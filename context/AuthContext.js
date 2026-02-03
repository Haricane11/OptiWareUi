'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [role, setRole] = useState(null); // 'manager' | 'staff' | null
  const router = useRouter();

  const login = (selectedRole) => {
    setRole(selectedRole);
    if (selectedRole === 'manager') {
      router.push('/dashboard');
    } else {
      router.push('/staff');
    }
  };

  const logout = () => {
    setRole(null);
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
