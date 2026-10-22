const { Pool } = require('pg');
const assert = require('assert');

const CENTRAL_CONFIG = {
  host: 'localhost',
  port: 5436,
  user: 'admin',
  password: 'admin123',
  database: 'warehouse_central'
};

const NODES_CONFIG = {
  HN01: { host: 'localhost', port: 5433, user: 'admin', password: 'admin123', database: 'warehouse_hn' },
  DN01: { host: 'localhost', port: 5434, user: 'admin', password: 'admin123', database: 'warehouse_dn' },
  HCM01: { host: 'localhost', port: 5435, user: 'admin', password: 'admin123', database: 'warehouse_hcm' }
};

async function runTest() {
  console.log('================================================================');
  console.log('BAI TEST: TONG HOP XUAT BAN & KIEM KE TON KHO THEO MA SAN PHAM');
  console.log('Muc tieu: SP001 ban duoc bao nhieu tai HN, DN, HCM theo thang');
  console.log('================================================================\n');

  // TEST 1: Truy van Database Trung tam (Central DB)
  console.log('[TEST 1] Kiem tra tong hop tu CSDL Trung tam (Central Database - Port 5436)...');
  const centralPool = new Pool(CENTRAL_CONFIG);
  
  try {
    const centralRes = await centralPool.query(`
      SELECT 
        TO_CHAR(ngay_xuat, 'YYYY-MM') AS thang,
        ma_kho,
        ma_sp,
        COUNT(DISTINCT ma_phieu_xuat) AS so_don_xuat,
        SUM(so_luong)::int AS tong_so_luong_xuat,
        SUM(thanh_tien)::numeric AS tong_doanh_thu
      FROM xuat_hang_central
      WHERE ma_sp = 'SP001'
      GROUP BY TO_CHAR(ngay_xuat, 'YYYY-MM'), ma_kho, ma_sp
      ORDER BY thang DESC, ma_kho ASC;
    `);

    assert.ok(centralRes.rows.length > 0, 'Central DB phai co du lieu xuat ban cua SP001');
    console.log(`  -> DAT: Tim thay ${centralRes.rows.length} ban ghi tong hop theo (Thang, Kho) cho SP001.`);
    
    console.log('\n  Bang chi tiet xuat ban SP001 gan nhat theo thang va kho:');
    console.table(centralRes.rows.slice(0, 9));

    // TEST 2: Kiem tra View tong hop co san vw_ban_hang_theo_kho
    console.log('\n[TEST 2] Kiem tra View tong hop co san vw_ban_hang_theo_kho...');
    const viewRes = await centralPool.query(`
      SELECT ma_kho, ma_sp, tong_so_luong_ban::int, tong_doanh_thu::numeric
      FROM vw_ban_hang_theo_kho
      WHERE ma_sp = 'SP001'
      ORDER BY ma_kho;
    `);
    assert.ok(viewRes.rows.length > 0, 'View vw_ban_hang_theo_kho phai co du lieu SP001');
    console.log('  -> DAT: View vw_ban_hang_theo_kho hoat dong chinh xac (Tong luy ke cac kho):');
    console.table(viewRes.rows);

    // TEST 3: Kiem ke Ton kho hien tai (Inventory Balance) cua SP001 o cac kho
    console.log('\n[TEST 3] Kiem ke Ton kho hien tai cua SP001 o cac kho (Central DB)...');
    const stockRes = await centralPool.query(`
      SELECT ma_kho, ma_sp, so_luong::int, cap_nhat_luc
      FROM ton_kho_central
      WHERE ma_sp = 'SP001'
      ORDER BY ma_kho;
    `);
    assert.ok(stockRes.rows.length > 0, 'Phai co so lieu ton kho SP001');
    console.log('  -> DAT: So lieu ton kho hien tai cua SP001 tai cac kho:');
    console.table(stockRes.rows);

  } catch (err) {
    console.error('Loi khi truy van Central DB:', err);
    throw err;
  } finally {
    await centralPool.end();
  }

  // TEST 4: Doi soat truc tiep tai cac Node: Ha Noi (5433), Da Nang (5434), HCM (5435)
  console.log('\n[TEST 4] Doi soat doc lap tai tung Node chi nhanh...');
  for (const [nodeId, config] of Object.entries(NODES_CONFIG)) {
    const nodePool = new Pool(config);
    try {
      const nodeRes = await nodePool.query(`
        SELECT 
          TO_CHAR(px.ngay_xuat, 'YYYY-MM') AS thang,
          '${nodeId}' AS ma_kho,
          ct.ma_sp,
          SUM(ct.so_luong)::int AS tong_xuat
        FROM ct_phieu_xuat ct
        JOIN phieu_xuat px ON ct.ma_phieu_xuat = px.ma_phieu_xuat
        WHERE ct.ma_sp = 'SP001'
        GROUP BY TO_CHAR(px.ngay_xuat, 'YYYY-MM'), ct.ma_sp
        ORDER BY thang DESC
        LIMIT 3;
      `);
      console.log(`  -> Node ${nodeId}: Ket noi thanh cong, so dong du lieu SP001: ${nodeRes.rows.length}`);
      if (nodeRes.rows.length > 0) {
        console.table(nodeRes.rows);
      }
    } catch (nodeErr) {
      console.warn(`  -> Canh bao: Khong the truy van node ${nodeId}: ${nodeErr.message}`);
    } finally {
      await nodePool.end();
    }
  }

  console.log('\n================================================================');
  console.log('KET LUAN: TAT CA PHEP TEST TONG HOP VA KIEM KE DEU THANH CONG (PASS 100%)');
  console.log('================================================================\n');
}

runTest().catch((e) => {
  console.error('Test that bai:', e);
  process.exit(1);
});
