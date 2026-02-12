"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("optiware-token");
    const role = localStorage.getItem("optiware-role");
    if (token && role) {
      setUser({ token, role });
    }
    setLoading(false);
  }, []);

  const login = (token, role) => {
    localStorage.setItem("optiware-token", token);
    localStorage.setItem("optiware-role", role);
    setUser({ token, role });
    if (role === "manager") {
      router.push("/manager");
    } else {
      router.push("/staff");
    }
  };

  const logout = () => {
    localStorage.removeItem("optiware-token");
    localStorage.removeItem("optiware-role");
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
