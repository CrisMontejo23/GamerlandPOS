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
  // (si luego agregas edición de items/pagos en UI, ampliamos aquí)
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

  if (period === "day") {
    const s = baseISO, e = baseISO;
    return { from: s, to: e };
  }
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

  const { from, to } = useMemo(() => rangeFrom(period, baseDate), [period, baseDate]);

  const load = async () => {
    setLoading(true);
    try {
      const url = new URL(`/reports/sales-lines`, window.location.origin);
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      const r = await apiFetch(`/reports/sales-lines?${url.searchParams.toString()}`);
      const data: Row[] = await r.json();
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totals = useMemo(() => {
    const revenue = rows.reduce((a, r) => a + r.revenue, 0);
    const cost = rows.reduce((a, r) => a + r.cost, 0);
    const profit = revenue - cost;
    return { revenue, cost, profit };
  }, [rows]);

  const payBreakdown = useMemo(() => {
    const acc = new Map<string, number>();
    for (const r of rows) {
      for (const p of r.paymentMethods || []) {
        acc.set(p.method, (acc.get(p.method) || 0) + p.amount);
      }
    }
    return Array.from(acc.entries()).map(([method, amount]) => ({ method, amount }));
  }, [rows]);

  // --- acciones admin sencillas ---
  const patchSale = async (id: number, body: SalePatch) => {
    const r = await apiFetch(`/sales/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert(`Error: ${e?.error || "No se pudo actualizar"}`);
      return false;
    }
    return true;
  };

  const editCustomer = async (saleId: number) => {
    const nuevo = window.prompt("Nuevo nombre de cliente (dejar vacío para quitar):", "");
    if (nuevo === null) return;
    const ok = await patchSale(saleId, { customer: nuevo.trim() || null });
    if (ok) load();
  };

  const setStatus = async (saleId: number, status: "paid" | "void") => {
    if (status === "void") {
      const sure = window.confirm("¿Seguro que deseas ANULAR esta venta?");
      if (!sure) return;
    }
    const ok = await patchSale(saleId, { status });
    if (ok) load();
  };

  return (
    <div className="max-w-7xl mx-auto text-gray-200 space-y-5">
      <h1 className="text-2xl font-bold text-cyan-400">Ventas</h1>

      {/* Filtros */}
      <section
        className="rounded-xl p-4"
        style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}
      >
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
        </div>

        {/* Breakdown por método */}
        {payBreakdown.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {payBreakdown.map((p) => (
              <span
                key={p.method}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full"
                style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                title={p.method}
              >
                <b className="text-cyan-300">{p.method === "QR_LLAVE" ? "QR / Llave" : p.method}:</b>{" "}
                {fmtCOP(p.amount)}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Tabla */}
      <section
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}
      >
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
              {rows.map((r, idx) => (
                <tr
                  key={`${r.saleId}-${idx}`}
                  className="hover:bg-[#191B4B]"
                  style={{ borderBottom: `1px solid ${COLORS.border}` }}
                >
                  <Td>{new Date(r.createdAt).toLocaleString("es-CO")}</Td>
                  <Td className="font-mono">{r.sku}</Td>
                  <Td>{r.name}</Td>
                  <Td className="text-right">{fmtCOP(r.unitPrice)}</Td>
                  <Td className="text-right">{fmtCOP(r.unitCost)}</Td>
                  <Td className="text-center">{r.qty}</Td>
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
                        <button
                          onClick={() => editCustomer(r.saleId)}
                          className="px-3 py-1 rounded text-sm font-medium"
                          style={{ backgroundColor: "#374151" }}
                          title="Editar cliente"
                        >
                          Cliente
                        </button>
                        <button
                          onClick={() => setStatus(r.saleId, "void")}
                          className="px-3 py-1 rounded text-sm font-semibold"
                          style={{ backgroundColor: "#ef4444", color: "#001014" }}
                          title="Anular venta"
                        >
                          Anular
                        </button>
                        <button
                          onClick={() => setStatus(r.saleId, "paid")}
                          className="px-3 py-1 rounded text-sm font-semibold"
                          style={{ backgroundColor: "#0bd977", color: "#001014" }}
                          title="Marcar pagada"
                        >
                          Pagada
                        </button>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`py-2 px-3 text-gray-300 ${className}`} style={{}}>
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`py-2 px-3 ${className}`} style={{}}>
      {children}
    </td>
  );
}