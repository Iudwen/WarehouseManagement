/**
 * UNIT TEST: Logic kiểm tra Idempotency & State Transition của confirmSourceTransfer & shipTransfer
 */

const assert = require('assert');

// Giả lập mock state và DB pool
let centralState = {
  saga_id: '11111111-1111-1111-1111-111111111111',
  ma_giao_dich_global: '22222222-2222-2222-2222-222222222222',
  ma_phieu_dc: 'DC_HN01_TEST_01',
  kho_xuat: 'HN01',
  kho_nhap: 'DN01',
  ma_sp: 'SP001',
  so_luong_yeu_cau: 5,
  current_state: 'WAITING_SOURCE_CONFIRMATION',
  status: 'RUNNING',
};

let nodeReservations = [];

// Mô phỏng logic của sp_accept_transfer với Idempotency
function mockSpAcceptTransfer(data) {
  // 1. Kiểm tra Idempotency
  const exists = nodeReservations.find(
    (r) => r.saga_id === data.saga_id && r.ma_phieu_dc === data.ma_phieu_dc && r.trang_thai === 'RESERVED'
  );
  if (exists) {
    return { status: 'IDEMPOTENT_IGNORED', reservation: exists };
  }

  // 2. Tạo reservation
  const newRes = {
    reservation_id: nodeReservations.length + 1,
    saga_id: data.saga_id,
    ma_phieu_dc: data.ma_phieu_dc,
    ma_kho: data.ma_kho,
    ma_sp: data.ma_sp,
    so_luong_reserve: data.so_luong,
    trang_thai: 'RESERVED',
  };
  nodeReservations.push(newRes);
  return { status: 'CREATED', reservation: newRes };
}

// Mô phỏng logic confirmSourceTransfer
async function mockConfirmSourceTransfer(maPhieuDc, maNguoiDung, maKhoContext) {
  if (!maNguoiDung) throw new Error('Không xác định được người xác nhận');
  if (!maKhoContext || maKhoContext === 'CENTRAL') throw new Error('Người xác nhận phải thuộc một kho chi nhánh');

  const saga = centralState;
  if (!saga || saga.ma_phieu_dc !== maPhieuDc) {
    throw new Error(`Phiếu ${maPhieuDc} chưa có Saga`);
  }

  if (saga.kho_xuat.trim().toUpperCase() !== maKhoContext.trim().toUpperCase()) {
    throw new Error('Bạn không thuộc kho xuất của phiếu này');
  }

  // Idempotency: Nếu đã SOURCE_ACCEPTED
  if (saga.current_state === 'SOURCE_ACCEPTED') {
    return {
      success: true,
      ma_phieu_dc: saga.ma_phieu_dc,
      saga_id: saga.saga_id,
      global_id: saga.ma_giao_dich_global,
      ma_kho: saga.kho_xuat,
      event_type: 'TRANSFER_ACCEPTED',
      already_confirmed: true,
    };
  }

  if (saga.current_state !== 'WAITING_SOURCE_CONFIRMATION') {
    throw new Error(`Saga không ở trạng thái chờ kho nguồn xác nhận: ${saga.current_state}`);
  }

  // Gọi Node
  mockSpAcceptTransfer({
    saga_id: saga.saga_id,
    global_id: saga.ma_giao_dich_global,
    ma_phieu_dc: saga.ma_phieu_dc,
    ma_kho: saga.kho_xuat,
    ma_sp: saga.ma_sp,
    so_luong: saga.so_luong_yeu_cau,
  });

  // Cập nhật Central
  centralState.current_state = 'SOURCE_ACCEPTED';

  return {
    success: true,
    ma_phieu_dc: saga.ma_phieu_dc,
    saga_id: saga.saga_id,
    global_id: saga.ma_giao_dich_global,
    ma_kho: saga.kho_xuat,
    event_type: 'TRANSFER_ACCEPTED',
  };
}

// Mô phỏng logic shipTransfer
async function mockShipTransfer(maPhieuDc, maNguoiThucHien, maKhoContext) {
  if (!maNguoiThucHien) throw new Error('Không xác định được nhân viên thực hiện');
  if (!maKhoContext || maKhoContext === 'CENTRAL') throw new Error('Nhân viên xuất hàng phải thuộc kho chi nhánh');

  const saga = centralState;
  if (!saga || saga.ma_phieu_dc !== maPhieuDc) throw new Error(`Phiếu ${maPhieuDc} chưa có Saga`);
  if (saga.kho_xuat.trim().toUpperCase() !== maKhoContext.trim().toUpperCase()) {
    throw new Error('Bạn không thuộc kho xuất của phiếu này');
  }

  if (
    saga.current_state !== 'SOURCE_ACCEPTED' &&
    saga.current_state !== 'WAITING_SOURCE_CONFIRMATION'
  ) {
    throw new Error(`Saga chưa được kho nguồn xác nhận giữ hàng: ${saga.current_state}`);
  }

  return {
    success: true,
    ma_phieu_dc: saga.ma_phieu_dc,
    event_type: 'TRANSFER_SHIPPED',
    status: 'SHIPPED_PENDING_RELAY',
  };
}

async function runUnitTests() {
  console.log('=== CHẠY KIỂM THỬ ĐƠN VỊ (UNIT TEST): LOGIC XÁC NHẬN NGUỒN ===\n');

  // Test 1: Xác nhận sai kho -> Báo lỗi
  try {
    await mockConfirmSourceTransfer('DC_HN01_TEST_01', 'nv_dn', 'DN01');
    assert.fail('Lẽ ra phải văng lỗi sai kho');
  } catch (err) {
    assert.strictEqual(err.message, 'Bạn không thuộc kho xuất của phiếu này');
    console.log('✓ TEST 1: Từ chối nhân viên kho khác xác nhận thành công.');
  }

  // Test 2: Xác nhận lần đầu -> Thành công, chuyển sang SOURCE_ACCEPTED, tạo 1 reservation
  const res1 = await mockConfirmSourceTransfer('DC_HN01_TEST_01', 'nv_hn', 'HN01');
  assert.strictEqual(res1.success, true);
  assert.strictEqual(centralState.current_state, 'SOURCE_ACCEPTED');
  assert.strictEqual(nodeReservations.length, 1);
  console.log('✓ TEST 2: Xác nhận lần đầu thành công, Central đổi sang SOURCE_ACCEPTED, tạo đúng 1 reservation.');

  // Test 3: Xác nhận lần thứ hai (Idempotent call) -> Thành công, không tạo reservation thứ 2
  const res2 = await mockConfirmSourceTransfer('DC_HN01_TEST_01', 'nv_hn', 'HN01');
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.already_confirmed, true);
  assert.strictEqual(nodeReservations.length, 1); // Vẫn chỉ là 1!
  console.log('✓ TEST 3: Xác nhận lần 2 trả về thành công (already_confirmed: true), không tạo reservation trùng.');

  // Test 4: Xuất kho sau khi đã SOURCE_ACCEPTED -> Cho phép xuất thành công
  const resShip = await mockShipTransfer('DC_HN01_TEST_01', 'nv_hn', 'HN01');
  assert.strictEqual(resShip.success, true);
  assert.strictEqual(resShip.event_type, 'TRANSFER_SHIPPED');
  console.log('✓ TEST 4: Xuất kho hoạt động chuẩn xác với trạng thái SOURCE_ACCEPTED.');

  // Test 5: Phiếu ở trạng thái không hợp lệ (ví dụ IN_TRANSIT) thì không cho xác nhận lại
  centralState.current_state = 'IN_TRANSIT';
  try {
    await mockConfirmSourceTransfer('DC_HN01_TEST_01', 'nv_hn', 'HN01');
    assert.fail('Lẽ ra phải văng lỗi');
  } catch (err) {
    assert.strictEqual(err.message, 'Saga không ở trạng thái chờ kho nguồn xác nhận: IN_TRANSIT');
    console.log('✓ TEST 5: Phiếu ở trạng thái IN_TRANSIT bị từ chối xác nhận lại chuẩn xác.');
  }

  console.log('\n=== TẤT CẢ 5 UNIT TESTS ĐỀU VƯỢT QUA 100% ===');
}

runUnitTests().catch((e) => {
  console.error('Lỗi Unit Test:', e);
  process.exit(1);
});
