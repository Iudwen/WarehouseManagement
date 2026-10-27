/**
 * Unit Test for IO Statistics (Thống kê Nhập - Xuất Kho)
 */
const assert = require('assert');
const {
  getIOStatistics,
  getPendingReceiptSummary,
  PRODUCT_NAMES,
  WAREHOUSE_NAMES,
} = require('../dist/services/dashboardService');

console.log('================================================================');
console.log('KIỂM THỬ THỐNG KÊ NHẬP - XUẤT KHO (IO STATISTICS SERVICE)');
console.log('================================================================\n');

// 1. Kiểm tra thống kê toàn hệ thống (ALL)
console.log('[TEST 1] Kiểm tra thống kê toàn hệ thống (ALL)...');
getIOStatistics('ALL', '2026-08-01', '2026-09-18', 'day').then((res) => {
  assert.strictEqual(res.warehouse, 'ALL');
  assert.strictEqual(res.granularity, 'day');
  assert.ok(res.kpi, 'Phải có trường kpi');

  // Phân biệt rõ số lượng hàng vs số lượng phiếu
  assert.ok(res.kpi.tong_nhap_khoang_loc > 0, 'Tổng số lượng hàng nhập phải > 0');
  assert.ok(res.kpi.so_phieu_nhap_khoang_loc > 0, 'Số phiếu nhập phải > 0');
  assert.ok(
    res.kpi.tong_nhap_khoang_loc >= res.kpi.so_phieu_nhap_khoang_loc,
    'Tổng số lượng hàng nhập phải lớn hơn hoặc bằng số phiếu nhập'
  );

  assert.ok(res.kpi.tong_xuat_khoang_loc > 0, 'Tổng số lượng hàng xuất phải > 0');
  assert.ok(res.kpi.so_phieu_xuat_khoang_loc > 0, 'Số phiếu xuất phải > 0');
  assert.ok(
    res.kpi.tong_xuat_khoang_loc >= res.kpi.so_phieu_xuat_khoang_loc,
    'Tổng số lượng hàng xuất phải lớn hơn hoặc bằng số phiếu xuất'
  );

  // Kiểm tra chênh lệch ròng (Net Flow)
  const expectedNet = res.kpi.tong_nhap_khoang_loc - res.kpi.tong_xuat_khoang_loc;
  assert.strictEqual(
    res.kpi.chenh_lech_rong_khoang_loc,
    expectedNet,
    'Chênh lệch ròng phải bằng tổng nhập - tổng xuất'
  );

  // Kiểm tra warehouse breakdown
  assert.strictEqual(res.warehouse_breakdown.length, 3, 'Phải có đủ 3 kho phân tán');
  const whCodes = res.warehouse_breakdown.map((w) => w.ma_kho);
  assert.ok(whCodes.includes('HN01') && whCodes.includes('DN01') && whCodes.includes('HCM01'));

  // Kiểm tra timeline
  assert.ok(res.timeline.length > 0, 'Timeline phải có dữ liệu');
  assert.ok(res.timeline[0].moc_thoi_gian, 'Timeline phải có mốc thời gian YYYY-MM-DD');

  // Kiểm tra top products
  assert.ok(res.top_products.most_imported.length <= 5);
  assert.ok(res.top_products.most_exported.length <= 5);
  console.log(`  -> ĐẠT: Tổng nhập kỳ=${res.kpi.tong_nhap_khoang_loc} (Phiếu: ${res.kpi.so_phieu_nhap_khoang_loc}), Tổng xuất kỳ=${res.kpi.tong_xuat_khoang_loc} (Phiếu: ${res.kpi.so_phieu_xuat_khoang_loc})`);

  // 2. Kiểm tra lọc theo chi nhánh cụ thể (HN01)
  console.log('\n[TEST 2] Kiểm tra lọc theo chi nhánh đơn lẻ (HN01)...');
  return getIOStatistics('HN01', '2026-08-01', '2026-09-18', 'day');
}).then((resHn) => {
  assert.strictEqual(resHn.warehouse, 'HN01');
  assert.strictEqual(resHn.warehouse_breakdown.length, 1);
  assert.strictEqual(resHn.warehouse_breakdown[0].ma_kho, 'HN01');
  assert.strictEqual(resHn.warehouse_breakdown[0].so_luong_nhap, resHn.kpi.tong_nhap_khoang_loc);
  assert.strictEqual(resHn.warehouse_breakdown[0].so_luong_xuat, resHn.kpi.tong_xuat_khoang_loc);
  console.log(`  -> ĐẠT: Lọc kho HN01 chính xác (Nhập: ${resHn.kpi.tong_nhap_khoang_loc}, Xuất: ${resHn.kpi.tong_xuat_khoang_loc})`);

  // 3. Kiểm tra gom nhóm theo Tháng (Monthly)
  console.log('\n[TEST 3] Kiểm tra gom nhóm chuỗi thời gian theo Tháng (Monthly)...');
  return getIOStatistics('ALL', '2025-09-18', '2026-09-18', 'month');
}).then((resMonth) => {
  assert.strictEqual(resMonth.granularity, 'month');
  assert.ok(resMonth.timeline.length >= 12, `1 năm dữ liệu phải có 12-13 mốc tháng, thực tế: ${resMonth.timeline.length}`);
  const firstMonth = resMonth.timeline[0].moc_thoi_gian;
  assert.match(firstMonth, /^\d{4}-\d{2}$/, 'Mốc tháng phải có định dạng YYYY-MM');
  console.log(`  -> ĐẠT: Chuỗi thời gian theo tháng chính xác (Tổng ${resMonth.timeline.length} tháng, từ ${firstMonth} đến ${resMonth.timeline[resMonth.timeline.length - 1].moc_thoi_gian})`);

  // 4. Kiểm tra kho không tồn tại
  console.log('\n[TEST 4] Kiểm tra kho không tồn tại / bộ lọc rỗng...');
  return getIOStatistics('KHO_AO_99', '2026-01-01', '2026-01-10', 'day');
}).then((resEmpty) => {
  assert.strictEqual(resEmpty.kpi.tong_nhap_khoang_loc, 0);
  assert.strictEqual(resEmpty.kpi.tong_xuat_khoang_loc, 0);
  assert.strictEqual(resEmpty.timeline.length, 0);
  console.log('  -> ĐẠT: Xử lý an toàn khi kho không tồn tại (trả về 0, không crash).');

  // 5. Kiểm tra hàm đếm đơn chờ xử lý
  console.log('\n[TEST 5] Kiểm tra đếm đơn chờ xử lý (Pending Receipts)...');
  return getPendingReceiptSummary('ALL');
}).then((pending) => {
  assert.ok(typeof pending.pendingImports === 'number');
  assert.ok(typeof pending.pendingExports === 'number');
  console.log(`  -> ĐẠT: pendingImports=${pending.pendingImports}, pendingExports=${pending.pendingExports}`);

  console.log('\n================================================================');
  console.log('TẤT CẢ KIỂM THỬ THỐNG KÊ NHẬP - XUẤT ĐỀU ĐẠT (100% PASS)');
  console.log('================================================================\n');
}).catch((err) => {
  console.error('❌ Lỗi kiểm thử:', err);
  process.exit(1);
});
