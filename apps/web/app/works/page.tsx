"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { apiFetch } from "../lib/api";

type Role = "ADMIN" | "EMPLOYEE";
type WorkStatus = "RECEIVED" | "IN_PROGRESS" | "FINISHED" | "DELIVERED";
type WorkLocation = "LOCAL" | "BOGOTA";

type WorkOrder = {
  id: number;
  code: string;
  item: string;
  description: string;
  customerName: string;
  customerPhone: string;
  status: WorkStatus;
  location: WorkLocation;
  quote?: number | null;
  deposit?: number | null;
  total?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

const COLORS = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
};

// Etiquetas “bonitas”
const niceStatus: Record<WorkStatus, string> = {
  RECEIVED: "RECIBIDO",
  IN_PROGRESS: "EN PROCESO",
  FINISHED: "FINALIZADO",
  DELIVERED: "ENTREGADO",
};

// Estilos por estado
const STATUS_STYLES: Record<
  "RECEIVED" | "IN_PROGRESS" | "FINISHED" | "DELIVERED",
  { badge: string; card: string }
> = {
  RECEIVED: { badge: "bg-amber-100 text-amber-800", card: "border-amber-300" },
  IN_PROGRESS: { badge: "bg-blue-100 text-blue-800", card: "border-blue-300" },
  FINISHED: {
    badge: "bg-emerald-100 text-emerald-800",
    card: "border-emerald-300",
  },
  DELIVERED: {
    badge: "bg-gray-200 text-gray-700",
    card: "border-gray-300 opacity-85",
  },
};

// === Utils ===
const UU = (v: unknown) => (v == null ? "" : String(v).toUpperCase());
const UDATA = (v: unknown) => (v == null ? "" : String(v).toUpperCase().trim());

/** Convierte unknown → number|null de forma segura */
function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fmt(d: string | Date) {
  const date = new Date(d);
  return date.toLocaleString();
}

type AnyRow = Partial<WorkOrder> & {
  id: number;
  code: string;
  quotation?: unknown; // alias de quote
  advance?: unknown; // alias de deposit (PRIORIDAD)
  abono?: unknown; // alias de deposit
};

function normalizeRows(rows: AnyRow[]): WorkOrder[] {
  return rows.map((r) => {
    // 👇 Damos prioridad a 'advance' porque suele ser como lo guarda el backend
    const quoteRaw = r.quote ?? r.quotation;
    const depositRaw = r.advance ?? r.deposit ?? r.abono;

    return {
      id: r.id,
      code: r.code,
      item: r.item ?? "",
      description: r.description ?? "",
      customerName: r.customerName ?? "",
      customerPhone: r.customerPhone ?? "",
      status: (r.status ?? "RECEIVED") as WorkStatus,
      location: (r.location ?? "LOCAL") as WorkLocation,
      quote: toNum(quoteRaw),
      deposit: toNum(depositRaw),
      total: toNum(r.total),
      notes: r.notes ?? null,
      createdAt: r.createdAt ?? new Date().toISOString(),
      updatedAt: r.updatedAt ?? new Date().toISOString(),
    };
  });
}

/** Patch que admite alias para máxima compatibilidad con tu API */
type Patch = {
  item?: string;
  description?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string | null;
  status?: WorkStatus;
  location?: WorkLocation;
  quote?: number | null;
  deposit?: number | null;
  total?: number | null;

  // ALIAS opcionales:
  advance?: number | null; // = deposit
  abono?: number | null; // = deposit
  quotation?: number | null; // = quote
};

export default function WorksPage() {
  const { role, ready } = useAuth();
  const canDelete = role === "ADMIN";

  // Filtros
  const [status, setStatus] = useState<WorkStatus | "">("");
  const [location, setLocation] = useState<WorkLocation | "">("");
  const [q, setQ] = useState("");

  // Lista
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Form crear
  const [openForm, setOpenForm] = useState(false);
  const [item, setItem] = useState("");
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [newLocation, setNewLocation] = useState<WorkLocation>("LOCAL");

  // Cotización (crear)
  const [hasQuote, setHasQuote] = useState<"YES" | "NO">("NO");
  const [quoteValue, setQuoteValue] = useState<string>("");
  const [hasDeposit, setHasDeposit] = useState<"YES" | "NO">("NO");
  const [depositValue, setDepositValue] = useState<string>("");

  // Modal FINALIZAR
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [finishAmount, setFinishAmount] = useState<string>("");
  const [finishTarget, setFinishTarget] = useState<WorkOrder | null>(null);

  // Modal EDITAR/AGREGAR COT/ABONO
  const [editQDOpen, setEditQDOpen] = useState(false);
  const [editQDTarget, setEditQDTarget] = useState<WorkOrder | null>(null);
  const [editHasQuote, setEditHasQuote] = useState<"YES" | "NO">("NO");
  const [editQuoteValue, setEditQuoteValue] = useState<string>("");
  const [editHasDeposit, setEditHasDeposit] = useState<"YES" | "NO">("NO");
  const [editDepositValue, setEditDepositValue] = useState<string>("");

  function resetForm() {
    setItem("");
    setDescription("");
    setCustomerName("");
    setCustomerPhone("");
    setNewLocation("LOCAL");
    setHasQuote("NO");
    setQuoteValue("");
    setHasDeposit("NO");
    setDepositValue("");
  }

  function resetEditQD() {
    setEditQDTarget(null);
    setEditHasQuote("NO");
    setEditQuoteValue("");
    setEditHasDeposit("NO");
    setEditDepositValue("");
  }

  const load = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (location) p.set("location", location);
      if (q.trim()) p.set("q", UDATA(q));

      const r = await apiFetch(`/works?${p.toString()}`);
      const data = (await r.json()) as AnyRow[];
      setRows(normalizeRows(data));
    } catch {
      setMsg("NO SE PUDIERON CARGAR LOS TRABAJOS");
      setTimeout(() => setMsg(""), 2200);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, status, location]);

  const normalizePatch = (patch: Patch): Patch => {
    const out: Patch = { ...patch };
    if (out.item != null) out.item = UDATA(out.item);
    if (out.description != null) out.description = UDATA(out.description);
    if (out.customerName != null) out.customerName = UDATA(out.customerName);
    if (out.customerPhone != null) out.customerPhone = UDATA(out.customerPhone);
    if (out.notes != null && typeof out.notes === "string")
      out.notes = UDATA(out.notes);
    return out;
  };

  const update = async (id: number, patch: Patch) => {
    const body = normalizePatch(patch);
    const r = await apiFetch(`/works/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (r.ok) {
      await load();
      return true;
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg(
        "ERROR: " +
          UDATA((e as { error?: string })?.error || "NO SE PUDO ACTUALIZAR")
      );
      setTimeout(() => setMsg(""), 2500);
      return false;
    }
  };

  const onDelete = async (id: number) => {
    if (!canDelete) return;
    if (!confirm("¿ELIMINAR ESTE TRABAJO? ESTA ACCIÓN ES PERMANENTE.")) return;
    const r = await apiFetch(`/works/${id}`, { method: "DELETE" });
    if (r.ok) {
      setMsg("TRABAJO ELIMINADO ✅");
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg(
        "ERROR: " +
          UDATA((e as { error?: string })?.error || "NO SE PUDO ELIMINAR")
      );
      setTimeout(() => setMsg(""), 2500);
    }
  };

  // Abrir modal de FINALIZAR
  const openFinish = (w: WorkOrder) => {
    setFinishTarget(w);
    if (w.quote != null) {
      const saldo = Math.max(Number(w.quote) - Number(w.deposit || 0), 0);
      setFinishAmount(String(saldo)); // mostramos el saldo
    } else {
      setFinishAmount(w.total != null ? String(Number(w.total)) : "");
    }
    setFinishModalOpen(true);
  };

  // Confirmar FINALIZAR
  const confirmFinish = async () => {
    if (!finishTarget) return;

    // Con cotización: total = saldo
    if (finishTarget.quote != null) {
      const saldo = Math.max(
        Number(finishTarget.quote) - Number(finishTarget.deposit || 0),
        0
      );
      await update(finishTarget.id, { status: "FINISHED", total: saldo });
      setFinishModalOpen(false);
      setFinishTarget(null);
      setFinishAmount("");
      return;
    }

    // Sin cotización: pedir valor
    const val = Number(finishAmount);
    if (!Number.isFinite(val) || val < 0) {
      setMsg("VALOR INVÁLIDO");
      setTimeout(() => setMsg(""), 2000);
      return;
    }
    await update(finishTarget.id, { status: "FINISHED", total: val });
    setFinishModalOpen(false);
    setFinishTarget(null);
    setFinishAmount("");
  };

  // ENTREGADO
  const deliver = async (w: WorkOrder) => {
    if (w.total == null) {
      const ok = confirm(
        "Este trabajo no tiene valor registrado. ¿Marcar como ENTREGADO de todas formas?"
      );
      if (!ok) return;
    }
    await update(w.id, { status: "DELIVERED" });
  };

  // Abrir/Guardar modal EDITAR COT/ABONO
  function openEditQuoteDeposit(w: WorkOrder) {
    setEditQDTarget(w);
    if (w.quote != null && Number(w.quote) > 0) {
      setEditHasQuote("YES");
      setEditQuoteValue(String(Number(w.quote)));
      const dep = Number(w.deposit || 0);
      setEditHasDeposit(dep > 0 ? "YES" : "NO");
      setEditDepositValue(dep > 0 ? String(dep) : "");
    } else {
      setEditHasQuote("NO");
      setEditQuoteValue("");
      setEditHasDeposit("NO");
      setEditDepositValue("");
    }
    setEditQDOpen(true);
  }

  async function saveEditQuoteDeposit() {
    if (!editQDTarget) return;

    // Sin cotización -> limpiar
    if (editHasQuote === "NO") {
      const ok = await update(editQDTarget.id, {
        quotation: null,
        advance: null,
        // compat:
        quote: null,
        deposit: null,
        abono: null,
      });
      if (ok !== false) setMsg("COTIZACIÓN/ABONO ACTUALIZADOS ✅");
      setEditQDOpen(false);
      resetEditQD();
      return;
    }

    // Con cotización: validar
    const q = Number(editQuoteValue);
    if (!Number.isFinite(q) || q <= 0) {
      setMsg("COTIZACIÓN INVÁLIDA");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    let d: number | null = 0;
    if (editHasDeposit === "YES") {
      d = Number(editDepositValue);
      if (!Number.isFinite(d) || d < 0 || d > q) {
        setMsg("ABONO INVÁLIDO (debe ser ≥ 0 y ≤ cotización)");
        setTimeout(() => setMsg(""), 2200);
        return;
      }
    }

    const ok = await update(editQDTarget.id, {
      quotation: q, // <- clave
      advance: d, // <- clave
      // compat:
      quote: q,
      deposit: d,
      abono: d,
    });
    if (ok !== false) setMsg("COTIZACIÓN/ABONO ACTUALIZADOS ✅");
    setEditQDOpen(false);
    resetEditQD();
  }

  const tabs: Array<{ key: WorkStatus | ""; label: string }> = [
    { key: "", label: "TODOS" },
    { key: "RECEIVED", label: "RECIBIDOS" },
    { key: "IN_PROGRESS", label: "EN PROCESO" },
    { key: "FINISHED", label: "FINALIZADOS" },
    { key: "DELIVERED", label: "ENTREGADOS" },
  ];

  return (
    <div className="max-w-6xl mx-auto text-gray-200 space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-cyan-400">TRABAJOS</h1>

        <div className="flex flex-col w-full gap-2 sm:flex-row sm:w-auto sm:items-center">
          <select
            className="rounded px-3 py-2 text-gray-100 w-full sm:w-auto"
            style={{
              backgroundColor: COLORS.input,
              border: `1px solid ${COLORS.border}`,
            }}
            value={location}
            onChange={(e) => setLocation(e.target.value as WorkLocation | "")}
          >
            <option value="">UBICACIÓN: TODAS</option>
            <option value="LOCAL">EN LOCAL</option>
            <option value="BOGOTA">EN BOGOTÁ</option>
          </select>

          <input
            placeholder="BUSCAR POR CÓDIGO, CLIENTE, EQUIPO..."
            className="rounded px-3 py-2 text-gray-100 w-full sm:w-64 uppercase"
            style={{
              backgroundColor: COLORS.input,
              border: `1px solid ${COLORS.border}`,
            }}
            value={q}
            onChange={(e) => setQ(UU(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />

          <div className="flex gap-2">
            <button
              onClick={load}
              className="px-4 py-2 rounded-lg font-semibold w-full sm:w-auto"
              style={{
                color: "#001014",
                background:
                  "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                boxShadow:
                  "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
              }}
            >
              BUSCAR
            </button>
            <button
              onClick={() => setOpenForm(true)}
              className="px-4 py-2 rounded border w-full sm:w-auto"
              style={{ borderColor: COLORS.border }}
            >
              + NUEVO TRABAJO
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key || "all"}
            onClick={() => setStatus(t.key)}
            className={[
              "px-3 py-1.5 rounded-lg text-sm",
              status === t.key ? "bg-[#1E1F4B] text-cyan-300" : "border",
            ].join(" ")}
            style={{ borderColor: COLORS.border }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Aviso informativo */}
      <div
        className="rounded-lg p-3 text-sm uppercase"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        💡 <b>REVISIÓN $20.000:</b> SI EL CLIENTE <b>ACEPTA EL ARREGLO</b>, LA
        REVISIÓN <b>NO SE COBRA</b>. SOLO SE COBRA EL VALOR DEL ARREGLO.
      </div>

      {!!msg && <div className="text-sm text-cyan-300">{msg}</div>}

      {/* Lista */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && (
          <div className="col-span-full text-gray-400">CARGANDO…</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="col-span-full text-gray-400">NO HAY TRABAJOS</div>
        )}

        {rows.map((w) => {
          const s = STATUS_STYLES[w.status] ?? STATUS_STYLES.RECEIVED;
          const delivered = w.status === "DELIVERED";

          return (
            <article
              key={w.id}
              className={`rounded-xl p-4 space-y-2 border ${s.card}`}
              style={{ backgroundColor: COLORS.bgCard }}
            >
              <header className="flex items-center justify-between">
                <div className="font-semibold text-cyan-300 uppercase">
                  {UU(w.code)}
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${s.badge} uppercase`}
                >
                  {niceStatus[w.status]}
                </span>
              </header>

              <div className="text-sm text-gray-300">
                <div>
                  <b>INGRESÓ:</b> {fmt(w.createdAt)}
                </div>
                <div>
                  <b>UBICACIÓN:</b>{" "}
                  {w.location === "LOCAL" ? "EN LOCAL" : "EN BOGOTÁ"}
                </div>
              </div>

              <div className="text-sm uppercase">
                <div>
                  <b>EQUIPO:</b> {UU(w.item)}
                </div>
                <div>
                  <b>DESCRIPCIÓN:</b> {UU(w.description)}
                </div>
                <div>
                  <b>CLIENTE:</b> {UU(w.customerName)} • {UU(w.customerPhone)}
                </div>

                {/* Dinero por cotización */}
                {w.quote != null && (
                  <>
                    <div>
                      <b>COTIZACIÓN:</b> $
                      {Number(w.quote).toLocaleString("es-CO")}
                    </div>
                    <div>
                      <b>ABONO:</b> $
                      {Number(w.deposit || 0).toLocaleString("es-CO")}
                    </div>
                    <div className="text-pink-300">
                      <b>SALDO:</b> $
                      {Math.max(
                        Number(w.quote) - Number(w.deposit || 0),
                        0
                      ).toLocaleString("es-CO")}
                    </div>
                  </>
                )}

                {/* Dinero por estado */}
                {w.status === "FINISHED" && w.total != null && (
                  <div className="text-emerald-300">
                    <b>VALOR A PAGAR:</b> $
                    {Number(w.total).toLocaleString("es-CO")}
                  </div>
                )}
                {w.status === "DELIVERED" && (
                  <div className="text-pink-300">
                    <b>PAGO:</b>{" "}
                    {w.total != null
                      ? `$${Number(w.total).toLocaleString("es-CO")}`
                      : "—"}
                  </div>
                )}

                {!!w.notes && (
                  <div>
                    <b>NOTAS:</b> {UU(w.notes)}
                  </div>
                )}
              </div>

              {!delivered && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {w.status !== "RECEIVED" && (
                    <button
                      className="px-3 py-1 rounded border text-xs uppercase"
                      style={{ borderColor: COLORS.border }}
                      onClick={() => update(w.id, { status: "RECEIVED" })}
                    >
                      RECIBIDO
                    </button>
                  )}

                  {w.status !== "IN_PROGRESS" && (
                    <button
                      className="px-3 py-1 rounded border text-xs uppercase"
                      style={{ borderColor: COLORS.border }}
                      onClick={() => update(w.id, { status: "IN_PROGRESS" })}
                    >
                      EN PROCESO
                    </button>
                  )}

                  {/* Editar/Agregar Cotización/Abono */}
                  <button
                    className="px-3 py-1 rounded border text-xs uppercase"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => openEditQuoteDeposit(w)}
                    title={
                      w.quote != null
                        ? "Editar cotización/abono"
                        : "Agregar cotización/abono"
                    }
                  >
                    {w.quote != null ? "EDITAR COT/ABONO" : "+ COT/ABONO"}
                  </button>

                  {/* FINALIZAR */}
                  {w.status !== "FINISHED" && (
                    <button
                      className="px-3 py-1 rounded border text-xs uppercase"
                      style={{ borderColor: COLORS.border }}
                      onClick={() => openFinish(w)}
                    >
                      FINALIZADO
                    </button>
                  )}

                  {/* ENTREGADO */}
                  {w.status === "FINISHED" && (
                    <button
                      className="px-3 py-1 rounded border text-xs uppercase"
                      style={{ borderColor: COLORS.border }}
                      onClick={() => deliver(w)}
                    >
                      ENTREGADO
                    </button>
                  )}

                  {/* Toggle ubicación */}
                  <button
                    className="px-3 py-1 rounded border text-xs uppercase"
                    style={{ borderColor: COLORS.border }}
                    onClick={() =>
                      update(w.id, {
                        location: w.location === "LOCAL" ? "BOGOTA" : "LOCAL",
                      })
                    }
                  >
                    {w.location === "LOCAL" ? "→ BOGOTÁ" : "→ LOCAL"}
                  </button>

                  {/* Eliminar (solo ADMIN) */}
                  {canDelete && (
                    <button
                      className="px-3 py-1 rounded border text-xs text-pink-400 uppercase"
                      style={{ borderColor: COLORS.border }}
                      onClick={() => onDelete(w.id)}
                    >
                      ELIMINAR
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>

      {/* Modal Crear */}
      {openForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-xl rounded-xl p-4"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <h2 className="text-lg font-semibold text-cyan-300 mb-3 uppercase">
              NUEVO TRABAJO
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1 uppercase">
                  ¿QUÉ SE RECIBE? *
                </label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  placeholder="EJ: XBOX 360, CONTROL"
                  value={item}
                  onChange={(e) => setItem(UU(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-sm mb-1 uppercase">
                  UBICACIÓN *
                </label>
                <select
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={newLocation}
                  onChange={(e) =>
                    setNewLocation(e.target.value as WorkLocation)
                  }
                >
                  <option value="LOCAL">EN LOCAL</option>
                  <option value="BOGOTA">EN BOGOTÁ</option>
                </select>
              </div>

              {/* COTIZACIÓN (crear) */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm mb-1 uppercase">
                    ¿HAY COTIZACIÓN? *
                  </label>
                  <select
                    className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                    style={{
                      backgroundColor: COLORS.input,
                      border: `1px solid ${COLORS.border}`,
                    }}
                    value={hasQuote}
                    onChange={(e) =>
                      setHasQuote(e.target.value as "YES" | "NO")
                    }
                  >
                    <option value="NO">NO</option>
                    <option value="YES">SÍ</option>
                  </select>
                </div>

                {hasQuote === "YES" && (
                  <>
                    <div>
                      <label className="block text-sm mb-1 uppercase">
                        VALOR COTIZACIÓN *
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        className="w-full rounded px-3 py-2 text-gray-100"
                        style={{
                          backgroundColor: COLORS.input,
                          border: `1px solid ${COLORS.border}`,
                        }}
                        value={quoteValue}
                        onChange={(e) => setQuoteValue(e.target.value)}
                        placeholder="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm mb-1 uppercase">
                        ¿ABONA AHORA?
                      </label>
                      <select
                        className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                        style={{
                          backgroundColor: COLORS.input,
                          border: `1px solid ${COLORS.border}`,
                        }}
                        value={hasDeposit}
                        onChange={(e) =>
                          setHasDeposit(e.target.value as "YES" | "NO")
                        }
                      >
                        <option value="NO">NO</option>
                        <option value="YES">SÍ</option>
                      </select>
                    </div>

                    {hasDeposit === "YES" && (
                      <div className="md:col-span-3">
                        <label className="block text-sm mb-1 uppercase">
                          VALOR ABONO
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          className="w-full rounded px-3 py-2 text-gray-100"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                          value={depositValue}
                          onChange={(e) => setDepositValue(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm mb-1 uppercase">
                  DESCRIPCIÓN DEL CASO *
                </label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  placeholder="NO PRENDE / MANTENIMIENTO / ACTUALIZACIÓN / JOYSTICK DERECHO..."
                  value={description}
                  onChange={(e) => setDescription(UU(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-sm mb-1 uppercase">
                  NOMBRE CLIENTE *
                </label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={customerName}
                  onChange={(e) => setCustomerName(UU(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-sm mb-1 uppercase">
                  WHATSAPP CLIENTE *
                </label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(UU(e.target.value))}
                />
              </div>

              <div className="md:col-span-2 text-xs text-gray-300 uppercase">
                💬 SE INFORMA AL CLIENTE:{" "}
                <i>
                  “LA REVISIÓN TIENE UN COSTO DE $20.000; SI REALIZA EL ARREGLO,
                  NO SE COBRA LA REVISIÓN, SOLO EL VALOR DEL ARREGLO.”
                </i>
              </div>
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="px-4 py-2 rounded border w-full sm:w-auto uppercase"
                style={{ borderColor: COLORS.border }}
                onClick={() => {
                  setOpenForm(false);
                  resetForm();
                }}
              >
                CANCELAR
              </button>
              <button
                className="px-5 py-2.5 rounded-lg font-semibold w-full sm:w-auto uppercase"
                style={{
                  color: "#001014",
                  background:
                    "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                  boxShadow:
                    "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
                }}
                onClick={async () => {
                  // Validación básica
                  if (
                    !item.trim() ||
                    !description.trim() ||
                    !customerName.trim() ||
                    !customerPhone.trim()
                  ) {
                    setMsg("FALTAN CAMPOS OBLIGATORIOS");
                    setTimeout(() => setMsg(""), 2200);
                    return;
                  }

                  // Si hay cotización, validar
                  let quoteNum: number | null = null;
                  let depositNum: number | null = null;

                  if (hasQuote === "YES") {
                    const qn = Number(quoteValue);
                    if (!Number.isFinite(qn) || qn <= 0) {
                      setMsg("COTIZACIÓN INVÁLIDA");
                      setTimeout(() => setMsg(""), 2200);
                      return;
                    }
                    quoteNum = qn;

                    if (hasDeposit === "YES") {
                      const dn = Number(depositValue);
                      if (!Number.isFinite(dn) || dn < 0 || dn > qn) {
                        setMsg("ABONO INVÁLIDO");
                        setTimeout(() => setMsg(""), 2200);
                        return;
                      }
                      depositNum = dn;
                    } else {
                      depositNum = 0;
                    }
                  }

                  // dentro del onClick del botón CREAR
                  const payload: Patch = {
                    item: UDATA(item),
                    description: UDATA(description),
                    customerName: UDATA(customerName),
                    customerPhone: UDATA(customerPhone),
                    location: newLocation,

                    // Mantengo ambos por compatibilidad, pero el backend seguramente usa estos dos:
                    quotation: quoteNum, // <- clave para cotización
                    advance: depositNum, // <- clave para abono

                    // Extra (backends que sí aceptan estos):
                    quote: quoteNum,
                    deposit: depositNum,
                    abono: depositNum,
                  };

                  const r = await apiFetch("/works", {
                    method: "POST",
                    body: JSON.stringify(payload),
                  });

                  if (r.ok) {
                    setMsg("TRABAJO CREADO ✅");
                    resetForm();
                    setOpenForm(false);
                    load();
                  } else {
                    const e = (await r.json().catch(() => ({}))) as {
                      error?: string;
                    };
                    setMsg("ERROR: " + UDATA(e?.error || "NO SE PUDO CREAR"));
                    setTimeout(() => setMsg(""), 2500);
                  }
                }}
              >
                CREAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal FINALIZAR */}
      {finishModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-md rounded-xl p-4 space-y-3"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-title"
          >
            <h3
              id="finish-title"
              className="text-lg font-semibold text-cyan-300 uppercase"
            >
              FINALIZAR TRABAJO {finishTarget ? UU(finishTarget.code) : ""}
            </h3>

            {/* Caso con cotización */}
            {finishTarget?.quote != null ? (
              <>
                <div className="text-sm text-gray-300 space-y-1">
                  <div>
                    <b>Cotización:</b> $
                    {Number(finishTarget.quote).toLocaleString("es-CO")}
                  </div>
                  <div>
                    <b>Abono:</b> $
                    {Number(finishTarget.deposit || 0).toLocaleString("es-CO")}
                  </div>
                  <div className="text-pink-300">
                    <b>Saldo a pagar:</b> $
                    {Math.max(
                      Number(finishTarget.quote) -
                        Number(finishTarget.deposit || 0),
                      0
                    ).toLocaleString("es-CO")}
                  </div>
                  <div className="text-xs text-gray-400">
                    * Se finalizará usando el <b>saldo</b> como valor a pagar.
                  </div>
                </div>

                <input
                  type="number"
                  value={finishAmount}
                  disabled
                  className="w-full rounded px-3 py-2 text-gray-100 opacity-70"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                />
              </>
            ) : (
              // Caso SIN cotización
              <>
                <p className="text-sm text-gray-300">
                  Ingresa el <b>valor a pagar</b> del trabajo (ej: 15000).
                </p>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={finishAmount}
                  onChange={(e) => setFinishAmount(e.target.value)}
                  className="w-full rounded px-3 py-2 text-gray-100"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  placeholder="0"
                  autoFocus
                />
              </>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-1">
              <button
                className="px-4 py-2 rounded border w-full sm:w-auto uppercase"
                style={{ borderColor: COLORS.border }}
                onClick={() => {
                  setFinishModalOpen(false);
                  setFinishTarget(null);
                  setFinishAmount("");
                }}
              >
                CANCELAR
              </button>
              <button
                className="px-5 py-2.5 rounded-lg font-semibold w-full sm:w-auto uppercase"
                style={{
                  color: "#001014",
                  background:
                    "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                  boxShadow:
                    "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
                }}
                onClick={confirmFinish}
              >
                GUARDAR Y FINALIZAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal EDITAR COT/ABONO */}
      {editQDOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-xl rounded-xl p-4 space-y-3"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <h3 className="text-lg font-semibold text-cyan-300 uppercase">
              {editQDTarget?.code
                ? `EDITAR COT/ABONO — ${UU(editQDTarget.code)}`
                : "EDITAR COT/ABONO"}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm mb-1 uppercase">
                  ¿HAY COTIZACIÓN? *
                </label>
                <select
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={editHasQuote}
                  onChange={(e) =>
                    setEditHasQuote(e.target.value as "YES" | "NO")
                  }
                >
                  <option value="NO">NO</option>
                  <option value="YES">SÍ</option>
                </select>
              </div>

              {editHasQuote === "YES" && (
                <>
                  <div>
                    <label className="block text-sm mb-1 uppercase">
                      VALOR COTIZACIÓN *
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      className="w-full rounded px-3 py-2 text-gray-100"
                      style={{
                        backgroundColor: COLORS.input,
                        border: `1px solid ${COLORS.border}`,
                      }}
                      value={editQuoteValue}
                      onChange={(e) => setEditQuoteValue(e.target.value)}
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-1 uppercase">
                      ¿ABONO?
                    </label>
                    <select
                      className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                      style={{
                        backgroundColor: COLORS.input,
                        border: `1px solid ${COLORS.border}`,
                      }}
                      value={editHasDeposit}
                      onChange={(e) =>
                        setEditHasDeposit(e.target.value as "YES" | "NO")
                      }
                    >
                      <option value="NO">NO</option>
                      <option value="YES">SÍ</option>
                    </select>
                  </div>

                  {editHasDeposit === "YES" && (
                    <div className="md:col-span-3">
                      <label className="block text-sm mb-1 uppercase">
                        VALOR ABONO
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        className="w-full rounded px-3 py-2 text-gray-100"
                        style={{
                          backgroundColor: COLORS.input,
                          border: `1px solid ${COLORS.border}`,
                        }}
                        value={editDepositValue}
                        onChange={(e) => setEditDepositValue(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {editHasQuote === "YES" && (
              <div className="text-xs text-gray-300">
                Saldo = Cotización – Abono. Se mostrará en la tarjeta y se usará
                al “FINALIZAR”.
              </div>
            )}

            <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="px-4 py-2 rounded border w-full sm:w-auto uppercase"
                style={{ borderColor: COLORS.border }}
                onClick={() => {
                  setEditQDOpen(false);
                  resetEditQD();
                }}
              >
                CANCELAR
              </button>
              <button
                className="px-5 py-2.5 rounded-lg font-semibold w-full sm:w-auto uppercase"
                style={{
                  color: "#001014",
                  background:
                    "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                  boxShadow:
                    "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
                }}
                onClick={saveEditQuoteDeposit}
              >
                GUARDAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
