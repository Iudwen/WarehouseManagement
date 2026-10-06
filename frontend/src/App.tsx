import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WarehouseProvider } from './contexts/WarehouseContext';
import ProtectedRoute from './components/ProtectedRoute';

import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Transfer from './pages/Transfer';
import AuditLogs from './pages/AuditLogs';
import WarehouseMap from './pages/WarehouseMap';
import Login from './pages/Login';
import Approvals from './pages/Approvals';

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Route công khai: Nếu đã đăng nhập thì tự động chuyển sang Dashboard */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />

      {/* Group Route bảo vệ */}
      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <Layout>
              <Outlet /> {/* <-- ĐÃ THÊM OUTLET VÀO ĐÂY ĐỂ ĐỔ NỘI DUNG TRANG CON */}
            </Layout>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/map" element={<WarehouseMap />} />
          <Route path="/import" element={<Inventory />} />
          <Route path="/export" element={<Inventory />} />
          <Route path="/transfer" element={<Transfer />} />
          <Route path="/audit" element={<AuditLogs />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/logs" element={<AuditLogs />} />
          <Route path="/reports" element={<Dashboard />} />
        </Route>
      </Route>

      {/* Điều hướng các URL không tồn tại về trang chủ */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WarehouseProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </WarehouseProvider>
    </AuthProvider>
  );
}