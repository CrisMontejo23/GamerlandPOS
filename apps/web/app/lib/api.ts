"use client";

export function getAuth() {
  if (typeof window === "undefined") {
    return { token: "", role: "" as "ADMIN" | "EMPLOYEE" | "" };
  }
  const token = localStorage.getItem("auth_token") || "";
  const role = (localStorage.getItem("auth_role") || "") as "ADMIN" | "EMPLOYEE" | "";
  return { token, role };
}

/** Normaliza rutas al backend:
 * - Si es absoluta (http/https), la deja igual.
 * - Si es relativa, garantiza que sea /api/...
 */
function toApiUrl(input: string | URL): string {
  const s = input instanceof URL ? input.toString() : String(input);
  if (/^https?:\/\//i.test(s)) return s; // absoluta → no tocar
  let path = s.startsWith("/") ? s : `/${s}`;
  if (!path.startsWith("/api/")) path = `/api${path}`;
  return path;
}

export async function apiFetch(input: string | URL, init: RequestInit = {}) {
  const { token } = getAuth();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");

  const url = toApiUrl(input);
  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_role");
    localStorage.removeItem("auth_username");
    window.location.href = "/login";
    throw new Error("Sesión expirada");
  }
  return res;
}