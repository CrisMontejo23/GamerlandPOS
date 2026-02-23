"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

/* ===== Tipos ===== */
type WorksStatus = {
  received: number;
  inProgress: number;
  finished: number;
  totalOpen: number;
  lastUpdated?: string;
};

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

/* ===== Estilos base (neón gamer) ===== */
const COLORS = {
  pageBg: "#0A0B1D",
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  cyan: "#00FFFF",
  pink: "#FF00FF",
  text: "#E5E5E5",
  muted: "#9CA3AF",
};

const toCOP = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

function fmtDate(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-CO");
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [works, setWorks] = useState<WorksStatus | null>(null);

  const [cashbox, setCashbox] = useState<CashboxState>({
    ok: false,
    source: "api",
    efectivo: 0,
    qr_llave: 0,
    datafono: 0,
    total: 0,
  });

  const loadWorks = useCallback(async () => {
    try {
      const r = await apiFetch("/reports/works-status");
      if (!r.ok) throw new Error("works fail");
      const d = (await r.json()) as WorksStatus;
      setWorks(d);
    } catch {
      setWorks(null);
    }
  }, []);

  const loadCashbox = useCallback(async () => {
    try {
      const r = await apiFetch(`/reports/cashbox`);
      if (!r.ok) throw new Error("cashbox fail");
      const d: CashboxAPI = await r.json();

      const efectivo = Number(d.efectivo || 0);
      const qr_llave = Number(d.qr_llave || 0);
      const datafono = Number(d.datafono || 0);
      const total = Number(d.total ?? efectivo + qr_llave + datafono);

      setCashbox({
        ok: true,
        source: "api",
        efectivo,
        qr_llave,
        datafono,
        total,
        lastUpdated: d.lastUpdated,
      });
    } catch {
      setCashbox((c) => ({ ...c, ok: false }));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      await Promise.all([loadCashbox(), loadWorks()]);
      setMsg("");
    } catch {
      setMsg("No se pudo actualizar");
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 2200);
    }
  }, [loadCashbox, loadWorks]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const t = setInterval(() => {
      loadCashbox();
      loadWorks();
    }, 60_000);
    return () => clearInterval(t);
  }, [loadCashbox, loadWorks]);

  const cajaParts = useMemo(() => {
    const total = Number(cashbox.total || 0);
    const ef = Number(cashbox.efectivo || 0);
    const qr = Number(cashbox.qr_llave || 0);
    const da = Number(cashbox.datafono || 0);

    const pct = (x: number) => (total > 0 ? Math.round((x / total) * 100) : 0);

    return {
      total,
      ef,
      qr,
      da,
      pEf: pct(ef),
      pQr: pct(qr),
      pDa: pct(da),
    };
  }, [cashbox]);

  return (
    <div
      className="min-h-[calc(100vh-64px)] px-3 sm:px-6 py-5 text-gray-200"
      style={{
        background:
          "radial-gradient(900px 400px at 20% 10%, rgba(0,255,255,.12), transparent 55%), radial-gradient(900px 400px at 80% 0%, rgba(255,0,255,.10), transparent 55%), linear-gradient(180deg, #090A1A 0%, #060716 100%)",
      }}
    >
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div
          className="rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{
            backgroundColor: "rgba(20,22,58,.72)",
            border: `1px solid ${COLORS.border}`,
            boxShadow:
              "0 0 22px rgba(0,255,255,.10), 0 0 28px rgba(255,0,255,.08)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold">
              <span className="text-cyan-300">DASHBOARD</span>{" "}
              <span className="text-gray-300">/</span>{" "}
              <span className="text-pink-300">BALANCES</span>
            </h1>
            <div className="text-xs sm:text-sm" style={{ color: COLORS.muted }}>
              Caja actual por método de pago + estado de trabajos de servicio
              técnico
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusPill
              ok={cashbox.ok && !!works}
              label={
                loading
                  ? "Actualizando…"
                  : cashbox.ok && works
                    ? "En vivo"
                    : "Sin conexión"
              }
            />
            <button
              onClick={refreshAll}
              disabled={loading}
              className="px-4 py-2 rounded-xl font-semibold text-sm disabled:opacity-60"
              style={{
                color: "#001014",
                background:
                  "linear-gradient(90deg, rgba(0,255,255,0.92), rgba(255,0,255,0.92))",
                boxShadow:
                  "0 0 14px rgba(0,255,255,.25), 0 0 22px rgba(255,0,255,.2)",
              }}
            >
              Refrescar
            </button>
          </div>
        </div>

        {!!msg && <div className="text-sm text-cyan-300">{msg}</div>}

        {/* Grid principal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* CAJA */}
          <Card
            title="CAJA ACTUAL"
            subtitle={
              cashbox.lastUpdated
                ? `Actualizado: ${fmtDate(cashbox.lastUpdated)}`
                : " "
            }
            rightTag={cashbox.ok ? "OK" : "OFF"}
            tagTone={cashbox.ok ? "cyan" : "muted"}
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-3xl sm:text-4xl font-extrabold text-pink-300">
                  {toCOP(cajaParts.total)}
                </div>
                <div className="text-xs mt-1" style={{ color: COLORS.muted }}>
                  Total en caja (sumatoria de métodos)
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs" style={{ color: COLORS.muted }}>
                  Fuente
                </div>
                <div className="text-sm font-semibold">
                  {cashbox.source === "api" ? "API / cashbox" : "Fallback"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <MiniStat
                label="Efectivo"
                value={toCOP(cajaParts.ef)}
                hint={`${cajaParts.pEf}%`}
                accent="cyan"
              />
              <MiniStat
                label="QR / Llave"
                value={toCOP(cajaParts.qr)}
                hint={`${cajaParts.pQr}%`}
                accent="cyan"
              />
              <MiniStat
                label="Datáfono"
                value={toCOP(cajaParts.da)}
                hint={`${cajaParts.pDa}%`}
                accent="cyan"
              />
            </div>

            <div className="mt-4">
              <BarSplit a={cajaParts.ef} b={cajaParts.qr} c={cajaParts.da} />
              <div className="text-xs mt-2" style={{ color: COLORS.muted }}>
                Distribución visual por método (proporción del total).
              </div>
            </div>
          </Card>

          {/* TRABAJOS */}
          <Card
            title="TRABAJOS (SERVICIO TÉCNICO)"
            subtitle={
              works?.lastUpdated
                ? `Actualizado: ${fmtDate(works.lastUpdated)}`
                : " "
            }
            rightTag={works ? "OK" : "OFF"}
            tagTone={works ? "pink" : "muted"}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MiniStat
                label="Recibidos"
                value={String(works?.received ?? 0)}
                accent="cyan"
              />
              <MiniStat
                label="En proceso"
                value={String(works?.inProgress ?? 0)}
                accent="pink"
              />
              <MiniStat
                label="Finalizados"
                value={String(works?.finished ?? 0)}
                accent="cyan"
              />
            </div>

            <div
              className="rounded-xl p-3 mt-4 flex items-center justify-between"
              style={{
                backgroundColor: "rgba(15,16,48,.6)",
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div>
                <div className="text-xs" style={{ color: COLORS.muted }}>
                  Abiertos (pendientes por entregar)
                </div>
                <div className="text-lg font-bold text-cyan-300">
                  {String(works?.totalOpen ?? 0)}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs" style={{ color: COLORS.muted }}>
                  Semáforo
                </div>
                <WorkHealthPill totalOpen={works?.totalOpen ?? 0} />
              </div>
            </div>

            <div className="text-xs mt-3" style={{ color: COLORS.muted }}>
              Tip: si quieres, puedo agregar “Entregados” como cuarto indicador,
              pero lo dejé fuera como pediste.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ===== UI helpers ===== */

function Card({
  title,
  subtitle,
  rightTag,
  tagTone,
  children,
}: {
  title: string;
  subtitle?: string;
  rightTag?: string;
  tagTone?: "cyan" | "pink" | "muted";
  children: React.ReactNode;
}) {
  const tone =
    tagTone === "cyan"
      ? { bg: "rgba(0,255,255,.12)", bd: "rgba(0,255,255,.22)", tx: "#7CF9FF" }
      : tagTone === "pink"
        ? {
            bg: "rgba(255,0,255,.12)",
            bd: "rgba(255,0,255,.22)",
            tx: "#FF7CFF",
          }
        : {
            bg: "rgba(255,255,255,.06)",
            bd: "rgba(255,255,255,.10)",
            tx: "#D1D5DB",
          };

  return (
    <div
      className="rounded-2xl p-4 sm:p-5"
      style={{
        backgroundColor: "rgba(20,22,58,.78)",
        border: `1px solid ${COLORS.border}`,
        boxShadow: "0 0 18px rgba(0,255,255,.08), 0 0 18px rgba(255,0,255,.06)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-base sm:text-lg text-cyan-200">
            {title}
          </h2>
          <div className="text-xs mt-1" style={{ color: COLORS.muted }}>
            {subtitle || " "}
          </div>
        </div>

        {!!rightTag && (
          <span
            className="px-2.5 py-1 rounded-full text-xs font-bold"
            style={{
              backgroundColor: tone.bg,
              border: `1px solid ${tone.bd}`,
              color: tone.tx,
            }}
          >
            {rightTag}
          </span>
        )}
      </div>

      <div className="mt-4">{children}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "cyan" | "pink";
}) {
  const glow =
    accent === "cyan"
      ? "0 0 18px rgba(0,255,255,.18), inset 0 0 18px rgba(0,255,255,.06)"
      : accent === "pink"
        ? "0 0 18px rgba(255,0,255,.16), inset 0 0 18px rgba(255,0,255,.06)"
        : "inset 0 0 12px rgba(255,255,255,.04)";

  const titleColor =
    accent === "cyan" ? "#7CF9FF" : accent === "pink" ? "#FF7CFF" : COLORS.text;

  return (
    <div
      className="rounded-2xl p-3"
      style={{
        backgroundColor: "rgba(15,16,48,.62)",
        border: `1px solid ${COLORS.border}`,
        boxShadow: glow,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold" style={{ color: titleColor }}>
          {label}
        </div>
        {!!hint && (
          <div className="text-xs" style={{ color: COLORS.muted }}>
            {hint}
          </div>
        )}
      </div>
      <div className="text-xl font-extrabold mt-1">{value}</div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="px-3 py-1 rounded-full text-xs font-bold"
      style={{
        backgroundColor: ok ? "rgba(0,255,255,.10)" : "rgba(255,255,255,.06)",
        border: ok
          ? "1px solid rgba(0,255,255,.22)"
          : "1px solid rgba(255,255,255,.10)",
        color: ok ? "#7CF9FF" : "#D1D5DB",
      }}
    >
      {label}
    </span>
  );
}

function WorkHealthPill({ totalOpen }: { totalOpen: number }) {
  // Ajusta umbrales a tu gusto
  const tone =
    totalOpen <= 5
      ? {
          bg: "rgba(0,255,255,.10)",
          bd: "rgba(0,255,255,.22)",
          tx: "#7CF9FF",
          t: "Bien",
        }
      : totalOpen <= 12
        ? {
            bg: "rgba(255,0,255,.10)",
            bd: "rgba(255,0,255,.22)",
            tx: "#FF7CFF",
            t: "Alerta",
          }
        : {
            bg: "rgba(255,99,132,.12)",
            bd: "rgba(255,99,132,.25)",
            tx: "#FF9FB2",
            t: "Crítico",
          };

  return (
    <span
      className="px-3 py-1 rounded-full text-xs font-bold"
      style={{
        backgroundColor: tone.bg,
        border: `1px solid ${tone.bd}`,
        color: tone.tx,
      }}
    >
      {tone.t}
    </span>
  );
}

/** Barra de distribución (3 segmentos) */
function BarSplit({ a, b, c }: { a: number; b: number; c: number }) {
  const total = a + b + c;
  const pa = total > 0 ? (a / total) * 100 : 0;
  const pb = total > 0 ? (b / total) * 100 : 0;
  const pc = total > 0 ? (c / total) * 100 : 0;

  return (
    <div
      className="rounded-full overflow-hidden h-3"
      style={{
        backgroundColor: "rgba(255,255,255,.06)",
        border: `1px solid ${COLORS.border}`,
      }}
      title={`Efectivo ${Math.round(pa)}% | QR ${Math.round(pb)}% | Datáfono ${Math.round(pc)}%`}
    >
      <div className="h-full flex">
        <div
          style={{
            width: `${pa}%`,
            background:
              "linear-gradient(90deg, rgba(0,255,255,.85), rgba(0,255,255,.35))",
          }}
        />
        <div
          style={{
            width: `${pb}%`,
            background:
              "linear-gradient(90deg, rgba(255,0,255,.80), rgba(255,0,255,.35))",
          }}
        />
        <div
          style={{
            width: `${pc}%`,
            background:
              "linear-gradient(90deg, rgba(124,249,255,.55), rgba(255,124,255,.35))",
          }}
        />
      </div>
    </div>
  );
}