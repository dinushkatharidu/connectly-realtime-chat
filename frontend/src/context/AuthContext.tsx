import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setAuthToken } from "../api";
import type { User } from "../types";

type AuthState = {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token")
  );
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as User) : null;
  });

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      setAuth: (t, u) => {
        setToken(t);
        setUser(u);
        localStorage.setItem("token", t);
        localStorage.setItem("user", JSON.stringify(u));
        setAuthToken(t);
      },
      logout: () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setAuthToken(null);
      },
    }),
    [token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
