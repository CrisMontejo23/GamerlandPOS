"use client";
import { useEffect, useRef, useState, useCallback } from "react";
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

type JsPDFWithAutoTable = jsPDF & {
  lastAutoTable?: { finalY: number };
};

/* ===== Tipos ===== */
type Summary = {
  ventas: number;
  subtotal: number;
  iva: number;
  descuentos: number;
  costo_vendido: number;
  gastos_total: number;        // suma de todos los gastos
  gastos_operativos: number;   // excluye MERCANCIA
  utilidad: number;            // ventas - costo - gastos_operativos
};

type PaymentsBreakdown = {
  // bruto por método
  EFECTIVO: number;
  QR_LLAVE: number;
  DATAFONO: number;
  total: number;
  // gastos por método
  gastos?: {
    EFECTIVO: number;
    QR_LLAVE: number;
    DATAFONO: number;
    total: number;
  };
  // neto por método (bruto - gastos)
  neto?: {
    EFECTIVO: number;
    QR_LLAVE: number;
    DATAFONO: number;
    total: number;
  };
};

type RangeType = "day" | "month" | "year" | "custom";

// Ventas (renglón)
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
  payMethods?: string; // compat
};

// Gasto
type ExpenseRow = {
  id: number;
  description?: string | null;
  amount: number | string;
  paymentMethod?: string | null;
  category?: string | null;
  createdAt: string;
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

// Carga una imagen importada (Next) como dataURL para jsPDF
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

export default function ReportsPage() {
  const today = todayLocalISO();
  const [rangeType, setRangeType] = useState<RangeType>("day");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [sumDay, setSumDay] = useState<Summary | null>(null);
  const [payDay, setPayDay] = useState<PaymentsBreakdown | null>(null);
  const [sumMonth, setSumMonth] = useState<Summary | null>(null);
  const [sumYear, setSumYear] = useState<Summary | null>(null);
  const [papTotal, setPapTotal] = useState<number>(0);

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
      const [r1, r2, r3, r4, r5] = await Promise.all([
        apiFetch(`/reports/summary?from=${from}&to=${to}`),
        apiFetch(`/reports/payments?from=${from}&to=${to}`),
        apiFetch(`/reports/summary?from=${monthStartISO(to)}&to=${to}`),
        apiFetch(`/reports/summary?from=${yearStartISO(to)}&to=${to}`),
        apiFetch(`/reports/papeleria?from=${from}&to=${to}`),
      ]);
      const [d1, d2, d3, d4, d5] = await Promise.all([
        r1.json(),
        r2.json(),
        r3.json(),
        r4.json(),
        r5.json(),
      ]);
      setSumDay(d1);
      setPayDay(d2);
      setSumMonth(d3);
      setSumYear(d4);
      setPapTotal(Number(d5?.total || 0));
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

  /* Datos de charts (solo UI) */
  const dayChartData = [
    { name: "Ventas", value: sumDay?.ventas || 0 },
    { name: "Gastos (Op.)", value: sumDay?.gastos_operativos || 0 },
    { name: "Utilidad", value: sumDay?.utilidad || 0 },
  ];

  // Usar neto si lo devuelve el backend; si no, usar bruto
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
      Gastos: sumMonth?.gastos_operativos || 0,
      Utilidad: sumMonth?.utilidad || 0,
    },
    {
      name: "Año",
      Ventas: sumYear?.ventas || 0,
      Gastos: sumYear?.gastos_operativos || 0,
      Utilidad: sumYear?.utilidad || 0,
    },
  ];

  /* ===== Exportar PDF (jsPDF + autoTable, estilo gamer) ===== */
  const exportReportPdf = async () => {
    try {
      // 1) Pide datos del rango actual
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

      // 2) Prepara PDF
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginX = 40;

      // Fondo header gamer
      pdf.setFillColor(20, 22, 58);
      pdf.rect(0, 0, pageW, 110, "F");

      // Logo
      const logoSrc =
        (typeof logo === "string"
          ? logo
          : (logo as unknown as { src?: string })?.src) || "/logo.png";
      const logoDataUrl = await fetchImageAsDataUrl(logoSrc);

      if (logoDataUrl) {
        pdf.addImage(logoDataUrl, "PNG", marginX, 25, 60, 60);
      }

      // Títulos
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0, 255, 255);
      pdf.setFontSize(20);
      pdf.text("GAMERLAND PC", marginX + 75, 48);

      pdf.setFontSize(12);
      pdf.setTextColor(229, 229, 229);
      pdf.text(`Reporte de ${from} a ${to}`, marginX + 75, 70);

      // Línea neón
      pdf.setDrawColor(255, 0, 255);
      pdf.setLineWidth(1.2);
      pdf.line(marginX, 100, pageW - marginX, 100);

      let curY = 120;

      // ===== Métricas (bloque compacto) =====
      autoTable(pdf, {
        startY: curY,
        head: [["Métrica", "Valor"]],
        body: [
          ["Ventas totales", toCOP(summary?.ventas || 0)],
          ["Costo vendido", toCOP(summary?.costo_vendido || 0)],
          ["Gastos (total)", toCOP(summary?.gastos_total || 0)],
          ["Gastos operativos", toCOP(summary?.gastos_operativos || 0)],
          ["Utilidad", toCOP(summary?.utilidad || 0)],
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

      // ===== Caja por método de pago (Bruto / Gastos / Neto) =====
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
        EFECTIVO: payments?.neto?.EFECTIVO ?? (bruto.EFECTIVO - gastos.EFECTIVO),
        QR_LLAVE: payments?.neto?.QR_LLAVE ?? (bruto.QR_LLAVE - gastos.QR_LLAVE),
        DATAFONO: payments?.neto?.DATAFONO ?? (bruto.DATAFONO - gastos.DATAFONO),
        total:
          payments?.neto?.total ??
          (bruto.total - gastos.total),
      };

      autoTable(pdf, {
        startY: curY,
        head: [["Método", "Bruto", "Gastos", "Neto"]],
        body: [
          ["Efectivo", toCOP(bruto.EFECTIVO), toCOP(gastos.EFECTIVO), toCOP(neto.EFECTIVO)],
          ["QR / Llave", toCOP(bruto.QR_LLAVE), toCOP(gastos.QR_LLAVE), toCOP(neto.QR_LLAVE)],
          ["Datáfono", toCOP(bruto.DATAFONO), toCOP(gastos.DATAFONO), toCOP(neto.DATAFONO)],
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
        bodyStyles: { fontStyle: "normal" },
        alternateRowStyles: { fillColor: [25, 27, 75] },
        margin: { left: marginX, right: marginX },
      });
      const lastYPayments =
        (pdf as JsPDFWithAutoTable).lastAutoTable?.finalY ?? curY;
      curY = lastYPayments + 24;

      // ===== Ventas =====
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
          const profit =
            typeof s.profit === "number"
              ? s.profit
              : Math.round(
                  (s.revenue ?? s.unitPrice * s.qty) -
                    (s.cost ?? s.unitCost * s.qty)
                );
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

      // ===== Gastos =====
      pdf.setFontSize(13);
      pdf.setTextColor(255, 0, 255);
      pdf.setFont("helvetica", "bold");
      pdf.text("Gastos del periodo", marginX, curY);
      curY += 8;
      pdf.setDrawColor(30, 31, 75);
      pdf.setLineWidth(0.8);
      pdf.line(marginX, curY, pageW - marginX, curY);
      curY += 8;

      const totalGastos = expenses.reduce((a, e) => a + Number(e.amount || 0), 0);

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

      // ===== Footer
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

  return (
    <div className="max-w-6xl mx-auto text-gray-200 space-y-6">
      <h1 className="text-2xl font-bold text-cyan-400">Dashboard / Reportes</h1>

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
          <option value="day">Día</option>
          <option value="month">Mes</option>
          <option value="year">Año</option>
          <option value="custom">Personalizado</option>
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
          Calcular
        </button>

        <div className="ml-auto flex gap-2">
          <button
            onClick={exportReportPdf}
            className="px-4 py-2 rounded border"
            style={{ borderColor: COLORS.border }}
            title="Exportar reporte en PDF (métricas + tablas)"
          >
            Exportar PDF
          </button>
        </div>
      </div>

      {!!msg && <div className="text-sm text-cyan-300">{msg}</div>}
      {loading && <div>Cargando…</div>}

      {/* Contenedor del dashboard */}
      <div ref={dashRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resumen diario */}
        <Card title="Resumen diario">
          <ChartBar data={dayChartData} />
          <div className="space-y-1 mt-2">
            <KV k="Ventas" v={toCOP(sumDay?.ventas || 0)} />
            <KV k="Gastos (operativos)" v={toCOP(sumDay?.gastos_operativos || 0)} />
            <KV k="Utilidad" v={toCOP(sumDay?.utilidad || 0)} strong />
            <KV k='PAPELERÍA (hoy)' v={toCOP(papTotal || 0)} />
          </div>
        </Card>

        {/* Caja por método de pago (NETO) */}
        <Card title="Caja por método de pago (Neto)">
          <ChartPie data={payChartData} />
          <div className="space-y-1 mt-2">
            <KV k="Efectivo (neto)" v={toCOP(payForChart.EFECTIVO || 0)} />
            <KV k="QR / Llave (neto)" v={toCOP(payForChart.QR_LLAVE || 0)} />
            <KV k="Datáfono (neto)" v={toCOP(payForChart.DATAFONO || 0)} />
            <KV k="Total neto" v={toCOP(payForChart.total || 0)} strong />
            <div className="text-xs text-gray-400">
              * Neto = Cobros - Gastos pagados con ese método.
            </div>
          </div>
        </Card>

        {/* Comparativa mes / año */}
        <Card title="Comparativa mensual vs anual">
          <ChartLine data={monthlyComparison} />
        </Card>

        {/* Indicadores clave */}
        <Card title="Indicadores de eficiencia">
          <KV
            k="% Utilidad / Ventas (mes)"
            v={pct(sumMonth?.utilidad || 0, sumMonth?.ventas || 0)}
          />
          <KV
            k="% Gastos / Ventas (mes)"
            v={pct(sumMonth?.gastos_operativos || 0, sumMonth?.ventas || 0)}
          />
          <KV
            k="% Utilidad / Ventas (año)"
            v={pct(sumYear?.utilidad || 0, sumYear?.ventas || 0)}
          />
          <KV
            k="% Gastos / Ventas (año)"
            v={pct(sumYear?.gastos_operativos || 0, sumYear?.ventas || 0)}
          />
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

/* ===== Charts ===== */
function ChartBar({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2C2E6D" />
        <XAxis dataKey="name" stroke="#aaa" />
        <YAxis stroke="#aaa" />
        <Tooltip
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
          contentStyle={{ backgroundColor: "#1E1F4B", border: "none" }}
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

type ChartLineData = {
  name: string;
  Ventas: number;
  Gastos: number;
  Utilidad: number;
};

function ChartLine({ data }: { data: ChartLineData[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2C2E6D" />
        <XAxis dataKey="name" stroke="#aaa" />
        <YAxis stroke="#aaa" />
        <Tooltip
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