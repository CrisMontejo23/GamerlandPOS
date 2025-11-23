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
  quote?: number | null;
  total?: number | null;
  deposit?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;

  // 👇 ya estaba
  informedCustomer?: boolean;

  // 👇 NUEVO: marca si esta orden es de garantía y referencia opcional
  isWarranty?: boolean;
  parentId?: number | null;
};

type WorkPayment = {
  id: number;
  amount: number;
  method: PayMethod;
  note?: string | null;
  createdAt: string;
  createdBy?: string | null;
};

type WorkItem = {
  id: number;
  workOrderId: number;
  label: string; // NOMBRE DEL PRODUCTO (CONTROL, CONSOLA, ETC.)
  done: boolean;
  price?: number | null; // 👈 valor del arreglo de ESTE producto
  detail?: string | null; // 👈 descripción específica del producto
  createdAt: string;
  updatedAt: string;
};

const COLORS = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  cyan: "#00FFFF",
  pink: "#FF00FF",
  text: "#E5E5E5",
};

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

// AnyRow incluye los nuevos campos (por ser Partial<WorkOrder>)
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
    deposit: toNum(r.deposit ?? 0),
    notes: r.notes ?? null,
    createdAt: r.createdAt ?? new Date().toISOString(),
    updatedAt: r.updatedAt ?? new Date().toISOString(),

    informedCustomer: !!r.informedCustomer,
    isWarranty: !!r.isWarranty,
    parentId: typeof r.parentId === "number" ? r.parentId : null,
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
  informedCustomer?: boolean;

  // 👇 NUEVO: campos que podemos mandar al backend para garantías
  isWarranty?: boolean;
  parentId?: number | null;

  // 👇 NUEVO: solo se usa al CREAR (garantía) para reusar el mismo código
  code?: string;
};

const PAGE_SIZE = 5;

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

  const [visibleByStatus, setVisibleByStatus] = useState<
    Record<WorkStatus, number>
  >({
    RECEIVED: PAGE_SIZE,
    IN_PROGRESS: PAGE_SIZE,
    FINISHED: PAGE_SIZE,
    DELIVERED: PAGE_SIZE,
  });

  // Crear
  const [openForm, setOpenForm] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [newLocation, setNewLocation] = useState<WorkLocation>("LOCAL");
  const [hasQuote, setHasQuote] = useState<"YES" | "NO">("NO");
  const [quoteValue, setQuoteValue] = useState<string>("");
  const [hasDeposit, setHasDeposit] = useState<"YES" | "NO">("NO");
  const [depositValue, setDepositValue] = useState<string>("");
  const [depositMethod, setDepositMethod] = useState<PayMethod>("EFECTIVO");

  // PRODUCTOS RECIBIDOS (dinámicos)
  type ProductRow = { id: number; label: string; description: string };

  const [productRows, setProductRows] = useState<ProductRow[]>([
    { id: Date.now(), label: "", description: "" }, // fila mínima
  ]);

  const [productsCountByWork, setProductsCountByWork] = useState<
    Record<number, number>
  >({});

  // Modal gamer para valor del arreglo de un producto
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productModalTargetWork, setProductModalTargetWork] =
    useState<WorkOrder | null>(null);
  const [productModalTargetItem, setProductModalTargetItem] =
    useState<WorkItem | null>(null);
  const [productModalPrice, setProductModalPrice] = useState<string>("");
  const [productModalDetail, setProductModalDetail] = useState<string>("");

  // Finalizar (solo se usa cuando NO hay cotización)
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [finishAmount, setFinishAmount] = useState<string>("");
  const [finishTarget, setFinishTarget] = useState<WorkOrder | null>(null);
  const [finishUseExtra, setFinishUseExtra] = useState<"NO" | "YES">("NO");
  const [finishExtraDescription, setFinishExtraDescription] = useState("");
  const [finishExtraValue, setFinishExtraValue] = useState("");

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

  // === Modal GARANTÍA ===
  const [warrantyModalOpen, setWarrantyModalOpen] = useState(false);
  const [warrantyTarget, setWarrantyTarget] = useState<WorkOrder | null>(null);
  const [warrantyDescription, setWarrantyDescription] = useState("");

  // Historial de abonos
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentsTarget, setPaymentsTarget] = useState<WorkOrder | null>(null);
  const [payments, setPayments] = useState<WorkPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentMethod, setNewPaymentMethod] =
    useState<PayMethod>("EFECTIVO");
  const [newPaymentNote, setNewPaymentNote] = useState("");

  // === CHECKLIST POR TRABAJO ===
  const [itemsByWork, setItemsByWork] = useState<Record<number, WorkItem[]>>(
    {}
  );
  const [itemsLoading, setItemsLoading] = useState<Record<number, boolean>>({});
  const [itemsError, setItemsError] = useState<
    Record<number, string | undefined>
  >({});
  const [newItemLabelByWork, setNewItemLabelByWork] = useState<
    Record<number, string>
  >({});
  const [openChecklist, setOpenChecklist] = useState<Record<number, boolean>>(
    {}
  );

  function addProductRow() {
    setProductRows((prev) => [
      ...prev,
      { id: Date.now(), label: "", description: "" },
    ]);
  }

  function updateProductRow(
    id: number,
    field: "label" | "description",
    value: string
  ) {
    setProductRows((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, [field]: value.toUpperCase() } : row
      )
    );
  }

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
    setCustomerName("");
    setCustomerPhone("");
    setNewLocation("LOCAL");
    setHasQuote("NO");
    setQuoteValue("");
    setHasDeposit("NO");
    setDepositValue("");
    setDepositMethod("EFECTIVO");

    // resetear productos recibidos: mínimo una fila vacía
    setProductRows([{ id: Date.now(), label: "", description: "" }]);
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
  function resetWarrantyModal() {
    setWarrantyModalOpen(false);
    setWarrantyTarget(null);
    setWarrantyDescription("");
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

  useEffect(() => {
    // cada vez que cambies de pestaña, reinicia el contador de items por columna
    setVisibleByStatus({
      RECEIVED: PAGE_SIZE,
      IN_PROGRESS: PAGE_SIZE,
      FINISHED: PAGE_SIZE,
      DELIVERED: PAGE_SIZE,
    });
  }, [status]);

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
      const e = (await r.json().catch(() => ({}))) as { error?: string };
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

    const msgToSend = buildStatusMsg(w, newStatus);
    openWhatsApp(w.customerPhone, msgToSend);
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
      const e = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg(
        "ERROR: " +
          UDATA((e as { error?: string })?.error || "NO SE PUDO ELIMINAR")
      );
      setTimeout(() => setMsg(""), 2500);
    }
  };

  // FINALIZAR: si hay cotización -> finalizar directo con saldo; si no, modal
  // FINALIZAR: siempre abre modal con opción de ajuste final
  const openFinish = (w: WorkOrder) => {
    setFinishTarget(w);

    if (w.quote != null) {
      setFinishAmount(String(Number(w.quote)));
    } else if (w.total != null) {
      setFinishAmount(String(Number(w.total)));
    } else {
      setFinishAmount("");
    }

    setFinishUseExtra("NO");
    setFinishExtraDescription("");
    setFinishExtraValue("");
    setFinishModalOpen(true);
  };

  const confirmFinish = async () => {
    if (!finishTarget) return;
    const w = finishTarget;
    const dep = Number(w.deposit || 0);

    // SIN info adicional: usa cotización/saldo o valor manual
    if (finishUseExtra === "NO") {
      let totalValue: number;

      if (w.quote != null) {
        const quoteNum = Number(w.quote);
        if (!Number.isFinite(quoteNum) || quoteNum < 0) {
          setMsg("COTIZACIÓN INVÁLIDA");
          setTimeout(() => setMsg(""), 2200);
          return;
        }
        totalValue = Math.max(quoteNum - dep, 0);
      } else {
        const val = Number(finishAmount);
        if (!Number.isFinite(val) || val < 0) {
          setMsg("VALOR INVÁLIDO");
          setTimeout(() => setMsg(""), 2000);
          return;
        }
        totalValue = val;
      }

      const ok = await update(w.id, {
        status: "FINISHED",
        total: totalValue,
      });
      if (!ok) return;

      const wForMsg: WorkOrder = {
        ...w,
        status: "FINISHED",
        total: totalValue,
      };

      openWhatsApp(w.customerPhone, buildStatusMsg(wForMsg, "FINISHED"));

      setFinishModalOpen(false);
      setFinishTarget(null);
      setFinishAmount("");
      await load();
      return;
    }

    // CON ajuste de descripción / valor
    const extraValNum = Number(finishExtraValue || finishAmount);
    if (!Number.isFinite(extraValNum) || extraValNum < 0) {
      setMsg("VALOR FINAL INVÁLIDO");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    const finalDesc =
      finishExtraDescription.trim() !== ""
        ? finishExtraDescription
        : w.description;

    const newQuote = extraValNum;
    const saldo = Math.max(newQuote - dep, 0);

    const ok = await update(w.id, {
      status: "FINISHED",
      description: finalDesc,
      quote: newQuote,
      quotation: newQuote,
      total: saldo,
    });
    if (!ok) return;

    const wForMsg: WorkOrder = {
      ...w,
      status: "FINISHED",
      description: finalDesc,
      quote: newQuote,
      total: saldo,
    };

    openWhatsApp(w.customerPhone, buildStatusMsg(wForMsg, "FINISHED"));

    setFinishModalOpen(false);
    setFinishTarget(null);
    setFinishAmount("");
    setFinishExtraDescription("");
    setFinishExtraValue("");
    await load();
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

    const qNum = Number(editQuoteValue);
    if (!Number.isFinite(qNum) || qNum <= 0) {
      setMsg("COTIZACIÓN INVÁLIDA");
      setTimeout(() => setMsg(""), 2200);
      return;
    }
    const ok = await update(editQDTarget.id, { quotation: qNum, quote: qNum });
    if (ok === false) return;

    // 2) (Opcional) Registrar abono como pago real
    if (editHasDeposit === "YES") {
      const dNum = Number(editDepositValue);
      if (!Number.isFinite(dNum) || dNum < 0 || dNum > qNum) {
        setMsg("ABONO INVÁLIDO (≥ 0 y ≤ cotización)");
        setTimeout(() => setMsg(""), 2200);
        return;
      }
      const pr = await apiFetch(`/works/${editQDTarget.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: dNum,
          method: editDepositMethod,
          note: editDepositNote,
          createdBy: username || undefined,
        }),
      });
      if (!pr.ok) {
        const e = (await pr.json().catch(() => ({}))) as { error?: string };
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

  async function openPaymentsModal(w: WorkOrder) {
    setPaymentsTarget(w);
    setPaymentsOpen(true);
    setPayments([]);
    setPaymentsLoading(true);
    setNewPaymentAmount("");
    setNewPaymentMethod("EFECTIVO");
    setNewPaymentNote("");

    try {
      const r = await apiFetch(`/works/${w.id}/payments`);
      if (!r.ok) throw new Error();
      const data = (await r.json()) as WorkPayment[];
      setPayments(data);
    } catch {
      setMsg("NO SE PUDIERON CARGAR LOS ABONOS");
      setTimeout(() => setMsg(""), 2200);
    } finally {
      setPaymentsLoading(false);
    }
  }

  async function addPaymentFromModal() {
    if (!paymentsTarget) return;
    const amount = Number(newPaymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMsg("ABONO INVÁLIDO");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    try {
      const r = await apiFetch(`/works/${paymentsTarget.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          method: newPaymentMethod,
          note: newPaymentNote,
          createdBy: username || undefined,
        }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        setMsg("ERROR AL REGISTRAR ABONO: " + UDATA(e?.error || ""));
        setTimeout(() => setMsg(""), 2500);
        return;
      }

      const created = (await r.json().catch(() => null)) as WorkPayment | null;
      if (created) {
        // lo ponemos al inicio (ya que el back ordena DESC por createdAt)
        setPayments((prev) => [created, ...prev]);
      }

      setNewPaymentAmount("");
      setNewPaymentNote("");
      setMsg("ABONO REGISTRADO ✅");
      setTimeout(() => setMsg(""), 1800);
      await load(); // para refrescar depósito en las tarjetas
    } catch {
      setMsg("ERROR AL REGISTRAR ABONO");
      setTimeout(() => setMsg(""), 2500);
    }
  }

  async function deletePayment(paymentId: number) {
    if (!canDelete) return;
    if (!paymentsTarget) return;
    if (!confirm("¿ELIMINAR ESTE ABONO? ESTA ACCIÓN ES PERMANENTE.")) return;

    try {
      const r = await apiFetch(
        `/works/${paymentsTarget.id}/payments/${paymentId}`,
        { method: "DELETE" }
      );
      if (!r.ok) throw new Error();

      setPayments((prev) => prev.filter((p) => p.id !== paymentId));
      setMsg("ABONO ELIMINADO ✅");
      setTimeout(() => setMsg(""), 1800);
      await load();
    } catch {
      setMsg("ERROR: NO SE PUDO ELIMINAR EL ABONO");
      setTimeout(() => setMsg(""), 2500);
    }
  }

  // ===== CHECKLIST HELPERS =====
  async function loadWorkItems(workId: number) {
    setItemsLoading((prev) => ({ ...prev, [workId]: true }));
    try {
      const r = await apiFetch(`/works/${workId}/items`);
      if (!r.ok) throw new Error();
      const data = (await r.json()) as WorkItem[];
      setItemsByWork((prev) => ({ ...prev, [workId]: data }));
      setProductsCountByWork((prev) => ({ ...prev, [workId]: data.length }));
      setItemsError((prev) => ({ ...prev, [workId]: undefined }));
    } catch {
      setItemsError((prev) => ({
        ...prev,
        [workId]: "NO SE PUDIERON CARGAR LAS TAREAS",
      }));
    } finally {
      setItemsLoading((prev) => ({ ...prev, [workId]: false }));
    }
  }

  async function addWorkItem(workId: number) {
    const label = (newItemLabelByWork[workId] || "").trim();
    if (!label) {
      setMsg("ESCRIBE LA TAREA ANTES DE AGREGARLA");
      setTimeout(() => setMsg(""), 2000);
      return;
    }

    try {
      const r = await apiFetch(`/works/${workId}/items`, {
        method: "POST",
        body: JSON.stringify({ label }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        setMsg("ERROR AL CREAR TAREA: " + UDATA(e?.error || ""));
        setTimeout(() => setMsg(""), 2200);
        return;
      }
      const created = (await r.json()) as WorkItem;
      setItemsByWork((prev) => ({
        ...prev,
        [workId]: prev[workId] ? [...prev[workId], created] : [created],
      }));
      setProductsCountByWork((prev) => ({
        ...prev,
        [workId]: (prev[workId] || 0) + 1,
      }));
      setNewItemLabelByWork((prev) => ({ ...prev, [workId]: "" }));
    } catch {
      setMsg("ERROR AL CREAR TAREA");
      setTimeout(() => setMsg(""), 2200);
    }
  }

  async function toggleWorkItem(w: WorkOrder, item: WorkItem) {
    const nextDone = !item.done;

    // Si lo desmarcan, solo actualizamos "done" y no enviamos mensaje
    if (!nextDone) {
      try {
        const r = await apiFetch(`/works/${w.id}/items/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ done: false }),
        });
        if (!r.ok) throw new Error();

        setItemsByWork((prev) => ({
          ...prev,
          [w.id]: (prev[w.id] || []).map((it) =>
            it.id === item.id ? { ...it, done: false } : it
          ),
        }));
      } catch {
        setMsg("ERROR AL ACTUALIZAR PRODUCTO");
        setTimeout(() => setMsg(""), 2200);
      }
      return;
    }

    // Lo vamos a marcar como LISTO → abrir modal gamer
    setProductModalTargetWork(w);
    setProductModalTargetItem(item);
    setProductModalPrice(item.price != null ? String(item.price) : "");
    setProductModalDetail(item.detail ?? "");
    setProductModalOpen(true);
  }

  async function confirmProductModal() {
    if (!productModalTargetWork || !productModalTargetItem) return;

    const w = productModalTargetWork;
    const item = productModalTargetItem;

    const precioNum = Number(productModalPrice);
    if (!Number.isFinite(precioNum) || precioNum < 0) {
      setMsg("VALOR DEL PRODUCTO INVÁLIDO");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    const detalleStr =
      productModalDetail.trim() === "" ? null : productModalDetail.trim();

    try {
      const r = await apiFetch(`/works/${w.id}/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          done: true,
          price: precioNum,
          detail: detalleStr ?? item.detail ?? null,
        }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        setMsg("ERROR AL ACTUALIZAR PRODUCTO: " + UDATA(e?.error || ""));
        setTimeout(() => setMsg(""), 2200);
        return;
      }

      // Actualizar en memoria y obtener lista actualizada
      let updatedItems: WorkItem[] = [];
      setItemsByWork((prev) => {
        const current = prev[w.id] || [];
        updatedItems = current.map((it) =>
          it.id === item.id
            ? {
                ...it,
                done: true,
                price: precioNum,
                detail: detalleStr ?? it.detail,
              }
            : it
        );
        return { ...prev, [w.id]: updatedItems };
      });
      setProductsCountByWork((prev) => ({
        ...prev,
        [w.id]: updatedItems.length,
      }));

      const pending = updatedItems.filter((it) => !it.done);

      if (pending.length === 0) {
        // 👉 ESTE ERA EL ÚLTIMO PRODUCTO: FINALIZAR TRABAJO Y ENVIAR MENSAJE GLOBAL
        const totalProducts = updatedItems.reduce((sum, it) => {
          const p = it.price != null ? Number(it.price) : 0;
          return Number.isFinite(p) ? sum + p : sum;
        }, 0);

        const depAll = Number(w.deposit || 0);
        const saldo = Math.max(totalProducts - depAll, 0);

        const okUpdate = await update(w.id, {
          status: "FINISHED",
          total: saldo,
        });
        if (okUpdate) {
          const msgAll = buildAllProductsDoneMsg(
            { ...w, status: "FINISHED", total: saldo },
            updatedItems,
            totalProducts,
            depAll,
            saldo
          );
          openWhatsApp(w.customerPhone, msgAll);
        }
      } else {
        // 👉 Todavía hay productos pendientes: mensaje SOLO de este producto
        const pendingNames = pending.map((it) => it.label);

        const msgToSend = buildProductDoneMsg(
          w,
          {
            ...item,
            price: precioNum,
            detail: detalleStr ?? item.detail,
          },
          precioNum,
          pendingNames
        );

        openWhatsApp(w.customerPhone, msgToSend);
      }

      // recargar trabajos para reflejar el TOTAL recalculado / actualizado
      await load();

      // cerrar modal
      setProductModalOpen(false);
      setProductModalTargetWork(null);
      setProductModalTargetItem(null);
      setProductModalPrice("");
      setProductModalDetail("");
    } catch {
      setMsg("ERROR AL ACTUALIZAR PRODUCTO");
      setTimeout(() => setMsg(""), 2200);
    }
  }

  async function markInformedAndNotify(w: WorkOrder) {
    // Traemos los productos para poder enumerarlos
    const items = await fetchItemsForMsg(w.id);

    // Si ya está marcado, solo reenviamos el mensaje
    if (w.informedCustomer) {
      openWhatsApp(w.customerPhone, buildReceivedMsg(w, items));
      return;
    }

    const ok = await update(w.id, { informedCustomer: true });
    if (!ok) return;

    await load();
    openWhatsApp(w.customerPhone, buildReceivedMsg(w, items));
  }

  const tabs: Array<{ key: WorkStatus | ""; label: string }> = [
    { key: "", label: "TODOS" },
    { key: "RECEIVED", label: "RECIBIDOS" },
    { key: "IN_PROGRESS", label: "EN PROCESO" },
    { key: "FINISHED", label: "FINALIZADOS" },
    { key: "DELIVERED", label: "ENTREGADOS" },
  ];

  async function fetchItemsForMsg(workId: number): Promise<WorkItem[]> {
    try {
      const r = await apiFetch(`/works/${workId}/items`);
      if (!r.ok) throw new Error();
      const data = (await r.json()) as WorkItem[];
      setItemsByWork((prev) => ({ ...prev, [workId]: data }));
      setProductsCountByWork((prev) => ({ ...prev, [workId]: data.length }));
      return data;
    } catch {
      return itemsByWork[workId] || [];
    }
  }

  // ===== WhatsApp helpers =====
  function onlyDigits(s: string) {
    return (s || "").replace(/\D+/g, "");
  }
  function normalizeCOPhone(raw: string) {
    const d = onlyDigits(raw);
    if (d.startsWith("57")) return d;
    if (d.length === 10) return "57" + d;
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

  function buildProductDoneMsg(
    w: WorkOrder,
    item: WorkItem,
    price: number,
    pendingNames: string[]
  ) {
    const depAll = Number(w.deposit || 0); // suma de abonos ya calculada en el back

    const lineas: string[] = [
      `Hola ${UU(w.customerName)} 🎮`,
      `El producto "${UU(item.label)}" de tu trabajo ${UU(
        w.code
      )} ya está LISTO. ✅`,
    ];

    if (item.detail) {
      lineas.push(`Se le hizo: ${UU(item.detail)}.`);
    }

    lineas.push(
      `Precio del arreglo de este producto: ${toCOP(price)}.`,
      `Abonos registrados a tu trabajo: ${toCOP(depAll)}.`
    );

    if (pendingNames.length > 0) {
      lineas.push(
        `Aún falta por terminar: ${pendingNames
          .map((n) => `"${UU(n)}"`)
          .join(", ")}.`
      );
    } else {
      lineas.push(
        `Este era el último producto de tu trabajo. ¡Gracias por confiar en Gamerland!`
      );
    }

    return lineas.join("\n");
  }

  function buildAllProductsDoneMsg(
    w: WorkOrder,
    items: WorkItem[],
    totalProducts: number,
    depAll: number,
    saldo: number
  ) {
    const lineas: string[] = [
      `Hola ${UU(w.customerName)} 🎮`,
      `¡Todos los productos de tu trabajo ${UU(w.code)} están LISTOS! ✅`,
      `Se trabajó sobre:`,
    ];

    items.forEach((it, idx) => {
      const partes: string[] = [`${idx + 1}. ${UU(it.label)}`];
      if (it.detail) partes.push(`Trabajo: ${UU(it.detail)}`);
      if (typeof it.price === "number")
        partes.push(`Valor: ${toCOP(it.price)}`);
      lineas.push(partes.join(" — "));
    });

    lineas.push(
      ``,
      `Total arreglos: ${toCOP(totalProducts)}.`,
      `Abonos registrados: ${toCOP(depAll)}.`,
      `Saldo a pagar: ${toCOP(saldo)}.`,
      `Puedes pasar por tus productos en horario de atención. ¡Gracias por elegir Gamerland!`
    );

    return lineas.join("\n");
  }

  function openWhatsApp(phone: string, text: string) {
    const num = normalizeCOPhone(phone);
    const url = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function buildReceivedMsg(w: WorkOrder, items?: WorkItem[]) {
    const dep = Number(w.deposit || 0);
    const quote = Number(w.quote ?? 0);
    const saldo = Math.max(quote - dep, 0);

    const productos = items && items.length > 0 ? items : undefined;

    // Mensaje especial si es garantía
    if (w.isWarranty) {
      const lineasGarantia: string[] = [
        `Hola ${UU(w.customerName)} 🎮`,
        `Tu equipo ${UU(w.code)} fue recibido POR GARANTÍA. 🛠️`,
      ];

      if (productos) {
        lineasGarantia.push(`Se recibió:`);
        productos.forEach((it, idx) => {
          lineasGarantia.push(`${idx + 1}. ${UU(it.label)}`);
        });
      } else {
        lineasGarantia.push(
          `Equipo: ${UU(w.item)} 🕹️`,
          `Descripción: ${UU(w.description)}`
        );
      }

      lineasGarantia.push(
        `Este servicio NO genera cobro adicional por el mismo daño reportado.`,
        `Si se detecta un daño diferente te informaremos antes de hacer cualquier cobro.`,
        `Gracias por confiar en Gamerland.`
      );
      return lineasGarantia.join("\n");
    }

    const partes: string[] = [
      `Hola ${UU(w.customerName)} 🎮`,
      `Tu trabajo ${UU(w.code)} fue RECIBIDO.`,
    ];

    if (productos) {
      partes.push(`Se recibió:`);
      productos.forEach((it, idx) => {
        partes.push(`${idx + 1}. ${UU(it.label)}`);
      });
    } else {
      partes.push(
        `Equipo: ${UU(w.item)} 🕹️`,
        `Descripción: ${UU(w.description)}`
      );
    }

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

    if (newStatus === "IN_PROGRESS") {
      return [
        `Hola ${UU(w.customerName)} 🎮`,
        `Tu trabajo ${base} ha entrado EN PROCESO. 👨‍🔧`,
        `Cuando esté FINALIZADO te enviaremos otro mensaje para que puedas pasar a recoger tu equipo.`,
      ].join("\n");
    }

    if (newStatus === "FINISHED") {
      const lineas: string[] = [];
      lineas.push(
        `Hola ${UU(w.customerName)} 🎮`,
        w.isWarranty
          ? `Tu trabajo ${base} (GARANTÍA) está FINALIZADO. ✅`
          : `Tu trabajo ${base} está FINALIZADO. ✅`
      );

      lineas.push(`Descripción del trabajo: ${UU(w.description)}`);

      if (!w.isWarranty && quoteNum != null) {
        lineas.push(
          `Cotización: ${toCOP(quoteNum)}`,
          `Abono: ${toCOP(dep)}`,
          `Saldo: ${toCOP(saldo ?? 0)}`
        );
      }

      if (w.isWarranty) {
        lineas.push(
          `Servicio en garantía SIN costo adicional por el mismo daño reportado.`
        );
      }

      lineas.push(
        `Puedes pasar por tu equipo en horario de atención. ¡Gracias por elegir Gamerland!`
      );
      return lineas.join("\n");
    }

    if (newStatus === "DELIVERED") {
      if (w.isWarranty) {
        return [
          `Hola ${UU(w.customerName)} 🎮`,
          `Tu equipo ${base} fue ENTREGADO por garantía. ✅`,
          `Recuerda: este servicio NO tuvo costo adicional.`,
          `Si vuelve a presentar fallas, contáctanos para ayudarte.`,
        ].join("\n");
      }
      return `${base} ENTREGADO. ✅ Recuerda: para cualquier garantía avísanos con tiempo para gestionarla.`;
    }

    return `${base} ahora está ${niceStatus[newStatus]}`;
  }

  // ====== Ordenar trabajos por fecha (NUEVO: recientes primero) ======
  const sortedRows = [...rows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // sortedRows ya está ordenado de más nuevo a más viejo
  const latestByCode = new Map<string, WorkOrder>();

  for (const w of sortedRows) {
    if (!latestByCode.has(w.code)) {
      latestByCode.set(w.code, w); // primera vez que vemos ese code = más reciente
    }
  }

  const boardRows = Array.from(latestByCode.values());

  const statusOrder: WorkStatus[] = [
    "RECEIVED",
    "IN_PROGRESS",
    "FINISHED",
    "DELIVERED",
  ];

  const visibleStatuses: WorkStatus[] = status === "" ? statusOrder : [status];

  function openWarranty(w: WorkOrder) {
    setWarrantyTarget(w);
    setWarrantyDescription(
      `GARANTÍA: ${UU(w.description || "REVISIÓN GARANTÍA")}`
    );
    setWarrantyModalOpen(true);
  }

  async function createWarrantyOrder() {
    if (!warrantyTarget) return;

    const desc =
      warrantyDescription.trim() ||
      `GARANTÍA: ${UU(warrantyTarget.description)}`;

    const payload: Patch = {
      // 👇 Reutilizamos el mismo código del trabajo original
      code: warrantyTarget.code,

      item: UDATA(warrantyTarget.item),
      description: UDATA(desc),
      customerName: UDATA(warrantyTarget.customerName),
      customerPhone: UDATA(warrantyTarget.customerPhone),
      //location: warrantyTarget.location,
      quotation: null,
      quote: null,
      isWarranty: true,
      parentId: warrantyTarget.id,
    };

    const r = await apiFetch("/works", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (r.ok) {
      setMsg("ORDEN POR GARANTÍA CREADA ✅");
      resetWarrantyModal();
      await load();
    } else {
      const e = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg(
        "ERROR: " + UDATA(e?.error || "NO SE PUDO CREAR LA ORDEN DE GARANTÍA")
      );
      setTimeout(() => setMsg(""), 2500);
    }
  }

  const renderWorkCard = (w: WorkOrder) => {
    const s = STATUS_STYLES[w.status] ?? STATUS_STYLES.RECEIVED;
    const delivered = w.status === "DELIVERED";
    const dep = Number(w.deposit || 0);
    const quote = Number(w.quote ?? 0);
    const saldo = Math.max(quote - dep, 0);
    const productsCount =
      productsCountByWork[w.id] ?? itemsByWork[w.id]?.length ?? 0;

    return (
      <article
        key={w.id}
        className={`rounded-xl p-4 space-y-2 border ${s.card}`}
        style={{ backgroundColor: COLORS.bgCard }}
      >
        <header className="flex items-center justify-between">
          <div className="font-semibold text-cyan-300 uppercase">
            {UU(w.code)}
            {w.isWarranty && (
              <span className="ml-2 inline-block text-xs px-2 py-0.5 rounded bg-pink-200 text-pink-800">
                GARANTÍA
              </span>
            )}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${s.badge} uppercase`}>
            {niceStatus[w.status]}
          </span>
        </header>

        <div className="text-sm text-gray-300 space-y-1">
          <div>
            <b>INGRESO:</b> {fmt(w.createdAt)}
          </div>
          <div>
            <b># PRODUCTOS:</b> {productsCount || "—"}
          </div>
        </div>

        {/* CHECKLIST DE TAREAS */}
        <section className="mt-2 pt-2 border-t border-white/10">
          {(() => {
            const checklistOpen = openChecklist[w.id] ?? false;
            const items = itemsByWork[w.id] || [];
            const loadingItems = itemsLoading[w.id];
            const errorItems = itemsError[w.id];
            const draft = newItemLabelByWork[w.id] || "";

            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase text-gray-300">
                  <span className="font-semibold">PRODUCTOS / CHECKLIST</span>
                  <button
                    className="px-2 py-0.5 rounded border text-[11px]"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => {
                      const next = !checklistOpen;
                      setOpenChecklist((prev) => ({ ...prev, [w.id]: next }));
                      if (next && !itemsByWork[w.id] && !itemsLoading[w.id]) {
                        // carga perezosa
                        loadWorkItems(w.id);
                      }
                    }}
                  >
                    {checklistOpen ? "OCULTAR" : "VER"}
                  </button>
                </div>

                {checklistOpen && (
                  <div className="space-y-2">
                    {/* Input para nueva tarea */}
                    <div className="flex gap-2 items-center">
                      <input
                        className="flex-1 rounded px-2 py-1 text-[11px] text-gray-100 uppercase"
                        style={{
                          backgroundColor: COLORS.input,
                          border: `1px solid ${COLORS.border}`,
                        }}
                        placeholder="AGREGAR PRODUCTO (EJ: CONTROL, CONSOLA, CABLE HDMI...)"
                        value={draft}
                        onChange={(e) =>
                          setNewItemLabelByWork((prev) => ({
                            ...prev,
                            [w.id]: UU(e.target.value),
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addWorkItem(w.id);
                          }
                        }}
                      />
                      <button
                        className="px-3 py-1 rounded text-[11px] font-semibold uppercase"
                        style={{
                          color: "#001014",
                          background:
                            "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                        }}
                        onClick={() => addWorkItem(w.id)}
                      >
                        + PRODUCTO
                      </button>
                    </div>

                    {loadingItems && (
                      <div className="text-[11px] text-gray-400">
                        CARGANDO PRODUCTOS…
                      </div>
                    )}

                    {errorItems && (
                      <div className="text-[11px] text-pink-300">
                        {errorItems}
                      </div>
                    )}

                    {!loadingItems && items.length === 0 && !errorItems && (
                      <div className="text-[11px] text-gray-400">
                        Sin productos registrados. Agrega el primero arriba.
                      </div>
                    )}

                    {items.length > 0 && (
                      <ul className="space-y-1 max-h-36 overflow-y-auto pr-1">
                        {items.map((it) => (
                          <li
                            key={it.id}
                            className="flex items-center gap-2 text-[11px] text-gray-200"
                          >
                            <input
                              type="checkbox"
                              className="h-3 w-3 accent-cyan-400"
                              checked={it.done}
                              onChange={() => toggleWorkItem(w, it)}
                            />
                            <span
                              className={
                                it.done
                                  ? "line-through text-gray-500"
                                  : "text-gray-200"
                              }
                            >
                              {UU(it.label)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </section>

        <div className="text-sm uppercase mt-2 space-y-1">
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

          {/* 👇 NUEVO: total acumulado por productos mientras aún no está finalizado/entregado */}
          {w.total != null &&
            Number(w.total) > 0 &&
            w.status !== "FINISHED" &&
            w.status !== "DELIVERED" && (
              <div className="text-cyan-300">
                <b>ACUMULADO ARREGLOS:</b> $
                {Number(w.total).toLocaleString("es-CO")}
              </div>
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
                {!w.informedCustomer && (
                  <button
                    className="px-3 py-1 rounded border text-xs uppercase"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => markInformedAndNotify(w)}
                  >
                    INFORMAR AL CLIENTE
                  </button>
                )}

                {/* EN PROCESO SOLO DESPUÉS DE INFORMAR AL CLIENTE */}
                {w.informedCustomer && (
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

            <button
              className="px-3 py-1 rounded border text-xs uppercase"
              style={{ borderColor: COLORS.border }}
              onClick={() => openPaymentsModal(w)}
              title="Ver historial de abonos"
            >
              ABONOS
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

        {delivered && (
          <div className="flex flex-wrap gap-2 pt-2">
            {/* Botón GARANTÍA disponible para cualquier rol */}
            <button
              className="px-3 py-1 rounded border text-xs uppercase"
              style={{ borderColor: COLORS.border }}
              onClick={() => openWarranty(w)}
              title="Ver historial y crear nueva orden por garantía"
            >
              GARANTÍA
            </button>

            <button
              className="px-3 py-1 rounded border text-xs uppercase"
              style={{ borderColor: COLORS.border }}
              onClick={() => openPaymentsModal(w)}
              title="Ver historial de abonos"
            >
              ABONOS
            </button>

            {canDelete && (
              <button
                className="px-3 py-1 rounded border text-xs text-pink-400 uppercase"
                style={{ borderColor: COLORS.border }}
                onClick={() => onDelete(w.id)}
                title="Eliminar definitivamente este trabajo (ADMIN)"
              >
                ELIMINAR
              </button>
            )}
          </div>
        )}
      </article>
    );
  };

  // ===== Historial para el modal de garantía =====
  const warrantyHistory: WorkOrder[] =
    warrantyTarget == null
      ? []
      : [...rows]
          .filter((w) => w.code === warrantyTarget.code)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

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
              const colRowsAll = boardRows.filter((w) => w.status === st);
              const limit = visibleByStatus[st] ?? PAGE_SIZE;
              const colRows = colRowsAll.slice(0, limit);
              const hasMore = colRowsAll.length > limit;

              return (
                <div key={st} className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                    {niceStatus[st]}
                    <span className="ml-1 text-xs text-gray-400">
                      ({colRowsAll.length})
                    </span>
                  </h2>

                  <div className="space-y-3">
                    {!loading && colRowsAll.length === 0 && (
                      <div className="text-xs text-gray-500">Sin trabajos</div>
                    )}

                    {colRows.map((w) => renderWorkCard(w))}

                    {hasMore && (
                      <button
                        className="mt-1 px-3 py-1 rounded border text-xs uppercase"
                        style={{ borderColor: COLORS.border }}
                        onClick={() =>
                          setVisibleByStatus((prev) => ({
                            ...prev,
                            [st]: (prev[st] ?? PAGE_SIZE) + PAGE_SIZE,
                          }))
                        }
                      >
                        MOSTRAR MÁS
                      </button>
                    )}
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
              {/* PRODUCTOS RECIBIDOS */}
              <div className="md:col-span-2 space-y-2 mt-2">
                <span className="text-sm font-semibold uppercase">
                  PRODUCTOS RECIBIDOS
                </span>

                {productRows.map((row, index) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap gap-2 items-center"
                  >
                    {/* QUÉ SE RECIBE */}
                    <input
                      value={row.label}
                      onChange={(e) =>
                        updateProductRow(row.id, "label", e.target.value)
                      }
                      placeholder="QUÉ SE RECIBE (EJ: CONTROL, CONSOLA...)"
                      className="flex-1 min-w-[160px] rounded px-3 py-2 text-gray-100 uppercase text-xs"
                      style={{
                        backgroundColor: COLORS.input,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    />

                    {/* DESCRIPCIÓN */}
                    <input
                      value={row.description}
                      onChange={(e) =>
                        updateProductRow(row.id, "description", e.target.value)
                      }
                      placeholder="DESCRIPCIÓN (COLOR, ESTADO, DETALLE...)"
                      className="flex-1 min-w-[160px] rounded px-3 py-2 text-gray-100 uppercase text-xs"
                      style={{
                        backgroundColor: COLORS.input,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    />

                    {/* + PRODUCTO solo en la última fila */}
                    {index === productRows.length - 1 && (
                      <button
                        className="px-3 py-2 rounded text-[11px] font-semibold uppercase"
                        style={{
                          color: "#001014",
                          background:
                            "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                          boxShadow:
                            "0 0 12px rgba(0,255,255,.25), 0 0 20px rgba(255,0,255,.25)",
                        }}
                        onClick={addProductRow}
                      >
                        + PRODUCTO
                      </button>
                    )}
                  </div>
                ))}

                {productRows.length === 0 && (
                  <p className="text-[11px] text-gray-400 uppercase">
                    Sin productos registrados. Agrega el primero arriba.
                  </p>
                )}
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
                  if (!customerName.trim() || !customerPhone.trim()) {
                    setMsg("FALTAN CAMPOS OBLIGATORIOS");
                    setTimeout(() => setMsg(""), 2200);
                    return;
                  }

                  // validar productos recibidos (al menos 1 con label, filas vacías permitidas)
                  const nonEmptyProducts = productRows.filter((p) =>
                    p.label.trim()
                  );

                  if (nonEmptyProducts.length === 0) {
                    setMsg("AGREGA AL MENOS UN PRODUCTO (QUÉ SE RECIBE)");
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

                  const firstProduct = productRows[0];
                  const mainItemLabel = firstProduct?.label || "PRODUCTO";
                  const mainDescription =
                    firstProduct?.description ||
                    firstProduct?.label ||
                    "SIN DESCRIPCIÓN";

                  const payload: Patch = {
                    item: UDATA(mainItemLabel), // EQUIPO = primer producto
                    description: UDATA(mainDescription), // se arma a partir del producto
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

                    if (created && typeof created.id === "number") {
                      const workId = created.id;

                      // 👇 crear productos iniciales (SOLO los que tienen label)
                      const nonEmptyProducts = productRows.filter((p) =>
                        p.label.trim()
                      );
                      setProductsCountByWork((prev) => ({
                        ...prev,
                        [workId]: nonEmptyProducts.length,
                      }));
                      if (nonEmptyProducts.length > 0) {
                        await Promise.all(
                          nonEmptyProducts.map((p) => {
                            const fullLabel = p.description
                              ? `${UDATA(p.label)} — ${UDATA(p.description)}`
                              : UDATA(p.label);
                            return apiFetch(`/works/${workId}/items`, {
                              method: "POST",
                              body: JSON.stringify({ label: fullLabel }),
                            }).catch(() => null);
                          })
                        );
                      }

                      // 👇 abono inicial, igual que ya tenías
                      if (depositNum > 0) {
                        await apiFetch(`/works/${workId}/payments`, {
                          method: "POST",
                          body: JSON.stringify({
                            amount: depositNum,
                            method: depositMethod,
                            note: "ABONO INICIAL",
                            createdBy: username || undefined,
                          }),
                        }).catch(() => null);
                      }
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

            <div className="mt-3">
              <label className="block text-sm mb-1 uppercase">
                ¿AGREGAR DESCRIPCIÓN / VALOR FINAL?
              </label>
              <select
                className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                }}
                value={finishUseExtra}
                onChange={(e) =>
                  setFinishUseExtra(e.target.value as "YES" | "NO")
                }
              >
                <option value="NO">NO</option>
                <option value="YES">SÍ</option>
              </select>
            </div>

            {finishUseExtra === "YES" && (
              <div className="grid grid-cols-1 gap-3 mt-2">
                <div>
                  <label className="block text-sm mb-1 uppercase">
                    DESCRIPCIÓN FINAL DEL TRABAJO
                  </label>
                  <input
                    className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                    style={{
                      backgroundColor: COLORS.input,
                      border: `1px solid ${COLORS.border}`,
                    }}
                    value={finishExtraDescription}
                    onChange={(e) =>
                      setFinishExtraDescription(UU(e.target.value))
                    }
                    placeholder="EJ: CAMBIO DE DISCO Y FORMATEO, REPARACIÓN EXTRA, ETC."
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 uppercase">
                    VALOR FINAL (SOBREESCRIBE LA COTIZACIÓN)
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
                    value={finishExtraValue}
                    onChange={(e) => setFinishExtraValue(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
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

      {/* Modal GARANTÍA */}
      {warrantyModalOpen && warrantyTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-2xl rounded-xl p-4 space-y-3"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="warranty-title"
          >
            <h3
              id="warranty-title"
              className="text-lg font-semibold text-cyan-300 uppercase"
            >
              GARANTÍA — {UU(warrantyTarget.code)}
            </h3>

            <div className="text-sm text-gray-200 uppercase space-y-1">
              <div>
                <b>EQUIPO:</b> {UU(warrantyTarget.item)}
              </div>
              <div>
                <b>ÚLTIMO TRABAJO:</b> {UU(warrantyTarget.description)}
              </div>
              <div>
                <b>CLIENTE:</b> {UU(warrantyTarget.customerName)} •{" "}
                {UU(warrantyTarget.customerPhone)}
              </div>
              <div>
                <b>FECHA ENTREGA (ÚLTIMA):</b> {fmt(warrantyTarget.updatedAt)}
              </div>
              <div>
                <b>VALOR PAGADO:</b>{" "}
                {warrantyTarget.total != null
                  ? toCOP(warrantyTarget.total)
                  : "—"}
              </div>
            </div>

            <div className="mt-2">
              <h4 className="text-xs font-semibold text-gray-300 uppercase">
                Historial de trabajos de este código
              </h4>
              <div
                className="mt-1 max-h-40 overflow-y-auto text-xs text-gray-300 border border-dashed rounded p-2"
                style={{ borderColor: COLORS.border }}
              >
                {warrantyHistory.length === 0 && (
                  <div>Sin otros registros para este código.</div>
                )}
                {warrantyHistory.map((h) => (
                  <div
                    key={h.id}
                    className="flex justify-between border-b border-white/10 py-1 last:border-b-0"
                  >
                    <div className="pr-2">
                      <div>
                        <b>{niceStatus[h.status]}</b>
                        {h.isWarranty && " · GARANTÍA"}
                      </div>
                      <div>{fmt(h.createdAt)}</div>
                    </div>
                    <div className="text-right">
                      <div>{UU(h.description)}</div>
                      <div className="text-[11px] text-gray-400">
                        Total: {h.total != null ? toCOP(h.total) : "—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <h4 className="text-xs font-semibold text-gray-300 uppercase">
                Crear nueva orden por GARANTÍA
              </h4>
              <p className="text-[11px] text-gray-400 mb-1">
                Esta nueva orden se creará SIN cotización ni abono, marcada como
                garantía para este mismo código.
              </p>
              <input
                className="w-full rounded px-3 py-2 text-gray-100 uppercase text-xs"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                }}
                value={warrantyDescription}
                onChange={(e) => setWarrantyDescription(UU(e.target.value))}
                placeholder="GARANTÍA: DESCRIPCIÓN DEL NUEVO PROBLEMA / REVISIÓN"
              />
            </div>

            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="px-4 py-2 rounded border w-full sm:w-auto uppercase text-xs"
                style={{ borderColor: COLORS.border }}
                onClick={resetWarrantyModal}
              >
                CERRAR
              </button>
              <button
                className="px-5 py-2.5 rounded-lg font-semibold w-full sm:w-auto uppercase text-xs"
                style={{
                  color: "#001014",
                  background:
                    "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                  boxShadow:
                    "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
                }}
                onClick={createWarrantyOrder}
              >
                CREAR ORDEN DE GARANTÍA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal VALOR ARREGLO PRODUCTO (gamer) */}
      {productModalOpen && productModalTargetWork && productModalTargetItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-md rounded-xl p-4 space-y-3"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-price-title"
          >
            <h3
              id="product-price-title"
              className="text-lg font-semibold text-cyan-300 uppercase"
            >
              VALOR DEL ARREGLO
            </h3>

            <p className="text-xs text-gray-300 uppercase">
              Trabajo {UU(productModalTargetWork.code)} • Producto:{" "}
              <b>{UU(productModalTargetItem.label)}</b>
            </p>

            <div className="space-y-2">
              <div>
                <label className="block text-sm mb-1 uppercase">
                  Valor del arreglo de este producto *
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
                  value={productModalPrice}
                  onChange={(e) => setProductModalPrice(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm mb-1 uppercase">
                  Descripción / trabajo realizado
                </label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase text-xs"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={productModalDetail}
                  onChange={(e) => setProductModalDetail(UU(e.target.value))}
                  placeholder="CAMBIO DE PIEZAS / SOLDADURA / LIMPIEZA..."
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-1">
              <button
                className="px-4 py-2 rounded border w-full sm:w-auto uppercase text-xs"
                style={{ borderColor: COLORS.border }}
                onClick={() => {
                  setProductModalOpen(false);
                  setProductModalTargetWork(null);
                  setProductModalTargetItem(null);
                  setProductModalPrice("");
                  setProductModalDetail("");
                }}
              >
                CANCELAR
              </button>
              <button
                className="px-5 py-2.5 rounded-lg font-semibold w-full sm:w-auto uppercase text-xs"
                style={{
                  color: "#001014",
                  background:
                    "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                  boxShadow:
                    "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
                }}
                onClick={confirmProductModal}
              >
                GUARDAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ABONOS */}
      {paymentsOpen && paymentsTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-xl rounded-xl p-4 space-y-3"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payments-title"
          >
            <h3
              id="payments-title"
              className="text-lg font-semibold text-cyan-300 uppercase"
            >
              ABONOS — {UU(paymentsTarget.code)}
            </h3>

            {/* Formulario para nuevo abono */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block mb-1 uppercase">VALOR ABONO</label>
                <input
                  type="number"
                  min={0}
                  step="1"
                  className="w-full rounded px-2 py-1 text-gray-100"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={newPaymentAmount}
                  onChange={(e) => setNewPaymentAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block mb-1 uppercase">MÉTODO</label>
                <select
                  className="w-full rounded px-2 py-1 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={newPaymentMethod}
                  onChange={(e) =>
                    setNewPaymentMethod(e.target.value as PayMethod)
                  }
                >
                  <option value="EFECTIVO">EFECTIVO</option>
                  <option value="QR_LLAVE">QR_LLAVE</option>
                  <option value="DATAFONO">DATAFONO</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="block mb-1 uppercase">NOTA (opcional)</label>
                <input
                  className="w-full rounded px-2 py-1 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={newPaymentNote}
                  onChange={(e) => setNewPaymentNote(UU(e.target.value))}
                  placeholder="ABONO A COTIZACIÓN / ACEPTACIÓN / ..."
                />
              </div>
              <div className="md:col-span-3 flex justify-end">
                <button
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold uppercase"
                  style={{
                    color: "#001014",
                    background:
                      "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                    boxShadow:
                      "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
                  }}
                  onClick={addPaymentFromModal}
                >
                  REGISTRAR ABONO
                </button>
              </div>
            </div>

            <hr className="border-white/10" />

            {paymentsLoading && (
              <div className="text-sm text-gray-300">CARGANDO ABONOS…</div>
            )}

            {!paymentsLoading && payments.length === 0 && (
              <div className="text-sm text-gray-400">
                Este trabajo no tiene abonos registrados.
              </div>
            )}

            {!paymentsLoading && payments.length > 0 && (
              <div className="max-h-64 overflow-y-auto text-sm">
                <table className="w-full text-xs">
                  <thead className="text-gray-400 border-b border-white/10">
                    <tr>
                      <th className="text-left py-1 pr-2">FECHA</th>
                      <th className="text-right py-1 pr-2">VALOR</th>
                      <th className="text-left py-1 pr-2">MÉTODO</th>
                      <th className="text-left py-1 pr-2">NOTA</th>
                      <th className="text-left py-1">USUARIO</th>
                      {canDelete && (
                        <th className="py-1 text-right">ACCIONES</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-white/5 last:border-b-0"
                      >
                        <td className="py-1 pr-2">{fmt(p.createdAt)}</td>
                        <td className="py-1 pr-2 text-right">
                          {toCOP(p.amount)}
                        </td>
                        <td className="py-1 pr-2">{p.method}</td>
                        <td className="py-1 pr-2">
                          {p.note ? UU(p.note) : "—"}
                        </td>
                        <td className="py-1 pr-2">
                          {p.createdBy ? UU(p.createdBy) : "—"}
                        </td>
                        {canDelete && (
                          <td className="py-1 text-right">
                            <button
                              className="px-2 py-0.5 rounded border text-[11px] text-pink-400 uppercase"
                              style={{ borderColor: COLORS.border }}
                              onClick={() => deletePayment(p.id)}
                            >
                              ELIMINAR
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="px-4 py-2 rounded border w-full sm:w-auto uppercase text-xs"
                style={{ borderColor: COLORS.border }}
                onClick={() => {
                  setPaymentsOpen(false);
                  setPaymentsTarget(null);
                  setPayments([]);
                }}
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
