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
  reviewPaid: boolean;
  status: WorkStatus;
  location: WorkLocation;
  quote?: number | null;
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
  RECEIVED:    { badge: "bg-amber-100 text-amber-800",    card: "border-amber-300" },
  IN_PROGRESS: { badge: "bg-blue-100 text-blue-800",       card: "border-blue-300" },
  FINISHED:    { badge: "bg-emerald-100 text-emerald-800", card: "border-emerald-300" },
  DELIVERED:   { badge: "bg-gray-200 text-gray-700",       card: "border-gray-300 opacity-85" },
};

// === Helpers de mayúsculas ===
// UI: mayúsculas SIN recortar (no rompe los espacios mientras escribes)
const UU = (v: unknown) => (v == null ? "" : String(v).toUpperCase());
// DATA: mayúsculas + trim SOLO para enviar/normalizar
const UDATA = (v: unknown) => (v == null ? "" : String(v).toUpperCase().trim());

// Fecha “Ingresó”
function fmt(d: string | Date) {
  const date = new Date(d);
  return date.toLocaleString();
}

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
  const [reviewPaid, setReviewPaid] = useState(false);
  const [newLocation, setNewLocation] = useState<WorkLocation>("LOCAL");

  const resetForm = () => {
    setItem("");
    setDescription("");
    setCustomerName("");
    setCustomerPhone("");
    setReviewPaid(false);
    setNewLocation("LOCAL");
  };

  const load = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (location) p.set("location", location);
      if (q.trim()) p.set("q", UDATA(q)); // aquí sí trim para consulta
      const r = await apiFetch(`/works?${p.toString()}`);
      const data: WorkOrder[] = await r.json();
      setRows(data);
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

  const onCreate = async () => {
    if (!item.trim() || !description.trim() || !customerName.trim() || !customerPhone.trim()) {
      setMsg("FALTAN CAMPOS OBLIGATORIOS");
      setTimeout(() => setMsg(""), 2200);
      return;
    }
    const payload = {
      item: UDATA(item),
      description: UDATA(description),
      customerName: UDATA(customerName),
      customerPhone: UDATA(customerPhone),
      reviewPaid,
      location: newLocation,
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
      const e = await r.json().catch(() => ({}));
      setMsg("ERROR: " + UDATA(e?.error || "NO SE PUDO CREAR"));
      setTimeout(() => setMsg(""), 2500);
    }
  };

  // Normaliza parches antes de enviar (usa UDATA para limpiar)
  const normalizePatch = (patch: Partial<WorkOrder>) => {
    const out: Partial<WorkOrder> = { ...patch };
    if (out.item != null) out.item = UDATA(out.item);
    if (out.description != null) out.description = UDATA(out.description);
    if (out.customerName != null) out.customerName = UDATA(out.customerName);
    if (out.customerPhone != null) out.customerPhone = UDATA(out.customerPhone);
    if (out.notes != null) out.notes = UDATA(out.notes);
    return out;
  };

  const update = async (id: number, patch: Partial<WorkOrder>) => {
    const body = normalizePatch(patch);
    const r = await apiFetch(`/works/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (r.ok) {
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg("ERROR: " + UDATA(e?.error || "NO SE PUDO ACTUALIZAR"));
      setTimeout(() => setMsg(""), 2500);
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
      setMsg("ERROR: " + UDATA(e?.error || "NO SE PUDO ELIMINAR"));
      setTimeout(() => setMsg(""), 2500);
    }
  };

  const tabs: Array<{ key: WorkStatus | ""; label: string }> = [
    { key: "", label: "TODOS" },
    { key: "RECEIVED", label: "RECIBIDOS" },
    { key: "IN_PROGRESS", label: "EN PROCESO" },
    { key: "FINISHED", label: "FINALIZADOS" },
    { key: "DELIVERED", label: "ENTREGADOS" },
  ];

  return (
    <div className="max-w-6xl mx-auto text-gray-200 space-y-6">
      {/* Header responsive */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-cyan-400">TRABAJOS</h1>

        <div className="flex flex-col w-full gap-2 sm:flex-row sm:w-auto sm:items-center">
          <select
            className="rounded px-3 py-2 text-gray-100 w-full sm:w-auto"
            style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
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
            style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
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
                background: "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                boxShadow: "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
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

      {/* Tabs de estado */}
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

      {/* Aviso revisión */}
      <div
        className="rounded-lg p-3 text-sm uppercase"
        style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}
      >
        💡 <b>REVISIÓN $20.000:</b> SI EL CLIENTE <b>ACEPTA EL ARREGLO</b>, LA REVISIÓN <b>NO SE COBRA</b>.
        MARCA <b>“PAGÓ REVISIÓN”</b> PARA RECORDARLO AL CERRAR EL CASO.
      </div>

      {!!msg && <div className="text-sm text-cyan-300">{msg}</div>}

      {/* Lista de tarjetas */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && <div className="col-span-full text-gray-400">CARGANDO…</div>}
        {!loading && rows.length === 0 && <div className="col-span-full text-gray-400">NO HAY TRABAJOS</div>}

        {rows.map((w) => {
          const s = STATUS_STYLES[w.status] ?? STATUS_STYLES.RECEIVED;
          return (
            <article
              key={w.id}
              className={`rounded-xl p-4 space-y-2 border ${s.card}`}
              style={{ backgroundColor: COLORS.bgCard }}
            >
              <header className="flex items-center justify-between">
                <div className="font-semibold text-cyan-300 uppercase">{UU(w.code)}</div>
                <span className={`text-xs px-2 py-0.5 rounded ${s.badge} uppercase`}>
                  {niceStatus[w.status]}
                </span>
              </header>

              <div className="text-sm text-gray-300">
                <div><b>INGRESÓ:</b> {fmt(w.createdAt)}</div>
                <div><b>UBICACIÓN:</b> {w.location === "LOCAL" ? "EN LOCAL" : "EN BOGOTÁ"}</div>
              </div>

              <div className="text-sm uppercase">
                <div><b>EQUIPO:</b> {UU(w.item)}</div>
                <div><b>DESCRIPCIÓN:</b> {UU(w.description)}</div>
                <div>
                  <b>CLIENTE:</b> {UU(w.customerName)} • {UU(w.customerPhone)}
                </div>
                <div><b>REVISIÓN:</b> {w.reviewPaid ? "PAGADA ($20.000)" : "PENDIENTE"}</div>

                {w.quote != null && (
                  <div><b>COTIZACIÓN:</b> ${Number(w.quote).toLocaleString("es-CO")}</div>
                )}
                {w.total != null && (
                  <div><b>TOTAL FINAL:</b> ${Number(w.total).toLocaleString("es-CO")}</div>
                )}
                {!!w.notes && (
                  <div><b>NOTAS:</b> {UU(w.notes)}</div>
                )}
              </div>

              {/* Acciones rápidas */}
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
                {w.status !== "FINISHED" && (
                  <button
                    className="px-3 py-1 rounded border text-xs uppercase"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => update(w.id, { status: "FINISHED" })}
                  >
                    FINALIZADO
                  </button>
                )}
                {w.status !== "DELIVERED" && (
                  <button
                    className="px-3 py-1 rounded border text-xs uppercase"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => update(w.id, { status: "DELIVERED" })}
                  >
                    ENTREGADO
                  </button>
                )}

                {/* Toggle ubicación */}
                <button
                  className="px-3 py-1 rounded border text-xs uppercase"
                  style={{ borderColor: COLORS.border }}
                  onClick={() =>
                    update(w.id, { location: w.location === "LOCAL" ? "BOGOTA" : "LOCAL" })
                  }
                >
                  {w.location === "LOCAL" ? "→ BOGOTÁ" : "→ LOCAL"}
                </button>

                {/* Toggle revisión pagada */}
                <button
                  className="px-3 py-1 rounded border text-xs uppercase"
                  style={{ borderColor: COLORS.border }}
                  onClick={() => update(w.id, { reviewPaid: !w.reviewPaid })}
                >
                  {w.reviewPaid ? "QUITAR REVISIÓN PAGADA" : "MARCAR REVISIÓN PAGADA"}
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
            </article>
          );
        })}
      </section>

      {/* Modal Crear */}
      {openForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-xl rounded-xl p-4"
            style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-lg font-semibold text-cyan-300 mb-3 uppercase">NUEVO TRABAJO</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1 uppercase">¿QUÉ SE RECIBE? *</label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                  placeholder="EJ: XBOX 360, CONTROL"
                  value={item}
                  onChange={(e) => setItem(UU(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-sm mb-1 uppercase">UBICACIÓN *</label>
                <select
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value as WorkLocation)}
                >
                  <option value="LOCAL">EN LOCAL</option>
                  <option value="BOGOTA">EN BOGOTÁ</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm mb-1 uppercase">DESCRIPCIÓN DEL CASO *</label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                  placeholder="NO PRENDE / MANTENIMIENTO / ACTUALIZACIÓN / JOYSTICK DERECHO..."
                  value={description}
                  onChange={(e) => setDescription(UU(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-sm mb-1 uppercase">NOMBRE CLIENTE *</label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                  value={customerName}
                  onChange={(e) => setCustomerName(UU(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-sm mb-1 uppercase">WHATSAPP CLIENTE *</label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(UU(e.target.value))}
                />
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <input
                  id="rev"
                  type="checkbox"
                  checked={reviewPaid}
                  onChange={(e) => setReviewPaid(e.target.checked)}
                />
                <label htmlFor="rev" className="text-sm uppercase">PAGÓ REVISIÓN ($20.000)</label>
              </div>
              <div className="md:col-span-2 text-xs text-gray-300 uppercase">
                💬 SE INFORMA AL CLIENTE: <i>“LA REVISIÓN TIENE UN COSTO DE $20.000; SI REALIZA EL ARREGLO,
                NO SE COBRA LA REVISIÓN, SOLO EL VALOR DEL ARREGLO.”</i>
              </div>
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="px-4 py-2 rounded border w-full sm:w-auto uppercase"
                style={{ borderColor: COLORS.border }}
                onClick={() => { setOpenForm(false); resetForm(); }}
              >
                CANCELAR
              </button>
              <button
                className="px-5 py-2.5 rounded-lg font-semibold w-full sm:w-auto uppercase"
                style={{
                  color: "#001014",
                  background: "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                  boxShadow: "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
                }}
                onClick={onCreate}
              >
                CREAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}