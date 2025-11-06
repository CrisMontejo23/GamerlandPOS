"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/pos",       label: "POS" },
  { href: "/products",  label: "Productos" },
  { href: "/stock-in",  label: "Stock" },
  { href: "/sales",     label: "Ventas" },
  { href: "/expenses",  label: "Gastos" },
  { href: "/reports",   label: "Reportes" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="h-full flex flex-col">
      {/* Branding */}
      <div className="px-4 py-4 border-b">
        <Link href="/" className="text-lg font-semibold">GAMERLAND POS</Link>
        <p className="text-xs text-gray-500 mt-1">Panel principal</p>
      </div>

      {/* Navegación */}
      <nav className="flex-1 py-3">
        <ul className="space-y-1 px-2">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={[
                    "block rounded-lg px-3 py-2 text-sm transition",
                    active
                      ? "bg-gray-900 text-white"
                      : "text-gray-700 hover:bg-gray-100",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer Sidebar */}
      <div className="px-4 py-3 border-t text-xs text-gray-500">
        © {new Date().getFullYear()} Gamerland
      </div>
    </div>
  );
}