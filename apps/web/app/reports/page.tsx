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
  utilidad: number;
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
  qty: number;
  unitPrice: number;
  unitCost: number;
  revenue?: number;
  cost?: number;
  profit?: number;
  paymentMethods?: { method: string; amount: number }[];
  payMethods?: string;
};

type ExpenseRow = {
  id: number;
  description?: string | null;
  amount: number | string;
  paymentMethod?: string | null;
  category?: string | null; // "INTERNO" | "EXTERNO" | otros
  createdAt: string;
};

/* ===== CAJA ===== */
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

/** COSTOS FIJOS MENSUALES (parametrizables) */
const FIXED_MONTHLY = {
  arriendo: 473_400,
  servicios: 200_000,
  trabajadores: 760_000,
};
const FIXED_TOTAL_MONTH =
  FIXED_MONTHLY.arriendo + FIXED_MONTHLY.servicios + FIXED_MONTHLY.trabajadores;

/** Normaliza a pesos sin decimales */
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
function parseISO(s: string) {
  // fuerza medianoche local
  return new Date(`${s}T00:00:00`);
}
function daysBetweenInclusive(fromISO: string, toISO: string) {
  const a = parseISO(fromISO).getTime();
  const b = parseISO(toISO).getTime();
  const ms = Math.max(0, b - a);
  return Math.floor(ms / 86_400_000) + 1;
}
/** días del mes del toISO */
function daysInMonthOf(toISO: string) {
  const d = parseISO(toISO);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
/** Prorratea costos fijos para un rango arbitrario usando una base diaria (30.42 días promedio/mes) */
function fixedForRange(fromISO: string, toISO: string) {
  const days = Math.max(1, daysBetweenInclusive(fromISO, toISO));
  const daily = FIXED_TOTAL_MONTH / 30.42;
  return daily * days;
}

/** Carga imagen local como dataURL para PDF */
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

/* ===== Reglas de ganancia (tu Excel) ===== */
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

  // Margen normal
  return Math.round(total - costo);
}

/** Gastos operativos EXTERNOS (excluye INTERNO) */
function sumOperativeExpensesExcludingInternos(list: ExpenseRow[]) {
  return (list || [])
    .filter((e) => String(e.category || "").toUpperCase() !== "INTERNO")
    .reduce((a, e) => a + Number(e.amount || 0), 0);
}

/** Utilidad por reglas sobre ventas (CMR aproximado) */
function contributionMarginRatio(ventas: number, utilidadPorReglas: number) {
  if (ventas <= 0) return 0;
  return Math.max(0, Math.min(1, utilidadPorReglas / ventas));
}

export default function ReportsPage() {
  const today = todayLocalISO();
  const [rangeType, setRangeType] = useState<RangeType>("day");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Resúmenes base (del backend)
  const [sumDay, setSumDay] = useState<Summary | null>(null);
  const [payDay, setPayDay] = useState<PaymentsBreakdown | null>(null);
  const [sumMonth, setSumMonth] = useState<Summary | null>(null);
  const [sumYear, setSumYear] = useState<Summary | null>(null);
  const [papTotal, setPapTotal] = useState<number>(0);

  // Utilidad por reglas (front) — día/mes/año
  const [utilDayByRule, setUtilDayByRule] = useState<number>(0);
  const [utilMonthByRule, setUtilMonthByRule] = useState<number>(0);
  const [utilYearByRule, setUtilYearByRule] = useState<number>(0);

  // Gastos operativos recalculados (excluye INTERNO) — día/mes/año
  const [opsDay, setOpsDay] = useState<number>(0);
  const [opsMonth, setOpsMonth] = useState<number>(0);
  const [opsYear, setOpsYear] = useState<number>(0);

  /* CAJA */
  const [cashbox, setCashbox] = useState<CashboxState>({
    ok: false,
    source: "fallback",
    efectivo: 0,
    qr_llave: 0,
    datafono: 0,
    total: 0,
  });

  const dashRef = useRef<HTMLDivElement>(null);

  /* Ajuste automático de rango por tipo */
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
        rLinesDay,
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
        linesDay,
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
        rLinesDay.json() as Promise<SaleLine[]>,
        rLinesMonth.json() as Promise<SaleLine[]>,
        rLinesYear.json() as Promise<SaleLine[]>,
        rExpDay.json() as Promise<ExpenseRow[]>,
        rExpMonth.json() as Promise<ExpenseRow[]>,
        rExpYear.json() as Promise<ExpenseRow[]>,
      ]);

      // Estados base recibidos del backend
      setSumDay(dSumDay);
      setPayDay(dPayDay);
      setSumMonth(dSumMonth);
      setSumYear(dSumYear);
      setPapTotal(Number(dPap?.total || 0));

      // Utilidades por regla
      const uDay = (linesDay || []).reduce(
        (a, s) => a + profitByRuleFromSale(s),
        0
      );
      const uMonth = (linesMonth || []).reduce(
        (a, s) => a + profitByRuleFromSale(s),
        0
      );
      const uYear = (linesYear || []).reduce(
        (a, s) => a + profitByRuleFromSale(s),
        0
      );
      setUtilDayByRule(uDay);
      setUtilMonthByRule(uMonth);
      setUtilYearByRule(uYear);

      // Gastos operativos EXTERNOS (excluye INTERNO)
      const gDay = sumOperativeExpensesExcludingInternos(expDay || []);
      const gMonth = sumOperativeExpensesExcludingInternos(expMonth || []);
      const gYear = sumOperativeExpensesExcludingInternos(expYear || []);
      setOpsDay(gDay);
      setOpsMonth(gMonth);
      setOpsYear(gYear);

      setMsg("");
    } catch {
      setMsg("No se pudo cargar la información");
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 2500);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  /* ===== CAJA ===== */
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
      /* fallback */
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
        EFECTIVO:
          typeof p?.neto?.EFECTIVO === "number"
            ? p.neto.EFECTIVO
            : bruto.EFECTIVO - gastos.EFECTIVO,
        QR_LLAVE:
          typeof p?.neto?.QR_LLAVE === "number"
            ? p.neto.QR_LLAVE
            : bruto.QR_LLAVE - gastos.QR_LLAVE,
        DATAFONO:
          typeof p?.neto?.DATAFONO === "number"
            ? p.neto.DATAFONO
            : bruto.DATAFONO - gastos.DATAFONO,
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

  /* ====== KPIs de rentabilidad (derivados) ====== */

  // Prorrateo de fijos para el rango actual
  const fixedForCurrentRange = useMemo(
    () => fixedForRange(from, to),
    [from, to]
  );

  // Ratios de contribución (día/mes/año)
  const cmrDay = useMemo(
    () => contributionMarginRatio(sumDay?.ventas || 0, utilDayByRule || 0),
    [sumDay, utilDayByRule]
  );
  const cmrMonth = useMemo(
    () => contributionMarginRatio(sumMonth?.ventas || 0, utilMonthByRule || 0),
    [sumMonth, utilMonthByRule]
  );
  const cmrYear = useMemo(
    () => contributionMarginRatio(sumYear?.ventas || 0, utilYearByRule || 0),
    [sumYear, utilYearByRule]
  );

  // Neto del periodo (utilidad por reglas - gastos operativos - fijos prorrateados)
  const netPeriod = useMemo(() => {
    const util = utilDayByRule || 0;
    const ops = opsDay || 0;
    const fijos = fixedForCurrentRange || 0;
    return util - ops - fijos;
  }, [utilDayByRule, opsDay, fixedForCurrentRange]);

  const netMonth = useMemo(
    () => utilMonthByRule - opsMonth - fixedForRange(monthStartISO(to), to),
    [utilMonthByRule, opsMonth, to]
  );
  const netYear = useMemo(
    () => utilYearByRule - opsYear - fixedForRange(yearStartISO(to), to),
    [utilYearByRule, opsYear, to]
  );

  // Margen neto sobre ventas (periodo)
  const netMarginPeriod = useMemo(() => {
    const v = sumDay?.ventas || 0;
    return v > 0 ? netPeriod / v : 0;
  }, [sumDay, netPeriod]);

  // Puntos de equilibrio (ventas) — clásico: Fijos / CMR
  const beSales_fixedOnly = useMemo(() => {
    const cmr = cmrDay;
    return cmr > 0 ? (fixedForCurrentRange || 0) / cmr : Infinity;
  }, [cmrDay, fixedForCurrentRange]);

  // Punto de equilibrio ampliado (fijos + gastos operativos del periodo)
  const beSales_fixedPlusOps = useMemo(() => {
    const cmr = cmrDay;
    const target = (fixedForCurrentRange || 0) + (opsDay || 0);
    return cmr > 0 ? target / cmr : Infinity;
  }, [cmrDay, fixedForCurrentRange, opsDay]);

  // Margen de seguridad (ventas – BE) y %
  const safetyAbs = useMemo(
    () => (sumDay?.ventas || 0) - beSales_fixedOnly,
    [sumDay, beSales_fixedOnly]
  );
  const safetyPct = useMemo(() => {
    const v = sumDay?.ventas || 0;
    if (v <= 0 || !isFinite(beSales_fixedOnly)) return 0;
    return Math.max(0, (v - beSales_fixedOnly) / v);
  }, [sumDay, beSales_fixedOnly]);

  // Proyección fin de mes (promedio diario al día "to")
  const monthDays = daysInMonthOf(to);
  const elapsedDays = useMemo(() => {
    const d = parseISO(to);
    return d.getDate(); // día del mes (1..n)
  }, [to]);
  const avgNetPerDayMonthToDate = useMemo(
    () => (elapsedDays > 0 ? netMonth / elapsedDays : 0),
    [netMonth, elapsedDays]
  );
  const projectedNetMonth = useMemo(
    () => avgNetPerDayMonthToDate * monthDays,
    [avgNetPerDayMonthToDate, monthDays]
  );

  /* Charts (UI) — ahora con fijos y neto */
  const dayChartData = [
    { name: "Ventas", value: sumDay?.ventas || 0 },
    { name: "Gastos (Op.)", value: opsDay || 0 },
    { name: "Fijos prorr.", value: fixedForCurrentRange || 0 },
    { name: "Utilidad (reglas)", value: utilDayByRule || 0 },
    { name: "Neto", value: netPeriod || 0 },
  ];

  const payForChart = payDay?.neto ?? {
    EFECTIVO: payDay?.EFECTIVO || 0,
    QR_LLAVE: payDay?.QR_LLAVE || 0,
    DATAFONO: payDay?.DATAFONO || 0,
    total:
      (payDay?.EFECTIVO || 0) +
      (payDay?.QR_LLAVE || 0) +
      (payDay?.DATAFONO || 0),
  };

  const payChartData = payDay
    ? [
        { name: "Efectivo", value: payForChart.EFECTIVO || 0 },
        { name: "QR / Llave", value: payForChart.QR_LLAVE || 0 },
        { name: "Datáfono", value: payForChart.DATAFONO || 0 },
      ]
    : [];

  const monthlyComparison = [
    {
      name: "Mes",
      Ventas: sumMonth?.ventas || 0,
      Gastos: opsMonth || 0,
      Utilidad: utilMonthByRule || 0,
    },
    {
      name: "Año",
      Ventas: sumYear?.ventas || 0,
      Gastos: opsYear || 0,
      Utilidad: utilYearByRule || 0,
    },
  ];

  /* ===== Exportar PDF ===== */
  const exportReportPdf = async () => {
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

      // Recalcular métricas para PDF
      const utilByRuleForPdf = (sales || []).reduce(
        (a, s) => a + profitByRuleFromSale(s),
        0
      );
      const gastosOperativosPdf =
        sumOperativeExpensesExcludingInternos(expenses);
      const fijosProrrPdf = fixedForRange(from, to);
      const netoPdf = utilByRuleForPdf - gastosOperativosPdf - fijosProrrPdf;

      const cmrPdf = contributionMarginRatio(
        summary?.ventas || 0,
        utilByRuleForPdf
      );
      const beFixedPdf = cmrPdf > 0 ? fijosProrrPdf / cmrPdf : Infinity;
      const beFixedPlusOpsPdf =
        cmrPdf > 0 ? (fijosProrrPdf + gastosOperativosPdf) / cmrPdf : Infinity;
      const safetyAbsPdf = (summary?.ventas || 0) - beFixedPdf;
      const safetyPctPdf =
        summary?.ventas && isFinite(beFixedPdf) && summary.ventas > 0
          ? Math.max(0, safetyAbsPdf / summary.ventas)
          : 0;

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

      // Bloque 1: métricas principales
      autoTable(pdf, {
        startY: curY,
        head: [["Métrica", "Valor"]],
        body: [
          ["Ventas totales", toCOP(summary?.ventas || 0)],
          ["Costo vendido", toCOP(summary?.costo_vendido || 0)],
          ["Gastos (operativos)", toCOP(gastosOperativosPdf || 0)],
          ["Fijos prorrateados", toCOP(fijosProrrPdf || 0)],
          ["Utilidad (reglas)", toCOP(utilByRuleForPdf || 0)],
          ["Neto del periodo", toCOP(netoPdf || 0)],
          ["Papelería (periodo)", toCOP(Number(pap?.total || 0))],
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

      // Bloque 2: análisis de equilibrio
      pdf.setFontSize(13);
      pdf.setTextColor(0, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.text("Análisis de equilibrio", marginX, curY);
      curY += 8;

      pdf.setDrawColor(30, 31, 75);
      pdf.setLineWidth(0.8);
      pdf.line(marginX, curY, pageW - marginX, curY);
      curY += 8;

      autoTable(pdf, {
        startY: curY,
        head: [["Indicador", "Valor"]],
        body: [
          [
            "CMR (Utilidad/Ventas)",
            pct(utilByRuleForPdf, summary?.ventas || 0),
          ],
          [
            "Punto de equilibrio (fijos)",
            isFinite(beFixedPdf) ? toCOP(beFixedPdf) : "∞",
          ],
          [
            "Punto de equilibrio (fijos + ops)",
            isFinite(beFixedPlusOpsPdf) ? toCOP(beFixedPlusOpsPdf) : "∞",
          ],
          ["Margen de seguridad (abs.)", toCOP(safetyAbsPdf || 0)],
          ["Margen de seguridad (%)", `${(safetyPctPdf * 100).toFixed(1)}%`],
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
      const lastYEquil =
        (pdf as JsPDFWithAutoTable).lastAutoTable?.finalY ?? curY;
      curY = lastYEquil + 24;

      // Bloque 3: caja por método
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

      // Bloque 4: ventas del periodo
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

      // Bloque 5: gastos del periodo
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

      // Footer
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
  };

  const rangeWord =
    rangeType === "day" ? "DÍA" : rangeType === "month" ? "MES" : "AÑO";
  const resumenTitle =
    rangeType === "day"
      ? "Resumen diario"
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

      {/* Contenedor del dashboard */}
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
                  : "Fuente: cálculo neto efectivo (fallback)"}
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

        {/* Resumen con rentabilidad del periodo */}
        <Card title={resumenTitle}>
          <ChartBar data={dayChartData} />
          <div className="space-y-1 mt-2">
            <KV k="Ventas" v={toCOP(sumDay?.ventas || 0)} />
            <KV k="Gastos (Operativos)" v={toCOP(opsDay || 0)} />
            <KV k="Fijos prorrateados" v={toCOP(fixedForCurrentRange || 0)} />
            <KV k="Utilidad (reglas)" v={toCOP(utilDayByRule || 0)} />
            <KV k="Neto del periodo" v={toCOP(netPeriod || 0)} strong />
            <KV
              k="Margen neto sobre ventas"
              v={pct(netPeriod || 0, sumDay?.ventas || 0)}
            />
            <KV k="Papelería (periodo)" v={toCOP(papTotal || 0)} />
          </div>
        </Card>

        {/* Caja por método (NETO) */}
        <Card title={cajaPayTitle}>
          <ChartPie data={payChartData} />
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

        {/* Comparativa mes / año (utilidad y gastos variables) */}
        <Card title="Comparativa mensual vs anual">
          <ChartLine
            data={[
              {
                name: "Mes",
                Ventas: sumMonth?.ventas || 0,
                Gastos: opsMonth || 0,
                Utilidad: utilMonthByRule || 0,
              },
              {
                name: "Año",
                Ventas: sumYear?.ventas || 0,
                Gastos: opsYear || 0,
                Utilidad: utilYearByRule || 0,
              },
            ]}
          />
        </Card>

        {/* Indicadores y equilibrio */}
        <Card title="Indicadores de eficiencia y equilibrio (periodo)">
          <KV
            k="CMR (Utilidad/Ventas)"
            v={pct(utilDayByRule || 0, sumDay?.ventas || 0)}
          />
          <KV
            k="Punto de equilibrio (solo fijos)"
            v={isFinite(beSales_fixedOnly) ? toCOP(beSales_fixedOnly) : "∞"}
          />
          <KV
            k="Punto de equilibrio (fijos + gastos op.)"
            v={
              isFinite(beSales_fixedPlusOps) ? toCOP(beSales_fixedPlusOps) : "∞"
            }
          />
          <KV k="Margen de seguridad (abs.)" v={toCOP(safetyAbs || 0)} />
          <KV
            k="Margen de seguridad (%)"
            v={`${(safetyPct * 100).toFixed(1)}%`}
          />
        </Card>

        {/* Proyección del mes (a fin de mes) */}
        <Card title="Proyección de cierre del mes">
          <div className="space-y-1">
            <KV k="Neto acumulado del mes" v={toCOP(netMonth || 0)} />
            <KV
              k="Promedio diario neto (mes a la fecha)"
              v={toCOP(avgNetPerDayMonthToDate || 0)}
            />
            <KV
              k={`Proyección neta al cierre (≈ ${monthDays} días)`}
              v={toCOP(projectedNetMonth || 0)}
              strong
            />
            <div className="text-xs text-gray-400">
              * Proyección = promedio neto diario × días del mes.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
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
    <ResponsiveContainer width="100%" height={220}>
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