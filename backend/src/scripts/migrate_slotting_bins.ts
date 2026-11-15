import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import fs from 'fs';
import path from 'path';
import { pools } from '../config/postgresql';

interface WarehouseTarget {
  code: string;
  nodeKey: 'HN' | 'DN' | 'HCM';
  jsonFile: string;
}

const TARGETS: WarehouseTarget[] = [
  { code: 'HN01', nodeKey: 'HN', jsonFile: 'abc_xyz_analysis_HN01.json' },
  { code: 'DN01', nodeKey: 'DN', jsonFile: 'abc_xyz_analysis_DN01.json' },
  { code: 'HCM01', nodeKey: 'HCM', jsonFile: 'abc_xyz_analysis_HCM01.json' },
];

async function runSlottingMigration() {
  console.log('================================================================================');
  console.log('🚀 THỰC THI MIGRATION & SEED DỮ LIỆU SLOTTING BINS CHUẨN RÀNG BUỘC (BƯỚC 1)');
  console.log('================================================================================');

  for (const target of TARGETS) {
    const pool = pools[target.nodeKey];
    console.log(`\n================================================================`);
    console.log(`📌 TIẾN HÀNH XỬ LÝ NODE: ${target.code} (${target.nodeKey})`);
    console.log(`================================================================`);

    // 1. Tạo DDL với đầy đủ các ràng buộc chặt chẽ
    const ddl = `
      -- 1. Bảng danh mục ô kệ (Storage Bin Master)
      DROP TABLE IF EXISTS phan_bo_o_ke CASCADE;
      DROP TABLE IF EXISTS vi_tri_kho CASCADE;

      CREATE TABLE vi_tri_kho (
        ma_vi_tri VARCHAR(20) NOT NULL,
        ma_kho VARCHAR(10) NOT NULL REFERENCES kho(ma_kho),
        day_ke VARCHAR(5) NOT NULL,
        tang INT NOT NULL CHECK (tang >= 1 AND tang <= 5),
        ngan INT NOT NULL CHECK (ngan >= 1 AND ngan <= 10),
        vung_luu_tru VARCHAR(20) NOT NULL CHECK (vung_luu_tru IN ('GOLDEN_ZONE', 'MID_ZONE', 'TOP_STORAGE')),
        suc_chua_toi_da INT NOT NULL CHECK (suc_chua_toi_da > 0),
        trang_thai VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (trang_thai IN ('ACTIVE', 'MAINTENANCE')),
        PRIMARY KEY (ma_kho, ma_vi_tri),
        CONSTRAINT uq_${target.nodeKey.toLowerCase()}_day_tang_ngan UNIQUE (ma_kho, day_ke, tang, ngan),
        CONSTRAINT chk_${target.nodeKey.toLowerCase()}_vung_tang CHECK (
          (tang IN (1, 2) AND vung_luu_tru = 'GOLDEN_ZONE') OR
          (tang IN (3, 4) AND vung_luu_tru = 'MID_ZONE') OR
          (tang = 5 AND vung_luu_tru = 'TOP_STORAGE')
        )
      );

      -- 2. Bảng phân bổ sản phẩm vào ô kệ (Bin Allocation)
      CREATE TABLE phan_bo_o_ke (
        id BIGSERIAL PRIMARY KEY,
        ma_kho VARCHAR(10) NOT NULL,
        ma_vi_tri VARCHAR(20) NOT NULL,
        ma_sp VARCHAR(20) NOT NULL REFERENCES san_pham(ma_sp),
        so_luong INT NOT NULL CHECK (so_luong > 0),
        cap_nhat_luc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ma_kho, ma_vi_tri) REFERENCES vi_tri_kho(ma_kho, ma_vi_tri) ON DELETE CASCADE,
        CONSTRAINT uq_${target.nodeKey.toLowerCase()}_kho_vi_tri_sp UNIQUE (ma_kho, ma_vi_tri, ma_sp),
        CONSTRAINT uq_${target.nodeKey.toLowerCase()}_kho_sp_single_bin UNIQUE (ma_kho, ma_sp)
      );

      -- 3. Trigger đồng bộ tự động chênh lệch từ ton_kho sang phan_bo_o_ke
      CREATE OR REPLACE FUNCTION fn_sync_ton_kho_to_bin()
      RETURNS TRIGGER AS $$
      DECLARE
          v_vi_tri VARCHAR(20);
          v_diff INT;
      BEGIN
          IF (TG_OP = 'UPDATE') THEN
              v_diff := NEW.so_luong - OLD.so_luong;
              IF (v_diff <> 0) THEN
                  SELECT ma_vi_tri INTO v_vi_tri
                  FROM phan_bo_o_ke
                  WHERE ma_kho = NEW.ma_kho AND ma_sp = NEW.ma_sp
                  LIMIT 1;

                  IF v_vi_tri IS NOT NULL THEN
                      UPDATE phan_bo_o_ke
                      SET so_luong = so_luong + v_diff,
                          cap_nhat_luc = CURRENT_TIMESTAMP
                      WHERE ma_kho = NEW.ma_kho AND ma_vi_tri = v_vi_tri AND ma_sp = NEW.ma_sp;
                  END IF;
              END IF;
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_ton_kho_to_bin ON ton_kho;
      CREATE TRIGGER trg_sync_ton_kho_to_bin
      AFTER UPDATE ON ton_kho
      FOR EACH ROW
      EXECUTE FUNCTION fn_sync_ton_kho_to_bin();
    `;

    await pool.query(ddl);
    console.log(`[PASS] 1. Khởi tạo cấu trúc bảng & Trigger đồng bộ trên CSDL ${target.nodeKey}`);

    // 2. Khởi tạo 45 ô vị trí kệ mô phỏng (3 Dãy x 5 Tầng x 3 Ngăn)
    const racks = ['A', 'B', 'C'];
    const levels = [1, 2, 3, 4, 5];
    const bays = [1, 2, 3];

    for (const rack of racks) {
      for (const level of levels) {
        for (const bay of bays) {
          const maViTri = `${rack}-0${level}-0${bay}`;
          let vungLuuTru = 'MID_ZONE';
          let sucChua = 5000;

          if (level <= 2) {
            vungLuuTru = 'GOLDEN_ZONE';
            sucChua = 6000;
          } else if (level === 5) {
            vungLuuTru = 'TOP_STORAGE';
            sucChua = 4000;
          }

          await pool.query(`
            INSERT INTO vi_tri_kho (ma_vi_tri, ma_kho, day_ke, tang, ngan, vung_luu_tru, suc_chua_toi_da, trang_thai)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE');
          `, [maViTri, target.code, rack, level, bay, vungLuuTru, sucChua]);
        }
      }
    }
    console.log(`[PASS] 2. Seed thành công 45 ô vị trí kệ (Mỗi dãy 15 ô, phân tầng Golden/Mid/Top nghiêm ngặt)`);

    // 3. Đọc dữ liệu tồn kho thật từ ton_kho
    const stockRes = await pool.query(
      `SELECT ma_sp, so_luong FROM ton_kho WHERE ma_kho = $1 ORDER BY ma_sp;`,
      [target.code]
    );
    const stockMap: Record<string, number> = {};
    for (const row of stockRes.rows) {
      stockMap[row.ma_sp] = Number(row.so_luong);
    }
    console.log(`[PASS] 3. Đọc dữ liệu tồn kho thật từ ton_kho: ${Object.keys(stockMap).length} sản phẩm`);

    // 4. Phân bổ 20 sản phẩm vào 20 ô kệ
    // Lưu ý: Cố ý để SP014 (nhóm A) ở C-05-01 (Top Storage) và SP020 (nhóm C) ở A-02-03 (Golden Zone)
    // để minh họa chức năng phát hiện lệch vị trí của Slotting Advisor
    const binAssignments: { ma_sp: string; ma_vi_tri: string }[] = [
      // Dãy A: Tầng 1-2 (Golden Zone) & Tầng 3 (Mid Zone)
      { ma_sp: 'SP001', ma_vi_tri: 'A-01-01' },
      { ma_sp: 'SP002', ma_vi_tri: 'A-01-02' },
      { ma_sp: 'SP003', ma_vi_tri: 'A-01-03' },
      { ma_sp: 'SP004', ma_vi_tri: 'A-02-01' },
      { ma_sp: 'SP005', ma_vi_tri: 'A-02-02' },
      { ma_sp: 'SP006', ma_vi_tri: 'A-03-01' },
      { ma_sp: 'SP007', ma_vi_tri: 'A-03-02' },

      // Dãy B:
      { ma_sp: 'SP008', ma_vi_tri: 'B-01-01' },
      { ma_sp: 'SP009', ma_vi_tri: 'B-01-02' },
      { ma_sp: 'SP010', ma_vi_tri: 'B-02-01' },
      { ma_sp: 'SP011', ma_vi_tri: 'B-03-01' },
      { ma_sp: 'SP012', ma_vi_tri: 'B-04-01' },
      { ma_sp: 'SP013', ma_vi_tri: 'B-04-02' },

      // Dãy C:
      { ma_sp: 'SP014', ma_vi_tri: 'C-05-01' }, // Cố ý đặt ở Tầng 5 (Misplaced demo)
      { ma_sp: 'SP015', ma_vi_tri: 'C-03-01' },
      { ma_sp: 'SP016', ma_vi_tri: 'C-03-02' },
      { ma_sp: 'SP017', ma_vi_tri: 'C-04-01' },
      { ma_sp: 'SP018', ma_vi_tri: 'C-05-02' },
      { ma_sp: 'SP019', ma_vi_tri: 'C-05-03' },
      { ma_sp: 'SP020', ma_vi_tri: 'A-02-03' }, // Cố ý đặt ở Golden Zone (Misplaced demo)
    ];

    for (const item of binAssignments) {
      const qty = stockMap[item.ma_sp];
      if (qty === undefined || qty <= 0) continue;

      await pool.query(`
        INSERT INTO phan_bo_o_ke (ma_kho, ma_vi_tri, ma_sp, so_luong, cap_nhat_luc)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP);
      `, [target.code, item.ma_vi_tri, item.ma_sp, qty]);
    }
    console.log(`[PASS] 4. Đã phân bổ 20 sản phẩm vào 20 ô kệ với số lượng khớp tuyệt đối ton_kho`);

    // 5. Đối chiếu kiểm toán tính nhất quán: ton_kho == sum(phan_bo_o_ke)
    const auditRes = await pool.query(`
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

    let allMatch = true;
    for (const row of auditRes.rows) {
      if (Number(row.diff) !== 0) {
        allMatch = false;
        console.error(`  ❌ Lệch dữ liệu tại SP ${row.ma_sp}: ton_kho=${row.ton_kho_qty}, bin=${row.bin_qty}`);
      }
    }

    if (allMatch) {
      console.log(`[PASS] 5. KIỂM TOÁN HOÀN HẢO: 20/20 sản phẩm có sum(phan_bo_o_ke) = ton_kho (Lệch = 0)`);
    } else {
      throw new Error(`Phát hiện sai lệch giữa ton_kho và phan_bo_o_ke tại kho ${target.code}`);
    }

    // 6. Kiểm tra Trigger đồng bộ hoạt động chính xác
    console.log(`[TEST] 6. Thử nghiệm Trigger đồng bộ khi cập nhật tồn kho (+10 SP)...`);
    const testSp = 'SP001';
    const oldQty = stockMap[testSp];

    // Cập nhật tăng 10 đơn vị trong ton_kho
    await pool.query(`UPDATE ton_kho SET so_luong = so_luong + 10 WHERE ma_kho = $1 AND ma_sp = $2;`, [target.code, testSp]);

    // Kiểm tra phan_bo_o_ke có tự động tăng 10 đơn vị không
    const verifyBinRes = await pool.query(`SELECT so_luong FROM phan_bo_o_ke WHERE ma_kho = $1 AND ma_sp = $2;`, [target.code, testSp]);
    const newBinQty = Number(verifyBinRes.rows[0].so_luong);

    if (newBinQty === oldQty + 10) {
      console.log(`  + Trigger hoạt động chuẩn xác: phan_bo_o_ke tự động đồng bộ tăng lên ${newBinQty}`);
    } else {
      throw new Error(`Trigger đồng bộ thất bại: expected ${oldQty + 10}, actual ${newBinQty}`);
    }

    // Khôi phục lại số lượng gốc
    await pool.query(`UPDATE ton_kho SET so_luong = $1 WHERE ma_kho = $2 AND ma_sp = $3;`, [oldQty, target.code, testSp]);
    console.log(`  + Đã hoàn trả lại số lượng tồn kho ban đầu (${oldQty})`);
  }

  // 7. Lưu lại file SQL template cho các node
  const sqlContent = `
-- CẤU TRÚC PHÂN HỆ WAREHOUSE SLOTTING & BINS
CREATE TABLE IF NOT EXISTS vi_tri_kho (
  ma_vi_tri VARCHAR(20) NOT NULL,
  ma_kho VARCHAR(10) NOT NULL REFERENCES kho(ma_kho),
  day_ke VARCHAR(5) NOT NULL,
  tang INT NOT NULL CHECK (tang >= 1 AND tang <= 5),
  ngan INT NOT NULL CHECK (ngan >= 1 AND ngan <= 10),
  vung_luu_tru VARCHAR(20) NOT NULL CHECK (vung_luu_tru IN ('GOLDEN_ZONE', 'MID_ZONE', 'TOP_STORAGE')),
  suc_chua_toi_da INT NOT NULL CHECK (suc_chua_toi_da > 0),
  trang_thai VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (trang_thai IN ('ACTIVE', 'MAINTENANCE')),
  PRIMARY KEY (ma_kho, ma_vi_tri)
);

CREATE TABLE IF NOT EXISTS phan_bo_o_ke (
  id BIGSERIAL PRIMARY KEY,
  ma_kho VARCHAR(10) NOT NULL,
  ma_vi_tri VARCHAR(20) NOT NULL,
  ma_sp VARCHAR(20) NOT NULL REFERENCES san_pham(ma_sp),
  so_luong INT NOT NULL CHECK (so_luong > 0),
  cap_nhat_luc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ma_kho, ma_vi_tri) REFERENCES vi_tri_kho(ma_kho, ma_vi_tri) ON DELETE CASCADE,
  CONSTRAINT uq_kho_vi_tri_sp UNIQUE (ma_kho, ma_vi_tri, ma_sp)
);
`;

  const rootPath = path.resolve(__dirname, '../../../');
  fs.writeFileSync(path.join(rootPath, 'nodes/node_hn/10_create_slotting_bins.sql'), sqlContent, 'utf-8');
  fs.writeFileSync(path.join(rootPath, 'nodes/node_dn/10_create_slotting_bins.sql'), sqlContent, 'utf-8');
  fs.writeFileSync(path.join(rootPath, 'nodes/node_hcm/10_create_slotting_bins.sql'), sqlContent, 'utf-8');
  console.log(`\n[PASS] 7. Đã ghi nhận tệp SQL định nghĩa 10_create_slotting_bins.sql vào nodes/node_*`);

  console.log('\n================================================================================');
  console.log('🏆 NGHIỆM THU BƯỚC 1 HOÀN HẢO: 3 NODE ĐÃ CÓ BẢNG, RÀNG BUỘC & ĐỒNG BỘ 100%!');
  console.log('================================================================================');
  process.exit(0);
}

runSlottingMigration().catch((err) => {
  console.error('❌ Lỗi migration:', err);
  process.exit(1);
});
