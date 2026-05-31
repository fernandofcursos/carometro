import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { setAuthErrorCallback } from "@workspace/api-client-react";

export type UsuarioDisciplina = {
  ofertaId: string;
  disciplinaId: string;
  disciplinaNome: string;
  cursoId: string;
  cursoNome: string;
  turnoId: string;
  turnoNome: string;
};
export type Role = { id: string; nome: string };

export type AuthUser = {
  id: string;
  nome: string | null;
  email: string;
  codigoAcesso: string;
  primeiroAcesso: boolean;
  roles: string[];
  allRoles: Role[];
  activeRoleId: string | null;
  permissions: string[];
  disciplinas: UsuarioDisciplina[];
};

type AuthCtx = {
  user: AuthUser | null;
  loading: boolean;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
  switchRole: (roleId: string) => Promise<void>;
};

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  refetch: async () => {},
  logout: async () => {},
  switchRole: async () => {},
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/me`, { credentials: "include" });
      if (res.ok) {
        setUser(await res.json());
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
    setLocation("/login");
  }, [setLocation]);

  const switchRole = useCallback(async (roleId: string) => {
    const res = await fetch(`${BASE}/api/auth/switch-role`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId }),
    });
    if (res.ok) {
      setUser(await res.json());
    }
  }, []);

  useEffect(() => {
    refetch().finally(() => setLoading(false));
  }, [refetch]);

  useEffect(() => {
    setAuthErrorCallback(() => {
      setUser(null);
      setLocation("/login");
    });
    return () => setAuthErrorCallback(null);
  }, [setLocation]);

  return (
    <AuthContext.Provider value={{ user, loading, refetch, logout, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useHasPermission(...permissions: string[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return permissions.every((p) => user.permissions.includes(p));
}

export function useHasRole(...roles: string[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return roles.some((r) => user.roles.includes(r));
}
