import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface WarehouseContextType {
  selectedWarehouse: string;
  setSelectedWarehouse: (wh: string) => void;
  isWarehouseLocked: boolean;
}

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

export const WarehouseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // Khóa đổi kho nếu tài khoản đã được gán kho cụ thể (nhân viên/quản lý chi nhánh)
  const isWarehouseLocked = Boolean(user?.ma_kho);

  const [selectedWarehouse, setSelectedWarehouseState] = useState<string>(() => {
    if (user?.ma_kho) return user.ma_kho;
    const savedWarehouse = localStorage.getItem('selectedWarehouse');
    return savedWarehouse || 'HN01';
  });

  // Tự động đồng bộ kho theo User khi vừa đăng nhập hoặc user thay đổi
  useEffect(() => {
    if (user?.ma_kho) {
      setSelectedWarehouseState(user.ma_kho);
      localStorage.setItem('selectedWarehouse', user.ma_kho);
    } else {
      const savedWarehouse = localStorage.getItem('selectedWarehouse');
      if (savedWarehouse) {
        setSelectedWarehouseState(savedWarehouse);
      }
    }
  }, [user]);

  // Hàm setter tự động lưu vào localStorage khi đổi kho (chỉ cho phép nếu không bị khóa)
  const setSelectedWarehouse = (wh: string) => {
    if (isWarehouseLocked && user?.ma_kho) {
      return;
    }
    localStorage.setItem('selectedWarehouse', wh);
    setSelectedWarehouseState(wh);
  };

  return (
    <WarehouseContext.Provider value={{ selectedWarehouse, setSelectedWarehouse, isWarehouseLocked }}>
      {children}
    </WarehouseContext.Provider>
  );
};

export const useWarehouse = () => {
  const context = useContext(WarehouseContext);
  if (!context) {
    throw new Error('useWarehouse phải được dùng bên trong WarehouseProvider');
  }
  return context;
};