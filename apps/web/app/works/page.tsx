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

const niceStatus: Record<WorkStatus, string> = {
  RECEIVED: "Recibido",
  IN_PROGRESS: "En proceso",
  FINISHED: "Finalizado",
  DELIVERED: "Entregado",
};

// === NUEVO: estilos por estado (badge + borde tarjeta)
const STATUS_STYLES: Record<
  "RECEIVED" | "IN_PROGRESS" | "FINISHED" | "DELIVERED",
  { badge: string; card: string }
> = {
  RECEIVED:    { badge: "bg-amber-100 text-amber-800",    card: "border-amber-300" },
  IN_PROGRESS: { badge: "bg-blue-100 text-blue-800",       card: "border-blue-300" },
  FINISHED:    { badge: "bg-emerald-100 text-emerald-800", card: "border-emerald-300" },
  DELIVERED:   { badge: "bg-gray-200 text-gray-700",       card: "border-gray-300 opacity-85" },
};

// === NUEVO: formateador de fecha para “Ingresó”
function fmt(d: string | Date) {
  const date = new Date(d);
  return date.toLocaleString(); // si prefieres solo fecha: toLocaleDateString()
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
      if (q.trim()) p.set("q", q.trim());
      const r = await apiFetch(`/works?${p.toString()}`);
      const data: WorkOrder[] = await r.json();
      setRows(data);
    } catch {
      setMsg("No se pudieron cargar los trabajos");
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
      setMsg("Faltan campos obligatorios");
      setTimeout(() => setMsg(""), 2200);
      return;
    }
    const payload = {
      item,
      description,
      customerName,
      customerPhone,
      reviewPaid,
      location: newLocation,
    };
    const r = await apiFetch("/works", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      setMsg("Trabajo creado ✅");
      resetForm();
      setOpenForm(false);
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg("Error: " + (e?.error || "No se pudo crear"));
      setTimeout(() => setMsg(""), 2500);
    }
  };

  const update = async (id: number, patch: Partial<WorkOrder>) => {
    const r = await apiFetch(`/works/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (r.ok) {
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg("Error: " + (e?.error || "No se pudo actualizar"));
      setTimeout(() => setMsg(""), 2500);
    }
  };

  const onDelete = async (id: number) => {
    if (!canDelete) return;
    if (!confirm("¿Eliminar este trabajo? Esta acción es permanente.")) return;
    const r = await apiFetch(`/works/${id}`, { method: "DELETE" });
    if (r.ok) {
      setMsg("Trabajo eliminado ✅");
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg("Error: " + (e?.error || "No se pudo eliminar"));
      setTimeout(() => setMsg(""), 2500);
    }
  };

  const tabs: Array<{ key: WorkStatus | ""; label: string }> = [
    { key: "", label: "Todos" },
    { key: "RECEIVED", label: "Recibidos" },
    { key: "IN_PROGRESS", label: "En proceso" },
    { key: "FINISHED", label: "Finalizados" },
    { key: "DELIVERED", label: "Entregados" },
  ];

  return (
    <div className="max-w-6xl mx-auto text-gray-200 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-cyan-400">Trabajos</h1>
        <div className="flex gap-2">
          <select
            className="rounded px-3 py-2 text-gray-100"
            style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
            value={location}
            onChange={(e) => setLocation(e.target.value as WorkLocation | "")}
          >
            <option value="">Ubicación: Todas</option>
            <option value="LOCAL">En local</option>
            <option value="BOGOTA">En Bogotá</option>
          </select>
          <input
            placeholder="Buscar por código, cliente, equipo..."
            className="rounded px-3 py-2 w-64 text-gray-100"
            style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <button
            onClick={load}
            className="px-4 py-2 rounded-lg font-semibold"
            style={{
              color: "#001014",
              background: "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
              boxShadow: "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
            }}
          >
            Buscar
          </button>
          <button
            onClick={() => setOpenForm(true)}
            className="px-4 py-2 rounded border"
            style={{ borderColor: COLORS.border }}
          >
            + Nuevo trabajo
          </button>
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
        className="rounded-lg p-3 text-sm"
        style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}
      >
        💡 <b>Revisión $20.000:</b> si el cliente <b>acepta el arreglo</b>, la revisión <b>no se cobra</b>.
        Marca <b>“Pagó revisión”</b> para recordarlo al cerrar el caso.
      </div>

      {!!msg && <div className="text-sm text-cyan-300">{msg}</div>}

      {/* Lista de tarjetas */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && <div className="col-span-full text-gray-400">Cargando…</div>}
        {!loading && rows.length === 0 && <div className="col-span-full text-gray-400">No hay trabajos</div>}

        {rows.map((w) => {
          const s = STATUS_STYLES[w.status] ?? STATUS_STYLES.RECEIVED;
          return (
            <article
              key={w.id}
              className={`rounded-xl p-4 space-y-2 border ${s.card}`}
              style={{ backgroundColor: COLORS.bgCard }}
            >
              <header className="flex items-center justify-between">
                <div className="font-semibold text-cyan-300">{w.code}</div>
                <span className={`text-xs px-2 py-0.5 rounded ${s.badge}`}>
                  {niceStatus[w.status]}
                </span>
              </header>

              <div className="text-sm text-gray-300">
                {/* NUEVO: Fecha de ingreso */}
                <div><b>Ingresó:</b> {fmt(w.createdAt)}</div>
                <div><b>Ubicación:</b> {w.location === "LOCAL" ? "En local" : "En Bogotá"}</div>
              </div>

              <div className="text-sm">
                <div><b>Equipo:</b> {w.item}</div>
                <div><b>Descripción:</b> {w.description}</div>
                <div><b>Cliente:</b> {w.customerName} • {w.customerPhone}</div>
                <div><b>Revisión:</b> {w.reviewPaid ? "Pagada ($20.000)" : "Pendiente"}</div>

                {w.quote != null && (
                  <div><b>Cotización:</b> ${Number(w.quote).toLocaleString("es-CO")}</div>
                )}
                {w.total != null && (
                  <div><b>Total final:</b> ${Number(w.total).toLocaleString("es-CO")}</div>
                )}
                {!!w.notes && (
                  <div><b>Notas:</b> {w.notes}</div>
                )}
              </div>

              {/* Acciones rápidas */}
              <div className="flex flex-wrap gap-2 pt-2">
                {w.status !== "RECEIVED" && (
                  <button
                    className="px-3 py-1 rounded border text-xs"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => update(w.id, { status: "RECEIVED" })}
                  >
                    Recibido
                  </button>
                )}
                {w.status !== "IN_PROGRESS" && (
                  <button
                    className="px-3 py-1 rounded border text-xs"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => update(w.id, { status: "IN_PROGRESS" })}
                  >
                    En proceso
                  </button>
                )}
                {w.status !== "FINISHED" && (
                  <button
                    className="px-3 py-1 rounded border text-xs"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => update(w.id, { status: "FINISHED" })}
                  >
                    Finalizado
                  </button>
                )}
                {w.status !== "DELIVERED" && (
                  <button
                    className="px-3 py-1 rounded border text-xs"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => update(w.id, { status: "DELIVERED" })}
                  >
                    Entregado
                  </button>
                )}

                {/* Toggle ubicación */}
                <button
                  className="px-3 py-1 rounded border text-xs"
                  style={{ borderColor: COLORS.border }}
                  onClick={() =>
                    update(w.id, { location: w.location === "LOCAL" ? "BOGOTA" : "LOCAL" })
                  }
                >
                  {w.location === "LOCAL" ? "→ Bogotá" : "→ Local"}
                </button>

                {/* Toggle revisión pagada */}
                <button
                  className="px-3 py-1 rounded border text-xs"
                  style={{ borderColor: COLORS.border }}
                  onClick={() => update(w.id, { reviewPaid: !w.reviewPaid })}
                >
                  {w.reviewPaid ? "Quitar revisión pagada" : "Marcar revisión pagada"}
                </button>

                {/* Eliminar (solo ADMIN) */}
                {canDelete && (
                  <button
                    className="px-3 py-1 rounded border text-xs text-pink-400"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => onDelete(w.id)}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {/* Modal Crear */}
      {openForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div
            className="w-full max-w-xl rounded-xl p-4"
            style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-lg font-semibold text-cyan-300 mb-3">Nuevo trabajo</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">¿Qué se recibe? *</label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100"
                  style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                  placeholder="Ej: Xbox 360, Control"
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Ubicación *</label>
                <select
                  className="w-full rounded px-3 py-2 text-gray-100"
                  style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value as WorkLocation)}
                >
                  <option value="LOCAL">En local</option>
                  <option value="BOGOTA">En Bogotá</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm mb-1">Descripción del caso *</label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100"
                  style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                  placeholder="No prende / mantenimiento / actualización / joystick derecho..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Nombre cliente *</label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100"
                  style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">WhatsApp cliente *</label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100"
                  style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <input
                  id="rev"
                  type="checkbox"
                  checked={reviewPaid}
                  onChange={(e) => setReviewPaid(e.target.checked)}
                />
                <label htmlFor="rev" className="text-sm">Pagó revisión ($20.000)</label>
              </div>
              <div className="md:col-span-2 text-xs text-gray-300">
                💬 Se informa al cliente: <i>“La revisión tiene un costo de $20.000; si realiza el arreglo,
                no se cobra la revisión, solo el valor del arreglo.”</i>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded border"
                style={{ borderColor: COLORS.border }}
                onClick={() => { setOpenForm(false); resetForm(); }}
              >
                Cancelar
              </button>
              <button
                className="px-5 py-2.5 rounded-lg font-semibold"
                style={{
                  color: "#001014",
                  background: "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                  boxShadow: "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
                }}
                onClick={onCreate}
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}