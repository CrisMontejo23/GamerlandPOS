"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, getApiBase, getAuth } from "../lib/api";
import { usePathname, useRouter } from "next/navigation";

type Role = "ADMIN" | "EMPLOYEE";
type AuthCtx = {
  role: Role | null;
  username: string | null;
  token: string | null;
  ready: boolean;
  login: (u: string, p: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);
export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/** Mapa de rutas -> roles permitidos (App Router) */
const ROUTE_RULES: { test: (path: string) => boolean; allow: Role[] }[] = [
  // Público:
  { test: (p) => p === "/login", allow: ["ADMIN", "EMPLOYEE"] },

  // Acceso EMPLOYEE+ADMIN
  { test: (p) => p === "/pos", allow: ["ADMIN", "EMPLOYEE"] },
  { test: (p) => p === "/products", allow: ["ADMIN", "EMPLOYEE"] },
  { test: (p) => p === "/sales", allow: ["ADMIN", "EMPLOYEE"] },
  { test: (p) => p === "/expenses", allow: ["ADMIN", "EMPLOYEE"] },
  { test: (p) => p === "/reports", allow: ["ADMIN", "EMPLOYEE"] },

  // Solo ADMIN
  { test: (p) => p.startsWith("/stock-in"), allow: ["ADMIN"] },
  { test: (p) => p.startsWith("/products/new"), allow: ["ADMIN"] },
  { test: (p) => /^\/products\/\d+\/edit$/.test(p), allow: ["ADMIN"] },
];

function allowedFor(path: string, role: Role | null): boolean {
  // Por defecto, si no hay regla, requiramos login
  const rule = ROUTE_RULES.find((r) => r.test(path));
  if (!rule) return !!role;
  if (!role) return false;
  return rule.allow.includes(role);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const pathname = usePathname();
  const router = useRouter();

  // Carga inicial de storage + verificación del token
  useEffect(() => {
    const { token, role } = getAuth();
    const username = localStorage.getItem("auth_username") || null;
    if (token) {
      setToken(token);
      setRole((role as Role) || null);
      setUsername(username);
      // Valida en /auth/me (opcional: se puede diferir)
      apiFetch(`${getApiBase()}/auth/me`)
        .then(async (r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .catch(() => {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_role");
          localStorage.removeItem("auth_username");
          setToken(null);
          setRole(null);
          setUsername(null);
          if (pathname !== "/login") router.replace("/login");
        })
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Protección por ruta
  useEffect(() => {
    if (!ready) return;
    if (pathname === "/") return; // lo maneja page.tsx
    if (!token && pathname !== "/login") {
      router.replace("/login");
      return;
    }
    if (token && pathname === "/login") {
      router.replace("/pos");
      return;
    }
    if (!allowedFor(pathname, role)) {
      // Redirige si no tiene permiso
      router.replace(role ? "/pos" : "/login");
    }
  }, [ready, token, role, pathname, router]);

  const login = async (username: string, password: string) => {
    try {
      const r = await fetch(`${getApiBase()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await r.json();
      if (!r.ok) return { ok: false, error: data?.error || "No se pudo iniciar sesión" };

      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_role", data.role);
      localStorage.setItem("auth_username", data.username);
      setToken(data.token);
      setRole(data.role);
      setUsername(data.username);
      return { ok: true };
    } catch {
      return { ok: false, error: "Error de conexión" };
    }
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_role");
    localStorage.removeItem("auth_username");
    setToken(null);
    setRole(null);
    setUsername(null);
    router.replace("/login");
  };

  const value = useMemo(
    () => ({ role, username, token, ready, login, logout }),
    [role, username, token, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}