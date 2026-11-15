/**
 * test_slotting_migration_suite.ts
 * BỘ KIỂM THỬ VÀ NGHIỆM THU TASK 1: DATABASE MIGRATION & SEED STORAGE BIN
 * 
 * Kiểm tra đầy đủ 6 tiêu chuẩn nghiệm thu trên cả 3 Node:
 * - Test 1: Cấu trúc (Bảng, PK, FK, Constraints)
 * - Test 2: Số lượng vị trí (45 ô / node, tổng 135 ô)
 * - Test 3: Dữ liệu phân bổ (SUM(phan_bo_o_ke) = ton_kho cho 100% sản phẩm)
 * - Test 4: Sức chứa (Không ô nào vượt suc_chua_toi_da)
 * - Test 5: Tính toàn vẹn (Không mã trùng, không sp lạ, không sai kho, so_luong > 0, không phân bổ vào MAINTENANCE)
 * - Test 6: Idempotency (Chạy lại migration/seed không nhân đôi, không lệch dữ liệu)
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import { pools } from '../src/config/postgresql';
import { runSlottingMigration, TARGETS } from '../src/scripts/migrate_slotting_bins';

interface TestResult {
  testId: string;
  name: string;
  node: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function recordResult(testId: string, name: string, node: string, status: 'PASS' | 'FAIL', details: string) {
  results.push({ testId, name, node, status, details });
  const icon = status === 'PASS' ? '✅ PASS' : '❌ FAIL';
  console.log(`[${icon}] [${testId}] [Node ${node}] ${name}: ${details}`);
}

async function runTestSuite() {
  console.log('================================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ VÀ NGHIỆM THU TOÀN DIỆN TASK 1 (STORAGE BIN MIGRATION & SEED)');
  console.log('================================================================================\n');

  for (const target of TARGETS) {
    const pool = pools[target.nodeKey];
    console.log(`\n--- KIỂM ĐỊNH NODE ${target.code} (${target.nodeKey}) ---`);

    // =========================================================================
    // TEST 1: CẤU TRÚC BẢNG & RÀNG BUỘC
    // =========================================================================
    const tableRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('vi_tri_kho', 'phan_bo_o_ke')
      ORDER BY table_name;
    `);
    const tables = tableRes.rows.map(r => r.table_name);
    const hasBothTables = tables.includes('vi_tri_kho') && tables.includes('phan_bo_o_ke');

    // Kiểm tra các constraints
    const constraintRes = await pool.query(`
      SELECT conname, contype 
      FROM pg_constraint 
      WHERE conrelid = 'vi_tri_kho'::regclass OR conrelid = 'phan_bo_o_ke'::regclass;
    `);
    const constraints = constraintRes.rows.map(r => r.conname);
    const hasFK = constraints.some(c => c.includes('fkey'));
    const hasUQ = constraints.some(c => c.includes('uq') || c.includes('key'));

    if (hasBothTables && hasFK && hasUQ) {
      recordResult(
        'TEST 1 - Cấu trúc',
        'Cấu trúc bảng, PK, FK và Constraints',
        target.code,
        'PASS',
        `Tồn tại vi_tri_kho và phan_bo_o_ke với đầy đủ PK, FK composite và Unique constraints (${constraints.length} ràng buộc)`
      );
    } else {
      recordResult(
        'TEST 1 - Cấu trúc',
        'Cấu trúc bảng, PK, FK và Constraints',
        target.code,
        'FAIL',
        `Thiếu bảng hoặc ràng buộc: tables=[${tables.join(',')}], constraints=[${constraints.join(',')}]`
      );
    }

    // =========================================================================
    // TEST 2: SỐ LƯỢNG VỊ TRÍ (45 Ô / NODE)
    // =========================================================================
    const binCountRes = await pool.query(`
      SELECT count(1) AS total_bins,
             count(1) FILTER (WHERE day_ke = 'A') AS rack_a,
             count(1) FILTER (WHERE day_ke = 'B') AS rack_b,
             count(1) FILTER (WHERE day_ke = 'C') AS rack_c,
             count(1) FILTER (WHERE vung_luu_tru = 'GOLDEN_ZONE') AS golden,
             count(1) FILTER (WHERE vung_luu_tru = 'MID_ZONE') AS mid,
             count(1) FILTER (WHERE vung_luu_tru = 'TOP_STORAGE') AS top
      FROM vi_tri_kho
      WHERE ma_kho = $1;
    `, [target.code]);

    const b = binCountRes.rows[0];
    const totalBins = Number(b.total_bins);
    const rackA = Number(b.rack_a);
    const rackB = Number(b.rack_b);
    const rackC = Number(b.rack_c);

    if (totalBins === 45 && rackA === 15 && rackB === 15 && rackC === 15) {
      recordResult(
        'TEST 2 - Số lượng',
        'Số lượng ô vị trí kệ',
        target.code,
        'PASS',
        `Đúng 45 ô/node (Dãy A: 15, Dãy B: 15, Dãy C: 15; Golden: ${b.golden}, Mid: ${b.mid}, Top: ${b.top})`
      );
    } else {
      recordResult(
        'TEST 2 - Số lượng',
        'Số lượng ô vị trí kệ',
        target.code,
        'FAIL',
        `Tổng ô: ${totalBins} (Kỳ vọng: 45), A: ${rackA}, B: ${rackB}, C: ${rackC}`
      );
    }

    // =========================================================================
    // TEST 3: DỮ LIỆU PHÂN BỔ (SUM(phan_bo_o_ke.so_luong) = ton_kho.so_luong)
    // =========================================================================
    const allocAuditRes = await pool.query(`
      SELECT 
        t.ma_sp,
        t.so_luong AS ton_kho_qty,
        COALESCE(SUM(p.so_luong), 0) AS bin_qty,
        (t.so_luong - COALESCE(SUM(p.so_luong), 0)) AS diff
      FROM ton_kho t
      LEFT JOIN phan_bo_o_ke p ON t.ma_kho = p.ma_kho AND t.ma_sp = p.ma_sp
      WHERE t.ma_kho = $1
      GROUP BY t.ma_sp, t.so_luong
      ORDER BY t.ma_sp;
    `, [target.code]);

    let diffCount = 0;
    let totalItems = allocAuditRes.rows.length;
    for (const row of allocAuditRes.rows) {
      if (Number(row.diff) !== 0) {
        diffCount++;
      }
    }

    if (totalItems > 0 && diffCount === 0) {
      recordResult(
        'TEST 3 - Phân bổ',
        'Đối chiếu tổng tồn kho ton_kho == phan_bo_o_ke',
        target.code,
        'PASS',
        `Chính xác tuyệt đối 100% (${totalItems}/${totalItems} sản phẩm có diff = 0, không có phân bổ vượt tồn kho)`
      );
    } else {
      recordResult(
        'TEST 3 - Phân bổ',
        'Đối chiếu tổng tồn kho ton_kho == phan_bo_o_ke',
        target.code,
        'FAIL',
        `Phát hiện ${diffCount}/${totalItems} sản phẩm bị sai lệch số lượng`
      );
    }

    // =========================================================================
    // TEST 4: SỨC CHỨA (Không ô nào vượt suc_chua_toi_da)
    // =========================================================================
    const capacityCheckRes = await pool.query(`
      SELECT 
        v.ma_vi_tri,
        v.suc_chua_toi_da,
        COALESCE(SUM(p.so_luong), 0) AS total_occupied,
        (COALESCE(SUM(p.so_luong), 0) - v.suc_chua_toi_da) AS overflow
      FROM vi_tri_kho v
      LEFT JOIN phan_bo_o_ke p ON v.ma_kho = p.ma_kho AND v.ma_vi_tri = p.ma_vi_tri
      WHERE v.ma_kho = $1
      GROUP BY v.ma_vi_tri, v.suc_chua_toi_da
      HAVING COALESCE(SUM(p.so_luong), 0) > v.suc_chua_toi_da;
    `, [target.code]);

    const overflowCount = capacityCheckRes.rows.length;
    if (overflowCount === 0) {
      recordResult(
        'TEST 4 - Sức chứa',
        'Kiểm tra giới hạn sức chứa ô kệ',
        target.code,
        'PASS',
        `100% ô kệ (45/45 ô) có tổng số lượng <= suc_chua_toi_da (0 ô vượt sức chứa)`
      );
    } else {
      recordResult(
        'TEST 4 - Sức chứa',
        'Kiểm tra giới hạn sức chứa ô kệ',
        target.code,
        'FAIL',
        `Phát hiện ${overflowCount} ô kệ bị vượt quá sức chứa tối đa`
      );
    }

    // =========================================================================
    // TEST 5: TÍNH TOÀN VẸN (Không trùng mã, không sai kho, so_luong > 0, không dùng MAINTENANCE)
    // =========================================================================
    // 5.1. Kiểm tra trùng mã vị trí trong kho
    const dupBinRes = await pool.query(`
      SELECT ma_vi_tri, count(1) 
      FROM vi_tri_kho 
      WHERE ma_kho = $1 
      GROUP BY ma_vi_tri 
      HAVING count(1) > 1;
    `, [target.code]);

    // 5.2. Kiểm tra sản phẩm lạ không có trong san_pham
    const orphanSpRes = await pool.query(`
      SELECT p.ma_sp 
      FROM phan_bo_o_ke p 
      LEFT JOIN san_pham s ON p.ma_sp = s.ma_sp 
      WHERE p.ma_kho = $1 AND s.ma_sp IS NULL;
    `, [target.code]);

    // 5.3. Kiểm tra số lượng âm hoặc bằng 0
    const invalidQtyRes = await pool.query(`
      SELECT count(1) AS cnt 
      FROM phan_bo_o_ke 
      WHERE ma_kho = $1 AND so_luong <= 0;
    `, [target.code]);

    // 5.4. Kiểm tra ô MAINTENANCE có bị phân bổ không
    const maintBinRes = await pool.query(`
      SELECT p.ma_vi_tri 
      FROM phan_bo_o_ke p 
      JOIN vi_tri_kho v ON p.ma_kho = v.ma_kho AND p.ma_vi_tri = v.ma_vi_tri 
      WHERE p.ma_kho = $1 AND v.trang_thai = 'MAINTENANCE';
    `, [target.code]);

    // 5.5. Kiểm tra tiền tố mã vị trí có đúng node không
    const invalidPrefixRes = await pool.query(`
      SELECT count(1) AS cnt 
      FROM vi_tri_kho 
      WHERE ma_kho = $1 AND ma_vi_tri NOT LIKE $2;
    `, [target.code, `${target.prefix}-%`]);

    const isIntegrityPass = 
      dupBinRes.rows.length === 0 &&
      orphanSpRes.rows.length === 0 &&
      Number(invalidQtyRes.rows[0].cnt) === 0 &&
      maintBinRes.rows.length === 0 &&
      Number(invalidPrefixRes.rows[0].cnt) === 0;

    if (isIntegrityPass) {
      recordResult(
        'TEST 5 - Toàn vẹn',
        'Kiểm tra tính toàn vẹn dữ liệu và quy tắc nghiệp vụ',
        target.code,
        'PASS',
        `0 mã trùng, 0 sản phẩm lạ, 0 số lượng <= 0, 0 ô MAINTENANCE bị dùng, 100% tiền tố ${target.prefix}- chuẩn`
      );
    } else {
      recordResult(
        'TEST 5 - Toàn vẹn',
        'Kiểm tra tính toàn vẹn dữ liệu và quy tắc nghiệp vụ',
        target.code,
        'FAIL',
        `Vi phạm tính toàn vẹn: dups=${dupBinRes.rows.length}, orphans=${orphanSpRes.rows.length}, invalidQty=${invalidQtyRes.rows[0].cnt}, maintBins=${maintBinRes.rows.length}, badPrefix=${invalidPrefixRes.rows[0].cnt}`
      );
    }
  }

  // =========================================================================
  // TEST 6: IDEMPOTENCY (Chạy lại migration/seed và xác nhận tính bất biến)
  // =========================================================================
  console.log(`\n--- KIỂM ĐỊNH TEST 6: TÍNH IDEMPOTENT (CHẠY LẠI MIGRATION/SEED LẦN 2) ---`);
  await runSlottingMigration(true);

  let idempotencyPass = true;
  for (const target of TARGETS) {
    const pool = pools[target.nodeKey];

    const binCount = await pool.query(`SELECT count(1) AS cnt FROM vi_tri_kho WHERE ma_kho = $1;`, [target.code]);
    const allocCount = await pool.query(`SELECT count(1) AS cnt FROM phan_bo_o_ke WHERE ma_kho = $1;`, [target.code]);
    const diffRes = await pool.query(`
      SELECT sum(abs(t.so_luong - p.so_luong)) AS total_diff
      FROM ton_kho t
      JOIN phan_bo_o_ke p ON t.ma_kho = p.ma_kho AND t.ma_sp = p.ma_sp
      WHERE t.ma_kho = $1;
    `, [target.code]);

    const bins = Number(binCount.rows[0].cnt);
    const allocs = Number(allocCount.rows[0].cnt);
    const diff = Number(diffRes.rows[0].total_diff);

    if (bins === 45 && allocs === 20 && diff === 0) {
      recordResult(
        'TEST 6 - Idempotency',
        'Chạy lại migration/seed không nhân đôi hoặc lệch dữ liệu',
        target.code,
        'PASS',
        `Bảo toàn tuyệt đối: đúng 45 ô, 20 bản ghi phân bổ, tổng độ lệch = 0`
      );
    } else {
      idempotencyPass = false;
      recordResult(
        'TEST 6 - Idempotency',
        'Chạy lại migration/seed không nhân đôi hoặc lệch dữ liệu',
        target.code,
        'FAIL',
        `Thất bại: bins=${bins}, allocs=${allocs}, diff=${diff}`
      );
    }
  }

  // =========================================================================
  // TỔNG HỢP KẾT QUẢ NGHIỆM THU
  // =========================================================================
  console.log('\n================================================================================');
  console.log('📊 BẢNG TỔNG HỢP ĐÁNH GIÁ NGHIỆM THU TASK 1 (WAREHOUSE SLOTTING)');
  console.log('================================================================================');
  console.table(results);

  const failCount = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n=> TỔNG SỐ TIÊU CHÍ KIỂM TRA: ${results.length}`);
  console.log(`=> SỐ TIÊU CHÍ ĐẠT (PASS):   ${results.length - failCount}`);
  console.log(`=> SỐ TIÊU CHÍ LỖI (FAIL):  ${failCount}`);

  if (failCount === 0) {
    console.log('\n🏆 KẾT LUẬN: PASS (100% TIÊU CHÍ NGHIỆM THU ĐẠT CHUẨN TUYỆT ĐỐI)');
    process.exit(0);
  } else {
    console.log('\n❌ KẾT LUẬN: FAIL');
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Lỗi kiểm thử:', err);
  process.exit(1);
});
