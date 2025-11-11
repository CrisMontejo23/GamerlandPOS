"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

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

type Payment = {
  method: "EFECTIVO" | "QR_LLAVE" | "DATAFONO" | string;
  amount: number;
};
type Row = {
  saleId: number;
  createdAt: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  revenue: number;
  cost: number;
  profit: number;
  paymentMethods: Payment[];
};

type SalePatch = {
  customer?: string | null;
  status?: "paid" | "void" | "return";
};
type Period = "day" | "month" | "year";

const COLORS = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  cyan: "#00FFFF",
  pink: "#FF00FF",
  text: "#E5E5E5",
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
      lastDay
    ).padStart(2, "0")}`;
    return { from: start, to: end };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

// ---- Reglas de ganancia (equivalentes a tu Excel) ----
function profitByRule(r: Row) {
  const name = (r.name || "").toUpperCase().trim();
  const total = r.unitPrice * r.qty;
  const costo = r.unitCost * r.qty;

  if (name === "REFACIL - RECARGA CELULAR") return Math.round(total * 0.055);
  if (name === "REFACIL - PAGO FACTURA") return 200;
  if (name === "REFACIL - PAGO VANTI GAS NATURAL CUNDIBOYACENSE") return 100;
  if (name === "REFACIL - PAGO CUOTA PAYJOY") return 250;
  if (name === "REFACIL - GAME PASS/PSN" || name === "REFACIL - GAME PASS")
    return Math.round(total * 0.03);
  if (
    [
      "REFACIL - CARGA DE CUENTA",
      "TRANSACCION",
      "TRANSACCION DATAFONO",
      "CUADRE DE CAJA",
    ].includes(name)
  )
    return 0;

  // CERTIFICADO LIBERTAD Y TRADICION => sin regla: usa margen normal
  return Math.round(total - costo);
}

function up(s: string) {
  return (s || "").toUpperCase().trim();
}

// “Internos/terceros” que NO deben sumarse como ventas del local
function isExcludedFromRevenue(r: Row) {
  const n = up(r.name);
  return (
    n === "REFACIL - CARGA DE CUENTA" ||
    n === "REFACIL - RECARGA CELULAR" ||
    n === "CERTIFICADO LIBERTAD Y TRADICION" ||
    n === "REFACIL - PAGO FACTURA" ||
    n === "REFACIL - PAGO VANTI GAS NATURAL CUNDIBOYACENSE" ||
    n === "REFACIL - PAGO CUOTA PAYJOY" ||
    n.includes("TRANSACCION") || // “TRANSACCION”, “TRANSACCION DATAFONO”
    n.includes("CUADRE DE CAJA")
  );
}

export default function SalesPage() {
  const { role } = useAuth();
  const isAdmin = role === "ADMIN";

  const [period, setPeriod] = useState<Period>("day");
  const [baseDate, setBaseDate] = useState<string>(todayISO());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // ---- Paginación (client-side) ----
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const { from, to } = useMemo(
    () => rangeFrom(period, baseDate),
    [period, baseDate]
  );

  const load = async () => {
    setLoading(true);
    try {
      const url = new URL(`/reports/sales-lines`, window.location.origin);
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      const r = await apiFetch(
        `/reports/sales-lines?${url.searchParams.toString()}`
      );
      const data: Row[] = await r.json();
      data.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // Totales visibles
  const totals = useMemo(() => {
    // Ventas “visibles” del local, excluyendo servicios de terceros/internos
    const revenue = rows
      .filter((r) => !isExcludedFromRevenue(r))
      .reduce((a, r) => a + r.revenue, 0);

    const cost = rows.reduce((a, r) => a + r.cost, 0);
    const profit = rows.reduce((a, r) => a + profitByRule(r), 0);
    return { revenue, cost, profit };
  }, [rows]);

  // Breakdown métodos
  const payBreakdown = useMemo(() => {
    const acc = new Map<string, number>();
    for (const r of rows)
      for (const p of r.paymentMethods || [])
        acc.set(p.method, (acc.get(p.method) || 0) + p.amount);
    return Array.from(acc.entries()).map(([method, amount]) => ({
      method,
      amount,
    }));
  }, [rows]);

  // helpers por venta
  const firstIndexBySale = useMemo(() => {
    const seen = new Set<number>();
    const idx = new Map<number, number>();
    rows.forEach((r, i) => {
      if (!seen.has(r.saleId)) {
        seen.add(r.saleId);
        idx.set(r.saleId, i);
      }
    });
    return idx;
  }, [rows]);

  // ======== PAGINACIÓN: derivaciones ========
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, safePage]);

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

  // --- acciones admin (genéricas) ---
  const patchSale = async (
    id: number,
    body: SalePatch | Record<string, unknown>
  ) => {
    const r = await apiFetch(`/sales/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({} as { error?: string }));
      alert(`Error: ${e?.error || "No se pudo actualizar"}`);
      return false;
    }
    return true;
  };

  // --- edición inline por línea ---
  type LineKey = string; // `${saleId}-${idx}`
  const [editKey, setEditKey] = useState<LineKey | null>(null);
  const [editPrice, setEditPrice] = useState<number | "">("");
  const [editCost, setEditCost] = useState<number | "">("");
  const [editQty, setEditQty] = useState<number | "">("");

  const startEditLine = (k: LineKey, r: Row) => {
    if (!isAdmin) return;
    setEditKey(k);
    setEditPrice(r.unitPrice);
    setEditCost(r.unitCost);
    setEditQty(r.qty);
  };
  const cancelEditLine = () => {
    setEditKey(null);
    setEditPrice("");
    setEditCost("");
    setEditQty("");
  };
  const saveEditLine = async (r: Row) => {
    if (editKey == null) return;
    const body = {
      items: [
        {
          sku: r.sku,
          unitPrice: editPrice === "" ? r.unitPrice : Number(editPrice),
          unitCost: editCost === "" ? r.unitCost : Number(editCost),
          qty: editQty === "" ? r.qty : Number(editQty),
        },
      ],
    };
    const ok = await patchSale(r.saleId, body);
    if (ok) {
      cancelEditLine();
      load();
    }
  };

  // eliminar venta
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
        const e = await r.json().catch(() => ({} as { error?: string }));
        setToast({
          open: true,
          kind: "error",
          title: "Error al eliminar",
          subtitle: String(
            e?.error || "No se pudo eliminar. Verifica el DELETE /sales/:id"
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

  // Handlers de filtros que resetean página
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

  return (
    <div className="max-w-7xl mx-auto text-gray-200 space-y-5">
      <h1 className="text-2xl font-bold text-cyan-400">Ventas</h1>

      {/* Filtros */}
      <section
        className="rounded-xl p-4"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex gap-2">
            <select
              className="rounded px-3 py-2 outline-none"
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
              className="rounded px-3 py-2 outline-none"
              style={{
                backgroundColor: COLORS.input,
                border: `1px solid ${COLORS.border}`,
              }}
              value={baseDate}
              onChange={(e) => onChangeBaseDate(e.target.value)}
            />
            <button
              onClick={onClickActualizar}
              className="px-4 rounded font-medium"
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

          <div className="md:ml-auto grid grid-cols-1 sm:grid-cols-3 gap-3 w-full md:w-auto">
            <SummaryCard title="Ventas" value={totals.revenue} accent="cyan" />
            <SummaryCard title="Costo" value={totals.cost} />
            <SummaryCard title="Ganancia" value={totals.profit} accent="pink" />
          </div>

          {payBreakdown.length > 0 && (
            <div className="md:ml-auto mt-2 md:mt-0 flex flex-wrap gap-2 text-sm">
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
        </div>
      </section>

      {/* Tabla */}
      <section
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr
                className="text-left"
                style={{ borderBottom: `1px solid ${COLORS.border}` }}
              >
                <Th>Fecha</Th>
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
                    colSpan={isAdmin ? 11 : 10}
                  >
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && pageSlice.length === 0 && (
                <tr>
                  <td
                    className="py-3 px-3 text-gray-400"
                    colSpan={isAdmin ? 11 : 10}
                  >
                    Sin registros
                  </td>
                </tr>
              )}
              {pageSlice.map((r, idx) => {
                const k = `${r.saleId}-${(safePage - 1) * PAGE_SIZE + idx}`;
                const isEditing = editKey === k;
                const isFirstOfSale =
                  firstIndexBySale.get(r.saleId) ===
                  (safePage - 1) * PAGE_SIZE + idx;

                return (
                  <tr
                    key={k}
                    className="hover:bg-[#191B4B]"
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <Td>{new Date(r.createdAt).toLocaleString("es-CO")}</Td>
                    <Td className="font-mono">{r.sku}</Td>
                    <Td>{r.name}</Td>

                    {/* Precio */}
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
                                : Math.max(0, Number(e.target.value))
                            )
                          }
                        />
                      ) : (
                        fmtCOP(r.unitPrice)
                      )}
                    </Td>

                    {/* Costo */}
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
                          value={editCost}
                          onChange={(e) =>
                            setEditCost(
                              e.target.value === ""
                                ? ""
                                : Math.max(0, Number(e.target.value))
                            )
                          }
                        />
                      ) : (
                        fmtCOP(r.unitCost)
                      )}
                    </Td>

                    {/* Cantidad */}
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
                                : Math.max(1, Number(e.target.value))
                            )
                          }
                        />
                      ) : (
                        r.qty
                      )}
                    </Td>

                    <Td className="text-right text-cyan-300">
                      {fmtCOP(r.revenue)}
                    </Td>
                    <Td className="text-right">{fmtCOP(r.cost)}</Td>
                    <Td className="text-right text-pink-300">
                      {fmtCOP(profitByRule(r))}
                    </Td>

                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {r.paymentMethods.map((p, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded text-xs"
                            style={{
                              backgroundColor: COLORS.input,
                              border: `1px solid ${COLORS.border}`,
                            }}
                            title={p.method}
                          >
                            {p.method === "QR_LLAVE" ? "QR / LLAVE" : p.method}
                          </span>
                        ))}
                      </div>
                    </Td>

                    {isAdmin && (
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          {!isEditing ? (
                            <>
                              <button
                                onClick={() => startEditLine(k, r)}
                                className="px-3 py-1 rounded text-sm font-semibold"
                                style={{ backgroundColor: "#0ea5e9" }}
                                title="Editar línea (precio/costo/cantidad)"
                              >
                                Editar
                              </button>

                              {/* Eliminar sólo en la primera fila visible de la venta */}
                              {isFirstOfSale && (
                                <button
                                  onClick={() => deleteSale(r.saleId)}
                                  className="px-3 py-1 rounded text-sm font-semibold"
                                  style={{
                                    backgroundColor: "#ef4444",
                                    color: "#001014",
                                  }}
                                  title="Eliminar venta"
                                >
                                  Eliminar
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => saveEditLine(r)}
                                className="px-3 py-1 rounded text-sm font-semibold"
                                style={{
                                  backgroundColor: "#0bd977",
                                  color: "#001014",
                                }}
                                disabled={
                                  editQty === "" ||
                                  editPrice === "" ||
                                  editCost === ""
                                }
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
