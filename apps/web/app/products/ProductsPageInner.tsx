"use client";
import { useEffect, useMemo, useState } from "react";
import type React from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
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

type MovementType = "in" | "out";

const UI = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  glow: "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
};

const ACTION_ICON = {
  btn: "p-2 sm:p-1", // área táctil grande en móvil
  box: "h-9 w-9 sm:h-5 sm:w-5", // icono grande móvil / normal desktop
  sizes: "(max-width: 640px) 36px, 20px",
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

/* ===== helpers categoría ===== */
const normCat = (c?: string | null) => (c ?? "").trim().toUpperCase();

/* ===== Página ===== */
export default function ProductsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role } = useAuth();

  // Estado inicial desde la URL
  const [q, setQ] = useState(() => (searchParams.get("q") ?? "").toUpperCase());
  const [page, setPage] = useState(() => {
    const raw = searchParams.get("page");
    const n = raw ? parseInt(raw, 10) : 1;
    return Number.isNaN(n) || n < 1 ? 1 : n;
  });
  const [categoryFilters, setCategoryFilters] = useState<string[]>(() => {
    const raw = searchParams.get("cat");
    return raw ? raw.split(",").filter(Boolean) : [];
  });

  const [rows, setRows] = useState<Product[]>([]);
  const [reload, setReload] = useState(0);

  // Paginación (client-side)
  const PAGE_SIZE = 10;

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

  // ===== Modal de ajuste de stock =====
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [movementType, setMovementType] = useState<MovementType>("in");
  const [stockQty, setStockQty] = useState<number | "">("");
  const [stockUnitCost, setStockUnitCost] = useState<number | "">("");

  const resetStockModal = () => {
    setStockProduct(null);
    setMovementType("in");
    setStockQty("");
    setStockUnitCost("");
    setStockModalOpen(false);
  };

  const openStockModal = (p: Product) => {
    setStockProduct(p);
    setMovementType("in");
    setStockQty("");
    setStockUnitCost("");
    setStockModalOpen(true);
  };

  const stockSaveDisabled =
    !stockProduct ||
    !stockQty ||
    Number(stockQty) <= 0 ||
    (movementType === "in" &&
      (stockUnitCost === "" ||
        Number(stockUnitCost) < 0 ||
        isNaN(Number(stockUnitCost))));

  const currentCost = Number(stockProduct?.cost ?? 0);
  const newUnitCost = Number(stockUnitCost || 0);
  const newLotCost =
    movementType === "in" && stockQty && newUnitCost
      ? newUnitCost * Number(stockQty)
      : 0;

  const doSaveStockMovement = async () => {
    if (!stockProduct || !stockQty || Number(stockQty) <= 0) return;

    try {
      if (movementType === "in") {
        if (stockUnitCost === "" || Number(stockUnitCost) < 0) return;

        const payload = {
          productId: stockProduct.id,
          qty: Number(stockQty),
          unitCost: Number(stockUnitCost),
          reference: "COMPRA",
        };

        const r = await apiFetch(`/stock/in`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          showToast(
            "error",
            "No se pudo registrar el ingreso",
            e?.error || "Verifica los datos e intenta de nuevo."
          );
          return;
        }

        showToast(
          "success",
          "Ingreso de stock registrado",
          `Producto ${stockProduct.sku} – +${stockQty} uds.`
        );
      } else {
        const payload = {
          productId: stockProduct.id,
          qty: Number(stockQty),
          reference: "AJUSTE",
        };

        const r = await apiFetch(`/stock/out`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          showToast(
            "error",
            "No se pudo registrar la salida",
            e?.error || "Verifica los datos e intenta de nuevo."
          );
          return;
        }

        showToast(
          "success",
          "Salida de stock registrada",
          `Producto ${stockProduct.sku} – -${stockQty} uds.`
        );
      }

      setReload((v) => v + 1);
      resetStockModal();
    } catch {
      showToast(
        "error",
        "Error de comunicación",
        "No se pudo contactar el servidor."
      );
    }
  };

  // Carga datos desde el backend (una sola página grande)
  useEffect(() => {
    const load = async () => {
      const sp = new URLSearchParams();
      if (q) sp.set("q", q);
      sp.set("withStock", "true");
      sp.set("includeInactive", "true");
      sp.set("page", "1");
      sp.set("pageSize", "2000"); // el backend ya corta a 1000

      const res = await apiFetch(`/products?${sp.toString()}`);
      const data = await res.json(); // { total, rows } o array
      const rows: Product[] = Array.isArray(data?.rows) ? data.rows : data;
      setRows(Array.isArray(rows) ? rows : []);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, reload]);

  // ====== ORDEN ALFABÉTICO por nombre ======
  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "es", {
          sensitivity: "base",
        })
      ),
    [rows]
  );

  // ====== Lista de categorías únicas ======
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of rows) {
      const c = normCat(p.category);
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [rows]);

  // ====== Filtro por categoría ======
  const filteredRows = useMemo(() => {
    if (!categoryFilters.length) return sortedRows;
    return sortedRows.filter((p) =>
      categoryFilters.includes(normCat(p.category))
    );
  }, [sortedRows, categoryFilters]);

  // Paginación client-side
  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  // Rango de páginas
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

  const syncUrl = (
    nextQ: string,
    nextPage: number,
    nextCatFilters: string[]
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextQ) params.set("q", nextQ);
    else params.delete("q");

    params.set("page", String(nextPage));

    if (nextCatFilters.length) {
      params.set("cat", nextCatFilters.join(","));
    } else {
      params.delete("cat");
    }

    params.delete("status");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

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

  // Handlers búsqueda
  const onSearchChange = (val: string) => {
    const nextQ = val.toUpperCase();
    setQ(nextQ);
    setPage(1);
    syncUrl(nextQ, 1, categoryFilters);
  };

  const clearSearch = () => {
    setQ("");
    setPage(1);
    syncUrl("", 1, categoryFilters);
  };

  const toggleCategoryFilter = (cat: string) => {
    setPage(1);
    setCategoryFilters((prev) => {
      const exists = prev.includes(cat);
      const next = exists ? prev.filter((p) => p !== cat) : [...prev, cat];
      syncUrl(q, 1, next);
      return next;
    });
  };

  const clearCategoryFilters = () => {
    setCategoryFilters([]);
    setPage(1);
    syncUrl(q, 1, []);
  };

  // Leer status para mostrar toast al volver de crear/editar
  useEffect(() => {
    const status = searchParams.get("status");
    if (!status) return;

    if (status === "created") {
      showToast(
        "success",
        "Producto creado",
        "El producto se guardó correctamente."
      );
    } else if (status === "updated") {
      showToast(
        "success",
        "Producto actualizado",
        "Los cambios fueron guardados."
      );
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("status");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  return (
    <>
      <div className="max-w-7xl mx-auto text-gray-200">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-5 gap-3">
          <h1 className="text-2xl font-bold text-cyan-400">PRODUCTOS</h1>
          {role === "ADMIN" && (
            <Link
              href={{
                pathname: "/products/new",
                query: {
                  from: "products",
                  q: q || undefined,
                  page: String(safePage),
                  cat: categoryFilters.length
                    ? categoryFilters.join(",")
                    : undefined,
                },
              }}
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

        {/* Buscador + filtros categoría */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                className="rounded px-3 py-2 w-full text-gray-100 placeholder-gray-400 outline-none pr-8"
                style={{
                  backgroundColor: UI.input,
                  border: `1px solid ${UI.border}`,
                }}
                placeholder="Buscar por nombre, SKU o categoría"
                value={q}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {q && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-100"
                  title="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {allCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-gray-300">Filtrar por categoría:</span>
              {allCategories.map((cat) => {
                const active = categoryFilters.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategoryFilter(cat)}
                    className={`px-2 py-1 rounded border transition transform hover:scale-105 ${
                      active
                        ? "bg-cyan-500/20 text-cyan-300"
                        : "text-gray-300 hover:bg-white/5"
                    }`}
                    style={{ borderColor: UI.border }}
                  >
                    {cat}
                  </button>
                );
              })}
              {categoryFilters.length > 0 && (
                <button
                  onClick={clearCategoryFilters}
                  className="ml-2 px-2 py-1 rounded border text-[11px] uppercase tracking-wide text-gray-300 hover:bg-white/5"
                  style={{ borderColor: UI.border }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
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
                <th className="px-3 text-right">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[#1E1F4B] hover:bg-[#191B4B]"
                >
                  <td className="py-2 px-3">{p.id}</td>
                  <td className="px-3 font-mono">{p.sku?.toUpperCase()}</td>
                  <td className="px-3">{p.name?.toUpperCase()}</td>
                  <td className="px-3">{normCat(p.category) || "-"}</td>
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
                        <button
                          onClick={() => openStockModal(p)}
                          className={`inline-flex items-center justify-center rounded-md ${ACTION_ICON.btn} hover:bg-white/5 transition transform hover:scale-110`}
                          aria-label="Ajustar stock"
                          title="Ajustar stock"
                        >
                          <span className={`relative ${ACTION_ICON.box}`}>
                            <Image
                              src="/añadir.png"
                              alt="Ajustar stock"
                              fill
                              sizes={ACTION_ICON.sizes}
                              className="object-contain opacity-90"
                            />
                          </span>
                        </button>

                        <Link
                          href={{
                            pathname: `/products/${p.id}/edit`,
                            query: {
                              from: "products",
                              q: q || undefined,
                              page: String(safePage),
                              cat: categoryFilters.length
                                ? categoryFilters.join(",")
                                : undefined,
                            },
                          }}
                          className={`inline-flex items-center justify-center rounded-md ${ACTION_ICON.btn} hover:bg-white/5 transition transform hover:scale-110`}
                          aria-label="Editar producto"
                          title="Editar producto"
                        >
                          <span className={`relative ${ACTION_ICON.box}`}>
                            <Image
                              src="/edit.png"
                              alt="Editar"
                              fill
                              sizes={ACTION_ICON.sizes}
                              className="object-contain opacity-90"
                            />
                          </span>
                        </Link>

                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          className={`inline-flex items-center justify-center rounded-md ${ACTION_ICON.btn} hover:bg-white/5 transition transform hover:scale-110`}
                          aria-label="Eliminar producto"
                          title="Eliminar producto"
                        >
                          <span className={`relative ${ACTION_ICON.box}`}>
                            <Image
                              src="/borrar.png"
                              alt="Eliminar"
                              fill
                              sizes={ACTION_ICON.sizes}
                              className="object-contain opacity-90"
                            />
                          </span>
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
              {pageRows.length === 0 && (
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
                onClick={() => {
                  setPage(1);
                  syncUrl(q, 1, categoryFilters);
                }}
              />
              <PagerButton
                label="‹"
                disabled={safePage === 1}
                onClick={() => {
                  const next = Math.max(1, safePage - 1);
                  setPage(next);
                  syncUrl(q, next, categoryFilters);
                }}
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
                    onClick={() => {
                      setPage(p);
                      syncUrl(q, p, categoryFilters);
                    }}
                  />
                )
              )}

              <PagerButton
                label="›"
                disabled={safePage === totalPages}
                onClick={() => {
                  const next = Math.min(totalPages, safePage + 1);
                  setPage(next);
                  syncUrl(q, next, categoryFilters);
                }}
              />
              <PagerButton
                label="»"
                disabled={safePage === totalPages}
                onClick={() => {
                  setPage(totalPages);
                  syncUrl(q, totalPages, categoryFilters);
                }}
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

      {/* Modal gamer de ajuste de stock */}
      {stockModalOpen && stockProduct && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div
            className="w-full max-w-xl rounded-2xl p-[1px] shadow-2xl"
            style={{
              backgroundImage:
                "linear-gradient(135deg, rgba(0,255,255,.7), rgba(255,0,255,.7))",
            }}
          >
            <div
              className="rounded-2xl px-6 py-5 space-y-5"
              style={{ backgroundColor: UI.bgCard }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold text-cyan-300 uppercase tracking-wide">
                    Ajuste de stock
                  </h3>
                  <p className="text-sm text-gray-300 mt-1">
                    <span className="font-mono text-pink-300">
                      {stockProduct.sku}
                    </span>{" "}
                    — {stockProduct.name}
                  </p>
                </div>
                <button
                  onClick={resetStockModal}
                  className="text-xs text-gray-400 hover:text-gray-100"
                >
                  ✕
                </button>
              </div>

              {/* Selector tipo de movimiento */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm text-gray-300">
                  Tipo de movimiento:
                </span>
                <div className="flex gap-2">
                  <button
                    className={[
                      "px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide",
                      movementType === "in"
                        ? "bg-[#1E1F4B] text-cyan-300"
                        : "border text-gray-200",
                    ].join(" ")}
                    style={{ borderColor: UI.border }}
                    onClick={() => setMovementType("in")}
                  >
                    Entrada
                  </button>
                  <button
                    className={[
                      "px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide",
                      movementType === "out"
                        ? "bg-[#1E1F4B] text-pink-300"
                        : "border text-gray-200",
                    ].join(" ")}
                    style={{ borderColor: UI.border }}
                    onClick={() => setMovementType("out")}
                  >
                    Salida
                  </button>
                </div>
              </div>

              {/* Info actual */}
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-200">
                <div>
                  <span className="block text-[11px] text-gray-400">
                    Stock actual
                  </span>
                  <span
                    className="inline-block mt-1 px-2 py-1 rounded"
                    style={{ backgroundColor: UI.input }}
                  >
                    {Number(stockProduct.stock ?? 0)}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-gray-400">
                    Costo actual unitario
                  </span>
                  <span
                    className="inline-block mt-1 px-2 py-1 rounded"
                    style={{ backgroundColor: UI.input }}
                  >
                    {fmtCOP(currentCost)}
                  </span>
                </div>
              </div>

              {/* Campos cantidad / nuevo costo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="sm:col-span-1">
                  <label className="block text-sm text-gray-300 mb-1">
                    Cantidad a {movementType === "in" ? "ingresar" : "retirar"}
                  </label>
                  <input
                    className="rounded px-3 py-2 w-full text-gray-100 text-sm outline-none"
                    style={{
                      backgroundColor: UI.input,
                      border: `1px solid ${UI.border}`,
                    }}
                    type="number"
                    placeholder="Cantidad"
                    value={stockQty}
                    onChange={(e) =>
                      setStockQty(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                  />
                </div>

                {movementType === "in" && (
                  <div className="sm:col-span-2 space-y-3">
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">
                        Nuevo costo unitario (COP)
                      </label>
                      <input
                        className="rounded px-3 py-2 w-full text-gray-100 text-sm outline-none"
                        style={{
                          backgroundColor: UI.input,
                          border: `1px solid ${UI.border}`,
                        }}
                        type="number"
                        placeholder="Costo unitario"
                        value={stockUnitCost}
                        onChange={(e) =>
                          setStockUnitCost(
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                      />
                    </div>

                    {stockQty && newUnitCost > 0 && (
                      <div className="text-sm text-gray-300">
                        <span className="text-gray-400 mr-1">
                          Costo nuevo (lote):
                        </span>
                        <span className="text-cyan-300">
                          {fmtCOP(newLotCost)}
                        </span>{" "}
                        <span className="text-gray-500">
                          ({Number(stockQty)} uds × {fmtCOP(newUnitCost)})
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botones acción */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3">
                <button
                  onClick={resetStockModal}
                  className="px-4 py-2 rounded border text-xs sm:text-sm uppercase"
                  style={{ borderColor: UI.border }}
                >
                  Cancelar
                </button>
                <button
                  onClick={doSaveStockMovement}
                  disabled={stockSaveDisabled}
                  className="px-5 py-2.5 rounded-lg font-semibold text-xs sm:text-sm uppercase disabled:opacity-60"
                  style={{
                    color: "#001014",
                    background:
                      "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                    boxShadow: UI.glow,
                  }}
                >
                  Guardar movimiento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
