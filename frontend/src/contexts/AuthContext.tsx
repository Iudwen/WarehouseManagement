import React, { createContext, useEffect, useState, useContext } from 'react';
import type { ReactNode } from 'react';

export interface User {
  ma_nguoi_dung: string;
  email: string;
  ho_ten: string;
  vai_tro: 'ADMIN' | 'MANAGER' | 'STAFF';
  ma_kho: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, userData: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getStoredUser = (): User | null => {
  if (typeof window === 'undefined') return null;

  try {
    const savedUser = window.localStorage.getItem('wms_user');
    return savedUser ? JSON.parse(savedUser) : null;
  } catch {
    window.localStorage.removeItem('wms_user');
    return null;
  }
};

const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('wms_token');
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(getStoredUser);
  const [token, setToken] = useState<string | null>(getStoredToken);

  const login = (newToken: string, userData: User) => {
    localStorage.setItem('wms_token', newToken);
    localStorage.setItem('wms_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('wms_token');
      window.localStorage.removeItem('wms_user');
    }
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được sử dụng bên trong AuthProvider');
  }
  return context;
};