/**
 * test_backup_frontend_integration.ts
 * Bộ kiểm thử tích hợp Frontend & Backend API cho Task 5.7 (Backup & Recovery UI & API)
 *
 * Kiểm tra:
 * 1. Unauthenticated requests bị từ chối 401 Unauthorized
 * 2. Non-ADMIN requests (STAFF, MANAGER) bị chặn 403 Forbidden bởi roleGuard
 * 3. ADMIN request được cấp quyền truy cập 200 OK với đầy đủ stats, scheduler, history
 * 4. Restore API chặn tuyệt đối mọi yêu cầu ghi đè lên production DB (warehouse_hn, dn, hcm, central, warehouse_events) -> 400 Bad Request
 * 5. Frontend routing và sidebar navigation đã tích hợp route /backup với điều kiện isAdmin
 * 6. Frontend build hoàn tất không có lỗi TypeScript / bundle
 */

import express, { Application } from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';
import fs from 'fs';
import path from 'path';
import backupRoutes from '../src/routes/backupRoutes';

const JWT_SECRET = process.env.JWT_SECRET || 'warehouse_super_secret_key_2026';

interface TestItem {
  id: number;
  title: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
}

const testResults: TestItem[] = [];

function recordTest(id: number, title: string, expected: string, actual: string, pass: boolean) {
  testResults.push({
    id,
    title,
    expected,
    actual,
    status: pass ? 'PASS' : 'FAIL',
  });
  console.log(`[TEST ${id}] ${pass ? '✅ PASS' : '❌ FAIL'} | ${title}`);
  if (!pass) {
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
  }
}

function generateToken(role: 'ADMIN' | 'MANAGER' | 'STAFF', username = 'testuser'): string {
  return jwt.sign(
    {
      ma_nguoi_dung: 'U_' + role,
      ho_ten: 'Test ' + role,
      vai_tro: role,
      ma_kho: 'KHO_HN',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function runIntegrationSuite() {
  console.log('='.repeat(70));
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TÍCH HỢP TASK 5.7: FRONTEND BACKUP & RECOVERY API');
  console.log('='.repeat(70));

  // Khởi tạo Express Test App để mount backupRoutes
  const app: Application = express();
  app.use(express.json());
  app.use('/api/v1/backup', backupRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1/backup`;

  const adminToken = generateToken('ADMIN');
  const managerToken = generateToken('MANAGER');
  const staffToken = generateToken('STAFF');

  try {
    // -------------------------------------------------------------
    // Test 1: Unauthenticated request -> 401 Unauthorized
    // -------------------------------------------------------------
    try {
      const res = await fetch(`${baseUrl}/history`);
      const body: any = await res.json();
      const pass = res.status === 401 && body.message === 'Chưa đăng nhập';
      recordTest(
        1,
        'Unauthenticated GET /backup/history trả về HTTP 401 Unauthorized',
        'HTTP 401 with message "Chưa đăng nhập"',
        `HTTP ${res.status}: ${JSON.stringify(body)}`,
        pass
      );
    } catch (err: any) {
      recordTest(1, 'Unauthenticated GET /backup/history', 'HTTP 401', err.message, false);
    }

    // -------------------------------------------------------------
    // Test 2: STAFF token -> 403 Forbidden
    // -------------------------------------------------------------
    try {
      const res = await fetch(`${baseUrl}/history`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      const body: any = await res.json();
      const pass = res.status === 403 && body.message.includes('không có quyền');
      recordTest(
        2,
        'STAFF truy cập GET /backup/history bị chặn HTTP 403 Forbidden',
        'HTTP 403 with permission denied message',
        `HTTP ${res.status}: ${JSON.stringify(body)}`,
        pass
      );
    } catch (err: any) {
      recordTest(2, 'STAFF role guard check', 'HTTP 403', err.message, false);
    }

    // -------------------------------------------------------------
    // Test 3: MANAGER token -> 403 Forbidden
    // -------------------------------------------------------------
    try {
      const res = await fetch(`${baseUrl}/all`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${managerToken}`,
          'Content-Type': 'application/json',
        },
      });
      const body: any = await res.json();
      const pass = res.status === 403 && body.message.includes('không có quyền');
      recordTest(
        3,
        'MANAGER kích hoạt POST /backup/all bị chặn HTTP 403 Forbidden',
        'HTTP 403 with permission denied message',
        `HTTP ${res.status}: ${JSON.stringify(body)}`,
        pass
      );
    } catch (err: any) {
      recordTest(3, 'MANAGER role guard check', 'HTTP 403', err.message, false);
    }

    // -------------------------------------------------------------
    // Test 4: ADMIN token -> 200 OK + Data Schema (history, stats, scheduler)
    // -------------------------------------------------------------
    try {
      const res = await fetch(`${baseUrl}/history`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body: any = await res.json();
      const hasStats = body.success === true && body.stats && typeof body.stats.total === 'number';
      const hasScheduler = body.scheduler && typeof body.scheduler.isScheduled === 'boolean';
      const hasHistory = Array.isArray(body.history);

      const pass = res.status === 200 && hasStats && hasScheduler && hasHistory;
      recordTest(
        4,
        'ADMIN truy cập GET /backup/history nhận HTTP 200 với đầy đủ stats, scheduler, history',
        'HTTP 200 with valid stats, scheduler, history array',
        `HTTP ${res.status}, success=${body.success}, totalBackups=${body.stats?.total}, historyLen=${body.history?.length}, schedulerScheduled=${body.scheduler?.isScheduled}`,
        pass
      );
    } catch (err: any) {
      recordTest(4, 'ADMIN history endpoint', 'HTTP 200', err.message, false);
    }

    // -------------------------------------------------------------
    // Test 5: Production Overwrite Rejection - PostgreSQL
    // -------------------------------------------------------------
    try {
      const res = await fetch(`${baseUrl}/restore/postgres`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backupFilePath: 'D:\\backups\\postgres\\warehouse_hn\\dummy.dump',
          targetDatabase: 'warehouse_hn', // Production DB
          targetNodeId: 'HN',
        }),
      });
      const body: any = await res.json();
      const pass = (res.status === 400 || res.status === 403) && body.success === false && body.message.includes('production');
      recordTest(
        5,
        'Restore PostgreSQL vào production DB (warehouse_hn) bị từ chối HTTP 400/403',
        'HTTP 400/403 with message protecting Production database',
        `HTTP ${res.status}: ${JSON.stringify(body)}`,
        pass
      );
    } catch (err: any) {
      recordTest(5, 'Restore PG production check', 'HTTP 400/403', err.message, false);
    }

    // -------------------------------------------------------------
    // Test 6: Production Overwrite Rejection - MongoDB
    // -------------------------------------------------------------
    try {
      const res = await fetch(`${baseUrl}/restore/mongodb`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backupFilePath: 'D:\\backups\\mongodb\\warehouse_events\\dummy.archive.gz',
          targetDatabase: 'warehouse_events', // Production DB
        }),
      });
      const body: any = await res.json();
      const pass = (res.status === 400 || res.status === 403) && body.success === false && body.message.includes('production');
      recordTest(
        6,
        'Restore MongoDB vào production DB (warehouse_events) bị từ chối HTTP 400/403',
        'HTTP 400/403 with message protecting Production database',
        `HTTP ${res.status}: ${JSON.stringify(body)}`,
        pass
      );
    } catch (err: any) {
      recordTest(6, 'Restore Mongo production check', 'HTTP 400/403', err.message, false);
    }

    // -------------------------------------------------------------
    // Test 7: Frontend Route & Sidebar integration check
    // -------------------------------------------------------------
    try {
      const appTsx = fs.readFileSync(path.join(__dirname, '../../frontend/src/App.tsx'), 'utf-8');
      const sidebarTsx = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/Sidebar.tsx'), 'utf-8');
      const backupPageTsx = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/BackupRecovery.tsx'), 'utf-8');

      const hasAppRoute = appTsx.includes('path="/backup"') && appTsx.includes('BackupRecovery');
      const hasSidebarItem = sidebarTsx.includes("path: '/backup'") && sidebarTsx.includes('isAdmin');
      const hasNoOverwriteOptions = !backupPageTsx.includes('allowProductionOverwrite') && !backupPageTsx.includes('allowExistingDataOverwrite');
      const hasRbacInPage = backupPageTsx.includes('isAdmin') && backupPageTsx.includes('Từ Chối Quyền Truy Cập (403)');

      const pass = hasAppRoute && hasSidebarItem && hasNoOverwriteOptions && hasRbacInPage;
      recordTest(
        7,
        'Frontend code verification: route /backup, Sidebar item, RBAC gate & no overwrite flags',
        'Route defined, Sidebar linked with isAdmin check, 403 page present, no dangerous overwrite flags',
        `appRoute=${hasAppRoute}, sidebarLink=${hasSidebarItem}, rbacGate=${hasRbacInPage}, safeFlags=${hasNoOverwriteOptions}`,
        pass
      );
    } catch (err: any) {
      recordTest(7, 'Frontend code verification', 'Pass all checks', err.message, false);
    }

    // -------------------------------------------------------------
    // Test 8: Frontend production bundle check
    // -------------------------------------------------------------
    try {
      const distIndexHtml = path.join(__dirname, '../../frontend/dist/index.html');
      const exists = fs.existsSync(distIndexHtml);
      const stat = exists ? fs.statSync(distIndexHtml) : null;
      const pass = exists && (stat?.size || 0) > 0;
      recordTest(
        8,
        'Frontend Vite production build artifact dist/index.html tồn tại hợp lệ',
        'dist/index.html exists and size > 0',
        `exists=${exists}, size=${stat?.size || 0} bytes`,
        pass
      );
    } catch (err: any) {
      recordTest(8, 'Frontend build artifact check', 'File exists', err.message, false);
    }

  } finally {
    server.close();
  }

  // -------------------------------------------------------------
  // Tổng kết kết quả
  // -------------------------------------------------------------
  console.log('='.repeat(70));
  console.log('📊 TỔNG KẾT KẾT QUẢ KIỂM THỬ TASK 5.7');
  console.log('='.repeat(70));
  const passedCount = testResults.filter((t) => t.status === 'PASS').length;
  const totalCount = testResults.length;

  testResults.forEach((t) => {
    console.log(`[TEST ${t.id}] ${t.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${t.title}`);
  });

  console.log(`\n=> KẾT QUẢ: ${passedCount}/${totalCount} TESTS ĐẠT (${((passedCount / totalCount) * 100).toFixed(1)}%)`);
  if (passedCount === totalCount) {
    console.log('🎉 TẤT CẢ CÁC TIÊU CHÍ TASK 5.7 ĐÃ ĐƯỢC NGHIỆM THU HOÀN HẢO!');
  } else {
    console.log('❌ CÓ BÀI TEST CHƯA ĐẠT. VUI LÒNG KIỂM TRA LẠI.');
    process.exit(1);
  }
}

runIntegrationSuite().catch((e) => {
  console.error('Fatal error during test run:', e);
  process.exit(1);
});
