import { pools } from '../config/postgresql';

async function setMaintenance() {
  for (const [node, pool] of Object.entries({ HN: pools.HN, DN: pools.DN, HCM: pools.HCM })) {
    await pool.query(`
      UPDATE vi_tri_kho 
      SET trang_thai = 'MAINTENANCE' 
      WHERE ma_vi_tri LIKE '%A-05-02' OR ma_vi_tri LIKE '%B-05-03';
    `);
    console.log(`✅ [${node}] Đã cập nhật 2 ô bảo trì: A-05-02 và B-05-03 sang MAINTENANCE`);
  }
}

setMaintenance()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
