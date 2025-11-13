"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { apiFetch } from "../lib/api";

type WorkStatus = "RECEIVED" | "IN_PROGRESS" | "FINISHED" | "DELIVERED";
type WorkLocation = "LOCAL" | "BOGOTA";
type PayMethod = "EFECTIVO" | "QR_LLAVE" | "DATAFONO";

type WorkOrder = {
  id: number;
  code: string;
  item: string;
  description: string;
  customerName: string;
  customerPhone: string;
  status: WorkStatus;
  location: WorkLocation;
  quote?: number | null; // BD
  total?: number | null; // BD
  deposit?: number | null; // 👈 viene calculado desde el backend
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

const COLORS = { bgCard: "#14163A", border: "#1E1F4B", input: "#0F1030" };

const niceStatus: Record<WorkStatus, string> = {
  RECEIVED: "RECIBIDO",
  IN_PROGRESS: "EN PROCESO",
  FINISHED: "FINALIZADO",
  DELIVERED: "ENTREGADO",
};

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
const toNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const fmt = (d: string | Date) => new Date(d).toLocaleString();

type AnyRow = Partial<WorkOrder> & { id: number; code: string };
function normalizeRows(rows: AnyRow[]): WorkOrder[] {
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    item: r.item ?? "",
    description: r.description ?? "",
    customerName: r.customerName ?? "",
    customerPhone: r.customerPhone ?? "",
    status: (r.status ?? "RECEIVED") as WorkStatus,
    location: (r.location ?? "LOCAL") as WorkLocation,
    quote: toNum(r.quote),
    total: toNum(r.total),
    deposit: toNum(r.deposit ?? 0), // 👈 del backend
    notes: r.notes ?? null,
    createdAt: r.createdAt ?? new Date().toISOString(),
    updatedAt: r.updatedAt ?? new Date().toISOString(),
  }));
}

type Patch = {
  item?: string;
  description?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string | null;
  status?: WorkStatus;
  location?: WorkLocation;
  total?: number | null;
  quote?: number | null;
  quotation?: number | null;
};

export default function WorksPage() {
  const { role, ready, username } = useAuth();
  const canDelete = role === "ADMIN";

  // Filtros
  const [status, setStatus] = useState<WorkStatus | "">("");
  const [location, setLocation] = useState<WorkLocation | "">("");
  const [q, setQ] = useState("");

  // Datos
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Track de cuáles trabajos ya se les dio "INFORMAR AL CLIENTE"
  const [informedIds, setInformedIds] = useState<Set<number>>(
    () => new Set<number>()
  );

  // Crear
  const [openForm, setOpenForm] = useState(false);
  const [item, setItem] = useState("");
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [newLocation, setNewLocation] = useState<WorkLocation>("LOCAL");
  const [hasQuote, setHasQuote] = useState<"YES" | "NO">("NO");
  const [quoteValue, setQuoteValue] = useState<string>("");
  const [hasDeposit, setHasDeposit] = useState<"YES" | "NO">("NO");
  const [depositValue, setDepositValue] = useState<string>("");
  const [depositMethod, setDepositMethod] = useState<PayMethod>("EFECTIVO");

  // Finalizar (solo se usa cuando NO hay cotización)
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [finishAmount, setFinishAmount] = useState<string>("");
  const [finishTarget, setFinishTarget] = useState<WorkOrder | null>(null);

  // Editar COT/ABONO (abono persistente)
  const [editQDOpen, setEditQDOpen] = useState(false);
  const [editQDTarget, setEditQDTarget] = useState<WorkOrder | null>(null);
  const [editHasQuote, setEditHasQuote] = useState<"YES" | "NO">("NO");
  const [editQuoteValue, setEditQuoteValue] = useState<string>("");
  const [editHasDeposit, setEditHasDeposit] = useState<"YES" | "NO">("NO");
  const [editDepositValue, setEditDepositValue] = useState<string>("");
  const [editDepositMethod, setEditDepositMethod] =
    useState<PayMethod>("EFECTIVO");
  const [editDepositNote, setEditDepositNote] = useState<string>("");

  // === Editar DESCRIPCIÓN / ITEM ===
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WorkOrder | null>(null);
  const [editItem, setEditItem] = useState("");
  const [editDescription, setEditDescription] = useState("");

  function openEditDetails(w: WorkOrder) {
    setEditTarget(w);
    setEditItem(UU(w.item));
    setEditDescription(UU(w.description));
    setEditOpen(true);
  }

  async function saveEditDetails() {
    if (!editTarget) return;
    if (!editItem.trim() || !editDescription.trim()) {
      setMsg("FALTAN CAMPOS OBLIGATORIOS");
      setTimeout(() => setMsg(""), 2200);
      return;
    }
    const ok = await update(editTarget.id, {
      item: editItem,
      description: editDescription,
    });
    if (ok) {
      setMsg("DESCRIPCIÓN ACTUALIZADA ✅");
      setTimeout(() => setMsg(""), 1800);
      setEditOpen(false);
      setEditTarget(null);
    }
  }

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
    setDepositMethod("EFECTIVO");
  }
  function resetEditQD() {
    setEditQDTarget(null);
    setEditHasQuote("NO");
    setEditQuoteValue("");
    setEditHasDeposit("NO");
    setEditDepositValue("");
    setEditDepositMethod("EFECTIVO");
    setEditDepositNote("");
  }

  const load = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      // El estado ahora se filtra en el front para poder mostrar columnas
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
  }, [ready, location]); // 👈 ya no recargamos por cambio de status (tab)

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

  async function updateStatusAndNotify(
    w: WorkOrder,
    newStatus: WorkStatus,
    extraPatch?: Patch
  ) {
    const ok = await update(w.id, { status: newStatus, ...(extraPatch || {}) });
    if (!ok) return;

    const msg = buildStatusMsg(w, newStatus);
    openWhatsApp(w.customerPhone, msg);
    await load();
  }

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

  // FINALIZAR: si hay cotización -> finalizar directo con saldo; si no, modal
  const openFinish = async (w: WorkOrder) => {
    if (w.quote != null) {
      const dep = Number(w.deposit || 0);
      const saldo = Math.max(Number(w.quote) - dep, 0);
      await updateStatusAndNotify(w, "FINISHED", { total: saldo });
      setMsg("TRABAJO FINALIZADO ✅");
      return;
    }
    // (sigue el modal para los que no tienen cotización)
    setFinishTarget(w);
    setFinishAmount(w.total != null ? String(Number(w.total)) : "");
    setFinishModalOpen(true);
  };

  const confirmFinish = async () => {
    if (!finishTarget) return;
    const val = Number(finishAmount);
    if (!Number.isFinite(val) || val < 0) {
      setMsg("VALOR INVÁLIDO");
      setTimeout(() => setMsg(""), 2000);
      return;
    }
    await updateStatusAndNotify(finishTarget, "FINISHED", { total: val });
    setFinishModalOpen(false);
    setFinishTarget(null);
    setFinishAmount("");
  };

  // Editar/Agregar COT y ABONO (abono se persiste via /works/:id/payments)
  function openEditQuoteDeposit(w: WorkOrder) {
    setEditQDTarget(w);

    if (w.quote != null && Number(w.quote) > 0) {
      setEditHasQuote("YES");
      setEditQuoteValue(String(Number(w.quote)));
    } else {
      setEditHasQuote("NO");
      setEditQuoteValue("");
    }
    // por defecto no obliga abono
    setEditHasDeposit("NO");
    setEditDepositValue("");
    setEditDepositMethod("EFECTIVO");
    setEditDepositNote("");

    setEditQDOpen(true);
  }

  async function saveEditQuoteDeposit() {
    if (!editQDTarget) return;

    // 1) Actualizar/limpiar cotización en WorkOrder
    if (editHasQuote === "NO") {
      const ok = await update(editQDTarget.id, {
        quotation: null,
        quote: null,
      });
      if (ok !== false) setMsg("COTIZACIÓN ACTUALIZADA ✅");
      // si no hay cotización, ignoramos abono
      setEditQDOpen(false);
      resetEditQD();
      return;
    }

    const q = Number(editQuoteValue);
    if (!Number.isFinite(q) || q <= 0) {
      setMsg("COTIZACIÓN INVÁLIDA");
      setTimeout(() => setMsg(""), 2200);
      return;
    }
    const ok = await update(editQDTarget.id, { quotation: q, quote: q });
    if (ok === false) return;

    // 2) (Opcional) Registrar abono como pago real
    if (editHasDeposit === "YES") {
      const d = Number(editDepositValue);
      if (!Number.isFinite(d) || d < 0 || d > q) {
        setMsg("ABONO INVÁLIDO (≥ 0 y ≤ cotización)");
        setTimeout(() => setMsg(""), 2200);
        return;
      }
      const pr = await apiFetch(`/works/${editQDTarget.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: d,
          method: editDepositMethod,
          note: editDepositNote,
          createdBy: username || undefined,
        }),
      });
      if (!pr.ok) {
        const e = await pr.json().catch(() => ({}));
        setMsg("ERROR AL REGISTRAR ABONO: " + UDATA(e?.error || ""));
        setTimeout(() => setMsg(""), 2500);
        return;
      }
    }

    setMsg("COTIZACIÓN/ABONO ACTUALIZADOS ✅");
    setEditQDOpen(false);
    resetEditQD();
    load();
  }

  const tabs: Array<{ key: WorkStatus | ""; label: string }> = [
    { key: "", label: "TODOS" },
    { key: "RECEIVED", label: "RECIBIDOS" },
    { key: "IN_PROGRESS", label: "EN PROCESO" },
    { key: "FINISHED", label: "FINALIZADOS" },
    { key: "DELIVERED", label: "ENTREGADOS" },
  ];

  // ===== WhatsApp helpers =====
  function onlyDigits(s: string) {
    return (s || "").replace(/\D+/g, "");
  }
  function normalizeCOPhone(raw: string) {
    const d = onlyDigits(raw);
    if (d.startsWith("57")) return d;
    // si son 10 dígitos locales, anteponer 57
    if (d.length === 10) return "57" + d;
    // fallback: si ya viene en 57xxxxxxxxxx o algo raro, intenta 57 + últimos 10
    return d.length >= 10 ? "57" + d.slice(-10) : d;
  }
  function toCOP(n?: number | null) {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—";
    return n.toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    });
  }
  function openWhatsApp(phone: string, text: string) {
    const num = normalizeCOPhone(phone);
    const url = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function buildReceivedMsg(w: WorkOrder) {
    const dep = Number(w.deposit || 0);
    const quote = Number(w.quote ?? 0);
    const saldo = Math.max(quote - dep, 0);

    const partes: string[] = [
      `Hola ${UU(w.customerName)} 🎮`,
      `Tu trabajo ${UU(w.code)} fue RECIBIDO.`,
      `Equipo: ${UU(w.item)} 🕹️`,
      `Descripción: ${UU(w.description)}`,
    ];
    if (w.quote != null) {
      partes.push(
        `Cotización: ${toCOP(quote)}`,
        `Abonos: ${toCOP(dep)}`,
        `Saldo: ${toCOP(saldo)}`
      );
    }
    partes.push(`Gracias por elegirnos.`);
    return partes.join("\n");
  }

  function buildStatusMsg(w: WorkOrder, newStatus: WorkStatus) {
    const base = `${UU(w.code)}`;
    const dep = Number(w.deposit || 0);
    const quoteNum = w.quote != null ? Number(w.quote) : null;
    const saldo = quoteNum != null ? Math.max(quoteNum - dep, 0) : null;

    if (newStatus === "IN_PROGRESS") return `${base} ahora está EN PROCESO. 👨‍🔧`;

    if (newStatus === "FINISHED") {
      const lineas: string[] = [];
      lineas.push(
        `Hola ${UU(w.customerName)} 🎮`,
        `Tu trabajo ${base} está FINALIZADO. ✅`
      );
      if (quoteNum != null) {
        lineas.push(
          `Cotización: ${toCOP(quoteNum)}`,
          `Abono: ${toCOP(dep)}`,
          `Saldo: ${toCOP(saldo ?? 0)}`
        );
      }
      lineas.push(
        `Puedes pasar por tu equipo en horario de atención. ¡Gracias por elegir Gamerland!`
      );
      return lineas.join("\n");
    }

    if (newStatus === "DELIVERED")
      return `${base} ENTREGADO. ✅ Recuerda: para cualquier garantía avísanos con tiempo para gestionarla.`;

    return `${base} ahora está ${niceStatus[newStatus]}`;
  }

  // ====== Ordenar trabajos por fecha (antiguos primero) ======
  const sortedRows = [...rows].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const statusOrder: WorkStatus[] = [
    "RECEIVED",
    "IN_PROGRESS",
    "FINISHED",
    "DELIVERED",
  ];

  const visibleStatuses: WorkStatus[] = status === "" ? statusOrder : [status];

  // Render de una tarjeta de trabajo (con la nueva lógica de botones)
  const renderWorkCard = (w: WorkOrder) => {
    const s = STATUS_STYLES[w.status] ?? STATUS_STYLES.RECEIVED;
    const delivered = w.status === "DELIVERED";
    const dep = Number(w.deposit || 0);
    const quote = Number(w.quote ?? 0);
    const saldo = Math.max(quote - dep, 0);

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
          <span className={`text-xs px-2 py-0.5 rounded ${s.badge} uppercase`}>
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

          {w.quote != null && (
            <>
              <div>
                <b>COTIZACIÓN:</b> ${Number(quote).toLocaleString("es-CO")}
              </div>
              <div>
                <b>ABONOS:</b> ${Number(dep).toLocaleString("es-CO")}
              </div>
              <div className="text-pink-300">
                <b>SALDO:</b> ${saldo.toLocaleString("es-CO")}
              </div>
            </>
          )}

          {w.status === "FINISHED" && w.total != null && (
            <div className="text-emerald-300">
              <b>VALOR A PAGAR:</b> ${Number(w.total).toLocaleString("es-CO")}
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

        {/* Botonera según estado (sin retornos) */}
        {!delivered && (
          <div className="flex flex-wrap gap-2 pt-2">
            {/* ACCIONES DE ESTADO */}
            {w.status === "RECEIVED" && (
              <>
                {/* INFORMAR AL CLIENTE SIEMPRE DISPONIBLE */}
                <button
                  className="px-3 py-1 rounded border text-xs uppercase"
                  style={{ borderColor: COLORS.border }}
                  onClick={() => {
                    openWhatsApp(w.customerPhone, buildReceivedMsg(w));
                    setInformedIds((prev) => {
                      const next = new Set(prev);
                      next.add(w.id);
                      return next;
                    });
                  }}
                  title="Enviar mensaje de recibido"
                >
                  INFORMAR AL CLIENTE
                </button>

                {/* EN PROCESO SOLO DESPUÉS DE INFORMAR AL CLIENTE */}
                {informedIds.has(w.id) && (
                  <button
                    className="px-3 py-1 rounded border text-xs uppercase"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => updateStatusAndNotify(w, "IN_PROGRESS")}
                  >
                    EN PROCESO
                  </button>
                )}
              </>
            )}

            {w.status === "IN_PROGRESS" && (
              <button
                className="px-3 py-1 rounded border text-xs uppercase"
                style={{ borderColor: COLORS.border }}
                onClick={() => openFinish(w)}
              >
                FINALIZADO
              </button>
            )}

            {w.status === "FINISHED" && (
              <button
                className="px-3 py-1 rounded border text-xs uppercase"
                style={{ borderColor: COLORS.border }}
                onClick={() => updateStatusAndNotify(w, "DELIVERED")}
              >
                ENTREGADO
              </button>
            )}

            {/* ACCIONES SIEMPRE DISPONIBLES MIENTRAS NO ESTÉ ENTREGADO */}
            <button
              className="px-3 py-1 rounded border text-xs uppercase"
              style={{ borderColor: COLORS.border }}
              onClick={() => openEditDetails(w)}
              title="Editar descripción y 'qué se recibe'"
            >
              EDITAR DESC.
            </button>

            <button
              className="px-3 py-1 rounded border text-xs uppercase"
              style={{ borderColor: COLORS.border }}
              onClick={() => openEditQuoteDeposit(w)}
              title={
                w.quote != null
                  ? "Editar cotización / agregar abono"
                  : "Agregar cotización"
              }
            >
              {w.quote != null ? "EDITAR COT/ABONO" : "+ COT/ABONO"}
            </button>

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

        {delivered && canDelete && (
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              className="px-3 py-1 rounded border text-xs text-pink-400 uppercase"
              style={{ borderColor: COLORS.border }}
              onClick={() => onDelete(w.id)}
              title="Eliminar definitivamente este trabajo (ADMIN)"
            >
              ELIMINAR
            </button>
          </div>
        )}
      </article>
    );
  };

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

      {/* Lista en 4 columnas por estado */}
      <section className="space-y-4">
        {loading && <div className="text-gray-400 text-sm">CARGANDO…</div>}
        {!loading && rows.length === 0 && (
          <div className="text-gray-400 text-sm">NO HAY TRABAJOS</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {statusOrder
            .filter((st) => visibleStatuses.includes(st))
            .map((st) => {
              const colRows = sortedRows.filter((w) => w.status === st);
              return (
                <div key={st} className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                    {niceStatus[st]}
                    <span className="ml-1 text-xs text-gray-400">
                      ({colRows.length})
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {!loading && colRows.length === 0 && (
                      <div className="text-xs text-gray-500">Sin trabajos</div>
                    )}
                    {colRows.map((w) => renderWorkCard(w))}
                  </div>
                </div>
              );
            })}
        </div>
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
                      <>
                        <div>
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
                        <div>
                          <label className="block text-sm mb-1 uppercase">
                            MÉTODO PAGO
                          </label>
                          <select
                            className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                            style={{
                              backgroundColor: COLORS.input,
                              border: `1px solid ${COLORS.border}`,
                            }}
                            value={depositMethod}
                            onChange={(e) =>
                              setDepositMethod(e.target.value as PayMethod)
                            }
                          >
                            <option value="EFECTIVO">EFECTIVO</option>
                            <option value="QR_LLAVE">QR_LLAVE</option>
                            <option value="DATAFONO">DATAFONO</option>
                          </select>
                        </div>
                      </>
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

                  let quoteNum: number | null = null;
                  let depositNum = 0;

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
                    }
                  }

                  // Crear orden
                  const payload: Patch = {
                    item: UDATA(item),
                    description: UDATA(description),
                    customerName: UDATA(customerName),
                    customerPhone: UDATA(customerPhone),
                    location: newLocation,
                    quotation: quoteNum,
                    quote: quoteNum,
                  };

                  const r = await apiFetch("/works", {
                    method: "POST",
                    body: JSON.stringify(payload),
                  });

                  if (r.ok) {
                    const created = (await r.json().catch(() => null)) as {
                      id: number;
                    } | null;

                    if (
                      created &&
                      typeof created.id === "number" &&
                      depositNum > 0
                    ) {
                      await apiFetch(`/works/${created.id}/payments`, {
                        method: "POST",
                        body: JSON.stringify({
                          amount: depositNum,
                          method: depositMethod,
                          note: "ABONO INICIAL",
                          createdBy: username || undefined,
                        }),
                      }).catch(() => null);
                    }

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

      {/* Modal FINALIZAR (solo sin cotización) */}
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
                    <>
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
                      <div>
                        <label className="block text-sm mb-1 uppercase">
                          MÉTODO PAGO
                        </label>
                        <select
                          className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                          value={editDepositMethod}
                          onChange={(e) =>
                            setEditDepositMethod(e.target.value as PayMethod)
                          }
                        >
                          <option value="EFECTIVO">EFECTIVO</option>
                          <option value="QR_LLAVE">QR_LLAVE</option>
                          <option value="DATAFONO">DATAFONO</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm mb-1 uppercase">
                          NOTA (opcional)
                        </label>
                        <input
                          className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                          value={editDepositNote}
                          onChange={(e) => setEditDepositNote(e.target.value)}
                          placeholder="ABONO A COTIZACIÓN / ACEPTACIÓN / ..."
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {editHasQuote === "YES" && (
              <div className="text-xs text-gray-300">
                Saldo = Cotización – Abonos (pagos). Se usará al “FINALIZAR”.
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

      {/* Modal EDITAR DESCRIPCIÓN / ITEM */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-xl rounded-xl p-4 space-y-3"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-desc-title"
          >
            <h3
              id="edit-desc-title"
              className="text-lg font-semibold text-cyan-300 uppercase"
            >
              EDITAR — {editTarget ? UU(editTarget.code) : ""}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-1">
                <label className="block text-sm mb-1 uppercase">
                  ¿QUÉ SE RECIBE? *
                </label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={editItem}
                  onChange={(e) => setEditItem(UU(e.target.value))}
                  placeholder="EJ: XBOX 360, CONTROL"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm mb-1 uppercase">
                  DESCRIPCIÓN *
                </label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={editDescription}
                  onChange={(e) => setEditDescription(UU(e.target.value))}
                  placeholder="NO PRENDE / MANTENIMIENTO / ..."
                />
              </div>
            </div>

            <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="px-4 py-2 rounded border w-full sm:w-auto uppercase"
                style={{ borderColor: COLORS.border }}
                onClick={() => {
                  setEditOpen(false);
                  setEditTarget(null);
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
                onClick={saveEditDetails}
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
