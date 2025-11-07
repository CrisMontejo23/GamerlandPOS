"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

type Expense = {
  id: number;
  description?: string | null;
  amount: string | number;
  paymentMethod?: string | null;
  category?: "MERCANCIA" | "LOCAL" | "FUERA_DEL_LOCAL" | null;
  createdAt: string;
};

const paymentOptions = ["EFECTIVO", "QR_LLAVE", "DATAFONO"] as const;
type PaymentMethod = (typeof paymentOptions)[number] | "";

const categoryOptions = ["MERCANCIA", "LOCAL", "FUERA_DEL_LOCAL"] as const;
type ExpenseCategory = (typeof categoryOptions)[number] | "";

type Period = "day" | "month" | "year";

type ExpenseUpdatePayload = Partial<{
  description: string;
  paymentMethod: PaymentMethod;
  category: ExpenseCategory;
  amount: number;
}>;

const COLORS = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  cyan: "#00FFFF",
  pink: "#FF00FF",
  text: "#E5E5E5",
};

function isPaymentMethod(v: string): v is PaymentMethod {
  return v === "" || (paymentOptions as readonly string[]).includes(v);
}
function isExpenseCategory(v: string): v is ExpenseCategory {
  return (categoryOptions as readonly ExpenseCategory[]).includes(
    v as ExpenseCategory
  );
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

export default function ExpensesPage() {
  const { role } = useAuth();
  const isAdmin = role === "ADMIN";

  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("");
  const [category, setCategory] = useState<ExpenseCategory>("");
  const [amount, setAmount] = useState<number | "">("");
  const [period, setPeriod] = useState<Period>("day");
  const [baseDate, setBaseDate] = useState<string>(todayISO());
  const { from, to } = useMemo(
    () => rangeFrom(period, baseDate),
    [period, baseDate]
  );

  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // edición inline
  const [editId, setEditId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState<string>("");
  const [editPay, setEditPay] = useState<PaymentMethod>("");
  const [editCat, setEditCat] = useState<ExpenseCategory>("");
  const [editAmount, setEditAmount] = useState<number | "">("");

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to }).toString();
      const r = await apiFetch(`/expenses?${qs}`);
      const data: Expense[] = await r.json();
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [from, to]);

  const add = async () => {
    if (
      !description.trim() ||
      !paymentMethod ||
      !category ||
      amount === "" ||
      Number(amount) < 0
    )
      return;
    const payload = {
      description: description.toUpperCase(),
      paymentMethod,
      category,
      amount: Number(amount),
    };

    const r = await apiFetch(`/expenses`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (r.ok) {
      setDescription("");
      setPaymentMethod("");
      setCategory("");
      setAmount("");
      setMsg("Gasto agregado ✅");
      setTimeout(() => setMsg(""), 2000);
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg(`Error: ${e?.error || "No se pudo agregar"}`);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const onPaymentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (isPaymentMethod(v)) setPaymentMethod(v);
  };
  const onCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (isExpenseCategory(v)) setCategory(v);
  };

  const startEdit = (row: Expense) => {
    if (!isAdmin) return;
    setEditId(row.id);
    setEditDesc((row.description || "").toString().toUpperCase());
    setEditPay((row.paymentMethod as PaymentMethod) || "");
    setEditCat((row.category as ExpenseCategory) || "");
    setEditAmount(Number(row.amount || 0));
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditDesc("");
    setEditPay("");
    setEditCat("");
    setEditAmount("");
  };

  const saveEdit = async () => {
    if (editId == null) return;
    const payload: ExpenseUpdatePayload = {};
    if (editDesc.trim()) payload.description = editDesc.toUpperCase();
    if (editPay) payload.paymentMethod = editPay;
    if (editCat) payload.category = editCat;
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

  const total = useMemo(
    () => rows.reduce((a, r) => a + Number(r.amount || 0), 0),
    [rows]
  );

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
        {/* En md+: 2 filas, 12 columnas. El botón ocupa 3 columnas y 2 filas (alto completo). */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
          {/* Fila 1 */}
          <input
            className="rounded px-3 py-2 text-gray-100 outline-none md:col-span-5"
            style={{
              backgroundColor: COLORS.input,
              border: `1px solid ${COLORS.border}`,
            }}
            placeholder="Descripción"
            value={description}
            onChange={(e) => setDescription(e.target.value.toUpperCase())}
          />

          <select
            className="rounded px-3 py-2 text-gray-100 outline-none md:col-span-2"
            style={{
              backgroundColor: COLORS.input,
              border: `1px solid ${paymentMethod ? COLORS.border : "#ff4b4b"}`,
            }}
            value={paymentMethod}
            onChange={onPaymentChange}
          >
            <option value="">Seleccione método *</option>
            <option value="EFECTIVO">EFECTIVO</option>
            <option value="QR_LLAVE">QR / LLAVE</option>
            <option value="DATAFONO">DATAFONO</option>
          </select>

          <select
            className="rounded px-3 py-2 text-gray-100 outline-none md:col-span-2"
            style={{
              backgroundColor: COLORS.input,
              border: `1px solid ${category ? COLORS.border : "#ff4b4b"}`,
            }}
            value={category}
            onChange={onCategoryChange}
          >
            <option value="">Categoría *</option>
            <option value="MERCANCIA">MERCANCIA</option>
            <option value="LOCAL">LOCAL</option>
            <option value="FUERA_DEL_LOCAL">FUERA DEL LOCAL</option>
          </select>

          {/* Botón grande (2 filas) */}
          <div className="md:col-span-3 md:row-span-2 flex">
            <button
              onClick={add}
              disabled={
                !description.trim() ||
                !paymentMethod ||
                !category ||
                amount === ""
              }
              className="w-full h-full min-h-[44px] md:min-h-[96px] rounded-lg font-semibold disabled:opacity-60 text-lg md:text-xl"
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

          {/* Fila 2 */}
          <div className="flex gap-2 md:col-span-9">
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
          onChange={(e) => setPeriod(e.target.value as Period)}
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
          onChange={(e) => setBaseDate(e.target.value)}
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
                    colSpan={isAdmin ? 6 : 5}
                  >
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    className="py-3 px-3 text-gray-400"
                    colSpan={isAdmin ? 6 : 5}
                  >
                    Sin registros
                  </td>
                </tr>
              )}
              {rows.map((r) => {
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
                          <option value="">Seleccione</option>
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

                    <td className="px-3">
                      {isEditing ? (
                        <select
                          className="rounded px-2 py-1 w-full outline-none"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                          value={editCat}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (isExpenseCategory(v)) setEditCat(v);
                          }}
                        >
                          <option value="">Seleccione</option>
                          <option value="MERCANCIA">MERCANCIA</option>
                          <option value="LOCAL">LOCAL</option>
                          <option value="FUERA_DEL_LOCAL">
                            FUERA DEL LOCAL
                          </option>
                        </select>
                      ) : (
                        r.category || "-"
                      )}
                    </td>

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
                          <button
                            onClick={() => startEdit(r)}
                            className="px-3 py-1 rounded text-sm font-medium"
                            style={{
                              color: "#001014",
                              background:
                                "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                            }}
                          >
                            Editar
                          </button>
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
                                !editCat ||
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
      </section>
    </div>
  );
}
