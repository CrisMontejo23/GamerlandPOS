"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

type Product = {
  id: number;
  sku: string;
  name: string;
  category?: string | null;
  price: number | string;
  cost?: number | string;
  active?: boolean;
  stock?: number;
};

const UI = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  glow: "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
};

const fmtCOP = (v: unknown) => {
  const n = Number(v);
  return isNaN(n) ? "-" : `$${n.toLocaleString("es-CO")}`;
};

export default function ProductsPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Product[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [reload, setReload] = useState(0);

  // ---- Paginación (server-side) ----
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // Carga datos desde el backend (paginado en server)
  useEffect(() => {
    const load = async () => {
      const sp = new URLSearchParams();
      if (q) sp.set("q", q);
      if (includeInactive) sp.set("includeInactive", "true");
      sp.set("withStock", "true");
      sp.set("page", String(page));
      sp.set("pageSize", String(PAGE_SIZE));

      const res = await apiFetch(`/products?${sp.toString()}`);
      const data = await res.json(); // { total, rows }
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setTotal(Number(data?.total ?? 0));
    };
    load();
  }, [q, includeInactive, page, reload]);

  // Derivados de paginación
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  // Rango compacto de páginas
  const pageRange = useMemo(() => {
    const maxToShow = 7;
    if (totalPages <= maxToShow) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const out: (number | "…")[] = [];
    const add = (n: number | "…") => out.push(n);
    const left = Math.max(2, safePage - 2);
    const right = Math.min(totalPages - 1, safePage + 2);

    add(1);
    if (left > 2) add("…");
    for (let p = left; p <= right; p++) add(p);
    if (right < totalPages - 1) add("…");
    add(totalPages);
    return out;
  }, [safePage, totalPages]);

  // Rangos "Mostrando X – Y de Z"
  const startItem = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(safePage * PAGE_SIZE, total);

  const toggleActive = async (id: number, active: boolean) => {
    await apiFetch(`/products/${id}/activate?active=${String(!active)}`, {
      method: "PATCH",
    });
    setReload((r) => r + 1);
  };

  const remove = async (id: number) => {
    if (!confirm("¿Eliminar este producto permanentemente?")) return;
    const r = await apiFetch(`/products/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert(e?.error || "No se pudo eliminar (tiene ventas o movimientos)");
      return;
    }
    setReload((v) => v + 1);
  };

  const { role } = useAuth();

  // Handlers que resetean a la primera página
  const onSearchChange = (val: string) => {
    setQ(val.toUpperCase());
    setPage(1);
  };
  const onToggleInactive = (checked: boolean) => {
    setIncludeInactive(checked);
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto text-gray-200">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-5 gap-3">
        <h1 className="text-2xl font-bold text-cyan-400">PRODUCTOS</h1>
        {role === "ADMIN" && (
          <Link
            href="/products/new"
            className="px-5 py-2.5 rounded-lg font-semibold text-[#001014]"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
              boxShadow: UI.glow,
            }}
          >
            NUEVO
          </Link>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          className="rounded px-3 py-2 flex-1 text-gray-100 placeholder-gray-400 outline-none"
          style={{
            backgroundColor: UI.input,
            border: `1px solid ${UI.border}`,
          }}
          placeholder="Buscar por nombre, SKU o categoría"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm uppercase text-gray-300">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => onToggleInactive(e.target.checked)}
          />
          Ver inactivos
        </label>
      </div>

      <div
        className="rounded-xl overflow-x-auto"
        style={{ backgroundColor: UI.bgCard, border: `1px solid ${UI.border}` }}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-sm text-cyan-300 bg-[#1E1F4B] uppercase">
              <th className="py-2 px-3 text-left">ID</th>
              <th className="px-3 text-left">SKU</th>
              <th className="px-3 text-left">NOMBRE</th>
              <th className="px-3 text-left">CATEGORÍA</th>
              <th className="px-3 text-right">STOCK</th>
              <th className="px-3 text-right">PRECIO</th>
              <th className="px-3 text-right">COSTO</th>
              <th className="px-3 text-center">ESTADO</th>
              <th className="px-3 text-right">ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                className="border-b border-[#1E1F4B] hover:bg-[#191B4B]"
              >
                <td className="py-2 px-3">{p.id}</td>
                <td className="px-3 font-mono">{p.sku?.toUpperCase()}</td>
                <td className="px-3">{p.name?.toUpperCase()}</td>
                <td className="px-3">{(p.category || "-").toUpperCase()}</td>
                <td className="px-3 text-right">{Number(p.stock ?? 0)}</td>
                <td className="px-3 text-right text-cyan-300">
                  {fmtCOP(p.price)}
                </td>
                <td className="px-3 text-right text-pink-300">
                  {fmtCOP(p.cost)}
                </td>
                <td className="px-3 text-center">
                  {p.active === false ? (
                    <span className="text-red-400">INACTIVO</span>
                  ) : (
                    <span className="text-green-400">ACTIVO</span>
                  )}
                </td>
                <td className="px-3 text-right space-x-2">
                  {role === "ADMIN" ? (
                    <>
                      <Link
                        href={`/products/${p.id}/edit`}
                        className="underline text-cyan-300"
                      >
                        Editar
                      </Link>
                      <button
                        onClick={() => toggleActive(p.id, p.active !== false)}
                        className="underline text-yellow-300"
                      >
                        {p.active === false ? "Activar" : "Desactivar"}
                      </button>
                      <button
                        onClick={() => remove(p.id)}
                        className="underline text-pink-400"
                      >
                        Eliminar
                      </button>
                    </>
                  ) : (
                    <span className="text-gray-500 text-sm">Solo lectura</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-4 px-3 text-center text-gray-400" colSpan={9}>
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Paginador */}
        <div
          className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between p-3"
          style={{ borderTop: `1px solid ${UI.border}` }}
        >
          <div className="text-xs text-gray-300">
            Mostrando <b>{startItem}</b> – <b>{endItem}</b> de <b>{total}</b>
          </div>

          <div className="flex items-center gap-1">
            <PagerButton
              label="«"
              disabled={safePage === 1}
              onClick={() => setPage(1)}
            />
            <PagerButton
              label="‹"
              disabled={safePage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            />

            {pageRange.map((p, idx) =>
              p === "…" ? (
                <span
                  key={`dots-${idx}`}
                  className="px-2 text-gray-400 select-none"
                >
                  …
                </span>
              ) : (
                <PagerButton
                  key={p}
                  label={String(p)}
                  active={p === safePage}
                  onClick={() => setPage(p)}
                />
              )
            )}

            <PagerButton
              label="›"
              disabled={safePage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
            <PagerButton
              label="»"
              disabled={safePage === totalPages}
              onClick={() => setPage(totalPages)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Botón pager ===== */
function PagerButton({
  label,
  onClick,
  disabled,
  active,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  const base =
    "px-3 py-1.5 rounded border text-sm select-none transition transform";
  const border = `1px solid ${UI.border}`;
  const activeStyle = {
    background:
      "linear-gradient(90deg, rgba(0,255,255,0.22), rgba(255,0,255,0.22))",
    boxShadow: UI.glow,
    color: "#E5E7EB",
    cursor: "default",
  } as React.CSSProperties;
  const normalStyle = {
    backgroundColor: "#0F1030",
    border,
    color: "#D1D5DB",
  } as React.CSSProperties;
  const disabledStyle = {
    opacity: 0.45,
    cursor: "not-allowed",
  } as React.CSSProperties;

  return (
    <button
      className={`${base} ${active ? "font-semibold" : ""}`}
      style={{
        ...(active ? activeStyle : normalStyle),
        ...(disabled ? disabledStyle : {}),
      }}
      onClick={() => !disabled && !active && onClick()}
      disabled={disabled || active}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </button>
  );
}