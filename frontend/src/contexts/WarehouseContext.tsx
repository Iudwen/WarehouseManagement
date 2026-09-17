import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface WarehouseContextType {
  selectedWarehouse: string;
  setSelectedWarehouse: (wh: string) => void;
}

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

export const WarehouseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // Thứ tự ưu tiên: 1. Kho đã chọn gần nhất (localStorage) -> 2. Kho mặc định của User -> 3. HN01
  const [selectedWarehouse, setSelectedWarehouseState] = useState<string>(() => {
    const savedWarehouse = localStorage.getItem('selectedWarehouse');
    if (savedWarehouse) return savedWarehouse;
    return user?.defaultWarehouse || 'HN01';
  });

  // Tự động đồng bộ kho theo User khi vừa đăng nhập
  useEffect(() => {
    if (user?.defaultWarehouse && !localStorage.getItem('selectedWarehouse')) {
      setSelectedWarehouseState(user.defaultWarehouse);
    }
  }, [user]);

  // Hàm setter tự động lưu vào localStorage khi đổi kho
  const setSelectedWarehouse = (wh: string) => {
    localStorage.setItem('selectedWarehouse', wh);
    setSelectedWarehouseState(wh);
  };

  return (
    <WarehouseContext.Provider value={{ selectedWarehouse, setSelectedWarehouse }}>
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