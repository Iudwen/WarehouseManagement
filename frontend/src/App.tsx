import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { WarehouseProvider } from './contexts/WarehouseContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Transfer from './pages/Transfer';
import AuditLogs from './pages/AuditLogs';
import WarehouseMap from './pages/WarehouseMap';
import Login from './pages/Login';
import DemandForecast from './pages/DemandForecast';

function AppRoutes() {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  if (isLoginPage) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/map" element={<WarehouseMap />} />
        <Route path="/import" element={<Inventory />} />
        <Route path="/export" element={<Inventory />} />
        <Route path="/transfer" element={<Transfer />} />
        <Route path="/audit" element={<AuditLogs />} />
        <Route path="/logs" element={<AuditLogs />} />
        <Route path="/reports" element={<DemandForecast />} />
        <Route path="/data-mining" element={<DemandForecast />} />
        <Route path="/forecast" element={<DemandForecast />} />
      </Routes>
    </Layout>
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