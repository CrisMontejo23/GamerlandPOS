"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { apiFetch } from "../lib/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { StaticImageData } from "next/image";
import logo from "../../assets/logo.png";
import Image from "next/image";

type PayMethod = "EFECTIVO" | "QR_LLAVE" | "DATAFONO";
type ReservationStatus = "OPEN" | "CLOSED";
type ReservationKind = "ENCARGO" | "APARTADO";

type JsPDFWithAutoTable = jsPDF & {
  lastAutoTable?: { finalY: number };
};

type Product = {
  id: number;
  sku: string;
  name: string;
  price: number;
};

type ReservationItem = {
  id?: number; // cuando venga del back
  productId: number;
  sku?: string;
  name: string;
  unitPrice: number;
  qty: number;
};

type ReservationItemApi = Omit<ReservationItem, "unitPrice" | "qty"> & {
  unitPrice?: number | string | null;
  qty?: number | string | null;
  product?: { sku?: string | null; name?: string | null } | null;
};

type ReservationPayment = {
  id: number;
  amount: number;
  method: PayMethod;
  note?: string | null;
  createdAt: string;
  createdBy?: string | null;
};

type Reservation = {
  id: number;
  code: string;
  status: ReservationStatus;

  // ✅ nuevo
  kind: ReservationKind;
  pickupDate?: string | null; // solo encargo (fecha retiro)
  deliveredAt?: string | null; // si el back lo envía (entregado a tarjeta/tienda)

  customerName: string;
  customerPhone: string;
  city?: string | null;

  totalPrice: number;
  initialDeposit: number;
  totalPaid: number;

  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;

  items?: ReservationItem[];
};

type ReservationApi = Omit<
  Reservation,
  "totalPrice" | "initialDeposit" | "totalPaid" | "kind"
> & {
  kind?: ReservationKind | string | null;
  type?: ReservationKind | string | null;

  totalPrice: number | string | null;
  initialDeposit: number | string | null;
  totalPaid: number | string | null;

  pickupDate?: string | null;
  deliveredAt?: string | null;

  items?: ReservationItemApi[];
};

type ReservationPaymentApi = Omit<ReservationPayment, "amount"> & {
  amount: number | string | null;
};

type CreateReservationResponse =
  | ReservationApi
  | { reservation: ReservationApi }
  | { res: ReservationApi }
  | { lay: ReservationApi };

type CreatePaymentResponse =
  | { reservation: ReservationApi; payment: ReservationPaymentApi }
  | { layaway: ReservationApi; payment: ReservationPaymentApi }
  | { lay: ReservationApi; pay: ReservationPaymentApi }
  | { reservation: ReservationApi; pay: ReservationPaymentApi };

type ReservationItemRowApi = {
  id: number;
  reservationId: number;
  productId: number | null;
  productName?: string | null;
  skuSnapshot?: string | null;
  qty?: number | string | null;
  unitPrice?: number | string | null;
  discount?: number | string | null;
  totalLine?: number | string | null;
};

function pickReservationFromCreate(
  resp: CreateReservationResponse
): ReservationApi {
  if ("reservation" in resp) return resp.reservation;
  if ("res" in resp) return resp.res;
  if ("lay" in resp) return resp.lay;
  return resp; // cuando el back devuelve la reserva “plana”
}

function pickReservationFromPayment(
  resp: CreatePaymentResponse
): ReservationApi {
  if ("reservation" in resp) return resp.reservation;
  if ("layaway" in resp) return resp.layaway;
  return resp.lay;
}

function pickPaymentFromPayment(
  resp: CreatePaymentResponse
): ReservationPaymentApi {
  if ("payment" in resp) return resp.payment;
  return resp.pay;
}

const COLORS = { bgCard: "#14163A", border: "#1E1F4B", input: "#0F1030" };

const STATUS_LABEL: Record<ReservationStatus, string> = {
  OPEN: "ABIERTO",
  CLOSED: "CERRADO",
};

const KIND_LABEL: Record<ReservationKind, string> = {
  ENCARGO: "ENCARGO",
  APARTADO: "APARTADO",
};

const PaymentLabels: Record<PayMethod, string> = {
  EFECTIVO: "EFECTIVO",
  QR_LLAVE: "QR_LLAVE",
  DATAFONO: "DATAFONO",
};

const PAGE_SIZE = 5;

// ✅ API NUEVA
const RES_API = "/reservations";

const U = (s: unknown) =>
  (typeof s === "string" ? s.toUpperCase() : s) as string;

function toCOP(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function fmt(d: string | Date) {
  return new Date(d).toLocaleString("es-CO");
}

function onlyDateISO(d: string) {
  // para mostrar bonito si viene ISO
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("es-CO");
  } catch {
    return d;
  }
}

function normalizeReservation(raw: ReservationApi): Reservation {
  const items: ReservationItem[] = (raw.items ?? []).map(
    (it: ReservationItemApi) => ({
      id: it.id,
      productId: Number(it.productId),
      sku: it.sku ?? it.product?.sku ?? "",
      name: U(it.name ?? it.product?.name ?? ""),
      unitPrice: Number(it.unitPrice ?? 0),
      qty: Number(it.qty ?? 0),
    })
  );

  const kindRaw = String(raw.kind ?? raw.type ?? "APARTADO").toUpperCase();
  const kind: ReservationKind = kindRaw === "ENCARGO" ? "ENCARGO" : "APARTADO";

  return {
    ...raw,
    kind,
    pickupDate: raw.pickupDate ?? null,
    deliveredAt: raw.deliveredAt ?? null,
    totalPrice: Number(raw.totalPrice ?? 0),
    initialDeposit: Number(raw.initialDeposit ?? 0),
    totalPaid: Number(raw.totalPaid ?? 0),
    items,
  };
}

function normalizePayment(raw: ReservationPaymentApi): ReservationPayment {
  return { ...raw, amount: Number(raw.amount ?? 0) };
}

export default function LayawaysPage() {
  const { ready, role } = useAuth();

  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // ===== filtros =====
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | "">(
    "OPEN"
  );
  const [q, setQ] = useState("");

  // paginación por columna (ENCARGO/APARTADO)
  const [visibleByKind, setVisibleByKind] = useState<
    Record<ReservationKind, number>
  >({
    ENCARGO: PAGE_SIZE,
    APARTADO: PAGE_SIZE,
  });

  // ===== modal crear =====
  const [openForm, setOpenForm] = useState(false);

  // tipo
  const [kind, setKind] = useState<ReservationKind>("APARTADO");

  // encargo: fecha retiro obligatoria
  const [pickupDate, setPickupDate] = useState<string>("");

  // datos cliente
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [city, setCity] = useState("");

  // items UI
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const productSearchRef = useRef<HTMLDivElement | null>(null);
  const [draftQty, setDraftQty] = useState<string>("1");
  const [draftSelected, setDraftSelected] = useState<Product | null>(null);
  const [draftItems, setDraftItems] = useState<ReservationItem[]>([]);

  // pagos iniciales
  const [initialDeposit, setInitialDeposit] = useState<string>("");
  const [initialMethod, setInitialMethod] = useState<PayMethod>("EFECTIVO");

  // modal contrato obligatorio
  const [contractReservation, setContractReservation] =
    useState<Reservation | null>(null);

  // modal devolución
  const [refundReservation, setRefundReservation] =
    useState<Reservation | null>(null);

  // modal abonos
  const [paymentsOpenId, setPaymentsOpenId] = useState<number | null>(null);
  const [paymentsCache, setPaymentsCache] = useState<
    Record<number, ReservationPayment[]>
  >({});
  const [newPayAmount, setNewPayAmount] = useState<string>("");
  const [newPayMethod, setNewPayMethod] = useState<PayMethod>("EFECTIVO");
  const [newPayNote, setNewPayNote] = useState("");

  // confirm genérico
  const [confirmData, setConfirmData] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const openGamerConfirm = (cfg: {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void | Promise<void>;
  }) => setConfirmData(cfg);

  // ===== LOADERS =====
  const loadReservations = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (statusFilter) p.set("status", statusFilter);
      if (q.trim()) p.set("q", q.trim().toUpperCase());

      const r = await apiFetch(`${RES_API}?${p.toString()}`);
      const data = (await r.json()) as ReservationApi[];
      setRows(data.map(normalizeReservation));
    } catch {
      setMsg("NO SE PUDIERON CARGAR LOS REGISTROS");
      setTimeout(() => setMsg(""), 2200);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    loadReservations();
  }, [ready, statusFilter]);

  useEffect(() => {
    setVisibleByKind({ ENCARGO: PAGE_SIZE, APARTADO: PAGE_SIZE });
  }, [statusFilter]);

  // cerrar dropdown si clic afuera
  useEffect(() => {
    function handleClickOutside(ev: MouseEvent) {
      if (!productSearchRef.current) return;
      if (!productSearchRef.current.contains(ev.target as Node)) {
        setProductDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // buscar productos para el modal
  useEffect(() => {
    if (!ready) return;

    let abort = false;
    const run = async () => {
      const term = productSearch.trim();
      if (!term) {
        setProducts([]);
        return;
      }

      const params = new URLSearchParams();
      params.set("q", term.toUpperCase());
      params.set("withStock", "false");
      params.set("includeInactive", "false");
      params.set("pageSize", "50");

      try {
        const r = await apiFetch(`/products?${params.toString()}`);
        type ProductApiRow = {
          id: number;
          sku: string;
          name: string;
          price?: number | string | null;
        };
        const json = (await r.json()) as {
          total: number;
          rows: ProductApiRow[];
        };

        if (!abort) {
          const mapped: Product[] = json.rows.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            price: Number(p.price ?? 0),
          }));
          setProducts(mapped);
        }
      } catch {
        if (!abort) setProducts([]);
      }
    };

    const t = setTimeout(run, 200);
    return () => {
      abort = true;
      clearTimeout(t);
    };
  }, [ready, productSearch]);

  const filteredProducts = useMemo(() => products, [products]);

  // ===== ITEMS UI =====
  const itemsTotal = useMemo(() => {
    return draftItems.reduce((acc, it) => acc + it.unitPrice * it.qty, 0);
  }, [draftItems]);

  const resetForm = () => {
    setKind("APARTADO");
    setPickupDate("");
    setCustomerName("");
    setCustomerPhone("");
    setCity("");
    setInitialDeposit("");
    setInitialMethod("EFECTIVO");
    setProductSearch("");
    setProductDropdownOpen(false);
    setDraftSelected(null);
    setDraftQty("1");
    setDraftItems([]);
  };

  function handleSelectProduct(p: Product) {
    setDraftSelected(p);
    setProductSearch(`${p.sku} — ${p.name}`);
    setProductDropdownOpen(false);
  }

  function dateOnlyToIso(dateStr: string) {
    // dateStr = "YYYY-MM-DD"
    // lo mandamos como ISO para que Zod .datetime() lo acepte
    return new Date(`${dateStr}T00:00:00.000Z`).toISOString();
  }

  const addDraftItem = () => {
    if (!draftSelected) {
      setMsg("SELECCIONA UN PRODUCTO");
      setTimeout(() => setMsg(""), 2000);
      return;
    }
    const qty = Number(draftQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setMsg("CANTIDAD INVÁLIDA");
      setTimeout(() => setMsg(""), 2000);
      return;
    }

    setDraftItems((prev) => {
      const idx = prev.findIndex((x) => x.productId === draftSelected.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + qty };
        return copy;
      }
      return [
        ...prev,
        {
          productId: draftSelected.id,
          sku: draftSelected.sku,
          name: U(draftSelected.name),
          unitPrice: Number(draftSelected.price ?? 0),
          qty,
        },
      ];
    });

    setDraftSelected(null);
    setProductSearch("");
    setProducts([]);
    setDraftQty("1");
  };

  const removeDraftItem = (productId: number) => {
    setDraftItems((prev) => prev.filter((x) => x.productId !== productId));
  };

  const updateDraftQty = (productId: number, qtyStr: string) => {
    const qty = Number(qtyStr);
    setDraftItems((prev) =>
      prev.map((x) =>
        x.productId === productId
          ? { ...x, qty: Number.isFinite(qty) && qty > 0 ? qty : x.qty }
          : x
      )
    );
  };

  type ReservationCreateBody = {
    kind: ReservationKind;
    customerName: string;
    customerPhone: string;
    city?: string;
    initialDeposit: number;
    method: PayMethod;
    pickupDate?: string; // solo ENCARGO
    items: Array<{
      productId: number;
      qty: number;
      unitPrice: number;
      productName: string;
      discount?: number;
    }>;
  };

  // ===== CREAR (ENCARGO/APARTADO) =====
  const createReservation = async () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      setMsg("NOMBRE Y WHATSAPP SON OBLIGATORIOS");
      setTimeout(() => setMsg(""), 2200);
      return;
    }
    if (!draftItems.length) {
      setMsg("DEBES AGREGAR AL MENOS 1 ÍTEM");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    if (kind === "ENCARGO") {
      if (!pickupDate.trim()) {
        setMsg("FECHA DE RETIRO ES OBLIGATORIA PARA ENCARGO");
        setTimeout(() => setMsg(""), 2400);
        return;
      }
    }

    const depStr = initialDeposit.trim();
    const dep = depStr ? Number(depStr) : 0;

    if (!Number.isFinite(dep) || dep < 0) {
      setMsg("ABONO INICIAL INVÁLIDO");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    const total = draftItems.reduce((a, it) => a + it.unitPrice * it.qty, 0);
    if (dep > total + 0.01) {
      setMsg("EL ABONO INICIAL NO PUEDE SER MAYOR AL TOTAL");
      setTimeout(() => setMsg(""), 2400);
      return;
    }

    const body: ReservationCreateBody = {
      kind,
      customerName: customerName.trim().toUpperCase(),
      customerPhone: customerPhone.trim(),
      city: city.trim() ? city.trim().toUpperCase() : undefined,
      initialDeposit: dep,
      method: initialMethod,
      items: draftItems.map((it) => ({
        productId: it.productId,
        qty: it.qty,
        unitPrice: it.unitPrice,
        productName: it.name, // ✅
        discount: 0, // ✅ opcional, pero ayuda si el schema lo tiene
      })),
    };

    if (kind === "ENCARGO") {
      body.pickupDate = dateOnlyToIso(pickupDate);
    }

    const r = await apiFetch(RES_API, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const e = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg("ERROR: " + U(e?.error || "NO SE PUDO CREAR"));
      setTimeout(() => setMsg(""), 2500);
      return;
    }

    const result = (await r.json()) as CreateReservationResponse;
    const resvRaw = pickReservationFromCreate(result);
    const resvNorm = normalizeReservation(resvRaw);

    setMsg(`${KIND_LABEL[resvNorm.kind]} CREADO ✅`);
    setOpenForm(false);
    resetForm();
    await loadReservations();

    setContractReservation(resvNorm);
  };

  // ===== ABONOS =====
  const openPaymentsModal = async (resv: Reservation) => {
    setPaymentsOpenId(resv.id);
    setNewPayAmount("");
    setNewPayMethod("EFECTIVO");
    setNewPayNote("");

    if (!paymentsCache[resv.id]) {
      try {
        const r = await apiFetch(`${RES_API}/${resv.id}/payments`);
        const data = (await r.json()) as ReservationPaymentApi[];
        setPaymentsCache((prev) => ({
          ...prev,
          [resv.id]: data.map(normalizePayment),
        }));
      } catch {
        setMsg("NO SE PUDIERON CARGAR LOS ABONOS");
        setTimeout(() => setMsg(""), 2200);
      }
    }
  };

  const closePaymentsModal = () => {
    setPaymentsOpenId(null);
    setNewPayAmount("");
    setNewPayNote("");
  };

  const currentPayments = useMemo(() => {
    if (!paymentsOpenId) return [];
    return paymentsCache[paymentsOpenId] ?? [];
  }, [paymentsOpenId, paymentsCache]);

  const registerPayment = async () => {
    if (!paymentsOpenId) return;
    const dep = Number(newPayAmount);
    if (!Number.isFinite(dep) || dep <= 0) {
      setMsg("MONTO DE ABONO INVÁLIDO");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    const r = await apiFetch(`${RES_API}/${paymentsOpenId}/payments`, {
      method: "POST",
      body: JSON.stringify({
        amount: dep,
        method: newPayMethod,
        note: newPayNote || undefined,
      }),
    });

    if (!r.ok) {
      const e = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg("ERROR: " + U(e?.error || "NO SE PUDO REGISTRAR EL ABONO"));
      setTimeout(() => setMsg(""), 2500);
      return;
    }

    const result = (await r.json()) as CreatePaymentResponse;
    const updatedRaw = pickReservationFromPayment(result);
    const payRaw = pickPaymentFromPayment(result);

    const updated = normalizeReservation(updatedRaw);
    const pay = normalizePayment(payRaw);

    setPaymentsCache((prev) => ({
      ...prev,
      [updated.id]: [...(prev[updated.id] || []), pay],
    }));

    await loadReservations();
    generatePaymentReceiptPdf(updated, pay);

    setMsg("ABONO REGISTRADO ✅");
    setNewPayAmount("");
    setNewPayNote("");
  };

  const deletePayment = (p: ReservationPayment) => {
    if (!paymentsOpenId) return;

    openGamerConfirm({
      title: "ELIMINAR ABONO",
      message: `Vas a eliminar el abono de ${toCOP(
        p.amount
      )}. Esta acción no se puede deshacer.`,
      confirmLabel: "SÍ, ELIMINAR",
      cancelLabel: "NO, VOLVER",
      onConfirm: async () => {
        try {
          const r = await apiFetch(
            `${RES_API}/${paymentsOpenId}/payments/${p.id}`,
            { method: "DELETE" }
          );

          if (!r.ok) {
            const e = (await r.json().catch(() => ({}))) as { error?: string };
            setMsg("ERROR: " + U(e?.error || "NO SE PUDO ELIMINAR EL ABONO"));
            setTimeout(() => setMsg(""), 2500);
            return;
          }

          setPaymentsCache((prev) => ({
            ...prev,
            [paymentsOpenId]: (prev[paymentsOpenId] || []).filter(
              (x) => x.id !== p.id
            ),
          }));

          await loadReservations();

          setMsg("ABONO ELIMINADO ✅");
          setTimeout(() => setMsg(""), 2200);
        } catch {
          setMsg("ERROR: NO SE PUDO ELIMINAR EL ABONO");
          setTimeout(() => setMsg(""), 2500);
        } finally {
          setConfirmData(null);
        }
      },
    });
  };

  type PosPreloadItem = {
    productId: number;
    productName: string;
    price: number;
    qty: number;
  };

  type PosPreload =
    | {
        source: "ORDER" | "RESERVATION";
        reservationId: number;
        code: string;
        customerName: string;
        kind: ReservationKind;
        pickupDate?: string;
        items: PosPreloadItem[];
        // legacy fields opcionales si hay 1 item
        productId?: number;
        productName?: string;
        price?: number;
        qty?: number;
      }
    | {
        source: "RESERVATION_REFUND";
        reservationId: number;
        code: string;
        customerName: string;
        refundAmount: number;
        kind: ReservationKind;
      };

  // ===== FINALIZAR → POS =====
  const finalizeReservation = (resv: Reservation) => {
    openGamerConfirm({
      title: "FINALIZAR",
      message: `Vas a finalizar el ${KIND_LABEL[resv.kind]} ${
        resv.code
      } y pasar a POS para registrar la venta final.`,
      confirmLabel: "SÍ, FINALIZAR E IR A POS",
      cancelLabel: "CANCELAR",
      onConfirm: async () => {
        try {
          const r = await apiFetch(`${RES_API}/${resv.id}/close`, {
            method: "POST",
          });

          if (!r.ok) {
            const e = (await r.json().catch(() => ({}))) as { error?: string };
            setMsg("ERROR: " + U(e?.error || "NO SE PUDO CERRAR"));
            setTimeout(() => setMsg(""), 2500);
            return;
          }

          const items = resv.items ?? [];
          const first = items[0];

          try {
            const payload: PosPreload = {
              source: resv.kind === "ENCARGO" ? "ORDER" : "RESERVATION",
              reservationId: resv.id,
              code: resv.code,
              customerName: resv.customerName,
              kind: resv.kind,
              pickupDate: resv.pickupDate ?? undefined,
              items: items.map((it) => ({
                productId: it.productId,
                productName: it.name,
                price: it.unitPrice,
                qty: it.qty,
              })),
            };

            if (items.length === 1 && first) {
              payload.productId = first.productId;
              payload.productName = first.name;
              payload.price = first.unitPrice;
              payload.qty = first.qty;
            }

            window.localStorage.setItem("POS_PRELOAD", JSON.stringify(payload));
          } catch {
            /* ignore */
          }

          window.location.href = "/pos";
        } catch {
          setMsg("ERROR: NO SE PUDO CERRAR");
          setTimeout(() => setMsg(""), 2500);
        } finally {
          setConfirmData(null);
        }
      },
    });
  };

  // ===== ELIMINAR (ADMIN) =====
  const deleteReservation = (resv: Reservation) => {
    openGamerConfirm({
      title: "ELIMINAR",
      message: `¿Eliminar el ${KIND_LABEL[resv.kind]} ${
        resv.code
      } y todos sus abonos? Esta acción no se puede deshacer.`,
      confirmLabel: "SÍ, ELIMINAR TODO",
      cancelLabel: "CANCELAR",
      onConfirm: async () => {
        try {
          const r = await apiFetch(`${RES_API}/${resv.id}`, {
            method: "DELETE",
          });
          if (!r.ok) {
            const e = (await r.json().catch(() => ({}))) as { error?: string };
            setMsg("ERROR: " + U(e?.error || "NO SE PUDO ELIMINAR"));
            setTimeout(() => setMsg(""), 2500);
            return;
          }
          setMsg("REGISTRO ELIMINADO ✅");
          await loadReservations();
        } catch {
          setMsg("ERROR: NO SE PUDO ELIMINAR");
          setTimeout(() => setMsg(""), 2500);
        } finally {
          setConfirmData(null);
        }
      },
    });
  };

  // ===== DEVOLUCIÓN 50% =====
  const openRefundModal = (resv: Reservation) => setRefundReservation(resv);

  const confirmRefund = async () => {
    if (!refundReservation) return;

    const half = Math.round(refundReservation.totalPaid * 0.5);
    if (!Number.isFinite(half) || half <= 0) {
      setMsg("NO HAY ABONOS PARA DEVOLVER");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    try {
      const r = await apiFetch(`${RES_API}/${refundReservation.id}/close`, {
        method: "POST",
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        setMsg("ERROR: " + U(e?.error || "NO SE PUDO CERRAR"));
        setTimeout(() => setMsg(""), 2500);
        return;
      }

      try {
        const payload: PosPreload = {
          source: "RESERVATION_REFUND",
          reservationId: refundReservation.id,
          code: refundReservation.code,
          customerName: refundReservation.customerName,
          refundAmount: half,
          kind: refundReservation.kind,
        };

        window.localStorage.setItem("POS_PRELOAD", JSON.stringify(payload));
      } catch {
        /* ignore */
      }

      setRefundReservation(null);
      window.location.href = "/pos";
    } catch {
      setMsg("ERROR: NO SE PUDO PROCESAR LA DEVOLUCIÓN");
      setTimeout(() => setMsg(""), 2500);
    }
  };

  // ===== PDFs =====
  function generateContractPdf(resv: Reservation) {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "letter",
    }) as JsPDFWithAutoTable;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 15;
    const firmaY = pageHeight - 40;
    let y = 12;

    doc.setFillColor(5, 10, 40);
    doc.rect(0, 0, pageWidth, 24, "F");

    try {
      const imgSrc = (logo as StaticImageData).src;
      doc.addImage(imgSrc, "PNG", marginX, 3.5, 18, 18);
    } catch {}

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0, 255, 255);
    doc.text("GAMERLAND PC", pageWidth / 2, 9, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text("Facatativá, Cundinamarca", pageWidth / 2, 13, {
      align: "center",
    });
    doc.text("Carrera 3 #4-13 Local 1", pageWidth / 2, 16, { align: "center" });
    doc.text("NIT 1003511062-1", pageWidth / 2, 19, { align: "center" });

    doc.setDrawColor(0, 255, 255);
    doc.setLineWidth(0.4);
    doc.line(marginX, 26, pageWidth - marginX, 26);

    y = 31;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);

    const title =
      resv.kind === "ENCARGO"
        ? "CONTRATO DE ENCARGO"
        : "CONTRATO SISTEMA DE APARTADO";

    doc.text(title, pageWidth / 2, y, { align: "center" });

    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`Facatativá, ${fmt(resv.createdAt)}`, pageWidth / 2, y, {
      align: "center",
    });

    y += 5;

    const resumenBody: Array<[string, string]> = [
      ["TIPO", KIND_LABEL[resv.kind]],
      ["CÓDIGO", resv.code],
      ["CLIENTE", resv.customerName],
      ["WHATSAPP", resv.customerPhone],
      ["CIUDAD", resv.city || "NO REGISTRA"],
    ];

    if (resv.kind === "ENCARGO") {
      resumenBody.push([
        "FECHA DE RETIRO",
        resv.pickupDate ? onlyDateISO(resv.pickupDate) : "NO REGISTRA",
      ]);
      if (resv.deliveredAt) {
        resumenBody.push(["ENTREGADO", fmt(resv.deliveredAt)]);
      }
    }

    resumenBody.push(
      ["TOTAL OBJETIVO", toCOP(resv.totalPrice)],
      ["ABONO INICIAL", toCOP(resv.initialDeposit)],
      ["TOTAL ABONADO A LA FECHA", toCOP(resv.totalPaid)]
    );

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "grid",
      head: [["DATO", "VALOR"]],
      body: resumenBody,
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: [0, 255, 255], textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [245, 248, 255] },
    });

    y = (doc.lastAutoTable?.finalY ?? y) + 5;

    // tabla items
    const items = resv.items ?? [];
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "grid",
      head: [["ÍTEM", "CANT", "V. UNIT", "SUBTOTAL"]],
      body: items.map((it) => [
        it.name,
        String(it.qty),
        toCOP(it.unitPrice),
        toCOP(it.unitPrice * it.qty),
      ]),
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: [15, 16, 48], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 248, 255] },
    });

    y = (doc.lastAutoTable?.finalY ?? y) + 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    const maxWidth = pageWidth - marginX * 2;

    const writeParagraph = (text: string, extraSpace = 2) => {
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, marginX, y, { maxWidth, lineHeightFactor: 1.25 });
      y += lines.length * 3.4 + extraSpace;
    };
    const tituloClausula = (t: string) => {
      doc.setFont("helvetica", "bold");
      doc.text(t, marginX, y);
      y += 4;
      doc.setFont("helvetica", "normal");
    };

    writeParagraph(
      `Entre GAMERLAND PC (NIT 1003511062-1), en adelante "LA TIENDA", y el(la) cliente ${resv.customerName} (WhatsApp ${resv.customerPhone}), en adelante "EL CLIENTE", se celebra el presente contrato, regido por las siguientes cláusulas:`,
      4
    );

    tituloClausula("CLÁUSULA PRIMERA – OBJETO");
    writeParagraph(
      `El objeto del presente contrato es la ${
        resv.kind === "ENCARGO"
          ? "gestión de encargo y reserva"
          : "reserva (sistema de apartado)"
      } a favor de EL CLIENTE, de los ítems descritos en este documento, por un valor objetivo total de ${toCOP(
        resv.totalPrice
      )}.`
    );

    if (resv.kind === "ENCARGO") {
      tituloClausula("CLÁUSULA SEGUNDA – FECHA DE RETIRO (ENCARGO)");
      writeParagraph(
        `EL CLIENTE se compromete a recoger el encargo en la fecha pactada: ${
          resv.pickupDate ? onlyDateISO(resv.pickupDate) : "NO REGISTRA"
        }.`
      );

      tituloClausula("CLÁUSULA TERCERA – INCUMPLIMIENTO FECHA DE RETIRO");
      writeParagraph(
        `En caso de no recoger el encargo en la fecha establecida, a partir de ese momento el ENCARGO se entiende como un SISTEMA DE APARTADO y empezarán a regir, como mínimo, las siguientes condiciones del APARTADO:`,
        1
      );
      writeParagraph(`1. CANCELACIÓN / DEVOLUCIÓN.`, 0.5);
      writeParagraph(
        `2. ENTREGA (reclamo con mínimo una (1) semana de anticipación).`,
        2
      );
    }

    // ABONOS
    tituloClausula(
      `CLÁUSULA ${resv.kind === "ENCARGO" ? "CUARTA" : "SEGUNDA"} – ABONOS`
    );
    writeParagraph(
      `EL CLIENTE realiza un abono inicial de ${toCOP(
        resv.initialDeposit
      )}. Los abonos posteriores se irán registrando hasta completar el valor total.`
    );

    // CANCELACIÓN / DEVOLUCIÓN
    tituloClausula(
      `CLÁUSULA ${
        resv.kind === "ENCARGO" ? "QUINTA" : "TERCERA"
      } – CANCELACIÓN / DEVOLUCIÓN`
    );
    writeParagraph(
      `Si EL CLIENTE cancela, LA TIENDA devolverá únicamente el 50% del total abonado a la fecha. El 50% restante se entiende como compensación por costos administrativos, logísticos y comerciales.`
    );

    // ENTREGA -> SOLO PARA APARTADO
    if (resv.kind === "APARTADO") {
      tituloClausula("CLÁUSULA CUARTA – ENTREGA");
      writeParagraph(
        `Para reclamar los productos, EL CLIENTE deberá informar con mínimo una (1) semana de anticipación para garantizar disponibilidad.`
      );

      tituloClausula("CLÁUSULA QUINTA – ACEPTACIÓN");
      writeParagraph(
        `EL CLIENTE declara haber leído y aceptado este contrato.`,
        6
      );
    } else {
      // ENCARGO: termina en SEXTA – ACEPTACIÓN
      tituloClausula("CLÁUSULA SEXTA – ACEPTACIÓN");
      writeParagraph(
        `EL CLIENTE declara haber leído y aceptado este contrato.`,
        6
      );
    }

    if (y > firmaY - 15) y = firmaY - 15;

    doc.setDrawColor(0, 0, 0);
    doc.line(marginX, firmaY, marginX + 70, firmaY);
    doc.line(pageWidth - marginX - 70, firmaY, pageWidth - marginX, firmaY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("EL CLIENTE", marginX + 35, firmaY + 5, { align: "center" });
    doc.text("GAMERLAND PC", pageWidth - marginX - 35, firmaY + 5, {
      align: "center",
    });

    doc.save(`Contrato_${KIND_LABEL[resv.kind]}_${resv.code}.pdf`);
  }

  async function fetchReservationItems(
    reservationId: number
  ): Promise<ReservationItem[]> {
    const r = await apiFetch(`${RES_API}/${reservationId}/items`);
    if (!r.ok) throw new Error("No se pudieron cargar ítems");
    const data = (await r.json()) as ReservationItemRowApi[];

    return data.map((it) => ({
      id: it.id,
      productId: Number(it.productId ?? 0),
      sku: String(it.skuSnapshot ?? ""),
      name: U(it.productName ?? "ITEM"),
      unitPrice: Number(it.unitPrice ?? 0),
      qty: Number(it.qty ?? 0),
    }));
  }

  async function printContractSafe(resv: Reservation) {
    const hasItems = (resv.items?.length ?? 0) > 0;

    // Si no hay items (o vienen vacíos), los pedimos al endpoint /items
    if (!hasItems) {
      try {
        const items = await fetchReservationItems(resv.id);
        generateContractPdf({ ...resv, items });
        return;
      } catch {
        // si falla, imprimimos igual (pero al menos no revienta)
      }
    }

    generateContractPdf(resv);
  }

  function generatePaymentReceiptPdf(
    resv: Reservation,
    payment: ReservationPayment
  ) {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "letter",
    }) as JsPDFWithAutoTable;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 10;
    const usableHeight = pageHeight / 2 - 10;

    let y = 8;

    doc.setFillColor(5, 10, 40);
    doc.rect(0, 0, pageWidth, 20, "F");

    try {
      const imgSrc = (logo as StaticImageData).src;
      doc.addImage(imgSrc, "PNG", marginX, 3.5, 18, 18);
    } catch {}

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 255, 255);
    doc.text(
      `RECIBO DE ABONO – ${resv.kind === "ENCARGO" ? "ENCARGO" : "APARTADO"}`,
      pageWidth / 2,
      9,
      { align: "center" }
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text("GAMERLAND PC", pageWidth / 2, 13, { align: "center" });

    doc.setDrawColor(0, 255, 255);
    doc.setLineWidth(0.4);
    doc.line(marginX, 26, pageWidth - marginX, 26);

    y = 32;
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);

    doc.text(`${KIND_LABEL[resv.kind]}: ${resv.code}`, marginX, y);
    y += 4;
    doc.text(`Cliente: ${resv.customerName}`, marginX, y);
    y += 4;
    doc.text(`WhatsApp: ${resv.customerPhone}`, marginX, y);
    y += 5;

    const saldo = resv.totalPrice - resv.totalPaid;

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "grid",
      head: [["CONCEPTO", "VALOR"]],
      body: [
        ["Fecha del abono", fmt(payment.createdAt)],
        ["Método de pago", PaymentLabels[payment.method]],
        ["Valor del abono", toCOP(payment.amount)],
        ["Total abonado a la fecha", toCOP(resv.totalPaid)],
        ["Saldo pendiente", toCOP(saldo)],
      ],
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [0, 255, 255], textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [245, 248, 255] },
    });

    y = (doc.lastAutoTable?.finalY ?? y) + 4;

    if (y < usableHeight - 16) {
      doc.setFontSize(7.5);
      doc.setTextColor(80, 80, 80);
      const notaLines = doc.splitTextToSize(
        `Este comprobante acredita el abono realizado al registro indicado. La suma abonada hace parte del valor total y se rige por las condiciones establecidas en el contrato.`,
        pageWidth - marginX * 2
      );
      doc.text(notaLines, marginX, y, {
        maxWidth: pageWidth - marginX * 2,
        lineHeightFactor: 1.35,
      });
      y += notaLines.length * 3.5 + 4;
    }

    doc.setTextColor(0, 0, 0);
    const firmaY = Math.min(usableHeight - 10, y + 6);
    doc.setDrawColor(0, 0, 0);
    doc.line(marginX, firmaY, marginX + 60, firmaY);
    doc.setFontSize(8);
    doc.text("Firma recibido cliente", marginX + 30, firmaY + 4, {
      align: "center",
    });

    doc.save(`Recibo_Abono_${KIND_LABEL[resv.kind]}_${resv.code}.pdf`);
  }

  // ===== RENDER helpers =====
  const sortedRows = useMemo(() => {
    return [...rows].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [rows]);

  const getCardItemsLabel = (resv: Reservation) => {
    const its = resv.items ?? [];
    if (its.length === 0) return "—";
    if (its.length === 1) return `${its[0].name} (x${its[0].qty})`;
    const first = its[0];
    return `${first.name} (x${first.qty}) + ${its.length - 1} más`;
  };

  const kinds: ReservationKind[] = ["ENCARGO", "APARTADO"];

  return (
    <div className="max-w-6xl mx-auto text-gray-200 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-cyan-400">
          ENCARGOS / SISTEMAS DE APARTADO
        </h1>

        <div className="flex flex-col w-full gap-2 sm:flex-row sm:w-auto sm:items-center">
          <select
            className="rounded px-3 py-2 text-gray-100 w-full sm:w-auto uppercase"
            style={{
              backgroundColor: COLORS.input,
              border: `1px solid ${COLORS.border}`,
            }}
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter((e.target.value as ReservationStatus | "") || "")
            }
          >
            <option value="">TODOS</option>
            <option value="OPEN">ABIERTOS</option>
            <option value="CLOSED">CERRADOS</option>
          </select>

          <input
            placeholder="BUSCAR POR CÓDIGO, CLIENTE..."
            className="rounded px-3 py-2 text-gray-100 w-full sm:w-72 uppercase"
            style={{
              backgroundColor: COLORS.input,
              border: `1px solid ${COLORS.border}`,
            }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadReservations()}
          />

          <div className="flex gap-2">
            <button
              onClick={loadReservations}
              className="px-4 py-2 rounded-lg font-semibold w-full sm:w-auto uppercase"
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
              className="px-4 py-2 rounded border w-full sm:w-auto uppercase"
              style={{ borderColor: COLORS.border }}
            >
              + NUEVO
            </button>
          </div>
        </div>
      </header>

      {!!msg && <div className="text-sm text-cyan-300">{msg}</div>}

      {loading && <div className="text-gray-400 text-sm">CARGANDO…</div>}

      {!loading && rows.length === 0 && (
        <div className="text-gray-400 text-sm">NO HAY REGISTROS</div>
      )}

      {/* ✅ 2 columnas fijas: Encargos (izq) / Apartados (der) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kinds.map((k) => {
          const all = sortedRows
            .filter((r) => r.kind === k)
            .filter((r) => !statusFilter || r.status === statusFilter);

          const limit = visibleByKind[k] ?? PAGE_SIZE;
          const colRows = all.slice(0, limit);
          const hasMore = all.length > limit;

          return (
            <div key={k} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                  {KIND_LABEL[k]}{" "}
                  <span className="text-xs text-gray-400">({all.length})</span>
                </h2>
              </div>

              <div className="space-y-3">
                {colRows.map((resv) => {
                  const saldo = resv.totalPrice - resv.totalPaid;
                  const canFinalize = resv.status === "OPEN" && saldo <= 500;

                  return (
                    <article
                      key={resv.id}
                      className="rounded-xl p-4 space-y-2 border"
                      style={{
                        backgroundColor: COLORS.bgCard,
                        borderColor: COLORS.border,
                      }}
                    >
                      <header className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-cyan-300 uppercase">
                          {resv.code}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-800 uppercase">
                            {KIND_LABEL[resv.kind]}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 uppercase">
                            {STATUS_LABEL[resv.status]}
                          </span>
                        </div>
                      </header>

                      <div className="text-xs text-gray-300">
                        <div>
                          <b>APERTURA:</b> {fmt(resv.createdAt)}
                        </div>
                        {resv.closedAt && (
                          <div>
                            <b>CERRADO:</b> {fmt(resv.closedAt)}
                          </div>
                        )}
                        {resv.kind === "ENCARGO" && resv.pickupDate && (
                          <div>
                            <b>RETIRO:</b> {onlyDateISO(resv.pickupDate)}
                          </div>
                        )}
                        {resv.kind === "ENCARGO" && resv.deliveredAt && (
                          <div className="text-emerald-300">
                            <b>ENTREGADO:</b> {fmt(resv.deliveredAt)}
                          </div>
                        )}
                      </div>

                      <div className="text-sm uppercase space-y-1">
                        <div>
                          <b>ÍTEMS:</b> {getCardItemsLabel(resv)}
                        </div>
                        <div>
                          <b>TOTAL OBJETIVO:</b> {toCOP(resv.totalPrice)}
                        </div>
                        <div>
                          <b>CLIENTE:</b> {resv.customerName} •{" "}
                          {resv.customerPhone}
                        </div>
                        {resv.city && (
                          <div>
                            <b>CIUDAD:</b> {resv.city}
                          </div>
                        )}
                        <div>
                          <b>ABONO INICIAL:</b> {toCOP(resv.initialDeposit)}
                        </div>
                        <div className="text-emerald-300">
                          <b>TOTAL ABONADO:</b> {toCOP(resv.totalPaid)}
                        </div>
                        <div className="text-pink-300">
                          <b>SALDO:</b> {toCOP(saldo)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          className="px-3 py-1 rounded border text-xs uppercase"
                          style={{ borderColor: COLORS.border }}
                          onClick={() => openPaymentsModal(resv)}
                        >
                          VER / ABONAR
                        </button>

                        {resv.status === "OPEN" && (
                          <>
                            <button
                              className="px-3 py-1 rounded border text-xs uppercase"
                              style={{ borderColor: COLORS.border }}
                              onClick={() => printContractSafe(resv)}
                            >
                              IMPRIMIR CONTRATO
                            </button>

                            <button
                              className="px-3 py-1 rounded border text-xs uppercase text-pink-300"
                              style={{ borderColor: COLORS.border }}
                              onClick={() => openRefundModal(resv)}
                            >
                              DEVOLUCIÓN 50%
                            </button>
                          </>
                        )}

                        {canFinalize && (
                          <button
                            className="px-3 py-1 rounded border text-xs uppercase text-emerald-300"
                            style={{ borderColor: COLORS.border }}
                            onClick={() => finalizeReservation(resv)}
                          >
                            FINALIZAR VENTA → POS
                          </button>
                        )}

                        {role === "ADMIN" && (
                          <button
                            className="px-3 py-1 rounded border text-xs uppercase text-red-300"
                            style={{ borderColor: COLORS.border }}
                            onClick={() => deleteReservation(resv)}
                          >
                            ELIMINAR
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}

                {hasMore && (
                  <button
                    className="mt-1 px-3 py-1 rounded border text-xs uppercase"
                    style={{ borderColor: COLORS.border }}
                    onClick={() =>
                      setVisibleByKind((prev) => ({
                        ...prev,
                        [k]: (prev[k] ?? PAGE_SIZE) + PAGE_SIZE,
                      }))
                    }
                  >
                    MOSTRAR MÁS
                  </button>
                )}

                {!loading && all.length === 0 && (
                  <div className="text-xs text-gray-500">
                    Sin registros en este tipo.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Modal nuevo */}
      {openForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-2xl rounded-xl p-4 space-y-3"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <h2 className="text-lg font-semibold text-cyan-300 uppercase">
              NUEVO ENCARGO / APARTADO
            </h2>

            {/* Tipo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1 uppercase">TIPO *</label>
                <select
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ReservationKind)}
                >
                  <option value="ENCARGO">ENCARGO</option>
                  <option value="APARTADO">APARTADO</option>
                </select>
              </div>

              {kind === "ENCARGO" && (
                <div>
                  <label className="block text-sm mb-1 uppercase">
                    FECHA DE RETIRO *
                  </label>
                  <input
                    type="date"
                    className="w-full rounded px-3 py-2 text-gray-100"
                    style={{
                      backgroundColor: COLORS.input,
                      border: `1px solid ${COLORS.border}`,
                    }}
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Cliente */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1 uppercase">
                  WHATSAPP CLIENTE *
                </label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm mb-1 uppercase">
                  CIUDAD (OPCIONAL)
                </label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
            </div>

            {/* Items */}
            <div className="mt-2 space-y-2">
              <div className="text-sm font-semibold uppercase text-gray-300">
                ÍTEMS *
              </div>

              <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                <div className="md:col-span-4">
                  <label className="block text-sm mb-1 uppercase">
                    BUSCAR PRODUCTO
                  </label>
                  <div className="relative" ref={productSearchRef}>
                    <input
                      placeholder="Escribe para buscar por SKU o nombre..."
                      className="w-full rounded px-3 py-2 text-gray-100 uppercase text-sm"
                      style={{
                        backgroundColor: COLORS.input,
                        border: `1px solid ${COLORS.border}`,
                      }}
                      value={productSearch}
                      onChange={(e) => {
                        const value = e.target.value;
                        setProductSearch(value);
                        setProductDropdownOpen(!!value.trim());
                      }}
                    />

                    {productDropdownOpen && productSearch.trim() && (
                      <div
                        className="absolute z-50 mt-1 w-full rounded-xl shadow-lg max-h-64 overflow-auto text-sm"
                        style={{
                          backgroundColor: COLORS.input,
                          border: `1px solid ${COLORS.border}`,
                        }}
                      >
                        {filteredProducts.length === 0 && (
                          <div className="px-3 py-2 text-xs text-gray-400">
                            No se encontraron productos.
                          </div>
                        )}

                        {filteredProducts.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectProduct(p)}
                            className="w-full text-left px-3 py-2 hover:bg-white/5 flex flex-col"
                          >
                            <span className="font-semibold text-cyan-300">
                              {p.sku} — {p.name}
                            </span>
                            <span className="text-xs text-gray-300">
                              {toCOP(p.price)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="md:col-span-1">
                  <label className="block text-sm mb-1 uppercase">CANT</label>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    className="w-full rounded px-3 py-2 text-gray-100"
                    style={{
                      backgroundColor: COLORS.input,
                      border: `1px solid ${COLORS.border}`,
                    }}
                    value={draftQty}
                    onChange={(e) => setDraftQty(e.target.value)}
                  />
                </div>

                <div className="md:col-span-1">
                  <button
                    type="button"
                    className="w-full px-3 py-2 rounded-lg font-semibold uppercase"
                    style={{
                      color: "#001014",
                      background:
                        "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                      boxShadow:
                        "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
                    }}
                    onClick={addDraftItem}
                  >
                    AGREGAR
                  </button>
                </div>
              </div>

              {/* Tabla items */}
              <div
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: COLORS.border }}
              >
                <table className="w-full text-left text-xs">
                  <thead className="bg-black/40">
                    <tr>
                      <th className="px-2 py-2 border-b border-gray-700">
                        ÍTEM
                      </th>
                      <th className="px-2 py-2 border-b border-gray-700">
                        V. UNIT
                      </th>
                      <th className="px-2 py-2 border-b border-gray-700">
                        CANT
                      </th>
                      <th className="px-2 py-2 border-b border-gray-700">
                        SUBTOTAL
                      </th>
                      <th className="px-2 py-2 border-b border-gray-700 text-right">
                        ACC
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftItems.map((it) => (
                      <tr key={it.productId}>
                        <td className="px-2 py-2 border-b border-gray-800 uppercase">
                          {it.sku ? `${it.sku} — ` : ""}
                          {it.name}
                        </td>
                        <td className="px-2 py-2 border-b border-gray-800">
                          {toCOP(it.unitPrice)}
                        </td>
                        <td className="px-2 py-2 border-b border-gray-800">
                          <input
                            type="number"
                            min={1}
                            step="1"
                            className="w-20 rounded px-2 py-1 text-gray-100"
                            style={{
                              backgroundColor: COLORS.input,
                              border: `1px solid ${COLORS.border}`,
                            }}
                            value={String(it.qty)}
                            onChange={(e) =>
                              updateDraftQty(it.productId, e.target.value)
                            }
                          />
                        </td>
                        <td className="px-2 py-2 border-b border-gray-800">
                          {toCOP(it.unitPrice * it.qty)}
                        </td>
                        <td className="px-2 py-2 border-b border-gray-800 text-right">
                          <button
                            type="button"
                            className="px-2 py-1 rounded border text-red-300 uppercase"
                            style={{ borderColor: COLORS.border }}
                            onClick={() => removeDraftItem(it.productId)}
                          >
                            QUITAR
                          </button>
                        </td>
                      </tr>
                    ))}
                    {draftItems.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-3 text-center text-gray-500"
                        >
                          Agrega productos para armar el registro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-sm uppercase">
                <div className="text-gray-300">TOTAL OBJETIVO</div>
                <div className="text-cyan-300 font-semibold">
                  {toCOP(itemsTotal)}
                </div>
              </div>
            </div>

            {/* Pago inicial */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-sm mb-1 uppercase">
                  ABONO INICIAL (OPCIONAL)
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
                  value={initialDeposit}
                  onChange={(e) => setInitialDeposit(e.target.value)}
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
                  value={initialMethod}
                  onChange={(e) =>
                    setInitialMethod(e.target.value as PayMethod)
                  }
                >
                  <option value="EFECTIVO">EFECTIVO</option>
                  <option value="QR_LLAVE">QR_LLAVE</option>
                  <option value="DATAFONO">DATAFONO</option>
                </select>
              </div>

              <div className="md:col-span-1 text-xs text-gray-300 uppercase flex items-end">
                💬 Al crear se generará un <b>contrato PDF</b> para firma.
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
                onClick={createReservation}
              >
                REGISTRAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal VER / ABONAR */}
      {paymentsOpenId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-2xl rounded-xl p-4 space-y-3"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <h3 className="text-lg font-semibold text-cyan-300 uppercase">
              ABONOS {rows.find((r) => r.id === paymentsOpenId)?.code}
            </h3>

            <div className="max-h-64 overflow-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-black/40">
                  <tr>
                    <th className="px-2 py-1 border-b border-gray-700">
                      FECHA
                    </th>
                    <th className="px-2 py-1 border-b border-gray-700">
                      MÉTODO
                    </th>
                    <th className="px-2 py-1 border-b border-gray-700">
                      MONTO
                    </th>
                    <th className="px-2 py-1 border-b border-gray-700">NOTA</th>
                    {role === "ADMIN" && (
                      <th className="px-2 py-1 border-b border-gray-700 text-right">
                        ACCIONES
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {currentPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-2 py-1 border-b border-gray-800">
                        {fmt(p.createdAt)}
                      </td>
                      <td className="px-2 py-1 border-b border-gray-800">
                        {PaymentLabels[p.method]}
                      </td>
                      <td className="px-2 py-1 border-b border-gray-800">
                        {toCOP(p.amount)}
                      </td>
                      <td className="px-2 py-1 border-b border-gray-800">
                        {p.note || ""}
                      </td>
                      {role === "ADMIN" && (
                        <td className="px-2 py-1 border-b border-gray-800 text-right">
                          <button
                            onClick={() => deletePayment(p)}
                            className="inline-flex items-center justify-center"
                          >
                            <Image
                              src="/borrar.png"
                              alt="Eliminar"
                              width={16}
                              height={16}
                              className="opacity-80 hover:opacity-100 hover:scale-110 transition"
                            />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {currentPayments.length === 0 && (
                    <tr>
                      <td
                        colSpan={role === "ADMIN" ? 5 : 4}
                        className="px-2 py-2 text-center text-gray-500"
                      >
                        Sin abonos registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-sm mb-1 uppercase">
                  NUEVO ABONO *
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
                  value={newPayAmount}
                  onChange={(e) => setNewPayAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1 uppercase">MÉTODO *</label>
                <select
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={newPayMethod}
                  onChange={(e) => setNewPayMethod(e.target.value as PayMethod)}
                >
                  <option value="EFECTIVO">EFECTIVO</option>
                  <option value="QR_LLAVE">QR_LLAVE</option>
                  <option value="DATAFONO">DATAFONO</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1 uppercase">NOTA</label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={newPayNote}
                  onChange={(e) => setNewPayNote(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="px-4 py-2 rounded border w-full sm:w-auto uppercase"
                style={{ borderColor: COLORS.border }}
                onClick={closePaymentsModal}
              >
                CERRAR
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
                onClick={registerPayment}
              >
                GUARDAR ABONO Y IMPRIMIR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal contrato obligatorio al crear */}
      {contractReservation && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-md rounded-xl p-4 space-y-3 text-center"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <h3 className="text-lg font-semibold text-cyan-300 uppercase">
              {KIND_LABEL[contractReservation.kind]} CREADO
            </h3>
            <p className="text-sm text-gray-200">
              Debes imprimir el contrato del{" "}
              <b>{KIND_LABEL[contractReservation.kind]}</b>{" "}
              <b>{contractReservation.code}</b> y hacerlo firmar.
            </p>
            <p className="text-xs text-gray-400">
              Este aviso no se cerrará hasta que imprimas el contrato.
            </p>

            <button
              className="mt-3 px-5 py-2.5 rounded-lg font-semibold uppercase"
              style={{
                color: "#001014",
                background:
                  "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                boxShadow:
                  "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
              }}
              onClick={async () => {
                await printContractSafe(contractReservation);
                setContractReservation(null);
              }}
            >
              IMPRIMIR CONTRATO
            </button>
          </div>
        </div>
      )}

      {/* Modal devolución 50% */}
      {refundReservation && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-md rounded-xl p-4 space-y-3"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <h3 className="text-lg font-semibold text-cyan-300 uppercase text-center">
              DEVOLUCIÓN {refundReservation.code}
            </h3>

            <p className="text-sm text-gray-200">
              Total abonado a la fecha:{" "}
              <b>{toCOP(refundReservation.totalPaid)}</b>
            </p>
            <p className="text-sm text-gray-200">
              Valor a devolver (50%):{" "}
              <b>{toCOP(Math.round(refundReservation.totalPaid * 0.5))}</b>
            </p>
            <p className="text-xs text-gray-400">
              Al confirmar, quedará <b>CERRADA</b> y abrirá POS con ítem{" "}
              <b>SALDO VENTA</b>.
            </p>

            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="px-4 py-2 rounded border w-full sm:w-auto uppercase"
                style={{ borderColor: COLORS.border }}
                onClick={() => setRefundReservation(null)}
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
                onClick={confirmRefund}
              >
                CONFIRMAR DEVOLUCIÓN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm global */}
      {confirmData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-sm rounded-2xl p-5 space-y-4 relative"
            style={{
              backgroundColor: COLORS.bgCard,
              border: "1px solid rgba(0,255,255,0.6)",
              boxShadow:
                "0 0 18px rgba(0,255,255,.45), 0 0 30px rgba(255,0,255,.35)",
            }}
          >
            <h3 className="text-lg font-semibold text-cyan-200 uppercase">
              {confirmData.title}
            </h3>

            <p className="text-sm text-gray-200">{confirmData.message}</p>

            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="px-4 py-2 rounded border w-full sm:w-auto uppercase text-xs"
                style={{ borderColor: COLORS.border }}
                onClick={() => setConfirmData(null)}
              >
                {confirmData.cancelLabel || "CANCELAR"}
              </button>
              <button
                className="px-5 py-2.5 rounded-lg font-semibold w-full sm:w-auto uppercase text-xs"
                style={{
                  color: "#001014",
                  background:
                    "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                  boxShadow:
                    "0 0 18px rgba(0,255,255,.35), 0 0 28px rgba(255,0,255,.35)",
                }}
                onClick={() => confirmData.onConfirm()}
              >
                {confirmData.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
