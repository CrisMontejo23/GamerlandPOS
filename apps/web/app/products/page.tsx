"use client";
import { useEffect, useMemo, useState } from "react";
import type React from "react";
import Link from "next/link";
import Image from "next/image";
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

/* ===== UI: GamerToast / GamerConfirm ===== */
type ToastKind = "success" | "error" | "info";

function GamerToast({
  open,
  kind,
  title,
  subtitle,
  onClose,
}: {
  open: boolean;
  kind: ToastKind;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  if (!open) return null;

  const borderGrad =
    kind === "success"
      ? "linear-gradient(90deg, rgba(0,255,255,.8), rgba(0,255,127,.8))"
      : kind === "error"
      ? "linear-gradient(90deg, rgba(255,99,132,.9), rgba(255,0,128,.9))"
      : "linear-gradient(90deg, rgba(99,102,241,.9), rgba(168,85,247,.9))";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pointer-events-none">
      <div className="mt-4 w-full max-w-md px-3 pointer-events-auto">
        <div
          className="rounded-xl p-[1px] shadow-2xl"
          style={{ backgroundImage: borderGrad }}
        >
          <div className="rounded-xl px-4 py-3 bg-[#050718] flex gap-3 items-start">
            <div className="mt-1 h-2 w-2 rounded-full animate-pulse bg-cyan-400" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-50 uppercase tracking-wide">
                {title}
              </div>
              {subtitle && (
                <div className="text-xs text-gray-300 mt-1">{subtitle}</div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-xs text-gray-400 hover:text-gray-100 ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GamerConfirm({
  open,
  title,
  subtitle,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3">
      <div
        className="w-full max-w-md rounded-xl p-[1px] shadow-2xl"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(0,255,255,.7), rgba(255,0,255,.7))",
        }}
      >
        <div
          className="rounded-xl px-4 py-4 space-y-3"
          style={{ backgroundColor: UI.bgCard }}
        >
          <h3 className="text-lg font-semibold text-cyan-300 uppercase tracking-wide text-center">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-gray-200 text-center">{subtitle}</p>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded border text-xs sm:text-sm uppercase"
              style={{ borderColor: UI.border }}
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className="px-5 py-2.5 rounded-lg font-semibold text-xs sm:text-sm uppercase"
              style={{
                color: "#001014",
                background:
                  "linear-gradient(90deg, rgba(255,0,128,0.95), rgba(255,99,132,0.95))",
                boxShadow: UI.glow,
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Página ===== */
export default function ProductsPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Product[]>([]);
  const [reload, setReload] = useState(0);

  // ---- Paginación (server-side) ----
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // Toast gamer
  const [toastOpen, setToastOpen] = useState(false);
  const [toastKind, setToastKind] = useState<ToastKind>("info");
  const [toastTitle, setToastTitle] = useState("");
  const [toastSubtitle, setToastSubtitle] = useState<string | undefined>();

  const showToast = (kind: ToastKind, title: string, subtitle?: string) => {
    setToastKind(kind);
    setToastTitle(title);
    setToastSubtitle(subtitle);
    setToastOpen(true);
    setTimeout(() => setToastOpen(false), 2600);
  };

  // Confirm gamer para eliminar
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Carga datos desde el backend (paginado en server)
  useEffect(() => {
    const load = async () => {
      const sp = new URLSearchParams();
      if (q) sp.set("q", q);
      sp.set("withStock", "true");
      sp.set("page", String(page));
      sp.set("pageSize", String(PAGE_SIZE));

      const res = await apiFetch(`/products?${sp.toString()}`);
      const data = await res.json(); // { total, rows }
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setTotal(Number(data?.total ?? 0));
    };
    load();
  }, [q, page, reload]);

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

  const doRemove = async () => {
    if (confirmDeleteId == null) return;

    try {
      const r = await apiFetch(`/products/${confirmDeleteId}`, {
        method: "DELETE",
      });

      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        showToast(
          "error",
          "No se pudo eliminar",
          e?.error || "El producto tiene ventas o movimientos registrados."
        );
        return;
      }

      showToast("success", "Producto eliminado", `ID ${confirmDeleteId}`);
      setReload((v) => v + 1);
    } catch {
      showToast(
        "error",
        "Error al eliminar",
        "Ocurrió un error inesperado eliminando el producto."
      );
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const { role } = useAuth();

  // Handlers que resetean a la primera página
  const onSearchChange = (val: string) => {
    setQ(val.toUpperCase());
    setPage(1);
  };

  return (
    <>
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
          {/* checkbox "Ver inactivos" eliminado */}
        </div>

        <div
          className="rounded-xl overflow-x-auto"
          style={{
            backgroundColor: UI.bgCard,
            border: `1px solid ${UI.border}`,
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
                {/* Columna ESTADO eliminada */}
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
                  <td className="px-3 text-right">
                    {role === "ADMIN" ? (
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/products/${p.id}/edit`}
                          className="inline-flex items-center justify-center rounded-md p-1 hover:bg-white/5 transition transform hover:scale-110"
                          aria-label="Editar producto"
                        >
                          <Image
                            src="/edit.png"
                            alt="Editar"
                            width={18}
                            height={18}
                            className="opacity-90"
                          />
                        </Link>
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          className="inline-flex items-center justify-center rounded-md p-1 hover:bg-white/5 transition transform hover:scale-110"
                          aria-label="Eliminar producto"
                        >
                          <Image
                            src="/borrar.png"
                            alt="Eliminar"
                            width={18}
                            height={18}
                            className="opacity-90"
                          />
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-500 text-sm">
                        Solo lectura
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    className="py-4 px-3 text-center text-gray-400"
                    colSpan={8}
                  >
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

      {/* Toast gamer */}
      <GamerToast
        open={toastOpen}
        kind={toastKind}
        title={toastTitle}
        subtitle={toastSubtitle}
        onClose={() => setToastOpen(false)}
      />

      {/* Confirm gamer eliminar producto */}
      <GamerConfirm
        open={confirmDeleteId !== null}
        title="¿Eliminar producto?"
        subtitle="Esta acción no se puede deshacer y no podrás recuperar el producto."
        confirmLabel="Eliminar definitivamente"
        cancelLabel="Cancelar"
        onConfirm={doRemove}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </>
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
