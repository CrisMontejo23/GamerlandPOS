"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logo from "../../assets/logo.png";
import { apiFetch } from "../lib/api";

type JsPDFWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

/* ===== Tipos ===== */
type Summary = {
  ventas: number;
  subtotal: number;
  iva: number;
  descuentos: number;
  costo_vendido: number;
  gastos_total: number;
  gastos_operativos: number;
  utilidad: number; // puede venir del backend, pero en UI y PDF usamos "por reglas"
};

type PaymentsBreakdown = {
  EFECTIVO: number;
  QR_LLAVE: number;
  DATAFONO: number;
  total: number;
  gastos?: {
    EFECTIVO: number;
    QR_LLAVE: number;
    DATAFONO: number;
    total: number;
  };
  neto?: {
    EFECTIVO: number;
    QR_LLAVE: number;
    DATAFONO: number;
    total: number;
  };
};

type RangeType = "day" | "month" | "year" | "custom";

type SaleLine = {
  saleId: number;
  createdAt: string;
  sku: string;
  name: string;
  category?: string | null;
  qty: number;
  unitPrice: number;
  unitCost: number;
  revenue?: number;
  cost?: number;
  profit?: number;
  paymentMethods?: { method: string; amount: number }[];
  payMethods?: string;
};

// ===== Gastos que SÍ cuentan como "gastos" en las métricas =====
const REAL_EXPENSE_CATEGORIES = [
  "OTRO",
  "PAGO TRABAJADORES",
  "VIAJE A BOGOTÁ",
  "VIAJE A BOGOTA", // por si llega sin tilde
];

function isRealExpense(e: ExpenseRow) {
  const cat = String(e.category || "")
    .toUpperCase()
    .trim();
  return REAL_EXPENSE_CATEGORIES.includes(cat);
}

type ExpenseRow = {
  id: number;
  description?: string | null;
  amount: number | string;
  paymentMethod?: string | null;
  category?: string | null;
  createdAt: string;
};

/* ===== NUEVO: tipos de caja ===== */
type CashboxAPI = {
  efectivo: number;
  qr_llave?: number;
  datafono?: number;
  total: number;
  lastUpdated?: string;
};
type CashboxState = {
  ok: boolean;
  source: "api" | "fallback";
  efectivo: number;
  qr_llave: number;
  datafono: number;
  total: number;
  lastUpdated?: string;
};

/* ===== Constantes / helpers ===== */
const COLORS = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  cyan: "#00FFFF",
  pink: "#FF00FF",
  text: "#E5E5E5",
};
const CHART_COLORS = ["#00FFFF", "#FF00FF", "#A5FF00", "#FFD700"];

const toCOP = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
const pct = (num: number, den: number) =>
  den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "0%";

function todayLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function monthStartISO(d: string) {
  const [y, m] = d.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
function yearStartISO(d: string) {
  const [y] = d.split("-").map(Number);
  return `${y}-01-01`;
}

/* ===== Gastos fijos (mensuales) ===== */
const FIXED_MONTHLY = {
  arriendo: 473_400,
  servicios: 200_000,
  nomina: 760_000,
};
const FIXED_MONTHLY_TOTAL =
  FIXED_MONTHLY.arriendo + FIXED_MONTHLY.servicios + FIXED_MONTHLY.nomina;

/** Prorratea gastos fijos mensuales según el rango dado (aprox 30 días/mes) */
function prorateFixed(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(`${toISO}T23:59:59`);
  const days = Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / 86400000) + 1
  );
  const months = days / 30;
  return Math.round(FIXED_MONTHLY_TOTAL * months);
}

async function fetchImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const resp = await fetch(src);
    const blob = await resp.blob();
    const reader = new FileReader();
    return await new Promise((resolve) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* ===== Reglas de ganancia (igual que en Sales) ===== */
function profitByRuleFromSale(s: SaleLine) {
  const name = (s.name || "").toUpperCase().trim();
  const total = typeof s.revenue === "number" ? s.revenue : s.unitPrice * s.qty;
  const costo = typeof s.cost === "number" ? s.cost : s.unitCost * s.qty;

  if (name === "REFACIL - RECARGA CELULAR") return Math.round(total * 0.055);
  if (name === "REFACIL - PAGO FACTURA") return 200;
  if (name === "REFACIL - PAGO VANTI GAS NATURAL CUNDIBOYACENSE") return 100;
  if (name === "REFACIL - PAGO CUOTA PAYJOY") return 250;
  if (name === "REFACIL - GAME PASS" || name === "REFACIL - GAME PASS/PSN")
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

  return Math.round(total - costo);
}

/* ===== Flags especiales ===== */
function isTransactionSale(s: SaleLine) {
  const name = (s.name || "").toUpperCase().trim();
  return name === "TRANSACCION";
}

const revenueFromLine = (s: SaleLine) =>
  typeof s.revenue === "number" ? s.revenue : s.unitPrice * s.qty;
const costFromLine = (s: SaleLine) =>
  typeof s.cost === "number" ? s.cost : s.unitCost * s.qty;

/** Suma SOLO los gastos que cuentan en métricas (OTRO, PAGO TRABAJADORES, VIAJE A BOGOTÁ) */
function sumOperativeExpensesExcludingInternos(list: ExpenseRow[]) {
  return (list || [])
    .filter(isRealExpense) // sólo las categorías "reales" de gasto
    .reduce((a, e) => a + Number(e.amount || 0), 0);
}

/* ===== Series diarias / semanales ===== */
function toLocalDayKey(d: string | Date) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getISOWeek(dt: Date) {
  const date = new Date(
    Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate())
  );
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    );
  return { year: date.getUTCFullYear(), week };
}

type DailyPoint = {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
};
type DailyWithMA = DailyPoint & { ma7_revenue?: number; ma7_profit?: number };

function buildDailySeries(lines: SaleLine[]): DailyPoint[] {
  const map = new Map<
    string,
    { revenue: number; cost: number; profit: number }
  >();
  for (const s of lines || []) {
    const key = toLocalDayKey(s.createdAt);
    const rev = revenueFromLine(s);
    const cst = costFromLine(s);
    const prf = profitByRuleFromSale(s);
    const cur = map.get(key) || { revenue: 0, cost: 0, profit: 0 };
    cur.revenue += rev;
    cur.cost += cst;
    cur.profit += prf;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([date, v]) => ({
      date,
      revenue: v.revenue,
      cost: v.cost,
      profit: v.profit,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
function addRolling7(series: DailyPoint[]): DailyWithMA[] {
  const out: DailyWithMA[] = [];
  let accRev = 0,
    accPrf = 0;
  const qRev: number[] = [],
    qPrf: number[] = [];
  const W = 7;
  for (const p of series) {
    qRev.push(p.revenue);
    qPrf.push(p.profit);
    accRev += p.revenue;
    accPrf += p.profit;
    if (qRev.length > W) accRev -= qRev.shift()!;
    if (qPrf.length > W) accPrf -= qPrf.shift()!;
    out.push({
      ...p,
      ma7_revenue: qRev.length === W ? Math.round(accRev / W) : undefined,
      ma7_profit: qPrf.length === W ? Math.round(accPrf / W) : undefined,
    });
  }
  return out;
}

type WeeklyPoint = {
  label: string;
  weekKey: string;
  revenue: number;
  cost: number;
  profit: number;
};
function buildWeeklySeries(lines: SaleLine[]): WeeklyPoint[] {
  const map = new Map<
    string,
    { revenue: number; cost: number; profit: number; label: string }
  >();
  for (const s of lines || []) {
    const d = new Date(s.createdAt);
    const { year, week } = getISOWeek(d);
    const weekKey = `${year}-W${String(week).padStart(2, "0")}`;
    const rev = revenueFromLine(s);
    const cst = costFromLine(s);
    const prf = profitByRuleFromSale(s);
    const cur = map.get(weekKey) || {
      revenue: 0,
      cost: 0,
      profit: 0,
      label: weekKey,
    };
    cur.revenue += rev;
    cur.cost += cst;
    cur.profit += prf;
    map.set(weekKey, cur);
  }
  return Array.from(map.entries())
    .map(([weekKey, v]) => ({
      weekKey,
      label: v.label,
      revenue: v.revenue,
      cost: v.cost,
      profit: v.profit,
    }))
    .sort((a, b) => a.weekKey.localeCompare(b.weekKey));
}

export default function ReportsPage() {
  const today = todayLocalISO();
  const [rangeType, setRangeType] = useState<RangeType>("day");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Resúmenes base (del backend) — los seguimos mostrando, pero los KPIs usan líneas
  const [sumDay, setSumDay] = useState<Summary | null>(null);
  const [payDay, setPayDay] = useState<PaymentsBreakdown | null>(null);
  const [sumMonth, setSumMonth] = useState<Summary | null>(null);
  const [sumYear, setSumYear] = useState<Summary | null>(null);
  const [papTotal, setPapTotal] = useState<number>(0);

  // ===== NUEVO: totales calculados desde LÍNEAS (mismo criterio que Sales) =====
  const [ventasRange, setVentasRange] = useState(0);
  const [ventasMonth, setVentasMonth] = useState(0);
  const [ventasYear, setVentasYear] = useState(0);

  const [utilDayByRule, setUtilDayByRule] = useState<number>(0);
  const [utilMonthByRule, setUtilMonthByRule] = useState<number>(0);
  const [utilYearByRule, setUtilYearByRule] = useState<number>(0);

  // NUEVO: gastos operativos recalculados (excluyendo INTERNO)
  const [opsDay, setOpsDay] = useState<number>(0);
  const [opsMonth, setOpsMonth] = useState<number>(0);
  const [opsYear, setOpsYear] = useState<number>(0);

  // Series
  const [dailySeries, setDailySeries] = useState<DailyWithMA[]>([]);
  const [weeklySeries, setWeeklySeries] = useState<WeeklyPoint[]>([]);

  /* ===== Estado de CAJA ===== */
  const [cashbox, setCashbox] = useState<CashboxState>({
    ok: false,
    source: "fallback",
    efectivo: 0,
    qr_llave: 0,
    datafono: 0,
    total: 0,
  });

  const dashRef = useRef<HTMLDivElement>(null);

  /* Ajuste autom. de rango por tipo */
  useEffect(() => {
    if (rangeType === "day") {
      const t = todayLocalISO();
      setFrom(t);
      setTo(t);
    } else if (rangeType === "month") {
      setFrom(monthStartISO(to));
    } else if (rangeType === "year") {
      setFrom(yearStartISO(to));
    }
  }, [rangeType, to]);

  /* Carga dashboard */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mFrom = monthStartISO(to);
      const yFrom = yearStartISO(to);

      const [
        rSumDay,
        rPayDay,
        rSumMonth,
        rSumYear,
        rPapDay,
        rLinesRange,
        rLinesMonth,
        rLinesYear,
        rExpDay,
        rExpMonth,
        rExpYear,
      ] = await Promise.all([
        apiFetch(`/reports/summary?from=${from}&to=${to}`),
        apiFetch(`/reports/payments?from=${from}&to=${to}`),
        apiFetch(`/reports/summary?from=${mFrom}&to=${to}`),
        apiFetch(`/reports/summary?from=${yFrom}&to=${to}`),
        apiFetch(`/reports/papeleria?from=${from}&to=${to}`),
        apiFetch(`/reports/sales-lines?from=${from}&to=${to}`),
        apiFetch(`/reports/sales-lines?from=${mFrom}&to=${to}`),
        apiFetch(`/reports/sales-lines?from=${yFrom}&to=${to}`),
        apiFetch(`/expenses?from=${from}&to=${to}`),
        apiFetch(`/expenses?from=${mFrom}&to=${to}`),
        apiFetch(`/expenses?from=${yFrom}&to=${to}`),
      ]);

      const [
        dSumDay,
        dPayDay,
        dSumMonth,
        dSumYear,
        dPap,
        linesRange,
        linesMonth,
        linesYear,
        expDay,
        expMonth,
        expYear,
      ] = await Promise.all([
        rSumDay.json() as Promise<Summary>,
        rPayDay.json() as Promise<PaymentsBreakdown>,
        rSumMonth.json() as Promise<Summary>,
        rSumYear.json() as Promise<Summary>,
        rPapDay.json() as Promise<{ total: number }>,
        rLinesRange.json() as Promise<SaleLine[]>,
        rLinesMonth.json() as Promise<SaleLine[]>,
        rLinesYear.json() as Promise<SaleLine[]>,
        rExpDay.json() as Promise<ExpenseRow[]>,
        rExpMonth.json() as Promise<ExpenseRow[]>,
        rExpYear.json() as Promise<ExpenseRow[]>,
      ]);

      // Estados base (por si quieres ver lo que dice el backend)
      setSumDay(dSumDay);
      setPayDay(dPayDay);
      setSumMonth(dSumMonth);
      setSumYear(dSumYear);
      setPapTotal(Number(dPap?.total || 0));

      // ===== NUEVO: totales por líneas (mismo criterio que Sales) =====
      const rangeNoTx = (linesRange || []).filter((s) => !isTransactionSale(s));
      const monthNoTx = (linesMonth || []).filter((s) => !isTransactionSale(s));
      const yearNoTx = (linesYear || []).filter((s) => !isTransactionSale(s));

      const vRange = rangeNoTx.reduce((a, s) => a + revenueFromLine(s), 0);
      const vMonth = monthNoTx.reduce((a, s) => a + revenueFromLine(s), 0);
      const vYear = yearNoTx.reduce((a, s) => a + revenueFromLine(s), 0);
      setVentasRange(vRange);
      setVentasMonth(vMonth);
      setVentasYear(vYear);

      const uRange = rangeNoTx.reduce((a, s) => a + profitByRuleFromSale(s), 0);
      const uMonth = monthNoTx.reduce((a, s) => a + profitByRuleFromSale(s), 0);
      const uYear = yearNoTx.reduce((a, s) => a + profitByRuleFromSale(s), 0);
      setUtilDayByRule(uRange);
      setUtilMonthByRule(uMonth);
      setUtilYearByRule(uYear);

      // Gastos operativos EXTERNOS
      const gRange = sumOperativeExpensesExcludingInternos(expDay || []);
      const gMonth = sumOperativeExpensesExcludingInternos(expMonth || []);
      const gYear = sumOperativeExpensesExcludingInternos(expYear || []);
      setOpsDay(gRange);
      setOpsMonth(gMonth);
      setOpsYear(gYear);

      // Series (ignorando TRANSACCION para ingresos/utilidad)
      const linesNoTx = (linesRange || []).filter((s) => !isTransactionSale(s));
      const daily = buildDailySeries(linesNoTx);
      setDailySeries(addRolling7(daily));
      setWeeklySeries(buildWeeklySeries(linesNoTx));

      setMsg("");
    } catch (e) {
      console.error(e);
      setMsg("No se pudo cargar la información");
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 2500);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  /* ===== Cargar CAJA ===== */
  const loadCashbox = useCallback(async () => {
    try {
      const r = await apiFetch(`/reports/cashbox`);
      if (r.ok) {
        const d: CashboxAPI = await r.json();
        setCashbox({
          ok: true,
          source: "api",
          efectivo: Number(d.efectivo || 0),
          qr_llave: Number(d.qr_llave || 0),
          datafono: Number(d.datafono || 0),
          total: Number(d.total || d.efectivo || 0),
          lastUpdated: d.lastUpdated,
        });
        return;
      }
    } catch {
      /* ignore */
    }
    try {
      const r2 = await apiFetch(
        `/reports/payments?from=2000-01-01&to=2099-12-31`
      );
      const p: PaymentsBreakdown = await r2.json();
      const bruto = {
        EFECTIVO: Number(p?.EFECTIVO || 0),
        QR_LLAVE: Number(p?.QR_LLAVE || 0),
        DATAFONO: Number(p?.DATAFONO || 0),
      };
      const gastos = {
        EFECTIVO: Number(p?.gastos?.EFECTIVO || 0),
        QR_LLAVE: Number(p?.gastos?.QR_LLAVE || 0),
        DATAFONO: Number(p?.gastos?.DATAFONO || 0),
      };
      const neto = {
        EFECTIVO: p?.neto?.EFECTIVO ?? bruto.EFECTIVO - gastos.EFECTIVO,
        QR_LLAVE: p?.neto?.QR_LLAVE ?? bruto.QR_LLAVE - gastos.QR_LLAVE,
        DATAFONO: p?.neto?.DATAFONO ?? bruto.DATAFONO - gastos.DATAFONO,
      };
      setCashbox({
        ok: true,
        source: "fallback",
        efectivo: neto.EFECTIVO,
        qr_llave: neto.QR_LLAVE,
        datafono: neto.DATAFONO,
        total: neto.EFECTIVO + neto.QR_LLAVE + neto.DATAFONO,
      });
    } catch {
      setCashbox((c) => ({ ...c, ok: false }));
    }
  }, []);

  useEffect(() => {
    loadCashbox();
    const t = setInterval(loadCashbox, 60_000);
    return () => clearInterval(t);
  }, [loadCashbox]);

  /* ======= KPI de rentabilidad y punto de equilibrio (sobre líneas) ======= */
  const kpiProfitability = useMemo(() => {
    const totRevenue = dailySeries.reduce((a, d) => a + d.revenue, 0);
    const totProfit = dailySeries.reduce((a, d) => a + d.profit, 0);
    const ops = opsDay;
    const fixed = prorateFixed(from, to);
    const marginRate = totRevenue > 0 ? totProfit / totRevenue : 0;
    const net = totProfit - ops - fixed;
    const breakEvenRevenue =
      marginRate > 0 ? Math.ceil((ops + fixed) / marginRate) : Infinity;

    const days = Math.max(1, dailySeries.length);
    const avgRevenueDay = Math.round(totRevenue / days);
    const avgProfitDay = Math.round(totProfit / days);
    const avgOpsDay = Math.round(ops / days);
    const avgFixedDay = Math.round(fixed / days);
    const avgBreakEvenRevenueDay =
      marginRate > 0 ? Math.round(breakEvenRevenue / days) : Infinity;

    return {
      totRevenue,
      totProfit,
      ops,
      fixed,
      net,
      marginRate,
      breakEvenRevenue,
      avgRevenueDay,
      avgProfitDay,
      avgOpsDay,
      avgFixedDay,
      avgBreakEvenRevenueDay,
      isProfitable: net > 0,
    };
  }, [dailySeries, opsDay, from, to]);

  const payForChart = payDay?.neto ?? {
    EFECTIVO: payDay?.EFECTIVO || 0,
    QR_LLAVE: payDay?.QR_LLAVE || 0,
    DATAFONO: payDay?.DATAFONO || 0,
    total:
      (payDay?.EFECTIVO || 0) +
      (payDay?.QR_LLAVE || 0) +
      (payDay?.DATAFONO || 0),
  };

  const rangeWord =
    rangeType === "day" ? "DÍA" : rangeType === "month" ? "MES" : "AÑO";
  const resumenTitle =
    rangeType === "day"
      ? "Resumen (rango actual)"
      : rangeType === "month"
      ? "Resumen mes"
      : "Resumen año";
  const cajaPayTitle = `CAJA POR MÉTODO DE PAGO ${rangeWord} (NETO)`;

  return (
    <div className="max-w-6xl mx-auto text-gray-200 space-y-6">
      <h1 className="text-2xl font-bold text-cyan-400">DASHBOARD / REPORTES</h1>

      {/* Filtros + Botones */}
      <div
        className="rounded-xl p-4 flex flex-wrap gap-3 items-center"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <select
          className="rounded px-3 py-2 outline-none"
          style={{
            backgroundColor: COLORS.input,
            border: `1px solid ${COLORS.border}`,
          }}
          value={rangeType}
          onChange={(e) => setRangeType(e.target.value as RangeType)}
        >
          <option value="day">DÍA</option>
          <option value="month">MES</option>
          <option value="year">AÑO</option>
          <option value="custom">PERSONALIZADO</option>
        </select>

        <input
          type="date"
          value={from}
          disabled={rangeType !== "custom"}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded px-3 py-2 outline-none"
          style={{
            backgroundColor: COLORS.input,
            border: `1px solid ${COLORS.border}`,
          }}
        />
        <input
          type="date"
          value={to}
          disabled={rangeType !== "custom"}
          onChange={(e) => setTo(e.target.value)}
          className="rounded px-3 py-2 outline-none"
          style={{
            backgroundColor: COLORS.input,
            border: `1px solid ${COLORS.border}`,
          }}
        />

        <button
          onClick={load}
          className="px-4 py-2 rounded font-medium"
          style={{
            color: "#001014",
            background:
              "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
            boxShadow:
              "0 0 14px rgba(0,255,255,.25), 0 0 22px rgba(255,0,255,.2)",
          }}
        >
          CALCULAR
        </button>

        <div className="ml-auto flex gap-2">
          <button
            onClick={exportReportPdf}
            className="px-4 py-2 rounded border"
            style={{ borderColor: COLORS.border }}
            title="Exportar reporte en PDF (métricas + tablas)"
          >
            EXPORTAR PDF
          </button>
        </div>
      </div>

      {!!msg && <div className="text-sm text-cyan-300">{msg}</div>}
      {loading && <div>CARGANDO...</div>}

      {/* Contenedor */}
      <div ref={dashRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CAJA (actual) */}
        <Card title="CAJA (actual)">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-extrabold text-pink-300">
                {toCOP(cashbox.total || 0)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {cashbox.source === "api"
                  ? "Fuente: /reports/cashbox"
                  : "Fuente: cálculo neto (fallback)"}
                {cashbox.lastUpdated
                  ? ` — ${new Date(cashbox.lastUpdated).toLocaleString(
                      "es-CO"
                    )}`
                  : ""}
              </div>
            </div>
            <button
              onClick={loadCashbox}
              className="px-3 py-1 rounded border text-sm"
              style={{ borderColor: COLORS.border }}
              title="Actualizar caja"
            >
              Refrescar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <MiniStat
              label="Efectivo"
              value={toCOP(cashbox.efectivo || 0)}
              accent="cyan"
            />
            <MiniStat
              label="QR / Llave"
              value={toCOP(cashbox.qr_llave || 0)}
              accent="cyan"
            />
            <MiniStat
              label="Datáfono"
              value={toCOP(cashbox.datafono || 0)}
              accent="cyan"
            />
          </div>

          <div className="text-xs text-gray-400 mt-2">
            * “Caja (actual)” ignora el rango de fechas. Siempre muestra lo que
            hay en caja ahora.
          </div>
        </Card>

        {/* Resumen del rango + Papelería (usando líneas) */}
        <Card title={resumenTitle}>
          <ChartBar
            data={[
              { name: "Ventas", value: ventasRange || 0 },
              { name: "Gastos (Op.)", value: opsDay || 0 },
              { name: "Utilidad", value: utilDayByRule || 0 },
            ]}
          />
          <div className="space-y-1 mt-2">
            <KV k="Ventas" v={toCOP(ventasRange || 0)} />
            <KV k="Gastos (Operativos)" v={toCOP(opsDay || 0)} />
            <KV k="Utilidad (reglas)" v={toCOP(utilDayByRule || 0)} strong />
            <KV k="Papelería" v={toCOP(papTotal || 0)} />
          </div>
        </Card>

        {/* Caja por método (NETO) */}
        <Card title={cajaPayTitle}>
          <ChartPie
            data={[
              { name: "Efectivo", value: payForChart.EFECTIVO || 0 },
              { name: "QR / Llave", value: payForChart.QR_LLAVE || 0 },
              { name: "Datáfono", value: payForChart.DATAFONO || 0 },
            ]}
          />
          <div className="space-y-1 mt-2">
            <KV k="EFECTIVO NETO" v={toCOP(payForChart.EFECTIVO || 0)} />
            <KV k="QR / LLAVE (NETO)" v={toCOP(payForChart.QR_LLAVE || 0)} />
            <KV k="DATÁFONO (NETO)" v={toCOP(payForChart.DATAFONO || 0)} />
            <KV k="TOTAL NETO" v={toCOP(payForChart.total || 0)} strong />
            <div className="text-xs text-gray-400">
              * NETO = COBROS - GASTOS PAGADOS CON ESE MÉTODO.
            </div>
          </div>
        </Card>

        {/* Comparativa mes / año (usando líneas) */}
        <Card title="Comparativa mensual vs anual">
          <ChartLine
            data={[
              {
                name: "Mes",
                Ventas: ventasMonth || 0,
                Gastos: opsMonth || 0,
                Utilidad: utilMonthByRule || 0,
              },
              {
                name: "Año",
                Ventas: ventasYear || 0,
                Gastos: opsYear || 0,
                Utilidad: utilYearByRule || 0,
              },
            ]}
          />
        </Card>

        {/* Tendencia diaria + MA(7) */}
        <Card title="Tendencia diaria (Ingresos/Utilidad) y promedio móvil 7 días">
          <TrendDailyChart data={dailySeries} />
          <div className="text-xs text-gray-400 mt-2">
            * El MA(7) suaviza variaciones diarias para ver la tendencia real.
          </div>
        </Card>

        {/* Semanal */}
        <Card title="Acumulado semanal (ISO)">
          <WeeklyBars data={weeklySeries} />
        </Card>

        {/* Rentabilidad & Punto de equilibrio */}
        <Card title="Rentabilidad & Punto de equilibrio (rango actual)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MiniStat
              label="Resultado neto"
              value={toCOP(kpiProfitability.net)}
              accent={kpiProfitability.isProfitable ? "cyan" : "pink"}
            />
            <MiniStat
              label="Margen (util/ventas)"
              value={pct(
                kpiProfitability.totProfit,
                kpiProfitability.totRevenue
              )}
              accent={kpiProfitability.marginRate >= 0.15 ? "cyan" : "pink"}
            />
            <MiniStat
              label="Gastos operativos (rango)"
              value={toCOP(kpiProfitability.ops)}
            />
            <MiniStat
              label="Gastos fijos prorrateados"
              value={toCOP(kpiProfitability.fixed)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <MiniStat
              label="Ingreso necesario (punto de equilibrio)"
              value={
                kpiProfitability.breakEvenRevenue === Infinity
                  ? "—"
                  : toCOP(kpiProfitability.breakEvenRevenue)
              }
              accent="pink"
            />
            <MiniStat
              label="Ingreso diario requerido (prom.)"
              value={
                kpiProfitability.avgBreakEvenRevenueDay === Infinity
                  ? "—"
                  : toCOP(kpiProfitability.avgBreakEvenRevenueDay)
              }
            />
            <MiniStat
              label="Ingreso diario actual (prom.)"
              value={toCOP(kpiProfitability.avgRevenueDay)}
            />
            <MiniStat
              label="Utilidad diaria actual (prom.)"
              value={toCOP(kpiProfitability.avgProfitDay)}
            />
          </div>

          <div className="text-xs text-gray-400 mt-2">
            * Punto de equilibrio = (Gastos Operativos + Gastos Fijos) / Margen
            real del periodo.
          </div>
        </Card>

        {/* Indicadores */}
        <Card title="Indicadores de eficiencia">
          <KV
            k="% Utilidad / Ventas (mes)"
            v={pct(utilMonthByRule || 0, ventasMonth || 0)}
          />
          <KV
            k="% Gastos / Ventas (mes)"
            v={pct(opsMonth || 0, ventasMonth || 0)}
          />
          <KV
            k="% Utilidad / Ventas (año)"
            v={pct(utilYearByRule || 0, ventasYear || 0)}
          />
          <KV
            k="% Gastos / Ventas (año)"
            v={pct(opsYear || 0, ventasYear || 0)}
          />
        </Card>
      </div>
    </div>
  );

  /* ===== Exportar PDF (alineado con la UI) ===== */
  async function exportReportPdf() {
    try {
      const [salesRes, expRes, sumRes, payRes, papRes] = await Promise.all([
        apiFetch(`/reports/sales-lines?from=${from}&to=${to}`),
        apiFetch(`/expenses?from=${from}&to=${to}`),
        apiFetch(`/reports/summary?from=${from}&to=${to}`),
        apiFetch(`/reports/payments?from=${from}&to=${to}`),
        apiFetch(`/reports/papeleria?from=${from}&to=${to}`),
      ]);
      const [sales, expenses, summary, payments, pap] = await Promise.all([
        salesRes.json() as Promise<SaleLine[]>,
        expRes.json() as Promise<ExpenseRow[]>,
        sumRes.json() as Promise<Summary>,
        payRes.json() as Promise<PaymentsBreakdown>,
        papRes.json() as Promise<{ total: number }>,
      ]);

      // ===== NUEVO: totales por líneas (mismo criterio que en pantalla)
      const salesNoTx = (sales || []).filter((s) => !isTransactionSale(s));

      const ventasPdf = salesNoTx.reduce((a, s) => a + revenueFromLine(s), 0);
      const costoPdf = salesNoTx.reduce((a, s) => a + costFromLine(s), 0);
      const utilPdf = salesNoTx.reduce(
        (a, s) => a + profitByRuleFromSale(s),
        0
      );

      const gastosOperativosPdf =
        sumOperativeExpensesExcludingInternos(expenses);
      const fixedPdf = prorateFixed(from, to);

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginX = 40;

      pdf.setFillColor(20, 22, 58);
      pdf.rect(0, 0, pageW, 110, "F");

      const logoSrc =
        (typeof logo === "string"
          ? logo
          : (logo as unknown as { src?: string })?.src) || "/logo.png";
      const logoDataUrl = await fetchImageAsDataUrl(logoSrc);
      if (logoDataUrl) pdf.addImage(logoDataUrl, "PNG", marginX, 25, 60, 60);

      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0, 255, 255);
      pdf.setFontSize(20);
      pdf.text("GAMERLAND PC", marginX + 75, 48);

      pdf.setFontSize(12);
      pdf.setTextColor(229, 229, 229);
      pdf.text(`Reporte de ${from} a ${to}`, marginX + 75, 70);

      pdf.setDrawColor(255, 0, 255);
      pdf.setLineWidth(1.2);
      pdf.line(marginX, 100, pageW - marginX, 100);

      let curY = 120;

      autoTable(pdf, {
        startY: curY,
        head: [["Métrica", "Valor"]],
        body: [
          ["Ventas totales", toCOP(ventasPdf || 0)],
          ["Costo vendido", toCOP(costoPdf || 0)],
          ["Gastos (operativos)", toCOP(gastosOperativosPdf || 0)],
          ["Gastos fijos (prorrateados)", toCOP(fixedPdf)],
          ["Utilidad (reglas)", toCOP(utilPdf || 0)],
          ["PAPELERÍA (periodo)", toCOP(Number(pap?.total || 0))],
        ],
        theme: "grid",
        styles: {
          fillColor: [15, 16, 48],
          textColor: [229, 229, 229],
          halign: "center",
          cellPadding: 6,
        },
        headStyles: {
          fillColor: [255, 0, 255],
          textColor: 255,
          fontStyle: "bold",
        },
        margin: { left: marginX, right: marginX },
      });
      const lastY1 = (pdf as JsPDFWithAutoTable).lastAutoTable?.finalY ?? curY;
      curY = lastY1 + 24;

      pdf.setFontSize(13);
      pdf.setTextColor(0, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.text("Caja por método de pago", marginX, curY);
      curY += 8;

      pdf.setDrawColor(30, 31, 75);
      pdf.setLineWidth(0.8);
      pdf.line(marginX, curY, pageW - marginX, curY);
      curY += 8;

      const bruto = {
        EFECTIVO: payments?.EFECTIVO || 0,
        QR_LLAVE: payments?.QR_LLAVE || 0,
        DATAFONO: payments?.DATAFONO || 0,
        total: payments?.total || 0,
      };
      const gastos = {
        EFECTIVO: payments?.gastos?.EFECTIVO || 0,
        QR_LLAVE: payments?.gastos?.QR_LLAVE || 0,
        DATAFONO: payments?.gastos?.DATAFONO || 0,
        total: payments?.gastos?.total || 0,
      };
      const neto = {
        EFECTIVO: payments?.neto?.EFECTIVO ?? bruto.EFECTIVO - gastos.EFECTIVO,
        QR_LLAVE: payments?.neto?.QR_LLAVE ?? bruto.QR_LLAVE - gastos.QR_LLAVE,
        DATAFONO: payments?.neto?.DATAFONO ?? bruto.DATAFONO - gastos.DATAFONO,
        total: payments?.neto?.total ?? bruto.total - gastos.total,
      };

      autoTable(pdf, {
        startY: curY,
        head: [["Método", "Bruto", "Gastos", "Neto"]],
        body: [
          [
            "Efectivo",
            toCOP(bruto.EFECTIVO),
            toCOP(gastos.EFECTIVO),
            toCOP(neto.EFECTIVO),
          ],
          [
            "QR / Llave",
            toCOP(bruto.QR_LLAVE),
            toCOP(gastos.QR_LLAVE),
            toCOP(neto.QR_LLAVE),
          ],
          [
            "Datáfono",
            toCOP(bruto.DATAFONO),
            toCOP(gastos.DATAFONO),
            toCOP(neto.DATAFONO),
          ],
          ["TOTAL", toCOP(bruto.total), toCOP(gastos.total), toCOP(neto.total)],
        ],
        theme: "grid",
        styles: {
          fontSize: 10,
          fillColor: [15, 16, 48],
          textColor: [229, 229, 229],
          halign: "center",
          cellPadding: 5,
        },
        headStyles: {
          fillColor: [0, 255, 255],
          textColor: 0,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [25, 27, 75] },
        margin: { left: marginX, right: marginX },
      });
      const lastYPayments =
        (pdf as JsPDFWithAutoTable).lastAutoTable?.finalY ?? curY;
      curY = lastYPayments + 24;

      pdf.setFontSize(13);
      pdf.setTextColor(255, 0, 255);
      pdf.setFont("helvetica", "bold");
      pdf.text("Ventas del periodo", marginX, curY);
      curY += 8;
      pdf.setDrawColor(30, 31, 75);
      pdf.setLineWidth(0.8);
      pdf.line(marginX, curY, pageW - marginX, curY);
      curY += 8;

      autoTable(pdf, {
        startY: curY,
        head: [
          [
            "Fecha",
            "SKU",
            "Producto",
            "Categoría",
            "Cant.",
            "Precio",
            "Costo",
            "Ganancia",
            "Método(s)",
          ],
        ],
        body: sales.map((s) => {
          const profit = profitByRuleFromSale(s);
          const methods =
            s.payMethods ||
            (s.paymentMethods?.length
              ? s.paymentMethods.map((p) => p.method).join(" + ")
              : "");
          return [
            new Date(s.createdAt).toLocaleString("es-CO"),
            s.sku,
            s.name,
            s.category ?? "-",
            String(s.qty),
            toCOP(s.unitPrice),
            toCOP(s.unitCost),
            toCOP(profit),
            methods,
          ];
        }),
        theme: "striped",
        styles: {
          fontSize: 9,
          fillColor: [20, 22, 58],
          textColor: [229, 229, 229],
          cellPadding: 5,
        },
        headStyles: {
          fillColor: [0, 255, 255],
          textColor: 0,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [25, 27, 75] },
        columnStyles: {
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
        },
        margin: { left: marginX, right: marginX },
      });
      const lastY2 = (pdf as JsPDFWithAutoTable).lastAutoTable?.finalY ?? curY;
      curY = lastY2 + 24;

      pdf.setFontSize(13);
      pdf.setTextColor(255, 0, 255);
      pdf.setFont("helvetica", "bold");
      pdf.text("Gastos del periodo", marginX, curY);
      curY += 8;
      pdf.setDrawColor(30, 31, 75);
      pdf.setLineWidth(0.8);
      pdf.line(marginX, curY, pageW - marginX, curY);
      curY += 8;

      const totalGastos = expenses.reduce(
        (a, e) => a + Number(e.amount || 0),
        0
      );

      autoTable(pdf, {
        startY: curY,
        head: [["Fecha", "Descripción", "Categoría", "Método", "Monto"]],
        body: expenses.map((e) => [
          new Date(e.createdAt).toLocaleString("es-CO"),
          e.description || "-",
          (e.category || "-").toString(),
          e.paymentMethod || "-",
          toCOP(Number(e.amount)),
        ]),
        theme: "striped",
        styles: {
          fontSize: 9,
          fillColor: [20, 22, 58],
          textColor: [229, 229, 229],
          cellPadding: 5,
        },
        headStyles: {
          fillColor: [255, 0, 255],
          textColor: 255,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [25, 27, 75] },
        margin: { left: marginX, right: marginX },
        foot: [["", "", "", "TOTAL", toCOP(totalGastos)]],
        footStyles: {
          fillColor: [230, 230, 230],
          textColor: 0,
          fontStyle: "bold",
        },
        columnStyles: { 4: { halign: "right" } },
      });

      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(9);
        pdf.setTextColor(160, 160, 160);
        pdf.text(
          "© 2025 GAMERLAND PC — Sistema de Reportes",
          pageW / 2,
          pageH - 22,
          { align: "center" }
        );
      }

      pdf.save(`Reporte_GAMERLAND_${from}_a_${to}.pdf`);
    } catch (e) {
      console.error(e);
      setMsg("No se pudo generar el PDF.");
      setTimeout(() => setMsg(""), 2500);
    }
  }
}

/* ===== UI ===== */
function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: COLORS.bgCard,
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <h2 className="font-semibold text-cyan-300 mb-2">{title}</h2>
      {children}
    </div>
  );
}

function KV({
  k,
  v,
  strong = false,
}: {
  k: string;
  v: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between ${strong ? "text-lg" : ""}`}>
      <span>{k}</span>
      <b className={strong ? "text-pink-300" : ""}>{v}</b>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
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
    >
      <div className="text-sm" style={{ color: titleColor }}>
        {label}
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

/* ===== Charts ===== */
function ChartBar({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2C2E6D" />
        <XAxis dataKey="name" stroke="#aaa" />
        <YAxis stroke="#aaa" tickFormatter={(v) => toCOP(Number(v))} />
        <Tooltip
          formatter={(value: number) => [toCOP(Number(value)), "Valor"]}
          contentStyle={{ backgroundColor: "#1E1F4B", border: "none" }}
        />
        <Bar dataKey="value" radius={6}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
function ChartPie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Tooltip
          formatter={(value: number, name: string) => [
            toCOP(Number(value)),
            name,
          ]}
          contentStyle={{ backgroundColor: "#1E1F4B", border: "none" }}
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={(e) => `${e.name}: ${toCOP(Number(e.value))}`}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
function ChartLine({
  data,
}: {
  data: { name: string; Ventas: number; Gastos: number; Utilidad: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2C2E6D" />
        <XAxis dataKey="name" stroke="#aaa" />
        <YAxis stroke="#aaa" tickFormatter={(v) => toCOP(Number(v))} />
        <Tooltip
          formatter={(value: number, name: string) => [
            toCOP(Number(value)),
            name,
          ]}
          contentStyle={{ backgroundColor: "#1E1F4B", border: "none" }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="Ventas"
          stroke="#00FFFF"
          strokeWidth={2}
        />
        <Line
          type="monotone"
          dataKey="Gastos"
          stroke="#FF00FF"
          strokeWidth={2}
        />
        <Line
          type="monotone"
          dataKey="Utilidad"
          stroke="#A5FF00"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ===== Tendencia diaria + MA(7) ===== */
function TrendDailyChart({ data }: { data: DailyWithMA[] }) {
  const rechartsData = data.map((d) => ({
    date: d.date,
    Ingresos: d.revenue,
    Utilidad: d.profit,
    "MA7 Ingresos": d.ma7_revenue ?? null,
    "MA7 Utilidad": d.ma7_profit ?? null,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={rechartsData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2C2E6D" />
        <XAxis dataKey="date" stroke="#aaa" />
        <YAxis stroke="#aaa" tickFormatter={(v) => toCOP(Number(v))} />
        <Tooltip
          formatter={(value: number, name: string) => [
            toCOP(Number(value)),
            name,
          ]}
          contentStyle={{ backgroundColor: "#1E1F4B", border: "none" }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="Ingresos"
          stroke="#00FFFF"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="MA7 Ingresos"
          stroke="#00FFFF"
          strokeDasharray="4 4"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="Utilidad"
          stroke="#A5FF00"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="MA7 Utilidad"
          stroke="#A5FF00"
          strokeDasharray="4 4"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ===== Barras semanales ===== */
function WeeklyBars({ data }: { data: WeeklyPoint[] }) {
  const rechartsData = data.map((w) => ({
    Semana: w.label,
    Ingresos: w.revenue,
    Utilidad: w.profit,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rechartsData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2C2E6D" />
        <XAxis dataKey="Semana" stroke="#aaa" />
        <YAxis stroke="#aaa" tickFormatter={(v) => toCOP(Number(v))} />
        <Tooltip
          formatter={(value: number, name: string) => [
            toCOP(Number(value)),
            name,
          ]}
          contentStyle={{ backgroundColor: "#1E1F4B", border: "none" }}
        />
        <Legend />
        <Bar dataKey="Ingresos" radius={6} fill={CHART_COLORS[0]} />
        <Bar dataKey="Utilidad" radius={6} fill={CHART_COLORS[2]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
