"use client";

const API = process.env.NEXT_PUBLIC_API_URL || "/api";

export function getApiBase() {
  return API;
}

export function getAuth() {
  if (typeof window === "undefined") {
    return { token: "", role: "" as "ADMIN" | "EMPLOYEE" | "" };
  }
  const token = localStorage.getItem("auth_token") || "";
  const role = (localStorage.getItem("auth_role") || "") as "ADMIN" | "EMPLOYEE" | "";
  return { token, role };
}

// Une base + path relativo de forma segura.
function resolveUrl(input: string | URL): string {
  const s = input instanceof URL ? input.toString() : String(input);
  // Si ya es absoluta (http/https), no tocar
  if (/^https?:\/\//i.test(s)) return s;
  // Si es relativa, anteponer API
  if (s.startsWith("/")) return `${API}${s}`;
  return `${API}/${s}`;
}

export async function apiFetch(input: string | URL, init: RequestInit = {}) {
  const { token } = getAuth();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");

  const url = resolveUrl(input);

  const res = await fetch(url, { ...init, headers });

  // Auto-logout si 401
  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_role");
    localStorage.removeItem("auth_username");
    window.location.href = "/login";
    throw new Error("Sesión expirada");
  }
  return res;
}