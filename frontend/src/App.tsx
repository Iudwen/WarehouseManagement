import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Transfer from './pages/Transfer';
import AuditLogs from './pages/AuditLogs';
import Login from './pages/Login';

function Navbar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <nav className="bg-slate-900 text-white p-4 flex justify-between items-center px-8 shadow">
      <Link to="/" className="font-bold text-xl tracking-wide">WAREHOUSE SYSTEM</Link>
      <div className="flex items-center gap-6 font-medium">
        <Link to="/" className="hover:text-blue-400">Dashboard</Link>
        <Link to="/inventory" className="hover:text-blue-400">Nhập/Xuất</Link>
        <Link to="/transfer" className="hover:text-blue-400">Điều Chuyển</Link>
        <Link to="/logs" className="hover:text-blue-400">Audit Logs</Link>
        <button onClick={logout} className="bg-red-600 text-sm px-3 py-1 rounded font-bold hover:bg-red-700">
          Thoát
        </button>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <Navbar />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/transfer" element={<Transfer />} />
            <Route path="/logs" element={<AuditLogs />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}