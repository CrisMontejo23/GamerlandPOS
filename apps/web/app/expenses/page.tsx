"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
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
        : "linear-gradient(90deg, rgba(99,102,241,.9), rgba(168,85,247,.8))";

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
          <p className="mt-2 text-gray-200 whitespace-pre-line">{message}</p>

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
type Expense = {
  id: number;
  user?: { id: number; username: string } | null;
  description?: string | null;
  amount: string | number;
  paymentMethod?: "EFECTIVO" | "QR_LLAVE" | "DATAFONO" | null;
  createdAt: string;
};

const paymentOptions = ["EFECTIVO", "QR_LLAVE", "DATAFONO"] as const;
type PaymentMethod = (typeof paymentOptions)[number] | "";

/* ===== UI Constantes ===== */
const COLORS = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  cyan: "#00FFFF",
  pink: "#FF00FF",
  text: "#E5E5E5",
};

const ACTION_ICON = {
  btn: "p-2 sm:p-1",
  box: "h-9 w-9 sm:h-5 sm:w-5",
  sizes: "(max-width: 640px) 36px, 20px",
};

/* ===== Helpers ===== */
function isPaymentMethod(v: string): v is PaymentMethod {
  return v === "" || (paymentOptions as readonly string[]).includes(v);
}
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
type Period = "day" | "month" | "year";
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
function normMethodLabel(m?: string | null) {
  if (!m) return "-";
  return m === "QR_LLAVE" ? "QR / LLAVE" : m;
}

/* ===== Componente ===== */
export default function ExpensesPage() {
  const { role } = useAuth();
  const isAdmin = role === "ADMIN";

  // ===== Form =====
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("");
  const [amount, setAmount] = useState<number | "">("");

  // ===== Filtros rango =====
  const [period, setPeriod] = useState<Period>("day");
  const [baseDate, setBaseDate] = useState<string>(todayISO());
  const { from, to } = useMemo(
    () => rangeFrom(period, baseDate),
    [period, baseDate],
  );

  // ===== Datos =====
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);

  // ===== UI filtros (tipo inventario/ventas) =====
  const [q, setQ] = useState("");
  const [methodFilter, setMethodFilter] = useState<PaymentMethod>("");

  const filtersActive = !!q.trim() || !!methodFilter;

  // ===== Paginación =====
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // ===== scroll-to-top =====
  const tableTopRef = useRef<HTMLDivElement | null>(null);
  const [showToTop, setShowToTop] = useState(false);

  // ===== Toast / Confirm (usa tus componentes) =====
  const [toast, setToast] = useState<{
    open: boolean;
    kind: "success" | "error" | "info";
    title: string;
    subtitle?: string;
  }>({ open: false, kind: "success", title: "" });

  const hideToast = () => setToast((t) => ({ ...t, open: false }));

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | (() => void)>(null);

  const [confirmTitle, setConfirmTitle] = useState("¿Confirmar acción?");
  const [confirmMessage, setConfirmMessage] = useState("");

  // opcional: para bloquear doble click mientras hace PATCH
  const [confirmBusy, setConfirmBusy] = useState(false);

  // ===== Edición inline =====
  const [editId, setEditId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState<string>("");
  const [editPay, setEditPay] = useState<PaymentMethod>("");
  const [editAmount, setEditAmount] = useState<number | "">("");

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        from,
        to,
        _ts: String(Date.now()),
      }).toString();
      const r = await apiFetch(`/expenses?${qs}`);
      const data: Expense[] = await r.json();
      data.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
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

  // ===== Filtros + búsqueda =====
  const filteredRows = useMemo(() => {
    const qq = q.trim().toUpperCase();
    return rows.filter((r) => {
      if (methodFilter && (r.paymentMethod || "") !== methodFilter)
        return false;
      if (!qq) return true;

      const hay =
        String(r.description || "")
          .toUpperCase()
          .includes(qq) ||
        String(r.user?.username || "")
          .toUpperCase()
          .includes(qq) ||
        String(r.id).includes(qq) ||
        String(r.amount || "").includes(qq) ||
        normMethodLabel(r.paymentMethod).toUpperCase().includes(qq);

      return hay;
    });
  }, [rows, q, methodFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const pageRange = useMemo<(number | "…")[]>(() => {
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

  // ===== Resumen =====
  const totals = useMemo(() => {
    const sum = filteredRows.reduce((a, r) => a + Number(r.amount || 0), 0);
    const count = filteredRows.length;
    return { sum, count };
  }, [filteredRows]);

  const payBreakdown = useMemo(() => {
    const acc = new Map<string, number>();
    for (const r of filteredRows) {
      const m = r.paymentMethod || "SIN_METODO";
      acc.set(m, (acc.get(m) || 0) + Number(r.amount || 0));
    }
    return Array.from(acc.entries()).map(([method, amount]) => ({
      method,
      amount,
    }));
  }, [filteredRows]);

  // ===== Alta =====
  const add = async () => {
    const desc = description.toUpperCase().trim();
    if (!desc || !paymentMethod || amount === "") return;

    const payload = {
      description: desc,
      paymentMethod,
      amount: Number(amount),
      category: "INTERNO"
    };

    const r = await apiFetch(`/expenses`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      setToast({
        open: true,
        kind: "error",
        title: "No se pudo agregar",
        subtitle: String(e?.error || "Verifica el POST /expenses"),
      });
      setTimeout(hideToast, 2200);
      return;
    }

    setDescription("");
    setPaymentMethod("");
    setAmount("");
    setPage(1);
    setToast({
      open: true,
      kind: "success",
      title: "¡Gasto agregado!",
      subtitle: "El registro se guardó correctamente.",
    });
    setTimeout(hideToast, 1800);
    load();
  };

  // ===== Edit =====
  const startEdit = (row: Expense) => {
    if (!isAdmin) return;
    setEditId(row.id);
    setEditDesc(String(row.description || "").toUpperCase());
    setEditPay((row.paymentMethod as PaymentMethod) || "");
    setEditAmount(Number(row.amount || 0));
  };
  const cancelEdit = () => {
    setEditId(null);
    setEditDesc("");
    setEditPay("");
    setEditAmount("");
  };
  const saveEditNow = async () => {
    if (editId == null) return;
    if (!editDesc.trim() || !editPay || editAmount === "") return;

    const payload = {
      description: editDesc.toUpperCase().trim(),
      paymentMethod: editPay,
      amount: Number(editAmount),
    };

    setConfirmBusy(true);
    try {
      const r = await apiFetch(`/expenses/${editId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setToast({
          open: true,
          kind: "error",
          title: "No se pudo actualizar",
          subtitle: String(e?.error || "Verifica el PATCH /expenses/:id"),
        });
        setTimeout(hideToast, 2200);
        return;
      }

      cancelEdit();
      setToast({
        open: true,
        kind: "success",
        title: "¡Actualizado!",
        subtitle: "El gasto se actualizó correctamente.",
      });
      setTimeout(hideToast, 1600);
      load();
    } finally {
      setConfirmBusy(false);
    }
  };

  const confirmSaveEdit = () => {
    if (editId == null) return;
    if (!editDesc.trim() || !editPay || editAmount === "") return;

    setConfirmTitle("¿Guardar cambios?");
    setConfirmMessage(
      `Se actualizará el gasto #${editId}.\n\n` +
        `Descripción: ${editDesc.toUpperCase().trim()}\n` +
        `Método: ${normMethodLabel(editPay)}\n` +
        `Monto: ${fmtCOP(Number(editAmount))}`,
    );

    setConfirmOpen(true);
    setConfirmAction(() => async () => {
      setConfirmOpen(false);
      await saveEditNow();
    });
  };

  // ===== Delete =====
  const deleteExpense = async (id: number) => {
    if (!isAdmin) return;

    setConfirmOpen(true);
    setConfirmAction(() => async () => {
      // cerramos el modal
      setConfirmOpen(false);

      const r = await apiFetch(`/expenses/${id}`, { method: "DELETE" });

      if (!r.ok) {
        const e = await r.json().catch(() => ({}) as { error?: string });
        setToast({
          open: true,
          kind: "error",
          title: "Error al eliminar",
          subtitle: String(
            e?.error || "No se pudo eliminar. Verifica el DELETE /expenses/:id",
          ),
        });
        setTimeout(hideToast, 2200);
        return;
      }

      setToast({
        open: true,
        kind: "success",
        title: "¡Gasto eliminado!",
        subtitle: "El registro fue eliminado correctamente.",
      });
      setTimeout(hideToast, 1800);

      // refresca
      load();
    });
  };

  // ===== Handlers filtros =====
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
      <h1 className="text-2xl font-bold text-cyan-400">Gastos</h1>

      {/* ===== Form (pro, organizado) ===== */}
      <section
        className="rounded-2xl p-4 space-y-3"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          boxShadow:
            "0 0 18px rgba(0,255,255,.10), 0 0 26px rgba(255,0,255,.10)",
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          {/* Descripción */}
          <div className="lg:col-span-6">
            <label className="block text-xs text-gray-300 mb-1">
              Descripción
            </label>
            <input
              className="w-full rounded-lg px-3 py-2 outline-none text-sm text-gray-100 placeholder-gray-400"
              style={{
                backgroundColor: COLORS.input,
                border: `1px solid ${description.trim() ? COLORS.border : "#ff4b4b"}`,
                boxShadow: description.trim()
                  ? "0 0 14px rgba(0,255,255,.14)"
                  : undefined,
              }}
              placeholder="Ej: COMPRA INSUMOS, TRANSPORTE, PAGO SERVICIO…"
              value={description}
              onChange={(e) => setDescription(e.target.value.toUpperCase())}
            />
          </div>

          {/* Método */}
          <div className="lg:col-span-3">
            <label className="block text-xs text-gray-300 mb-1">Método</label>
            <select
              className="w-full rounded-lg px-3 py-2 outline-none text-sm"
              style={{
                backgroundColor: COLORS.input,
                border: `1px solid ${paymentMethod ? COLORS.border : "#ff4b4b"}`,
              }}
              value={paymentMethod}
              onChange={(e) => {
                const v = e.target.value;
                if (isPaymentMethod(v)) setPaymentMethod(v);
              }}
            >
              <option value="">Selecciona…</option>
              <option value="EFECTIVO">EFECTIVO</option>
              <option value="QR_LLAVE">QR / LLAVE</option>
              <option value="DATAFONO">DATAFONO</option>
            </select>
          </div>

          {/* Monto */}
          <div className="lg:col-span-2">
            <label className="block text-xs text-gray-300 mb-1">Monto</label>
            <input
              className="w-full rounded-lg px-3 py-2 outline-none text-sm"
              style={{
                backgroundColor: COLORS.input,
                border: `1px solid ${COLORS.border}`,
              }}
              type="number"
              min={1}
              placeholder="0"
              value={amount}
              onChange={(e) =>
                setAmount(
                  e.target.value === ""
                    ? ""
                    : Math.max(1, Number(e.target.value)),
                )
              }
            />
          </div>

          {/* Agregar */}
          <div className="lg:col-span-1">
            <button
              onClick={add}
              disabled={!description.trim() || !paymentMethod || amount === ""}
              className="w-full min-h-[44px] rounded-lg font-semibold text-sm disabled:opacity-60"
              style={{
                color: "#001014",
                background:
                  "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                boxShadow:
                  "0 0 14px rgba(0,255,255,.25), 0 0 22px rgba(255,0,255,.2)",
              }}
              title="Guardar gasto"
            >
              Agregar
            </button>
          </div>
        </div>

        {/* Resumen mini */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryCard
            title="Total (filtrado)"
            value={totals.sum}
            accent="pink"
          />
          <SummaryCard
            title="Registros"
            value={totals.count}
            accent="cyan"
            isCount
          />
          <SummaryCard
            title="Rango"
            value={0}
            accent="cyan"
            customText={`${from} → ${to}`}
          />
        </div>
      </section>

      {/* ===== Filtros (estilo Ventas) ===== */}
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
              placeholder="Buscar por descripción, vendedor, método, monto o #id…"
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

          {/* Filtro método */}
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg px-3 py-2 outline-none text-sm"
              style={{
                backgroundColor: COLORS.input,
                border: `1px solid ${COLORS.border}`,
              }}
              value={methodFilter}
              onChange={(e) => {
                const v = e.target.value;
                if (isPaymentMethod(v)) setMethodFilter(v);
                setPage(1);
              }}
              title="Filtrar por método"
            >
              <option value="">Todos los métodos</option>
              <option value="EFECTIVO">EFECTIVO</option>
              <option value="QR_LLAVE">QR / LLAVE</option>
              <option value="DATAFONO">DATAFONO</option>
            </select>
          </div>
        </div>

        {/* Chips filtros */}
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
                  <b className="text-cyan-300">Búsqueda:</b>
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

              {methodFilter && (
                <span
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs"
                  style={{
                    backgroundColor: "rgba(255,0,255,.10)",
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <b className="text-pink-300">Método:</b>{" "}
                  {normMethodLabel(methodFilter)}
                  <button
                    className="text-gray-400 hover:text-gray-100"
                    onClick={() => setMethodFilter("")}
                    title="Quitar método"
                  >
                    ✕
                  </button>
                </span>
              )}

              <button
                onClick={() => {
                  setQ("");
                  setMethodFilter("");
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
              Tip: usa búsqueda o filtra por método.
            </span>
          )}
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
                <b className="text-cyan-300">{normMethodLabel(p.method)}:</b>{" "}
                {fmtCOP(p.amount)}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ===== Tabla ===== */}
      <section
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          className="overflow-x-auto max-h-[70vh]"
          onScroll={(e) => setShowToTop(e.currentTarget.scrollTop > 240)}
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
                <Th>Descripción</Th>
                <Th>Método</Th>
                <Th className="text-right">Monto</Th>
                {isAdmin && <Th>Acciones</Th>}
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td
                    className="py-3 px-3 text-gray-400"
                    colSpan={isAdmin ? 6 : 5}
                  >
                    Cargando…
                  </td>
                </tr>
              )}

              {!loading && pageSlice.length === 0 && (
                <tr>
                  <td
                    className="py-3 px-3 text-gray-400"
                    colSpan={isAdmin ? 6 : 5}
                  >
                    Sin registros
                  </td>
                </tr>
              )}

              {pageSlice.map((r) => {
                const isEditing = editId === r.id;

                return (
                  <tr
                    key={r.id}
                    className="hover:bg-[#191B4B]"
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <Td>{new Date(r.createdAt).toLocaleString("es-CO")}</Td>

                    <Td className="font-semibold text-cyan-200">
                      {r.user?.username || "-"}
                    </Td>

                    <Td>
                      {isEditing ? (
                        <input
                          className="rounded px-2 py-1 w-full outline-none"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                          value={editDesc}
                          onChange={(e) =>
                            setEditDesc(e.target.value.toUpperCase())
                          }
                        />
                      ) : (
                        r.description || "-"
                      )}
                    </Td>

                    <Td>
                      {isEditing ? (
                        <select
                          className="rounded px-2 py-1 w-full outline-none"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                          value={editPay}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (isPaymentMethod(v)) setEditPay(v);
                          }}
                        >
                          <option value="">MÉTODO</option>
                          <option value="EFECTIVO">EFECTIVO</option>
                          <option value="QR_LLAVE">QR / LLAVE</option>
                          <option value="DATAFONO">DATAFONO</option>
                        </select>
                      ) : (
                        <span
                          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs"
                          style={{
                            backgroundColor: (r.paymentMethod || "").includes(
                              "EFECT",
                            )
                              ? "rgba(0,255,255,.10)"
                              : (r.paymentMethod || "").includes("DATA")
                                ? "rgba(255,0,255,.10)"
                                : (r.paymentMethod || "").includes("QR")
                                  ? "rgba(99,102,241,.12)"
                                  : "rgba(255,255,255,.06)",
                            border: `1px solid ${COLORS.border}`,
                          }}
                          title={r.paymentMethod || ""}
                        >
                          {normMethodLabel(r.paymentMethod)}
                        </span>
                      )}
                    </Td>

                    <Td className="text-right text-pink-300">
                      {isEditing ? (
                        <input
                          className="rounded px-2 py-1 w-32 text-right outline-none"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                          type="number"
                          min={0}
                          value={editAmount}
                          onChange={(e) =>
                            setEditAmount(
                              e.target.value === ""
                                ? ""
                                : Math.max(0, Number(e.target.value)),
                            )
                          }
                        />
                      ) : (
                        fmtCOP(Number(r.amount || 0))
                      )}
                    </Td>

                    {isAdmin && (
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          {!isEditing ? (
                            <>
                              <button
                                onClick={() => startEdit(r)}
                                className={`inline-flex items-center justify-center rounded-md ${ACTION_ICON.btn} hover:bg-white/5 transition transform hover:scale-110`}
                                title="Editar gasto"
                                aria-label="Editar gasto"
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

                              <button
                                onClick={() => deleteExpense(r.id)}
                                className={`inline-flex items-center justify-center rounded-md ${ACTION_ICON.btn} hover:bg-white/5 transition transform hover:scale-110`}
                                title="Eliminar gasto"
                                aria-label="Eliminar gasto"
                              >
                                <span className={`relative ${ACTION_ICON.box}`}>
                                  <Image
                                    src="/borrar.png"
                                    alt="Eliminar"
                                    fill
                                    sizes={ACTION_ICON.sizes}
                                    className="opacity-90 object-contain"
                                  />
                                </span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={confirmSaveEdit}
                                className="px-3 py-1 rounded text-sm font-semibold"
                                style={{
                                  backgroundColor: "#0bd977",
                                  color: "#001014",
                                }}
                                disabled={
                                  !editDesc.trim() ||
                                  !editPay ||
                                  editAmount === "" ||
                                  confirmBusy
                                }
                              >
                                Guardar
                              </button>
                              <button
                                onClick={cancelEdit}
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
            <b>
              {filteredRows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}
            </b>{" "}
            – <b>{Math.min(safePage * PAGE_SIZE, filteredRows.length)}</b> de{" "}
            <b>{filteredRows.length}</b>
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

      {/* Confirm / Toast */}
      <GamerConfirm
        open={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        confirmText={confirmBusy ? "Guardando..." : "Confirmar"}
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
  isCount,
  customText,
}: {
  title: string;
  value: number;
  accent?: "cyan" | "pink";
  isCount?: boolean;
  customText?: string;
}) {
  const glow =
    accent === "cyan"
      ? "0 0 18px rgba(0,255,255,.25), inset 0 0 18px rgba(0,255,255,.08)"
      : accent === "pink"
        ? "0 0 18px rgba(255,0,255,.25), inset 0 0 18px rgba(255,0,255,.08)"
        : "inset 0 0 12px rgba(255,255,255,.04)";

  const titleColor =
    accent === "cyan" ? "#7CF9FF" : accent === "pink" ? "#FF7CFF" : COLORS.text;

  return (
    <div
      className="rounded-xl p-3"
      style={{
        backgroundColor: COLORS.bgCard,
        border: `1px solid ${COLORS.border}`,
        boxShadow: glow,
      }}
      role="status"
      aria-label={title}
    >
      <div className="text-sm" style={{ color: titleColor }}>
        {title}
      </div>
      <div className="text-xl font-semibold">
        {customText
          ? customText
          : isCount
            ? value.toLocaleString("es-CO")
            : fmtCOP(value)}
      </div>
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
