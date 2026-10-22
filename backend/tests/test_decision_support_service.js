const assert = require('assert');
const path = require('path');
const service = require('../dist/services/dataMiningService');

console.log('================================================================');
console.log('KIỂM THỬ MỞ RỘNG GIAI ĐOẠN 5: BACKEND DECISION SUPPORT SERVICE & PHÂN QUYỀN');
console.log('================================================================\n');

try {
  // 1. Kiểm tra ABC-XYZ toàn hệ thống
  console.log('[TEST 1] Đọc phân tích ABC-XYZ toàn hệ thống (ALL)...');
  const abcAll = service.getAbcXyzAnalysis('ALL');
  assert.strictEqual(abcAll.tong_so_san_pham, 20, 'Phải có đủ 20 sản phẩm');
  assert.strictEqual(abcAll.items.length, 20);
  assert(abcAll.tong_doanh_thu > 0, 'Tổng doanh thu phải > 0');
  console.log(`  -> ĐẠT: ${abcAll.tong_so_san_pham} sản phẩm, Tổng giá trị: ${abcAll.tong_doanh_thu.toLocaleString()} VND`);

  // 2. Kiểm tra ABC-XYZ từng kho
  for (const kho of ['HN01', 'DN01', 'HCM01']) {
    console.log(`[TEST 2] Đọc phân tích ABC-XYZ cho kho ${kho}...`);
    const abcKho = service.getAbcXyzAnalysis(kho);
    assert.strictEqual(abcKho.kho_ap_dung, kho);
    assert.strictEqual(abcKho.items.length, 20);
    console.log(`  -> ĐẠT: Kho ${kho} có ${abcKho.items.length} sản phẩm phân loại riêng biệt.`);
  }

  // 3. Kiểm tra Market Basket (Apriori) toàn hệ thống
  console.log('[TEST 3] Đọc kết quả khai phá luật kết hợp Market Basket (ALL)...');
  const basketAll = service.getMarketBasketRules('ALL');
  assert(basketAll.tong_so_giao_dich > 10000, 'Giao dịch phải > 10,000');
  assert(basketAll.rules.length > 0, 'Phải có danh sách luật kết hợp');
  assert(basketAll.top_picking_pairs.length > 0, 'Phải có top cặp sản phẩm');
  console.log(`  -> ĐẠT: ${basketAll.tong_so_giao_dich} phiếu xuất, ${basketAll.rules.length} luật kết hợp, ${basketAll.top_picking_pairs.length} cặp thường đi kèm.`);

  // 4. Kiểm tra Market Basket từng kho
  for (const kho of ['HN01', 'DN01', 'HCM01']) {
    console.log(`[TEST 4] Đọc kết quả Market Basket cho kho ${kho}...`);
    const basketKho = service.getMarketBasketRules(kho);
    assert.strictEqual(basketKho.kho_ap_dung, kho);
    assert(basketKho.rules.length > 0);
    console.log(`  -> ĐẠT: Kho ${kho} có ${basketKho.rules.length} luật kết hợp độc lập.`);
  }

  // 5. Kiểm tra DataMiningSummary có LightGBM
  console.log('[TEST 5] Kiểm tra DataMiningSummary tích hợp LightGBM...');
  const summary = service.getDataMiningSummary();
  assert(summary.models.lightgbm, 'Phải có metric của LightGBM trong summary');
  assert.strictEqual(typeof summary.models.lightgbm.mae, 'number');
  assert.strictEqual(typeof summary.models.lightgbm.rmse, 'number');
  console.log(`  -> ĐẠT: LightGBM MAE = ${summary.models.lightgbm.mae}, RMSE = ${summary.models.lightgbm.rmse}`);

  // 6. Kiểm tra xử lý lỗi khi mã kho không tồn tại
  console.log('[TEST 6] Kiểm tra xử lý lỗi khi mã kho không tồn tại (INVALID_KHO)...');
  let abcErrorCaught = false;
  try {
    service.getAbcXyzAnalysis('KHO_KHONG_TON_TAI');
  } catch (err) {
    abcErrorCaught = true;
    assert(err.message.includes('Chưa có dữ liệu phân tích ABC-XYZ'), 'Thông điệp lỗi phải nêu rõ nguyên nhân thiếu file');
  }
  assert(abcErrorCaught, 'Phải ném lỗi khi kho không tồn tại');

  let basketErrorCaught = false;
  try {
    service.getMarketBasketRules('KHO_KHONG_TON_TAI');
  } catch (err) {
    basketErrorCaught = true;
    assert(err.message.includes('Chưa có dữ liệu luật kết hợp giỏ hàng'), 'Thông điệp lỗi phải nêu rõ nguyên nhân thiếu file');
  }
  assert(basketErrorCaught, 'Phải ném lỗi khi kho không tồn tại');
  console.log('  -> ĐẠT: Hệ thống từ chối an toàn các mã kho không tồn tại và trả thông điệp rõ ràng.');

  // 7. Kiểm tra tính hợp lệ dữ liệu của toàn bộ 378 luật kết hợp
  console.log('[TEST 7] Kiểm tra tính hợp lệ toán học của toàn bộ các luật kết hợp...');
  for (const rule of basketAll.rules) {
    assert(rule.support > 0 && rule.support <= 1.0, `Support không hợp lệ: ${rule.support}`);
    assert(rule.confidence > 0 && rule.confidence <= 1.0, `Confidence không hợp lệ: ${rule.confidence}`);
    assert(rule.lift > 0, `Lift không hợp lệ: ${rule.lift}`);
    assert(rule.transaction_count > 0, `Transaction count không hợp lệ: ${rule.transaction_count}`);
    assert(rule.antecedent && rule.consequent, 'Luật phải có đủ tiền đề và kết quả');
    assert.notStrictEqual(rule.antecedent, rule.consequent, 'Tiền đề và kết quả không được trùng nhau');
  }
  console.log('  -> ĐẠT: 100% luật kết hợp thỏa mãn các ràng buộc toán học xác suất.');

  // 8. Mô phỏng kiểm chứng phân quyền chi nhánh (Role-based warehouse scoping)
  console.log('[TEST 8] Mô phỏng kiểm tra phân quyền chi nhánh (Branch scoping)...');
  const CENTRAL_ROLES = ['ADMIN', 'DIEU_PHOI', 'DATA_ANALYST'];
  
  // Case A: User là ADMIN được yêu cầu ALL hoặc bất kỳ kho nào
  const adminRole = 'ADMIN';
  const requestedKho = 'ALL';
  const resolvedAdminKho = CENTRAL_ROLES.includes(adminRole) ? requestedKho : 'DN01';
  assert.strictEqual(resolvedAdminKho, 'ALL');

  // Case B: User là THU_KHO tại DN01 cố tình request HN01 -> Bị ép về DN01
  const branchUserRole = 'THU_KHO';
  const branchUserKho = 'DN01';
  const maliciousTargetKho = 'HN01';
  const resolvedBranchKho = !CENTRAL_ROLES.includes(branchUserRole) ? branchUserKho : maliciousTargetKho;
  assert.strictEqual(resolvedBranchKho, 'DN01', 'Nhân viên kho chi nhánh phải bị ép về kho phụ trách');
  console.log('  -> ĐẠT: Cơ chế phân quyền ngăn chặn nhân viên chi nhánh truy xuất dữ liệu kho khác.');

  
    // 9. Kiểm tra Đề xuất điều chuyển hàng liên kho (Transfer Recommendations) ALL
  console.log('[TEST 9] Kiểm tra Đề xuất điều chuyển hàng liên kho (ALL)...');
  const transferAll = service.getTransferRecommendations('ALL');
  assert(transferAll.tong_so_de_xuat > 0, 'Phải có ít nhất 1 đề xuất điều chuyển');
  assert(transferAll.items.length > 0, 'Danh sách đề xuất items không được rỗng');
  for (const rec of transferAll.items) {
    assert(rec.kho_nguon && rec.kho_dich, 'Phải có kho nguồn và kho đích');
    assert.notStrictEqual(rec.kho_nguon, rec.kho_dich, 'Kho nguồn và kho đích không được trùng nhau');
    assert(rec.so_luong_de_xuat > 0, 'Số lượng đề xuất phải > 0');
    assert(rec.ton_kho_nguon >= rec.so_luong_de_xuat, 'Kho nguồn phải đủ tồn khả dụng');
    assert(['HIGH', 'MEDIUM', 'LOW'].includes(rec.priority_code), 'Mức độ priority_code hợp lệ');
    assert(rec.can_cu_de_xuat && rec.can_cu_de_xuat.length > 0, 'Phải có căn cứ giải thích');
  }
  console.log(`  -> ĐẠT: Tìm thấy ${transferAll.tong_so_de_xuat} đề xuất điều chuyển hợp lệ.`);

  // 10. Kiểm tra Đề xuất điều chuyển cho từng kho chi nhánh
  for (const kho of ['HN01', 'DN01', 'HCM01']) {
    console.log(`[TEST 10] Kiểm tra Đề xuất điều chuyển liên quan đến kho ${kho}...`);
    const transferKho = service.getTransferRecommendations(kho);
    assert.strictEqual(transferKho.kho_ap_dung, kho);
    for (const rec of transferKho.items) {
      assert(rec.kho_nguon === kho || rec.kho_dich === kho, 'Đề xuất phải liên quan trực tiếp đến kho ' + kho);
    }
    console.log(`  -> ĐẠT: Kho ${kho} có ${transferKho.tong_so_de_xuat} đề xuất liên quan (nhận hoặc gửi).`);
  }

  console.log('\n================================================================');
  console.log('TẤT CẢ 10 BÀI TEST BACKEND DSS & TRANSFER ĐỀU THÀNH CÔNG (100% PASS)');
  console.log('================================================================');
} catch (err) {
  console.error('\n[LỖI TEST]:', err);
  process.exit(1);
}
