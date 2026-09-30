import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute() {
  const { isAuthenticated } = useAuth();

  // Nếu chưa đăng nhập -> Tự động chuyển hướng về trang /login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Nếu đã đăng nhập -> Cho phép truy cập vào các trang con (Dashboard, Nhập kho...)
  return <Outlet />;
}