import { test, expect } from '@playwright/test';

test.describe('Warehouse frontend smoke tests', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Đăng Nhập Hệ Thống Kho' })).toBeVisible();
  });

  test('logs in a staff user, loads dashboard, and logs out', async ({ page }) => {
    await page.goto('/login');

    await page.locator('input[type="email"]').fill('cuong_hn@wms.com');
    await page.locator('input[type="password"]').fill('123456');
    await page.getByRole('button', { name: 'Đăng Nhập' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'TỔNG QUAN HỆ THỐNG KHO' })).toBeVisible();
    await expect(page.getByText('HN01', { exact: true }).first()).toBeVisible();

    await page.getByTitle('Đăng xuất khỏi hệ thống').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Đăng Nhập Hệ Thống Kho' })).toBeVisible();
  });

  test('admin can approve a pending HN01 import from Approval Center', async ({ page, request }) => {
    const apiUrl = 'http://127.0.0.1:5000/api/v1';
    const staffLogin = await request.post(`${apiUrl}/auth/login`, {
      data: { email: 'cuong_hn@wms.com', password: '123456', ma_kho: 'HN01' },
    });
    expect(staffLogin.ok()).toBeTruthy();

    const staffPayload = await staffLogin.json();
    const createImport = await request.post(`${apiUrl}/inventory/import`, {
      headers: { Authorization: `Bearer ${staffPayload.token}` },
      data: {
        ma_kho: 'HN01',
        ma_ncc: 'NCC001',
        items: [{ ma_sp: 'SP_TV_OLED_55', so_luong: 1, don_gia: 15000000 }],
      },
    });
    expect(createImport.status()).toBe(201);

    const importPayload = await createImport.json();
    const importCode = importPayload.ma_phieu_nhap;

    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@wms.com');
    await page.locator('input[type="password"]').fill('123456');
    await page.getByRole('button', { name: 'Đăng Nhập' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/approvals');
    const pendingRow = page.getByRole('row').filter({ hasText: importCode });
    await expect(pendingRow).toBeVisible();
    await pendingRow.getByRole('button', { name: 'Duyet' }).click();
    await expect(pendingRow).toBeHidden();
  });

  test('admin can approve pending imports from DN01 and HCM01', async ({ page, request }) => {
    const apiUrl = 'http://127.0.0.1:5000/api/v1';
    const cases = [
      { warehouse: 'DN01', email: 'truongkho_dn@wms.com' },
      { warehouse: 'HCM01', email: 'staff_hcm@wms.com' },
    ];

    const pendingCodes: Array<{ warehouse: string; code: string }> = [];
    for (const testCase of cases) {
      const login = await request.post(`${apiUrl}/auth/login`, {
        data: { email: testCase.email, password: '123456', ma_kho: testCase.warehouse },
      });
      expect(login.ok()).toBeTruthy();
      const loginData = await login.json();

      const createImport = await request.post(`${apiUrl}/inventory/import`, {
        headers: { Authorization: `Bearer ${loginData.token}` },
        data: {
          ma_kho: testCase.warehouse,
          ma_ncc: 'NCC001',
          items: [{ ma_sp: 'SP_TV_OLED_55', so_luong: 1, don_gia: 15000000 }],
        },
      });
      expect(createImport.status()).toBe(201);
      pendingCodes.push({
        warehouse: testCase.warehouse,
        code: (await createImport.json()).ma_phieu_nhap,
      });
    }

    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@wms.com');
    await page.locator('input[type="password"]').fill('123456');
    await page.getByRole('button', { name: 'Đăng Nhập' }).click();
    await expect(page).toHaveURL(/\/$/);

    const warehouseSelector = page.locator('select[title="Chọn kho làm việc"]');
    for (const pending of pendingCodes) {
      await warehouseSelector.selectOption(pending.warehouse);
      await page.goto('/approvals');
      const pendingRow = page.getByRole('row').filter({ hasText: pending.code });
      await expect(pendingRow).toBeVisible();
      await pendingRow.getByRole('button', { name: 'Duyet' }).click();
      await expect(pendingRow).toBeHidden();
    }
  });
});
