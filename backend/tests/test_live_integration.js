/**
 * LIVE INTEGRATION TEST
 * Kiểm thử toàn bộ 3 endpoint Data Mining thực tế qua HTTP Server (Port 5000 và Port 3000)
 */
const assert = require('assert');

const BACKEND_URL = 'http://localhost:5000/api/v1';
const FRONTEND_PROXY_URL = 'http://localhost:3000/api/v1';

async function runLiveIntegrationTests() {
  console.log('================================================================');
  console.log('BẮT ĐẦU KIỂM THỬ TÍCH HỢP LIVE HTTP DATA MINING API');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // MỤC 1: KIỂM TRA BẢO MẬT & XÁC THỰC (AUTHENTICATION)
  // -------------------------------------------------------------------------
  console.log('[MỤC 1] Kiểm tra bảo mật và xác thực JWT token...');

  // 1.1. Gọi API không có token -> Phải trả về 401
  const unauthRes = await fetch(`${BACKEND_URL}/data-mining/summary`);
  assert.strictEqual(unauthRes.status, 401, 'Request không có token phải bị từ chối 401');
  const unauthBody = await unauthRes.json();
  assert.strictEqual(unauthBody.message, 'Chưa đăng nhập');
  console.log('  -> ĐẠT: Không có token bị chặn 401 (Chưa đăng nhập).');

  // 1.2. Gọi API với token sai -> Phải trả về 401
  const badTokenRes = await fetch(`${BACKEND_URL}/data-mining/summary`, {
    headers: { Authorization: 'Bearer fake_invalid_jwt_token_123' },
  });
  assert.strictEqual(badTokenRes.status, 401, 'Token sai phải bị từ chối 401');
  console.log('  -> ĐẠT: Token giả mạo bị chặn 401 (Token không hợp lệ).');

  // 1.3. Đăng nhập tài khoản thật để lấy token
  console.log('\n[MỤC 2] Đăng nhập tài khoản hệ thống để cấp phát token...');
  // Đăng nhập Admin
  const adminLoginRes = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  });
  assert.strictEqual(adminLoginRes.status, 200, 'Đăng nhập admin thất bại');
  const adminData = await adminLoginRes.json();
  const adminToken = adminData.token;
  assert.ok(adminToken, 'Admin token phải tồn tại');
  console.log('  -> ĐẠT: Đăng nhập Admin thành công (vai_tro: ADMIN).');

  // Đăng nhập Quản lý kho Hà Nội (HN01)
  const qlHnLoginRes = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ql_hn', password: '123456' }),
  });
  assert.strictEqual(qlHnLoginRes.status, 200, 'Đăng nhập ql_hn thất bại');
  const qlHnData = await qlHnLoginRes.json();
  const qlHnToken = qlHnData.token;
  console.log('  -> ĐẠT: Đăng nhập Quản lý kho Hà Nội thành công (ma_kho: HN01).');

  // -------------------------------------------------------------------------
  // MỤC 3: KIỂM TRA ENDPOINT 1: GET /api/v1/data-mining/summary
  // -------------------------------------------------------------------------
  console.log('\n[MỤC 3] Kiểm tra Endpoint 1: GET /api/v1/data-mining/summary...');
  const summaryRes = await fetch(`${BACKEND_URL}/data-mining/summary`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(summaryRes.status, 200);
  const summaryJson = await summaryRes.json();
  assert.strictEqual(summaryJson.success, true);

  const sumData = summaryJson.data;
  assert.strictEqual(sumData.trainSet.totalRecords, 18600);
  assert.strictEqual(sumData.testSet.totalRecords, 2940);
  assert.ok(Math.abs(sumData.models.baseline.mae - 14.7424) < 0.005, 'Baseline MAE khớp');
  assert.ok(Math.abs(sumData.models.ridge.mae - 13.9641) < 0.005, 'Ridge MAE khớp');
  assert.ok(Math.abs(sumData.models.randomForest.mae - 13.9994) < 0.005, 'RF MAE khớp');
  assert.strictEqual(sumData.models.bestModel, 'Linear Ridge Regression');

  // Kiểm tra 3 kho
  assert.strictEqual(sumData.warehouseBreakdown.length, 3);
  assert.strictEqual(sumData.zeroDemandBreakdown.zeroDays.count, 1056);
  assert.strictEqual(sumData.zeroDemandBreakdown.positiveDays.count, 1884);
  console.log('  -> ĐẠT: Summary trả dữ liệu thật từ pipeline: Baseline MAE=14.7424, Ridge MAE=13.9641 (Tốt nhất).');

  // -------------------------------------------------------------------------
  // MỤC 4: KIỂM TRA ENDPOINT 2: GET /api/v1/data-mining/forecast-results
  // -------------------------------------------------------------------------
  console.log('\n[MỤC 4] Kiểm tra Endpoint 2: GET /api/v1/data-mining/forecast-results...');

  // 4.1. Mặc định trang 1 (limit 50)
  const fcRes1 = await fetch(`${BACKEND_URL}/data-mining/forecast-results`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(fcRes1.status, 200);
  const fcJson1 = await fcRes1.json();
  assert.strictEqual(fcJson1.total, 2940);
  assert.strictEqual(fcJson1.items.length, 50);
  assert.strictEqual(fcJson1.page, 1);
  assert.strictEqual(fcJson1.totalPages, 59); // ceil(2940 / 50)
  console.log('  -> ĐẠT: Mặc định trả về trang 1 (50 bản ghi / 2,940 tổng).');

  // 4.2. Lọc theo mã kho DN01
  const fcResKho = await fetch(`${BACKEND_URL}/data-mining/forecast-results?ma_kho=DN01`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const fcJsonKho = await fcResKho.json();
  assert.strictEqual(fcJsonKho.total, 980);
  assert.ok(fcJsonKho.items.every((it) => it.ma_kho === 'DN01'), 'Tất cả bản ghi phải là DN01');
  console.log('  -> ĐẠT: Lọc kho DN01 trả đúng 980 dòng của Đà Nẵng.');

  // 4.3. Lọc theo mã sản phẩm SP001
  const fcResSp = await fetch(`${BACKEND_URL}/data-mining/forecast-results?ma_sp=SP001`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const fcJsonSp = await fcResSp.json();
  assert.strictEqual(fcJsonSp.total, 147); // 49 ngày x 3 kho
  assert.ok(fcJsonSp.items.every((it) => it.ma_sp === 'SP001'));
  console.log('  -> ĐẠT: Lọc SP001 trả đúng 147 dòng.');

  // 4.4. Lọc ngày: 2026-08-01 -> 2026-08-05 (5 ngày)
  const fcResDate = await fetch(
    `${BACKEND_URL}/data-mining/forecast-results?from_date=2026-08-01&to_date=2026-08-05`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  const fcJsonDate = await fcResDate.json();
  assert.strictEqual(fcJsonDate.total, 300); // 5 ngày x 60 cặp
  console.log('  -> ĐẠT: Lọc khoảng 5 ngày trả đúng 300 dòng.');

  // 4.5. Lọc dữ liệu rỗng (sản phẩm không tồn tại)
  const fcResEmpty = await fetch(`${BACKEND_URL}/data-mining/forecast-results?ma_sp=SP_KHONG_CO`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(fcResEmpty.status, 200);
  const fcJsonEmpty = await fcResEmpty.json();
  assert.strictEqual(fcJsonEmpty.total, 0);
  assert.strictEqual(fcJsonEmpty.items.length, 0);
  console.log('  -> ĐẠT: Lọc không có kết quả trả về total=0, items=[] an toàn.');

  // 4.6. Kiểm tra giới hạn quyền xem kho (Role-based Access Control)
  // Quản lý kho HN01 (ql_hn) cố tình yêu cầu xem kho DN01 -> Controller bắt buộc ép về HN01
  const fcResRole = await fetch(`${BACKEND_URL}/data-mining/forecast-results?ma_kho=DN01`, {
    headers: { Authorization: `Bearer ${qlHnToken}` },
  });
  const fcJsonRole = await fcResRole.json();
  assert.strictEqual(fcJsonRole.total, 980);
  assert.ok(
    fcJsonRole.items.every((it) => it.ma_kho === 'HN01'),
    'User kho HN01 chỉ được xem dữ liệu kho HN01'
  );
  console.log('  -> ĐẠT: Phân quyền kho chuẩn: tài khoản HN01 bị giới hạn dữ liệu kho HN01.');

  // -------------------------------------------------------------------------
  // MỤC 5: KIỂM TRA ENDPOINT 3: GET /api/v1/data-mining/time-series
  // -------------------------------------------------------------------------
  console.log('\n[MỤC 5] Kiểm tra Endpoint 3: GET /api/v1/data-mining/time-series...');
  const tsRes = await fetch(`${BACKEND_URL}/data-mining/time-series`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(tsRes.status, 200);
  const tsJson = await tsRes.json();
  assert.strictEqual(tsJson.data.length, 49);
  assert.strictEqual(tsJson.data[0].ngay, '2026-08-01');
  assert.strictEqual(tsJson.data[48].ngay, '2026-09-18');
  assert.ok(tsJson.data[0].thuc_te !== undefined);
  assert.ok(tsJson.data[0].du_bao_ridge !== undefined);
  assert.ok(tsJson.data[0].du_bao_baseline !== undefined);
  console.log('  -> ĐẠT: Time-series trả đủ 49 mốc ngày liên tục để vẽ biểu đồ.');

  // -------------------------------------------------------------------------
  // MỤC 6: KIỂM TRA PROXY FRONTEND VÀ KHÔNG LÀM HỎNG CÁC ROUTE CŨ
  // -------------------------------------------------------------------------
  console.log('\n[MỤC 6] Kiểm tra qua Proxy Frontend (Port 3000) và các API hiện có...');

  // 6.1. Gọi API Data Mining qua proxy cổng 3000 của Vite
  const proxyRes = await fetch(`${FRONTEND_PROXY_URL}/data-mining/summary`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(proxyRes.status, 200, 'Proxy qua Vite port 3000 phải thành công');
  const proxyJson = await proxyRes.json();
  assert.strictEqual(proxyJson.data.testSet.totalRecords, 2940);
  console.log('  -> ĐẠT: Frontend proxy /api -> http://localhost:5000 hoạt động thông suốt.');

  // 6.2. Kiểm tra API cũ: Master Data
  const masterRes = await fetch(`${BACKEND_URL}/master-data`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(masterRes.status, 200, 'API cũ /master-data phải hoạt động');
  console.log('  -> ĐẠT: API cũ /master-data hoạt động bình thường.');

  // 6.3. Kiểm tra API cũ: Dashboard Summary
  const dashRes = await fetch(`${BACKEND_URL}/dashboard/summary`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(dashRes.status, 200, 'API cũ /dashboard/summary phải hoạt động');
  console.log('  -> ĐẠT: API cũ /dashboard/summary hoạt động bình thường.');

  console.log('\n================================================================');
  console.log('TOÀN BỘ KIỂM THỬ TÍCH HỢP LIVE ĐỀU ĐẠT (100% PASS)');
  console.log('================================================================\n');
}

runLiveIntegrationTests().catch((err) => {
  console.error('\n[LỖI TEST LIVE]:', err);
  process.exit(1);
});
