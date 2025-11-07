"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

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
  // si luego agregas edición de items, se amplía aquí
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
    const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { from: start, to: end };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export default function SalesPage() {
  const { role } = useAuth();
  const isAdmin = role === "ADMIN";

  const [period, setPeriod] = useState<Period>("day");
  const [baseDate, setBaseDate] = useState<string>(todayISO());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // UI edición pagos (modal)
  const [editSaleId, setEditSaleId] = useState<number | null>(null);
  const [editEfectivo, setEditEfectivo] = useState<number | "">("");
  const [editQR, setEditQR] = useState<number | "">("");
  const [editDatafono, setEditDatafono] = useState<number | "">("");
  const [editMsg, setEditMsg] = useState<string>("");

  const { from, to } = useMemo(() => rangeFrom(period, baseDate), [period, baseDate]);

  const load = async () => {
    setLoading(true);
    try {
      const url = new URL(`/reports/sales-lines`, window.location.origin);
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      const r = await apiFetch(`/reports/sales-lines?${url.searchParams.toString()}`);
      const data: Row[] = await r.json();
      // último primero
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // totales visibles
  const totals = useMemo(() => {
    const revenue = rows.reduce((a, r) => a + r.revenue, 0);
    const cost = rows.reduce((a, r) => a + r.cost, 0);
    const profit = revenue - cost;
    return { revenue, cost, profit };
  }, [rows]);

  // breakdown métodos (visual)
  const payBreakdown = useMemo(() => {
    const acc = new Map<string, number>();
    for (const r of rows) {
      for (const p of r.paymentMethods || []) {
        acc.set(p.method, (acc.get(p.method) || 0) + p.amount);
      }
    }
    return Array.from(acc.entries()).map(([method, amount]) => ({ method, amount }));
  }, [rows]);

  // ---- helpers por venta ----
  const saleTotalById = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rows) {
      m.set(r.saleId, (m.get(r.saleId) || 0) + r.revenue);
    }
    return m;
  }, [rows]);

  const salePaysById = useMemo(() => {
    const m = new Map<number, { EFECTIVO: number; QR_LLAVE: number; DATAFONO: number; otros: number }>();
    for (const r of rows) {
      const prev = m.get(r.saleId) || { EFECTIVO: 0, QR_LLAVE: 0, DATAFONO: 0, otros: 0 };
      for (const p of r.paymentMethods || []) {
        if (p.method === "EFECTIVO") prev.EFECTIVO += p.amount;
        else if (p.method === "QR_LLAVE") prev.QR_LLAVE += p.amount;
        else if (p.method === "DATAFONO") prev.DATAFONO += p.amount;
        else prev.otros += p.amount;
      }
      m.set(r.saleId, prev);
    }
    return m;
  }, [rows]);

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

  // --- acciones admin (genéricas) ---
  const patchSale = async (id: number, body: SalePatch | Record<string, unknown>) => {
    const r = await apiFetch(`/sales/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    if (!r.ok) {
      const e = await r.json().catch(() => ({} as { error?: string }));
      alert(`Error: ${e?.error || "No se pudo actualizar"}`);
      return false;
    }
    return true;
  };

  // modal edición de pagos
  const openEditPayments = (saleId: number) => {
    const pays = salePaysById.get(saleId) || { EFECTIVO: 0, QR_LLAVE: 0, DATAFONO: 0, otros: 0 };
    setEditSaleId(saleId);
    setEditEfectivo(pays.EFECTIVO || "");
    setEditQR(pays.QR_LLAVE || "");
    setEditDatafono(pays.DATAFONO || "");
    setEditMsg("");
  };
  const closeEditPayments = () => {
    setEditSaleId(null);
    setEditEfectivo("");
    setEditQR("");
    setEditDatafono("");
    setEditMsg("");
  };
  const savePayments = async () => {
    if (editSaleId == null) return;
    const totalVenta = saleTotalById.get(editSaleId) || 0;
    const EFECTIVO = Number(editEfectivo || 0);
    const QR = Number(editQR || 0);
    const DATAFONO = Number(editDatafono || 0);
    const suma = EFECTIVO + QR + DATAFONO;

    if (Math.abs(suma - totalVenta) > 0.5) {
      setEditMsg(`La suma de pagos (${fmtCOP(suma)}) debe ser igual al total de la venta (${fmtCOP(totalVenta)}).`);
      return;
    }
    const body = {
      payments: [
        ...(EFECTIVO > 0 ? [{ method: "EFECTIVO", amount: EFECTIVO }] : []),
        ...(QR > 0 ? [{ method: "QR_LLAVE", amount: QR }] : []),
        ...(DATAFONO > 0 ? [{ method: "DATAFONO", amount: DATAFONO }] : []),
      ],
    };
    const ok = await patchSale(editSaleId, body);
    if (ok) {
      closeEditPayments();
      load();
    }
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
          unitCost:  editCost  === "" ? r.unitCost  : Number(editCost),
          qty:       editQty   === "" ? r.qty       : Number(editQty),
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
  const deleteSale = async (saleId: number) => {
    const sure = window.confirm("¿Eliminar definitivamente esta venta? Esta acción no se puede deshacer.");
    if (!sure) return;
    const r = await apiFetch(`/sales/${saleId}`, { method: "DELETE" });
    if (!r.ok) {
      const e = await r.json().catch(() => ({} as { error?: string }));
      alert(`Error: ${e?.error || "No se pudo eliminar. Verifica el endpoint DELETE /sales/:id."}`);
      return;
    }
    load();
  };

  return (
    <div className="max-w-7xl mx-auto text-gray-200 space-y-5">
      <h1 className="text-2xl font-bold text-cyan-400">Ventas</h1>

      {/* Filtros */}
      <section className="rounded-xl p-4" style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex gap-2">
            <select
              className="rounded px-3 py-2 outline-none"
              style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
            >
              <option value="day">Día</option>
              <option value="month">Mes</option>
              <option value="year">Año</option>
            </select>
            <input
              type="date"
              className="rounded px-3 py-2 outline-none"
              style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
              value={baseDate}
              onChange={(e) => setBaseDate(e.target.value)}
            />
            <button
              onClick={load}
              className="px-4 rounded font-medium"
              style={{
                color: "#001014",
                background: "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                boxShadow: "0 0 14px rgba(0,255,255,.25), 0 0 22px rgba(255,0,255,.2)",
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
                  style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                  title={p.method}
                >
                  <b className="text-cyan-300">{p.method === "QR_LLAVE" ? "QR / Llave" : p.method}:</b> {fmtCOP(p.amount)}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Tabla */}
      <section className="rounded-xl overflow-hidden" style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
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
                  <td className="py-3 px-3 text-gray-400" colSpan={isAdmin ? 11 : 10}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td className="py-3 px-3 text-gray-400" colSpan={isAdmin ? 11 : 10}>
                    Sin registros
                  </td>
                </tr>
              )}
              {rows.map((r, idx) => {
                const k = `${r.saleId}-${idx}`;
                const isEditing = editKey === k;
                const isFirstOfSale = firstIndexBySale.get(r.saleId) === idx;

                return (
                  <tr key={k} className="hover:bg-[#191B4B]" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <Td>{new Date(r.createdAt).toLocaleString("es-CO")}</Td>
                    <Td className="font-mono">{r.sku}</Td>
                    <Td>{r.name}</Td>

                    {/* Precio */}
                    <Td className="text-right">
                      {isEditing ? (
                        <input
                          className="rounded px-2 py-1 w-28 text-right outline-none"
                          style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                          type="number"
                          min={0}
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
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
                          style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                          type="number"
                          min={0}
                          value={editCost}
                          onChange={(e) => setEditCost(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
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
                          style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                          type="number"
                          min={1}
                          value={editQty}
                          onChange={(e) => setEditQty(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))}
                        />
                      ) : (
                        r.qty
                      )}
                    </Td>

                    <Td className="text-right text-cyan-300">{fmtCOP(r.revenue)}</Td>
                    <Td className="text-right">{fmtCOP(r.cost)}</Td>
                    <Td className="text-right text-pink-300">{fmtCOP(r.profit)}</Td>

                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {r.paymentMethods.map((p, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded text-xs"
                            style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                            title={p.method}
                          >
                            {p.method === "QR_LLAVE" ? "QR / Llave" : p.method}
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

                              {/* Eliminar solo en la primera fila de la venta */}
                              {isFirstOfSale && (
                                <button
                                  onClick={() => deleteSale(r.saleId)}
                                  className="px-3 py-1 rounded text-sm font-semibold"
                                  style={{ backgroundColor: "#ef4444", color: "#001014" }}
                                  title="Eliminar venta"
                                >
                                  Eliminar
                                </button>
                              )}

                              {/* Si quieres mantener el modal de pagos, puedes ofrecerlo aquí también */}
                              {isFirstOfSale && (
                                <button
                                  onClick={() => openEditPayments(r.saleId)}
                                  className="px-3 py-1 rounded text-sm font-medium"
                                  style={{ backgroundColor: "#374151" }}
                                  title="Editar métodos de pago"
                                >
                                  Pagos
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => saveEditLine(r)}
                                className="px-3 py-1 rounded text-sm font-semibold"
                                style={{ backgroundColor: "#0bd977", color: "#001014" }}
                                disabled={editQty === "" || editPrice === "" || editCost === ""}
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
      </section>

      {/* Modal edición de pagos */}
      {isAdmin && editSaleId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeEditPayments} />
          <div
            className="relative w-full max-w-md rounded-xl p-4 space-y-3"
            style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-lg font-semibold text-cyan-300">Editar métodos de pago</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumberInput label="Efectivo" value={editEfectivo} onChange={(v) => setEditEfectivo(v)} />
              <NumberInput label="QR / Llave" value={editQR} onChange={(v) => setEditQR(v)} />
              <NumberInput label="Datafono" value={editDatafono} onChange={(v) => setEditDatafono(v)} />
            </div>
            {!!editMsg && <div className="text-sm text-pink-300">{editMsg}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={closeEditPayments} className="px-4 py-2 rounded font-medium" style={{ backgroundColor: "#374151" }}>
                Cancelar
              </button>
              <button
                onClick={savePayments}
                className="px-4 py-2 rounded font-semibold"
                style={{
                  color: "#001014",
                  background: "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                  boxShadow: "0 0 14px rgba(0,255,255,.25), 0 0 22px rgba(255,0,255,.25)",
                }}
              >
                Guardar
              </button>
            </div>
            <div className="text-xs text-gray-400">Total venta: {fmtCOP(saleTotalById.get(editSaleId) || 0)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- UI helpers ---------- */
function SummaryCard({ title, value, accent }: { title: string; value: number; accent?: "cyan" | "pink" }) {
  const glow =
    accent === "cyan"
      ? "0 0 18px rgba(0,255,255,.25), inset 0 0 18px rgba(0,255,255,.08)"
      : accent === "pink"
      ? "0 0 18px rgba(255,0,255,.25), inset 0 0 18px rgba(255,0,255,.08)"
      : "inset 0 0 12px rgba(255,255,255,.04)";
  const titleColor = accent === "cyan" ? "#7CF9FF" : accent === "pink" ? "#FF7CFF" : COLORS.text;
  const border = `1px solid ${COLORS.border}`;

  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: COLORS.bgCard, border, boxShadow: glow }} role="status" aria-label={title}>
      <div className="text-sm" style={{ color: titleColor }}>{title}</div>
      <div className="text-xl font-semibold">{fmtCOP(value)}</div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`py-2 px-3 text-gray-300 ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-2 px-3 ${className}`}>{children}</td>;
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
}) {
  return (
    <label className="text-sm">
      <div className="mb-1 text-gray-300">{label}</div>
      <input
        className="w-full rounded px-3 py-2 text-right outline-none"
        style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
      />
    </label>
  );
}