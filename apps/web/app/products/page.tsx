"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, getApiBase } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

const API = getApiBase();

type Product = {
  id: number;
  sku: string;
  name: string;
  category?: string | null;
  price: string;
  cost?: string;
  active?: boolean;
  stock?: number;
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

  useEffect(() => {
    const load = async () => {
      const url = new URL(`${API}/products`);
      if (q) url.searchParams.set("q", q);
      if (includeInactive) url.searchParams.set("includeInactive", "true");
      url.searchParams.set("withStock", "true");
      const res = await apiFetch(url);
      const data = await res.json();
      setRows(data);
    };
    load();
  }, [q, includeInactive, reload]);

  const toggleActive = async (id: number, active: boolean) => {
    await apiFetch(`${API}/products/${id}/activate?active=${String(!active)}`, {
      method: "PATCH",
    });
    setReload((r) => r + 1);
  };

  const remove = async (id: number) => {
    if (!confirm("¿Eliminar este producto permanentemente?")) return;
    const r = await apiFetch(`${API}/products/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert(e?.error || "No se pudo eliminar (tiene ventas o movimientos)");
      return;
    }
    setReload((v) => v + 1);
  };

  const { role } = useAuth();

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
              boxShadow:
                "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
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
            backgroundColor: "#0F1030",
            border: "1px solid #1E1F4B",
          }}
          placeholder="Buscar por nombre, SKU o categoría"
          value={q}
          onChange={(e) => setQ(e.target.value.toUpperCase())}
        />
        <label className="flex items-center gap-2 text-sm uppercase text-gray-300">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Ver inactivos
        </label>
      </div>

      <div
        className="rounded-xl overflow-x-auto"
        style={{
          backgroundColor: "#14163A",
          border: "1px solid #1E1F4B",
        }}
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
      </div>
    </div>
  );
}
