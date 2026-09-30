import { createContext, useContext, useState, useEffect } from 'react';
import type { FC, ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface WarehouseContextType {
  selectedWarehouse: string;
  setSelectedWarehouse: (wh: string) => void;
}

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

export const WarehouseProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // Thứ tự ưu tiên: 1. Kho đã chọn gần nhất (localStorage) -> 2. Kho mặc định của User -> 3. HN01
  const [selectedWarehouse, setSelectedWarehouseState] = useState<string>(() => {
    const savedWarehouse = typeof window !== 'undefined'
      ? window.localStorage.getItem('selectedWarehouse')
      : null;
    if (savedWarehouse) return savedWarehouse;
    return user?.ma_kho || 'HN01';
  });

  // Tự động đồng bộ kho theo User khi vừa đăng nhập
  useEffect(() => {
    const savedWarehouse = typeof window !== 'undefined'
      ? window.localStorage.getItem('selectedWarehouse')
      : null;
    if (user?.ma_kho && !savedWarehouse) {
      setSelectedWarehouseState(user.ma_kho);
    }
  }, [user]);

  // Hàm setter tự động lưu vào localStorage khi đổi kho
  const setSelectedWarehouse = (wh: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('selectedWarehouse', wh);
    }
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