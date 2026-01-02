"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
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
    [role]
  );

  if (isLogin) {
    return <main className="flex-1 overflow-y-auto w-full">{children}</main>;
  }

  return (
    <>
      {/* Topbar móvil */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-panel border-b border-eon h-14 flex items-center px-4">
        <button
          className="mr-3 rounded-lg px-2 py-1 border border-eon text-gray-200"
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menú"
        >
          ☰
        </button>
        <div className="flex items-center gap-2">
          <Image
            src={logo}
            alt="Gamerland"
            width={28}
            height={28}
            className="rounded-full"
          />
          <span className="font-bold text-neon">GAMERLAND POS</span>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={[
          // ✅ IGUAL, pero en desktop queda fijo
          "bg-panel border-r border-eon w-64 z-50",
          "md:fixed md:top-0 md:left-0 md:h-screen md:translate-x-0 md:block",
          // ✅ Mobile drawer igual
          "fixed inset-y-0 left-0 transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          // ✅ Para que footer se pegue abajo
          "flex flex-col",
        ].join(" ")}
      >
        <div className="p-6 flex flex-col items-center border-b border-eon">
          <Image
            src={logo}
            alt="Gamerland Logo"
            width={140}
            height={140}
            className="rounded-full"
          />
          <h1 className="mt-3 text-neon font-bold text-lg text-center">
            GAMERLAND POS
          </h1>
          <p className="text-[11px] text-neon-2 tracking-wider mt-1 text-center">
            Tierra soñada de jugadores
          </p>
          {ready && (
            <div className="mt-3 text-xs text-gray-400">
              {username ? (
                <>
                  👤 {username} • <b className="text-neon">{role}</b>
                </>
              ) : (
                "No autenticado"
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "block py-2 px-3 rounded-lg transition",
                  active
                    ? "bg-[#1E1F4B] text-neon"
                    : "text-gray-300 hover:bg-[#1E1F4B] hover:text-neon",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <footer className="p-3 text-center text-xs text-gray-500 border-t border-eon">
          <button
            onClick={logout}
            className="w-full mb-2 py-2 rounded-lg font-semibold"
            style={{
              color: "#001014",
              background:
                "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
              boxShadow:
                "0 0 14px rgba(0,255,255,.25), 0 0 22px rgba(255,0,255,.2)",
            }}
          >
            Cerrar sesión
          </button>
          © 2026 GAMERLAND PC
        </footer>
      </aside>

      {/* Overlay móvil */}
      {open && (
        <button
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      {/* Contenido */}
      <main className="flex-1 overflow-y-auto w-full px-4 md:px-6 pt-14 md:pt-6 md:ml-64">
        {children}
      </main>
    </>
  );
}
