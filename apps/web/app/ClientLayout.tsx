"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import logo from "../assets/logo.png";
import { useAuth } from "./auth/AuthProvider";

// 🔧 Define el tipo Role y úsalo en NAV_ALL
type Role = "ADMIN" | "EMPLOYEE";

const NAV_ALL: Array<{
  href: string;
  label: string;
  allow: ReadonlyArray<Role>;
}> = [
  { href: "/pos", label: "💰 POS", allow: ["ADMIN", "EMPLOYEE"] },
  { href: "/products", label: "📦 Inventario", allow: ["ADMIN", "EMPLOYEE"] },
  { href: "/sales", label: "📈 Ventas", allow: ["ADMIN", "EMPLOYEE"] },
  { href: "/expenses", label: "💸 Gastos", allow: ["ADMIN", "EMPLOYEE"] },
  { href: "/works", label: "🛠️ Trabajos", allow: ["ADMIN", "EMPLOYEE"] },
  {
    href: "/layaways",
    label: "📜 Encargos / Apartados",
    allow: ["ADMIN", "EMPLOYEE"],
  },
  { href: "/reports", label: "📄 Balances", allow: ["ADMIN", "EMPLOYEE"] },
  { href: "/users", label: "👥 Usuarios", allow: ["ADMIN"] },
];

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  const [open, setOpen] = useState(false);
  const { role, username, logout, ready } = useAuth(); // role: Role | null

  // Cerrar menú al navegar
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  const nav = useMemo(
    () =>
      NAV_ALL.filter((i) => (role ? i.allow.includes(role as Role) : false)),
    [role],
  );

  if (isLogin) {
    return <main className="flex-1 overflow-y-auto w-full">{children}</main>;
  }

  return (
    <>
      {/* Topbar móvil (mejor visual) */}
      <div
        className={cx(
          "md:hidden fixed top-0 inset-x-0 z-40 h-14 px-3",
          "flex items-center justify-between",
          "border-b border-eon bg-panel/90",
          "backdrop-blur-md",
        )}
        style={{
          boxShadow:
            "0 0 18px rgba(0,255,255,.08), 0 0 18px rgba(255,0,255,.06)",
        }}
      >
        <button
          className={cx(
            "rounded-xl px-3 py-2 text-gray-200",
            "border border-eon",
            "hover:bg-[#1E1F4B] active:scale-[.99] transition",
          )}
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menú"
        >
          ☰
        </button>

        <div className="flex items-center gap-2">
          {/* ✅ CAMBIO: el contorno ahora es CUADRADO (no redondo), para que cuadre con tu logo */}
          <div
            className="rounded-xl p-[2px]"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,255,255,.7), rgba(255,0,255,.7))",
              boxShadow:
                "0 0 14px rgba(0,255,255,.20), 0 0 18px rgba(255,0,255,.16)",
            }}
          >
            <Image
              src={logo}
              alt="Gamerland"
              width={28}
              height={28}
              className="rounded-lg bg-panel"
            />
          </div>

          <span className="font-extrabold text-neon tracking-wide">
            GAMERLAND
          </span>
        </div>

        {/* Chip de usuario (móvil) */}
        <div className="text-[11px] text-gray-300">
          {ready && username ? (
            <span className="px-2 py-1 rounded-full border border-eon bg-[#0F1030]/60">
              👤 <b className="text-neon">{username}</b>
            </span>
          ) : (
            <span className="px-2 py-1 rounded-full border border-eon bg-[#0F1030]/60">
              ⚪ Offline
            </span>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={cx(
          "w-64 z-50 flex flex-col overflow-y-auto",
          "border-r border-eon",
          // fondo + blur
          "bg-panel/85 backdrop-blur-md",
          // desktop fijo
          "md:fixed md:top-0 md:left-0 md:h-[100dvh] md:translate-x-0 md:block",
          // mobile drawer
          "fixed inset-y-0 left-0 transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{
          boxShadow:
            "0 0 22px rgba(0,255,255,.10), 0 0 26px rgba(255,0,255,.08)",
        }}
      >
        {/* Glow decorativo superior */}
        <div
          className="h-24 -mb-10"
          style={{
            background:
              "radial-gradient(220px 90px at 30% 40%, rgba(0,255,255,.25), transparent 70%), radial-gradient(240px 100px at 70% 10%, rgba(255,0,255,.18), transparent 70%)",
          }}
        />

        {/* Header */}
        <div
          className={cx(
            "border-b border-eon",
            "px-5 pt-4 pb-4",
            "[@media(max-height:750px)]:px-4 [@media(max-height:750px)]:pt-3 [@media(max-height:750px)]:pb-3",
            "[@media(max-height:650px)]:px-3 [@media(max-height:650px)]:pt-2 [@media(max-height:650px)]:pb-2",
          )}
        >
          <div className="flex items-center gap-3">
            {/* ✅ CAMBIO: marco cuadrado con esquinas suaves, perfecto para logo cuadrado */}
            <div
              className="rounded-2xl p-[2px]"
              style={{
                background:
                  "linear-gradient(90deg, rgba(0,255,255,.70), rgba(255,0,255,.70))",
                boxShadow:
                  "0 0 16px rgba(0,255,255,.18), 0 0 18px rgba(255,0,255,.14)",
              }}
            >
              <Image
                src={logo}
                alt="Gamerland Logo"
                width={56}
                height={56}
                className={cx(
                  "rounded-xl bg-panel",
                  "[@media(max-height:750px)]:w-[50px] [@media(max-height:750px)]:h-[50px]",
                  "[@media(max-height:650px)]:w-[44px] [@media(max-height:650px)]:h-[44px]",
                )}
              />
            </div>

            <div className="min-w-0">
              <h1 className="text-neon font-extrabold text-base tracking-wide leading-tight">
                GAMERLAND POS
              </h1>
              <p className="text-[11px] text-neon-2 tracking-wider">
                Tierra soñada de jugadores
              </p>
            </div>
          </div>

          {/* Usuario */}
          {ready && (
            <div className="mt-3 flex items-center justify-between gap-2">
              {username ? (
                <>
                  <div className="text-xs text-gray-300 truncate">
                    👤 <b className="text-neon">{username}</b>
                  </div>
                  <span className="text-[11px] px-2 py-1 rounded-full border border-eon bg-[#0F1030]/60">
                    {role}
                  </span>
                </>
              ) : (
                <div className="text-xs text-gray-400">No autenticado</div>
              )}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="p-3 space-y-2">
          <div className="px-2 pt-1 pb-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-gray-400">
              Menú
            </div>
          </div>

          {nav.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "group relative block rounded-xl px-3 py-2",
                  "transition",
                  active
                    ? "bg-[#1E1F4B] text-neon"
                    : "text-gray-300 hover:bg-[#1E1F4B] hover:text-neon",
                )}
                style={{
                  boxShadow: active
                    ? "inset 0 0 0 1px rgba(0,255,255,.18), 0 0 16px rgba(0,255,255,.08)"
                    : undefined,
                }}
              >
                {/* Barrita lateral cuando está activo */}
                <span
                  className={cx(
                    "absolute left-1 top-1 bottom-1 w-[3px] rounded-full",
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-70",
                  )}
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(0,255,255,.9), rgba(255,0,255,.9))",
                    boxShadow:
                      "0 0 10px rgba(0,255,255,.18), 0 0 10px rgba(255,0,255,.14)",
                  }}
                />

                <div className="flex items-center justify-between">
                  <span className="font-semibold">{item.label}</span>
                  <span
                    className={cx(
                      "text-xs opacity-0 group-hover:opacity-100 transition",
                      active && "opacity-100",
                    )}
                    style={{ color: "rgba(0,255,255,.9)" }}
                  >
                    ›
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer sticky */}
        <footer className="mt-auto sticky bottom-0 p-3 border-t border-eon bg-panel/90 backdrop-blur-md">
          <button
            onClick={logout}
            className={cx(
              "w-full mb-2 py-2 rounded-xl font-extrabold",
              "active:scale-[.99] transition",
            )}
            style={{
              color: "#001014",
              background:
                "linear-gradient(90deg, rgba(0,255,255,0.90), rgba(255,0,255,0.90))",
              boxShadow:
                "0 0 14px rgba(0,255,255,.25), 0 0 22px rgba(255,0,255,.2)",
            }}
          >
            Cerrar sesión
          </button>

          <div className="flex items-center justify-between text-[11px] text-gray-400 px-1">
            <span>© 2026 v2.0</span>
            <span className="text-neon-2 font-semibold">GAMERLAND PC</span>
          </div>
        </footer>
      </aside>

      {/* Overlay móvil */}
      {open && (
        <button
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      {/* Contenido */}
      <main className="flex-1 min-h-0 overflow-y-auto w-full px-4 md:px-6 pt-14 md:pt-6 md:ml-64">
        {children}
      </main>
    </>
  );
}