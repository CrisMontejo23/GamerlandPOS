"use client";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

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
      ? "linear-gradient(90deg, rgba(0,255,255,.8), rgba(255,0,255,.8))"
      : kind === "error"
        ? "linear-gradient(90deg, rgba(255,99,132,.9), rgba(255,0,128,.8))"
        : "linear-gradient(90deg, rgba(99,102,241,.9), rgba(168,85,247,.9))";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-2xl p-4 text-center"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          boxShadow:
            kind === "success"
              ? "0 0 22px rgba(0,255,255,.25), 0 0 34px rgba(255,0,255,.25)"
              : kind === "error"
                ? "0 0 22px rgba(255,99,132,.25), 0 0 34px rgba(255,0,128,.25)"
                : "0 0 22px rgba(99,102,241,.25), 0 0 34px rgba(168,85,247,.25)",
        }}
      >
        <div
          className="absolute -inset-[1.5px] rounded-2xl pointer-events-none"
          style={{ background: borderGrad, filter: "blur(6px)", opacity: 0.45 }}
        />
        <div className="relative">
          <div
            className="mx-auto mb-2 h-12 w-12 rounded-full grid place-items-center"
            style={{
              backgroundColor: COLORS.input,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <span
              className="text-2xl"
              style={{
                color:
                  kind === "success"
                    ? "#7CF9FF"
                    : kind === "error"
                      ? "#ff90b1"
                      : "#c4b5fd",
              }}
            >
              {kind === "success" ? "✔" : kind === "error" ? "!" : "i"}
            </span>
          </div>
          <h3
            className="text-xl font-extrabold"
            style={{ color: kind === "success" ? "#7CF9FF" : COLORS.text }}
          >
            {title}
          </h3>
          {!!subtitle && (
            <p className="mt-1 text-sm text-gray-300">{subtitle}</p>
          )}
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              color: "#001014",
              background:
                kind === "success"
                  ? "linear-gradient(90deg, rgba(0,255,255,.9), rgba(255,0,255,.9))"
                  : "linear-gradient(90deg, rgba(99,102,241,.95), rgba(168,85,247,.9))",
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function GamerConfirm({
  open,
  title = "¿Confirmar acción?",
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div
        className="relative w-full max-w-md rounded-2xl p-5"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          boxShadow:
            "0 0 28px rgba(0,255,255,.18), 0 0 36px rgba(255,0,255,.18)",
        }}
      >
        <div
          className="absolute -inset-[1.5px] rounded-2xl pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, rgba(0,255,255,.8), rgba(255,0,255,.8))",
            filter: "blur(6px)",
            opacity: 0.35,
          }}
        />
        <div className="relative">
          <h3 className="text-xl font-extrabold text-cyan-300">{title}</h3>
          <p className="mt-2 text-gray-200">{message}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: "#374151", color: "#E5E5E5" }}
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{
                color: "#001014",
                background:
                  "linear-gradient(90deg, rgba(0,255,255,.9), rgba(255,0,255,.9))",
              }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Tipos ===== */
type Payment = {
  method: "EFECTIVO" | "QR_LLAVE" | "DATAFONO" | string;
  amount: number;
};

type Row = {
  saleId: number;
  saleItemId: number;
  user?: { id: number; username: string } | null;
  createdAt: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  revenue: number; // puede venir del back
  cost: number; // puede venir del back
  profit: number;
  paymentMethods: Payment[];
};

type SalePatch = {
  customer?: string | null;
  status?: "paid" | "void" | "return";
  items?: { sku: string; unitPrice: number; qty: number; discount?: number }[];
};

type Period = "day" | "month" | "year";

/* ===== Constantes / helpers ===== */
const COLORS = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  cyan: "#00FFFF",
  pink: "#FF00FF",
  text: "#E5E5E5",
};

const ACTION_ICON = {
  btn: "p-2 sm:p-1", // ✅ más área táctil en móvil
  box: "h-9 w-9 sm:h-5 sm:w-5", // ✅ móvil grande, desktop normal
  sizes: "(max-width: 640px) 36px, 20px",
};

function fmtCOP(n: number) {
  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function rangeFrom(period: Period, baseISO: string) {
  const d = new Date(baseISO + "T00:00:00");
  const y = d.getFullYear();
  const m = d.getMonth();
  if (period === "day") return { from: baseISO, to: baseISO };
  if (period === "month") {
    const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(
      lastDay,
    ).padStart(2, "0")}`;
    return { from: start, to: end };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/* ===== Helpers extra ===== */
function isTransactionRow(r: Row) {
  const name = (r.name || "").toUpperCase().trim();
  return name === "TRANSACCION";
}

/* ===== Reglas de ganancia (Excel) ===== */
function profitByRule(r: Row) {
  const name = (r.name || "").toUpperCase().trim();
  const total = r.revenue ?? r.unitPrice * r.qty;
  const costo = r.cost ?? r.unitCost * r.qty;

  // TRANSACCION: no genera ganancia
  if (name === "TRANSACCION") return 0;

  if (name === "REFACIL - RECARGA CELULAR") return Math.round(total * 0.055);
  if (name === "REFACIL - PAGO FACTURA") return 200;
  if (name === "REFACIL - PAGO VANTI GAS NATURAL CUNDIBOYACENSE") return 100;
  if (name === "REFACIL - PAGO CUOTA PAYJOY") return 250;
  if (name === "REFACIL - GAME PASS/PSN" || name === "REFACIL - GAME PASS")
    return Math.round(total * 0.03);
  if (
    [
      "REFACIL - CARGA DE CUENTA",
      "TRANSACCION DATAFONO",
      "CUADRE DE CAJA",
    ].includes(name)
  )
    return 0;

  return Math.round(total - costo);
}

export default function SalesPage() {
  const { role } = useAuth();
  const isAdmin = role === "ADMIN";

  const [period, setPeriod] = useState<Period>("day");
  const [baseDate, setBaseDate] = useState<string>(todayISO());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [paperTotal, setPaperTotal] = useState(0);

  const tableTopRef = useRef<HTMLDivElement | null>(null);
  const [showToTop, setShowToTop] = useState(false);

  const [confirmItemOpen, setConfirmItemOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{
    saleId: number;
    saleItemId: number;
    label: string;
  } | null>(null);

  const deleteSaleItem = (
    saleId: number,
    saleItemId: number,
    label: string,
  ) => {
    setItemToDelete({ saleId, saleItemId, label });
    setConfirmItemOpen(true);
  };

  const doDeleteSaleItem = async () => {
    if (!itemToDelete) return;

    setConfirmItemOpen(false);

    const r = await apiFetch(
      `/sales/${itemToDelete.saleId}/items/${itemToDelete.saleItemId}`,
      { method: "DELETE" },
    );

    if (!r.ok) {
      const e = await r.json().catch(() => ({}) as { error?: string });
      setToast({
        open: true,
        kind: "error",
        title: "No se pudo eliminar el ítem",
        subtitle: String(e?.error || "Error eliminando item"),
      });
      setTimeout(hideToast, 2000);
      setItemToDelete(null);
      return;
    }

    setToast({
      open: true,
      kind: "success",
      title: "Ítem eliminado",
      subtitle: "Se eliminó solo esa línea de la venta.",
    });
    setTimeout(hideToast, 2000);

    setItemToDelete(null);
    load();
  };

  // ===== filtros UI tipo Inventario =====
  const [q, setQ] = useState(""); // búsqueda libre (sku/nombre/vendedor/método)
  const [onlyNotTransaction, setOnlyNotTransaction] = useState(true); // oculta TRANSACCION por defecto

  const filtersActive =
    (q && q.trim().length > 0) || (!onlyNotTransaction ? true : false);

  // Paginación
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const { from, to } = useMemo(
    () => rangeFrom(period, baseDate),
    [period, baseDate],
  );

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/reports/sales-lines?from=${from}&to=${to}`);
      const data: Row[] = await r.json();

      data.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setRows(data);

      // Papelería (categoría SERVICIOS)
      const rPap = await apiFetch(`/reports/papeleria?from=${from}&to=${to}`);
      const { total: papTotal } = await rPap.json();
      setPaperTotal(Number(papTotal || 0));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  /* ======= TOTALES EXACTOS (sin excluir nada) =======
     VENTAS = suma de TOTAL VENTA de cada registro
     GANANCIA = suma de GANANCIA de cada registro (misma regla que por fila)
     COSTO = suma de TOTAL COSTO de cada registro (útil para control) */
  const totals = useMemo(() => {
    // Filas que SÍ cuentan para resumen de Ventas / Costo / Ganancia
    const summaryRows = rows.filter((r) => !isTransactionRow(r));

    const revenue = summaryRows.reduce(
      (a, r) => a + (r.revenue ?? r.unitPrice * r.qty),
      0,
    );
    const cost = summaryRows.reduce(
      (a, r) => a + (r.cost ?? r.unitCost * r.qty),
      0,
    );
    const profit = summaryRows.reduce((a, r) => a + profitByRule(r), 0);

    return { revenue, cost, profit };
  }, [rows]);

  /* ===== Breakdown por métodos de pago (rango completo) ===== */
  const payBreakdown = useMemo(() => {
    const acc = new Map<string, number>();

    for (const r of rows) {
      // ❌ No contar TRANSACCION en el breakdown de métodos
      if (isTransactionRow(r)) continue;

      for (const p of r.paymentMethods || []) {
        acc.set(p.method, (acc.get(p.method) || 0) + p.amount);
      }
    }

    return Array.from(acc.entries()).map(([method, amount]) => ({
      method,
      amount,
    }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const qq = q.trim().toUpperCase();

    return rows.filter((r) => {
      if (onlyNotTransaction && isTransactionRow(r)) return false;

      if (!qq) return true;

      const methodStr = (r.paymentMethods || [])
        .map((p) => String(p.method || ""))
        .join(" ")
        .toUpperCase();

      const hay =
        String(r.sku || "")
          .toUpperCase()
          .includes(qq) ||
        String(r.name || "")
          .toUpperCase()
          .includes(qq) ||
        String(r.user?.username || "")
          .toUpperCase()
          .includes(qq) ||
        methodStr.includes(qq) ||
        String(r.saleId).includes(qq);

      return hay;
    });
  }, [rows, q, onlyNotTransaction]);

  /* ===== Primer índice de cada venta (para mostrar botón eliminar una vez) ===== */
  const firstIndexBySale = useMemo(() => {
    const seen = new Set<number>();
    const idx = new Map<number, number>();

    filteredRows.forEach((r, i) => {
      if (!seen.has(r.saleId)) {
        seen.add(r.saleId);
        idx.set(r.saleId, i);
      }
    });

    return idx;
  }, [filteredRows]);

  /* ===== Paginación: derivados ===== */

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const pageRange = useMemo(() => {
    const maxToShow = 7;
    if (totalPages <= maxToShow)
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: (number | "…")[] = [];
    const left = Math.max(2, safePage - 2);
    const right = Math.min(totalPages - 1, safePage + 2);
    out.push(1);
    if (left > 2) out.push("…");
    for (let p = left; p <= right; p++) out.push(p);
    if (right < totalPages - 1) out.push("…");
    out.push(totalPages);
    return out;
  }, [safePage, totalPages]);

  /* ===== Acciones admin ===== */
  const patchSale = async (
    id: number,
    body: SalePatch | Record<string, unknown>,
  ) => {
    const r = await apiFetch(`/sales/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}) as { error?: string });
      alert(`Error: ${e?.error || "No se pudo actualizar"}`);
      return false;
    }
    return true;
  };

  // Edición inline: SOLO precio y cantidad (el costo lo maneja el back)
  type LineKey = string; // `${saleId}-${idx}`
  const [editKey, setEditKey] = useState<LineKey | null>(null);
  const [editPrice, setEditPrice] = useState<number | "">("");
  const [editQty, setEditQty] = useState<number | "">("");

  const startEditLine = (k: LineKey, r: Row) => {
    if (!isAdmin) return;
    setEditKey(k);
    setEditPrice(r.unitPrice);
    setEditQty(r.qty);
  };
  const cancelEditLine = () => {
    setEditKey(null);
    setEditPrice("");
    setEditQty("");
  };
  const saveEditLine = async (r: Row) => {
    if (editKey == null) return;
    const body: SalePatch = {
      items: [
        {
          sku: r.sku,
          unitPrice: editPrice === "" ? r.unitPrice : Number(editPrice),
          qty: editQty === "" ? r.qty : Number(editQty),
          discount: 0,
        },
      ],
    };
    const ok = await patchSale(r.saleId, body);
    if (ok) {
      cancelEditLine();
      load();
    }
  };

  /* ===== Eliminar venta ===== */
  const [toast, setToast] = useState<{
    open: boolean;
    kind: "success" | "error" | "info";
    title: string;
    subtitle?: string;
  }>({ open: false, kind: "success", title: "" });
  const hideToast = () => setToast((t) => ({ ...t, open: false }));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | (() => void)>(null);

  const deleteSale = async (saleId: number) => {
    setConfirmOpen(true);
    setConfirmAction(() => async () => {
      setConfirmOpen(false);
      const r = await apiFetch(`/sales/${saleId}`, { method: "DELETE" });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}) as { error?: string });
        setToast({
          open: true,
          kind: "error",
          title: "Error al eliminar",
          subtitle: String(
            e?.error || "No se pudo eliminar. Verifica el DELETE /sales/:id",
          ),
        });
        setTimeout(hideToast, 2000);        
        return;
      }
      setToast({
        open: true,
        kind: "success",
        title: "¡Venta eliminada!",
        subtitle: "La venta fue eliminada correctamente.",
      });
      setTimeout(hideToast, 2000);
      load();
    });
  };

  // Filtros
  const onChangePeriod = (val: Period) => {
    setPeriod(val);
    setPage(1);
  };
  const onChangeBaseDate = (val: string) => {
    setBaseDate(val);
    setPage(1);
  };
  const onClickActualizar = () => {
    setPage(1);
    load();
  };

  /* ===== Render ===== */
  return (
    <div className="max-w-7xl mx-auto text-gray-200 space-y-5">
      <h1 className="text-2xl font-bold text-cyan-400">Ventas</h1>

      {/* Filtros (estilo Inventario) */}
      <section
        className="rounded-2xl p-4 space-y-3"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          boxShadow:
            "0 0 18px rgba(0,255,255,.10), 0 0 26px rgba(255,0,255,.10)",
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          {/* Periodo + fecha + actualizar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="rounded-lg px-3 py-2 outline-none text-sm"
              style={{
                backgroundColor: COLORS.input,
                border: `1px solid ${COLORS.border}`,
              }}
              value={period}
              onChange={(e) => onChangePeriod(e.target.value as Period)}
            >
              <option value="day">Día</option>
              <option value="month">Mes</option>
              <option value="year">Año</option>
            </select>

            <input
              type="date"
              className="rounded-lg px-3 py-2 outline-none text-sm"
              style={{
                backgroundColor: COLORS.input,
                border: `1px solid ${COLORS.border}`,
              }}
              value={baseDate}
              onChange={(e) => onChangeBaseDate(e.target.value)}
            />

            <button
              onClick={onClickActualizar}
              className="px-4 py-2 rounded-lg font-semibold text-sm"
              style={{
                color: "#001014",
                background:
                  "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                boxShadow:
                  "0 0 14px rgba(0,255,255,.25), 0 0 22px rgba(255,0,255,.2)",
              }}
            >
              Actualizar
            </button>
          </div>

          {/* Buscador */}
          <div className="relative flex-1">
            <input
              className="w-full rounded-lg px-3 py-2 pr-9 outline-none text-sm text-gray-100 placeholder-gray-400"
              style={{
                backgroundColor: COLORS.input,
                border: `1px solid ${COLORS.border}`,
                boxShadow: q ? "0 0 14px rgba(0,255,255,.18)" : undefined,
              }}
              placeholder="Buscar por SKU, producto, vendedor, método o #venta…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            {q.trim() && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setPage(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-100"
                title="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>

          {/* Switch TRANSACCION */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setOnlyNotTransaction((v) => !v);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: onlyNotTransaction
                  ? "rgba(0,255,255,.12)"
                  : COLORS.input,
                border: `1px solid ${COLORS.border}`,
                color: onlyNotTransaction ? "#7CF9FF" : "#D1D5DB",
              }}
              title="Ocultar/mostrar líneas TRANSACCION"
            >
              {onlyNotTransaction
                ? "Ocultando TRANSACCION"
                : "Mostrando TRANSACCION"}
            </button>
          </div>
        </div>

        {/* Chips de filtros activos + limpiar */}
        <div className="flex flex-wrap items-center gap-2">
          {filtersActive ? (
            <>
              <span className="text-xs text-gray-300">Filtros activos:</span>

              {q.trim() && (
                <span
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs"
                  style={{
                    backgroundColor: "rgba(0,255,255,.10)",
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <b className="text-cyan-300">Búsqueda:</b>{" "}
                  <span className="text-gray-200">{q.trim()}</span>
                  <button
                    className="text-gray-400 hover:text-gray-100"
                    onClick={() => setQ("")}
                    title="Quitar búsqueda"
                  >
                    ✕
                  </button>
                </span>
              )}

              {!onlyNotTransaction && (
                <span
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs"
                  style={{
                    backgroundColor: "rgba(255,0,255,.10)",
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <b className="text-pink-300">Incluye:</b> TRANSACCION
                  <button
                    className="text-gray-400 hover:text-gray-100"
                    onClick={() => setOnlyNotTransaction(true)}
                    title="Ocultar TRANSACCION"
                  >
                    ✕
                  </button>
                </span>
              )}

              <button
                onClick={() => {
                  setQ("");
                  setOnlyNotTransaction(true);
                  setPage(1);
                }}
                className="ml-1 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                Limpiar todo
              </button>
            </>
          ) : (
            <span className="text-xs text-gray-400">
              Tip: usa búsqueda o activa/desactiva TRANSACCION para filtrar.
            </span>
          )}
        </div>

        {/* Resumen (igual pero más pro) */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <SummaryCard title="Ventas" value={totals.revenue} accent="cyan" />
          <SummaryCard title="Costo" value={totals.cost} accent="pink" />
          <SummaryCard title="Ganancia" value={totals.profit} accent="cyan" />
          <SummaryCard title="Papelería" value={paperTotal} accent="pink" />
        </div>

        {/* Breakdown métodos */}
        {payBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-2 text-sm">
            {payBreakdown.map((p) => (
              <span
                key={p.method}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                }}
                title={p.method}
              >
                <b className="text-cyan-300">
                  {p.method === "QR_LLAVE" ? "QR / LLAVE" : p.method}:
                </b>{" "}
                {fmtCOP(p.amount)}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Tabla */}
      <section
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          className="overflow-x-auto max-h-[70vh]"
          onScroll={(e) => {
            const el = e.currentTarget;
            setShowToTop(el.scrollTop > 240);
          }}
        >
          <div ref={tableTopRef} />
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr
                className="text-left"
                style={{
                  backgroundColor: "#101233",
                  borderBottom: `1px solid ${COLORS.border}`,
                }}
              >
                <Th>Fecha</Th>
                <Th>Vendedor</Th>
                <Th>SKU</Th>
                <Th>Producto</Th>
                <Th className="text-right">Precio</Th>
                <Th className="text-right">Costo</Th>
                <Th className="text-center">Cant.</Th>
                <Th className="text-right">Total venta</Th>
                <Th className="text-right">Total costo</Th>
                <Th className="text-right">Ganancia</Th>
                <Th>Método(s)</Th>
                {isAdmin && <Th>Acciones</Th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    className="py-3 px-3 text-gray-400"
                    colSpan={isAdmin ? 12 : 11}
                  >
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && pageSlice.length === 0 && (
                <tr>
                  <td
                    className="py-3 px-3 text-gray-400"
                    colSpan={isAdmin ? 12 : 11}
                  >
                    Sin registros
                  </td>
                </tr>
              )}
              {pageSlice.map((r, idx) => {
                const k = `${r.saleId}-${(safePage - 1) * PAGE_SIZE + idx}`;
                const isEditing = editKey === k;
                const lineRevenue = r.revenue ?? r.unitPrice * r.qty;
                const lineCost = r.cost ?? r.unitCost * r.qty;
                const lineProfit = profitByRule(r);
                const absoluteIndex = (safePage - 1) * PAGE_SIZE + idx;
                const showGroupHeader =
                  firstIndexBySale.get(r.saleId) === absoluteIndex;

                const isFirstOfSale = showGroupHeader;

                return (
                  <tr
                    key={k}
                    className="hover:bg-[#191B4B]"
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`,

                      // ✅ “contorno” entre ventas SIN fila extra
                      ...(isFirstOfSale
                        ? {
                            borderTop: `2px solid ${COLORS.border}`,
                            boxShadow:
                              "inset 0 1px 0 rgba(0,255,255,.22), inset 0 2px 0 rgba(255,0,255,.16), inset 3px 0 0 rgba(0,255,255,.10)",
                            backgroundColor: "rgba(0,255,255,.03)",
                          }
                        : {}),
                    }}
                  >
                    <Td>{new Date(r.createdAt).toLocaleString("es-CO")}</Td>
                    <Td className="font-semibold text-cyan-200">
                      {r.user?.username || "-"}
                    </Td>
                    <Td className="font-mono">{r.sku}</Td>
                    <Td>{r.name}</Td>

                    {/* Precio (editable) */}
                    <Td className="text-right">
                      {isEditing ? (
                        <input
                          className="rounded px-2 py-1 w-28 text-right outline-none"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                          type="number"
                          min={0}
                          value={editPrice}
                          onChange={(e) =>
                            setEditPrice(
                              e.target.value === ""
                                ? ""
                                : Math.max(0, Number(e.target.value)),
                            )
                          }
                        />
                      ) : (
                        fmtCOP(r.unitPrice)
                      )}
                    </Td>

                    {/* Costo (solo lectura; el back lo maneja) */}
                    <Td className="text-right">{fmtCOP(r.unitCost)}</Td>

                    {/* Cantidad (editable) */}
                    <Td className="text-center">
                      {isEditing ? (
                        <input
                          className="rounded px-2 py-1 w-20 text-center outline-none"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                          type="number"
                          min={1}
                          value={editQty}
                          onChange={(e) =>
                            setEditQty(
                              e.target.value === ""
                                ? ""
                                : Math.max(1, Number(e.target.value)),
                            )
                          }
                        />
                      ) : (
                        r.qty
                      )}
                    </Td>

                    <Td className="text-right text-cyan-300">
                      {fmtCOP(lineRevenue)}
                    </Td>
                    <Td className="text-right">{fmtCOP(lineCost)}</Td>
                    <Td className="text-right text-pink-300">
                      {fmtCOP(lineProfit)}
                    </Td>

                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {r.paymentMethods.map((p, i) => {
                          const m = String(p.method || "").toUpperCase();
                          const tone = m.includes("EFECT")
                            ? "rgba(0,255,255,.10)"
                            : m.includes("DATA")
                              ? "rgba(255,0,255,.10)"
                              : m.includes("QR")
                                ? "rgba(99,102,241,.12)"
                                : "rgba(255,255,255,.06)";

                          return (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-full text-xs"
                              style={{
                                backgroundColor: tone,
                                border: `1px solid ${COLORS.border}`,
                              }}
                              title={p.method}
                            >
                              {p.method === "QR_LLAVE"
                                ? "QR / LLAVE"
                                : p.method}
                            </span>
                          );
                        })}
                      </div>
                    </Td>

                    {isAdmin && (
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          {!isEditing ? (
                            <>
                              {/* Editar (icono) */}

                              <button
                                onClick={() => startEditLine(k, r)}
                                className={`inline-flex items-center justify-center rounded-md ${ACTION_ICON.btn} hover:bg-white/5 transition transform hover:scale-110`}
                                title="Editar (precio / cantidad)"
                                aria-label="Editar venta"
                              >
                                <span className={`relative ${ACTION_ICON.box}`}>
                                  <Image
                                    src="/edit.png"
                                    alt="Editar"
                                    fill
                                    sizes={ACTION_ICON.sizes}
                                    className="opacity-90 object-contain"
                                  />
                                </span>
                              </button>

                              {/* Eliminar ítem (en TODAS las filas) */}
                              <button
                                onClick={() =>
                                  deleteSaleItem(
                                    r.saleId,
                                    r.saleItemId,
                                    `${r.sku} - ${r.name}`,
                                  )
                                }
                                className={`inline-flex items-center justify-center rounded-md ${ACTION_ICON.btn} hover:bg-white/5 transition transform hover:scale-110`}
                                title="Eliminar este ítem"
                                aria-label="Eliminar ítem"
                              >
                                <span className={`relative ${ACTION_ICON.box}`}>
                                  <Image
                                    src="/borrar.png"
                                    alt="Eliminar item"
                                    fill
                                    sizes={ACTION_ICON.sizes}
                                    className="opacity-90 object-contain"
                                  />
                                </span>
                              </button>                              
                            </>
                          ) : (
                            <>
                              {/* Mientras está en edición, dejamos Guardar / Cancelar como texto */}
                              <button
                                onClick={() => saveEditLine(r)}
                                className="px-3 py-1 rounded text-sm font-semibold"
                                style={{
                                  backgroundColor: "#0bd977",
                                  color: "#001014",
                                }}
                                disabled={editQty === "" || editPrice === ""}
                              >
                                Guardar
                              </button>
                              <button
                                onClick={cancelEditLine}
                                className="px-3 py-1 rounded text-sm font-medium"
                                style={{ backgroundColor: "#374151" }}
                              >
                                Cancelar
                              </button>
                            </>
                          )}
                        </div>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginador */}
        <div
          className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between p-3"
          style={{ borderTop: `1px solid ${COLORS.border}` }}
        >
          <div className="text-xs text-gray-300">
            Mostrando{" "}
            <b>{rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}</b> –{" "}
            <b>{Math.min(safePage * PAGE_SIZE, rows.length)}</b> de{" "}
            <b>{rows.length}</b>
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
              ),
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
        {showToTop && (
          <button
            onClick={() => {
              const container = document.querySelector(
                ".overflow-x-auto.max-h-\\[70vh\\]",
              ) as HTMLDivElement | null;

              if (container) container.scrollTo({ top: 0, behavior: "smooth" });

              // opcional: también enfoca el inicio
              tableTopRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
            className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-full font-semibold text-sm"
            style={{
              color: "#001014",
              background:
                "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
              boxShadow:
                "0 0 18px rgba(0,255,255,.25), 0 0 26px rgba(255,0,255,.2)",
            }}
            title="Ir al inicio"
          >
            ↑ Top
          </button>
        )}
      </section>

      <GamerConfirm
        open={confirmOpen}
        title="¿Eliminar venta?"
        message="Esta acción no se puede deshacer."
        confirmText="Sí, eliminar"
        cancelText="Cancelar"
        onConfirm={() => confirmAction?.()}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmAction(null);
        }}
      />

      <GamerConfirm
        open={confirmItemOpen}
        title="¿Eliminar este ítem?"
        message={
          itemToDelete
            ? `Se eliminará solo: ${itemToDelete.label}. La venta seguirá existiendo.`
            : "Esta acción no se puede deshacer."
        }
        confirmText="Sí, eliminar ítem"
        cancelText="Cancelar"
        onConfirm={doDeleteSaleItem}
        onCancel={() => {
          setConfirmItemOpen(false);
          setItemToDelete(null);
        }}
      />

      <GamerToast
        open={toast.open}
        kind={toast.kind}
        title={toast.title}
        subtitle={toast.subtitle}
        onClose={hideToast}
      />
    </div>
  );
}

/* ---------- UI helpers ---------- */
function SummaryCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: number;
  accent?: "cyan" | "pink";
}) {
  const glow =
    accent === "cyan"
      ? "0 0 18px rgba(0,255,255,.25), inset 0 0 18px rgba(0,255,255,.08)"
      : accent === "pink"
        ? "0 0 18px rgba(255,0,255,.25), inset 0 0 18px rgba(255,0,255,.08)"
        : "inset 0 0 12px rgba(255,255,255,.04)";
  const titleColor =
    accent === "cyan" ? "#7CF9FF" : accent === "pink" ? "#FF7CFF" : COLORS.text;
  const border = `1px solid ${COLORS.border}`;

  return (
    <div
      className="rounded-xl p-3"
      style={{ backgroundColor: COLORS.bgCard, border, boxShadow: glow }}
      role="status"
      aria-label={title}
    >
      <div className="text-sm" style={{ color: titleColor }}>
        {title}
      </div>
      <div className="text-xl font-semibold">{fmtCOP(value)}</div>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`py-2 px-3 text-gray-300 ${className}`}>{children}</th>;
}
function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`py-2 px-3 ${className}`}>{children}</td>;
}

/* ===== Botón pager ===== */
const UI = { border: "#1E1F4B" };
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
    boxShadow: "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
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
