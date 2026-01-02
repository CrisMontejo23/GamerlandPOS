"use client";
import { useEffect, useMemo, useState } from "react";
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
type Expense = {
  id: number;
  user?: { id: number; username: string } | null;
  description?: string | null;
  amount: string | number;
  paymentMethod?: "EFECTIVO" | "QR_LLAVE" | "DATAFONO" | null;
  category?: "INTERNO" | "EXTERNO" | null; // <- nuevo esquema en front
  createdAt: string;
};

const paymentOptions = ["EFECTIVO", "QR_LLAVE", "DATAFONO"] as const;
type PaymentMethod = (typeof paymentOptions)[number] | "";

type ExpenseCategory = "INTERNO" | "EXTERNO" | null;

// Opción del selector de “tipo de gasto”
type ExpensePreset =
  | "COMPRA DE MERCANCIA - PRODUCTOS"
  | "TRANSACCION - CUADRE DE CAJA"
  | "VIAJE A BOGOTÁ"
  | "PAGO TRABAJADORES"
  | "ARREGLOS"
  | "OTRO";

type Period = "day" | "month" | "year";

type ExpenseUpdatePayload = Partial<{
  description: string;
  paymentMethod: PaymentMethod;
  amount: number;
}>;

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
  btn: "p-2 sm:p-1", // ✅ más área táctil en móvil
  box: "h-9 w-9 sm:h-5 sm:w-5", // ✅ móvil grande, desktop normal
  sizes: "(max-width: 640px) 36px, 20px",
};

/* ===== Helpers ===== */
function isPaymentMethod(v: string): v is PaymentMethod {
  return v === "" || (paymentOptions as readonly string[]).includes(v);
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

// Derivar categoría/descripcion según preset
function categoryForPreset(p: ExpensePreset): ExpenseCategory {
  return p === "OTRO" ? "EXTERNO" : "INTERNO";
}
function descriptionForPreset(p: ExpensePreset, manual: string): string {
  return p === "OTRO" ? manual.toUpperCase().trim() : p;
}

/* ===== Componente ===== */
export default function ExpensesPage() {
  const { role } = useAuth();
  const isAdmin = role === "ADMIN";

  // Form
  const [preset, setPreset] = useState<ExpensePreset>("OTRO");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("");
  const [amount, setAmount] = useState<number | "">("");

  // Filtros de rango
  const [period, setPeriod] = useState<Period>("day");
  const [baseDate, setBaseDate] = useState<string>(todayISO());
  const { from, to } = useMemo(
    () => rangeFrom(period, baseDate),
    [period, baseDate]
  );

  // Datos
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // Edición inline
  const [editId, setEditId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState<string>("");
  const [editPay, setEditPay] = useState<PaymentMethod>("");
  const [editAmount, setEditAmount] = useState<number | "">("");

  // ===== Paginación (client-side) =====
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, safePage]);

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

  // Carga
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
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [from, to]);

  // Total del rango (excluye internos)
  const total = useMemo(
    () =>
      rows
        .filter((r) => (r.category || "EXTERNO") !== "INTERNO")
        .reduce((a, r) => a + Number(r.amount || 0), 0),
    [rows]
  );

  // Alta
  const add = async () => {
    const desc = descriptionForPreset(preset, description);
    const cat = categoryForPreset(preset);
    if (!paymentMethod || amount === "" || (preset === "OTRO" && !desc.trim()))
      return;

    const payload = {
      description: desc,
      paymentMethod,
      category: cat, // INTERNO / EXTERNO
      amount: Number(amount),
    };

    const r = await apiFetch(`/expenses`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      setPreset("OTRO");
      setDescription("");
      setPaymentMethod("");
      setAmount("");
      setMsg("Gasto agregado ✅");
      setTimeout(() => setMsg(""), 2000);
      setPage(1);
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg(`Error: ${e?.error || "No se pudo agregar"}`);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  // Editar
  const startEdit = (row: Expense) => {
    if (!isAdmin) return;
    setEditId(row.id);
    setEditDesc((row.description || "").toString().toUpperCase());
    setEditPay((row.paymentMethod as PaymentMethod) || "");
    setEditAmount(Number(row.amount || 0));
  };
  const cancelEdit = () => {
    setEditId(null);
    setEditDesc("");
    setEditPay("");
    setEditAmount("");
  };
  const saveEdit = async () => {
    if (editId == null) return;
    const payload: ExpenseUpdatePayload = {};
    if (editDesc.trim()) payload.description = editDesc.toUpperCase();
    if (editPay) payload.paymentMethod = editPay;
    if (editAmount !== "") payload.amount = Number(editAmount);
    const r = await apiFetch(`/expenses/${editId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      setMsg("Gasto actualizado ✅");
      setTimeout(() => setMsg(""), 2000);
      cancelEdit();
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg(`Error: ${e?.error || "No se pudo actualizar"}`);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  // Borrar
  const [toast, setToast] = useState<{
    open: boolean;
    kind: ToastKind;
    title: string;
    subtitle?: string;
  }>({
    open: false,
    kind: "success",
    title: "",
  });
  const hideToast = () => setToast((t) => ({ ...t, open: false }));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | (() => void)>(null);

  const deleteExpense = async (id: number) => {
    if (!isAdmin) return;
    setConfirmOpen(true);
    setConfirmAction(() => async () => {
      setConfirmOpen(false);
      const r = await apiFetch(`/expenses/${id}`, { method: "DELETE" });
      if (r.ok) {
        setMsg("Gasto eliminado ✅");
        setToast({
          open: true,
          kind: "success",
          title: "¡Eliminado!",
          subtitle: "El gasto fue eliminado correctamente.",
        });
        setTimeout(hideToast, 2000);
        setTimeout(() => setMsg(""), 2000);
        load();
      } else {
        const e = await r.json().catch(() => ({} as { error?: string }));
        setMsg(`Error: ${e?.error || "No se pudo eliminar"}`);
        setToast({
          open: true,
          kind: "error",
          title: "Error al eliminar",
          subtitle: String(e?.error || "Inténtalo de nuevo"),
        });
        setTimeout(hideToast, 2000);
        setTimeout(() => setMsg(""), 3000);
      }
    });
  };

  // Handlers de filtros
  const onChangePeriod = (val: Period) => {
    setPeriod(val);
    setPage(1);
  };
  const onChangeBaseDate = (val: string) => {
    setBaseDate(val);
    setPage(1);
  };
  const onClickFiltrar = () => {
    setPage(1);
    load();
  };

  // Lista de presets (oculta “Transacción” si no es admin)
  const presetOptions: ExpensePreset[] = [
    "COMPRA DE MERCANCIA - PRODUCTOS",
    ...(isAdmin ? (["TRANSACCION - CUADRE DE CAJA"] as const) : []),
    "VIAJE A BOGOTÁ",
    "PAGO TRABAJADORES",
    "ARREGLOS",
    "OTRO",
  ];

  return (
    <div className="max-w-5xl mx-auto text-gray-200 space-y-6">
      <h1 className="text-2xl font-bold text-cyan-400">Gastos</h1>

      {/* Formulario */}
      <section
        className="rounded-xl p-4 space-y-3"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
          {/* Tipo de gasto (preset) */}
          <select
            className="rounded px-3 py-2 text-gray-100 outline-none md:col-span-4"
            style={{
              backgroundColor: COLORS.input,
              border: `1px solid ${COLORS.border}`,
            }}
            value={preset}
            onChange={(e) => setPreset(e.target.value as ExpensePreset)}
          >
            {presetOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Descripción manual SOLO si es OTRO */}
          <input
            className="rounded px-3 py-2 text-gray-100 outline-none md:col-span-4 disabled:opacity-60"
            style={{
              backgroundColor: COLORS.input,
              border: `1px solid ${
                preset === "OTRO" ? COLORS.border : "#334155"
              }`,
            }}
            placeholder="Descripción (solo en OTRO)"
            value={description}
            onChange={(e) => setDescription(e.target.value.toUpperCase())}
            disabled={preset !== "OTRO"}
          />

          {/* Método */}
          <select
            className="rounded px-3 py-2 text-gray-100 outline-none md:col-span-2"
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
            <option value="">MÉTODO</option>
            <option value="EFECTIVO">EFECTIVO</option>
            <option value="QR_LLAVE">QR / LLAVE</option>
            <option value="DATAFONO">DATAFONO</option>
          </select>

          {/* Valor */}
          <div className="md:col-span-2">
            <input
              className="rounded px-3 py-2 text-gray-100 outline-none w-full"
              style={{
                backgroundColor: COLORS.input,
                border: `1px solid ${COLORS.border}`,
              }}
              type="number"
              min={0}
              placeholder="Valor"
              value={amount}
              onChange={(e) =>
                setAmount(
                  e.target.value === ""
                    ? ""
                    : Math.max(0, Number(e.target.value))
                )
              }
            />
          </div>

          {/* Botón agregar */}
          <div className="md:col-span-12 flex">
            <button
              onClick={add}
              disabled={
                !paymentMethod ||
                amount === "" ||
                (preset === "OTRO" && !description.trim())
              }
              className="w-full h-full min-h-[44px] rounded-lg font-semibold disabled:opacity-60 text-lg"
              style={{
                color: "#001014",
                background:
                  "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                boxShadow:
                  "0 0 14px rgba(0,255,255,.25), 0 0 22px rgba(255,0,255,.25)",
              }}
            >
              Agregar
            </button>
          </div>
        </div>

        {!!msg && <div className="text-sm text-cyan-300">{msg}</div>}
      </section>

      {/* Filtros */}
      <section
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
          onClick={onClickFiltrar}
          className="px-4 py-2 rounded font-medium"
          style={{
            color: "#001014",
            background:
              "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
            boxShadow:
              "0 0 14px rgba(0,255,255,.25), 0 0 22px rgba(255,0,255,.2)",
          }}
        >
          Filtrar
        </button>

        <div className="ml-auto text-right font-semibold text-cyan-300">
          Total: ${total.toLocaleString("es-CO")}
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
                <th className="py-2 px-3 text-gray-300">Fecha</th>
                <th className="px-3 text-gray-300">Vendedor</th>
                <th className="px-3 text-gray-300">Descripción</th>
                <th className="px-3 text-gray-300">Método</th>
                <th className="px-3 text-gray-300">Categoría</th>
                <th className="px-3 text-right text-gray-300">Monto</th>
                {isAdmin && <th className="px-3 text-gray-300">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    className="py-3 px-3 text-gray-400"
                    colSpan={isAdmin ? 7 : 6}
                  >
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && pageSlice.length === 0 && (
                <tr>
                  <td
                    className="py-3 px-3 text-gray-400"
                    colSpan={isAdmin ? 7 : 6}
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
                    <td className="py-2 px-3">
                      {new Date(r.createdAt).toLocaleString("es-CO")}
                    </td>

                    <td className="px-3 font-semibold text-cyan-200">
                      {r.user?.username || "-"}
                    </td>

                    <td className="px-3">
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
                    </td>

                    <td className="px-3">
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
                      ) : r.paymentMethod === "QR_LLAVE" ? (
                        "QR / LLAVE"
                      ) : (
                        r.paymentMethod || "-"
                      )}
                    </td>

                    <td className="px-3">{r.category || "-"}</td>

                    <td className="px-3 text-right text-pink-300">
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
                                : Math.max(0, Number(e.target.value))
                            )
                          }
                        />
                      ) : (
                        `$${Number(r.amount).toLocaleString("es-CO")}`
                      )}
                    </td>

                    {isAdmin && (
                      <td className="px-3">
                        {!isEditing ? (
                          <div className="flex gap-2">
                            {/* Editar (icono) */}
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

                            {/* Eliminar (icono) */}
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
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={saveEdit}
                              className="px-3 py-1 rounded text-sm font-semibold"
                              style={{
                                backgroundColor: "#0bd977",
                                color: "#001014",
                              }}
                              disabled={
                                !editDesc.trim() ||
                                !editPay ||
                                editAmount === ""
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
                          </div>
                        )}
                      </td>
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
        title="¿Eliminar gasto?"
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
