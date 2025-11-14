"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { apiFetch } from "../lib/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { StaticImageData } from "next/image";
import logo from "../../assets/logo.png";

type PayMethod = "EFECTIVO" | "QR_LLAVE" | "DATAFONO";
type LayawayStatus = "OPEN" | "CLOSED";

type Product = {
  id: number;
  sku: string;
  name: string;
  price: number;
};

type LayawayPayment = {
  id: number;
  amount: number;
  method: PayMethod;
  note?: string | null;
  createdAt: string;
  createdBy?: string | null;
};

type Layaway = {
  id: number;
  code: string;
  status: LayawayStatus;
  productId: number;
  productName: string;
  productPrice: number;
  customerName: string;
  customerPhone: string;
  city?: string | null;
  initialDeposit: number;
  totalPrice: number;
  totalPaid: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  payments?: LayawayPayment[];
};

const COLORS = { bgCard: "#14163A", border: "#1E1F4B", input: "#0F1030" };

const STATUS_LABEL: Record<LayawayStatus, string> = {
  OPEN: "ABIERTO",
  CLOSED: "CERRADO",
};

const PaymentLabels: Record<PayMethod, string> = {
  EFECTIVO: "EFECTIVO",
  QR_LLAVE: "QR_LLAVE",
  DATAFONO: "DATAFONO",
};

const PAGE_SIZE = 5;

const U = (s: unknown) =>
  (typeof s === "string" ? s.trim().toUpperCase() : s) as string;

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

export default function LayawaysPage() {
  const { ready } = useAuth();

  const [rows, setRows] = useState<Layaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [products, setProducts] = useState<Product[]>([]);

  const [statusFilter, setStatusFilter] = useState<LayawayStatus | "">("OPEN");
  const [q, setQ] = useState("");

  // paginación por columna
  const [visibleByStatus, setVisibleByStatus] = useState<
    Record<LayawayStatus, number>
  >({
    OPEN: PAGE_SIZE,
    CLOSED: PAGE_SIZE,
  });

  // modal crear
  const [openForm, setOpenForm] = useState(false);
  const [selProductId, setSelProductId] = useState<number | "">("");
  const [productPrice, setProductPrice] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [city, setCity] = useState("");
  const [initialDeposit, setInitialDeposit] = useState<string>("");
  const [initialMethod, setInitialMethod] = useState<PayMethod>("EFECTIVO");

  // modal contrato obligatorio
  const [contractLayaway, setContractLayaway] = useState<Layaway | null>(null);

  // modal abonos
  const [paymentsOpenId, setPaymentsOpenId] = useState<number | null>(null);
  const [paymentsCache, setPaymentsCache] = useState<
    Record<number, LayawayPayment[]>
  >({});
  const [newPayAmount, setNewPayAmount] = useState<string>("");
  const [newPayMethod, setNewPayMethod] = useState<PayMethod>("EFECTIVO");
  const [newPayNote, setNewPayNote] = useState("");

  // ==== LOADERS ====

  const loadProducts = async () => {
    try {
      const r = await apiFetch(
        "/products?includeInactive=false&pageSize=200&withStock=false"
      );

      type ProductApiRow = {
        id: number;
        sku: string;
        name: string;
        price?: number | string | null;
      };

      const data = (await r.json()) as { total: number; rows: ProductApiRow[] };

      const mapped: Product[] = data.rows.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: Number(p.price ?? 0),
      }));

      setProducts(mapped);
    } catch {
      setMsg("NO SE PUDIERON CARGAR LOS PRODUCTOS");
      setTimeout(() => setMsg(""), 2200);
    }
  };

  const loadLayaways = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (statusFilter) p.set("status", statusFilter);
      if (q.trim()) p.set("q", U(q));

      const r = await apiFetch(`/layaways?${p.toString()}`);
      const data = (await r.json()) as Layaway[];
      setRows(data);
    } catch {
      setMsg("NO SE PUDIERON CARGAR LOS SISTEMAS DE APARTADO");
      setTimeout(() => setMsg(""), 2200);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    loadProducts();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    loadLayaways();
  }, [ready, statusFilter]);

  useEffect(() => {
    setVisibleByStatus({ OPEN: PAGE_SIZE, CLOSED: PAGE_SIZE });
  }, [statusFilter]);

  // actualizar precio al cambiar producto
  useEffect(() => {
    if (!selProductId) {
      setProductPrice(null);
      return;
    }
    const found = products.find((p) => p.id === selProductId);
    setProductPrice(found ? found.price : null);
  }, [selProductId, products]);

  // ==== HELPERS ====

  const openPaymentsModal = async (lay: Layaway) => {
    setPaymentsOpenId(lay.id);
    setNewPayAmount("");
    setNewPayMethod("EFECTIVO");
    setNewPayNote("");

    if (!paymentsCache[lay.id]) {
      try {
        const r = await apiFetch(`/layaways/${lay.id}/payments`);
        const data = (await r.json()) as LayawayPayment[];
        setPaymentsCache((prev) => ({ ...prev, [lay.id]: data }));
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

  // ==== CREAR APARTADO ====

  const resetForm = () => {
    setSelProductId("");
    setProductPrice(null);
    setCustomerName("");
    setCustomerPhone("");
    setCity("");
    setInitialDeposit("");
    setInitialMethod("EFECTIVO");
  };

  const createLayaway = async () => {
    if (!selProductId || !productPrice) {
      setMsg("DEBES SELECCIONAR UN PRODUCTO");
      setTimeout(() => setMsg(""), 2200);
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setMsg("NOMBRE Y WHATSAPP SON OBLIGATORIOS");
      setTimeout(() => setMsg(""), 2200);
      return;
    }
    const dep = Number(initialDeposit);
    if (!Number.isFinite(dep) || dep <= 0) {
      setMsg("ABONO INICIAL INVÁLIDO");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    const body = {
      productId: selProductId,
      customerName: U(customerName),
      customerPhone: customerPhone.trim(),
      city: city.trim() ? U(city) : undefined,
      initialDeposit: dep,
      method: initialMethod,
    };

    const r = await apiFetch("/layaways", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const e = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg("ERROR: " + U(e?.error || "NO SE PUDO CREAR"));
      setTimeout(() => setMsg(""), 2500);
      return;
    }

    const result = (await r.json()) as {
      lay: Layaway;
      payments: LayawayPayment[];
    };

    setMsg("SISTEMA DE APARTADO CREADO ✅");
    setOpenForm(false);
    resetForm();
    await loadLayaways();

    // abrimos modal de contrato
    setContractLayaway(result.lay);
  };

  // ==== ABONO NUEVO + FACTURA PDF ====

  const registerPayment = async () => {
    if (!paymentsOpenId) return;
    const dep = Number(newPayAmount);
    if (!Number.isFinite(dep) || dep <= 0) {
      setMsg("MONTO DE ABONO INVÁLIDO");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    const r = await apiFetch(`/layaways/${paymentsOpenId}/payments`, {
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

    const result = (await r.json()) as {
      layaway: Layaway;
      payment: LayawayPayment;
    };

    // recargar caches
    setPaymentsCache((prev) => ({
      ...prev,
      [result.layaway.id]: [...(prev[result.layaway.id] || []), result.payment],
    }));

    await loadLayaways();

    // generar factura media carta
    generatePaymentReceiptPdf(result.layaway, result.payment);

    setMsg("ABONO REGISTRADO ✅");
    setNewPayAmount("");
    setNewPayNote("");
  };

  // ==== FINALIZAR VENTA ====

  const finalizeLayaway = async (lay: Layaway) => {
    const ok = confirm(
      `Finalizar el sistema de apartado ${lay.code} y pasar a POS para registrar la venta final?`
    );
    if (!ok) return;

    const r = await apiFetch(`/layaways/${lay.id}/close`, {
      method: "POST",
    });
    if (!r.ok) {
      const e = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg("ERROR: " + U(e?.error || "NO SE PUDO CERRAR"));
      setTimeout(() => setMsg(""), 2500);
      return;
    }

    // Guardamos info en localStorage para que POS la recoja
    try {
      const payload = {
        source: "LAYAWAY",
        layawayId: lay.id,
        productId: lay.productId,
        productName: lay.productName,
        price: lay.productPrice,
        customerName: lay.customerName,
      };
      window.localStorage.setItem("POS_PRELOAD", JSON.stringify(payload));
    } catch {
      /* ignore */
    }

    // Redirigir a POS
    window.location.href = "/pos";
  };

  // ==== PDFs ====

  function generateContractPdf(lay: Layaway) {
    const doc = new jsPDF();

    // Logo + encabezado gamer
    try {
      const imgSrc = (logo as StaticImageData).src;
      doc.addImage(imgSrc, "PNG", 10, 8, 30, 18);
    } catch {
      // si falla el logo, no rompemos el PDF
    }

    doc.setFontSize(14);
    doc.setTextColor(0, 255, 255);
    doc.text("GAMERLAND PC", 105, 12, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("Facatativá, Cundinamarca", 105, 17, { align: "center" });
    doc.text("Carrera 3 #4-13 Local 1", 105, 21, { align: "center" });
    doc.text("NIT 1003511062-1", 105, 25, { align: "center" });

    doc.setDrawColor(0, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(10, 30, 200, 30);

    // Título
    doc.setFontSize(12);
    doc.text("CONTRATO SISTEMA DE APARTADO", 105, 38, { align: "center" });

    const startY = 46;
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);

    const bodyLines: string[] = [];

    bodyLines.push(
      `En Facatativá, a la fecha ${fmt(
        lay.createdAt
      )}, se establece el presente contrato de sistema de apartado entre GAMERLAND PC y el(la) cliente ${
        lay.customerName
      }.`
    );
    bodyLines.push(
      `GAMERLAND PC abre un sistema de apartado a favor del cliente para el producto ${
        lay.productName
      }, con un valor de ${toCOP(
        lay.totalPrice
      )}. El cliente registra un abono inicial de ${toCOP(
        lay.initialDeposit
      )}, el cual hace parte del pago total del producto.`
    );
    bodyLines.push(
      `El cliente se compromete a realizar los abonos necesarios hasta completar el valor total del producto. En caso de que el cliente decida cancelar el sistema de apartado en cualquier momento, GAMERLAND PC devolverá únicamente el 50% del valor total abonado hasta la fecha de cancelación.`
    );
    bodyLines.push(
      `Para reclamar el producto, el cliente deberá informar a la tienda con mínimo una (1) semana de anticipación, con el fin de asegurar la existencia del producto en inventario y su correcta alistamiento.`
    );
    bodyLines.push(
      `La garantía del producto comenzará a regir a partir del día en que el mismo sea entregado al cliente, y se sujetará a las políticas de garantía vigentes en la tienda.`
    );
    bodyLines.push(
      `El cliente reconoce y acepta que el precio del producto puede variar según el tiempo que tarde en completar el pago total, debido a cambios en el mercado y en las condiciones de adquisición. En todo caso, GAMERLAND PC informará al cliente sobre cualquier ajuste de precio antes del pago final.`
    );
    bodyLines.push(
      `El cliente declara haber leído y aceptado todos los términos y condiciones aquí descritos, y recibe una copia del presente documento generado en la tienda.`
    );

    doc.text(bodyLines.join("\n\n"), 14, startY, {
      maxWidth: 182,
      lineHeightFactor: 1.4,
    });

    const footerY = 250;
    doc.setDrawColor(255, 255, 255);
    doc.line(20, footerY, 90, footerY);
    doc.line(120, footerY, 190, footerY);

    doc.setFontSize(9);
    doc.text("Firma Cliente", 55, footerY + 5, { align: "center" });
    doc.text("Firma GAMERLAND PC", 155, footerY + 5, { align: "center" });

    doc.output("dataurlnewwindow"); // abre en nueva pestaña
  }

  function generatePaymentReceiptPdf(lay: Layaway, payment: LayawayPayment) {
    // media carta en mm (aprox 140 x 216)
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [140, 216],
    });

    try {
      const imgSrc = (logo as StaticImageData).src;
      doc.addImage(imgSrc, "PNG", 8, 6, 24, 14);
    } catch {
      /* noop */
    }

    doc.setFontSize(12);
    doc.setTextColor(0, 255, 255);
    doc.text("RECIBO DE ABONO SISTEMA DE APARTADO", 108, 10, {
      align: "right",
    });

    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("GAMERLAND PC", 108, 15, { align: "right" });
    doc.text("Facatativá, Cundinamarca", 108, 19, { align: "right" });
    doc.text("Carrera 3 #4-13 Local 1", 108, 23, { align: "right" });
    doc.text("NIT 1003511062-1", 108, 27, { align: "right" });

    doc.setDrawColor(0, 255, 255);
    doc.line(8, 32, 132, 32);

    doc.setFontSize(9);
    doc.text(`Sistema de apartado: ${lay.code}`, 8, 38);
    doc.text(`Cliente: ${lay.customerName}`, 8, 43);
    doc.text(`WhatsApp: ${lay.customerPhone}`, 8, 48);
    if (lay.city) doc.text(`Ciudad: ${lay.city}`, 8, 53);

    doc.text(`Producto: ${lay.productName}`, 8, 60);
    doc.text(`Precio producto: ${toCOP(lay.totalPrice)}`, 8, 65);

    doc.text(`Fecha abono: ${fmt(payment.createdAt)}`, 8, 72);
    doc.text(`Método: ${PaymentLabels[payment.method]}`, 8, 77);
    doc.text(`Abono: ${toCOP(payment.amount)}`, 8, 82);

    const saldo = lay.totalPrice - lay.totalPaid;
    doc.text(`Total abonado: ${toCOP(lay.totalPaid)}`, 8, 89);
    doc.text(`Saldo pendiente: ${toCOP(saldo)}`, 8, 94);

    if (payment.note) {
      doc.text(`Nota: ${payment.note}`, 8, 101, { maxWidth: 120 });
    }

    doc.output("dataurlnewwindow");
  }

  // ==== RENDER ====

  const statusOrder: LayawayStatus[] = ["OPEN", "CLOSED"];

  const sortedRows = useMemo(() => {
    return [...rows].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto text-gray-200 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-cyan-400">
          SISTEMAS DE APARTADO
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
              setStatusFilter((e.target.value as LayawayStatus | "") || "")
            }
          >
            <option value="">TODOS</option>
            <option value="OPEN">ABIERTOS</option>
            <option value="CLOSED">CERRADOS</option>
          </select>

          <input
            placeholder="BUSCAR POR CÓDIGO, CLIENTE, PRODUCTO..."
            className="rounded px-3 py-2 text-gray-100 w-full sm:w-72 uppercase"
            style={{
              backgroundColor: COLORS.input,
              border: `1px solid ${COLORS.border}`,
            }}
            value={q}
            onChange={(e) => setQ(U(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && loadLayaways()}
          />

          <div className="flex gap-2">
            <button
              onClick={loadLayaways}
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
              + NUEVO APARTADO
            </button>
          </div>
        </div>
      </header>

      {!!msg && <div className="text-sm text-cyan-300">{msg}</div>}

      {loading && (
        <div className="text-gray-400 text-sm">CARGANDO SISTEMAS…</div>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-gray-400 text-sm">NO HAY SISTEMAS REGISTRADOS</div>
      )}

      {/* 2 columnas: ABIERTO / CERRADO */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {statusOrder
          .filter((st) => !statusFilter || st === statusFilter)
          .map((st) => {
            const all = sortedRows.filter((r) => r.status === st);
            const limit = visibleByStatus[st] ?? PAGE_SIZE;
            const colRows = all.slice(0, limit);
            const hasMore = all.length > limit;

            return (
              <div key={st} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                    {STATUS_LABEL[st]}{" "}
                    <span className="text-xs text-gray-400">
                      ({all.length})
                    </span>
                  </h2>
                </div>

                <div className="space-y-3">
                  {colRows.map((lay) => {
                    const saldo = lay.totalPrice - lay.totalPaid;
                    const canFinalize = lay.status === "OPEN" && saldo <= 500; // pequeño margen

                    return (
                      <article
                        key={lay.id}
                        className="rounded-xl p-4 space-y-2 border"
                        style={{
                          backgroundColor: COLORS.bgCard,
                          borderColor: COLORS.border,
                        }}
                      >
                        <header className="flex items-center justify-between">
                          <div className="font-semibold text-cyan-300 uppercase">
                            {lay.code}
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 uppercase">
                            {STATUS_LABEL[lay.status]}
                          </span>
                        </header>

                        <div className="text-xs text-gray-300">
                          <div>
                            <b>APERTURA:</b> {fmt(lay.createdAt)}
                          </div>
                          {lay.closedAt && (
                            <div>
                              <b>CERRADO:</b> {fmt(lay.closedAt)}
                            </div>
                          )}
                        </div>

                        <div className="text-sm uppercase">
                          <div>
                            <b>PRODUCTO:</b> {lay.productName}
                          </div>
                          <div>
                            <b>PRECIO OBJETIVO:</b> {toCOP(lay.totalPrice)}
                          </div>
                          <div>
                            <b>CLIENTE:</b> {lay.customerName} •{" "}
                            {lay.customerPhone}
                          </div>
                          {lay.city && (
                            <div>
                              <b>CIUDAD:</b> {lay.city}
                            </div>
                          )}
                          <div>
                            <b>ABONO INICIAL:</b> {toCOP(lay.initialDeposit)}
                          </div>
                          <div className="text-emerald-300">
                            <b>TOTAL ABONADO:</b> {toCOP(lay.totalPaid)}
                          </div>
                          <div className="text-pink-300">
                            <b>SALDO:</b> {toCOP(saldo)}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2">
                          <button
                            className="px-3 py-1 rounded border text-xs uppercase"
                            style={{ borderColor: COLORS.border }}
                            onClick={() => openPaymentsModal(lay)}
                          >
                            VER / ABONAR
                          </button>

                          {lay.status === "OPEN" && (
                            <button
                              className="px-3 py-1 rounded border text-xs uppercase"
                              style={{ borderColor: COLORS.border }}
                              onClick={() => generateContractPdf(lay)}
                            >
                              IMPRIMIR CONTRATO
                            </button>
                          )}

                          {canFinalize && (
                            <button
                              className="px-3 py-1 rounded border text-xs uppercase text-emerald-300"
                              style={{ borderColor: COLORS.border }}
                              onClick={() => finalizeLayaway(lay)}
                            >
                              FINALIZAR VENTA → POS
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
                        setVisibleByStatus((prev) => ({
                          ...prev,
                          [st]: (prev[st] ?? PAGE_SIZE) + PAGE_SIZE,
                        }))
                      }
                    >
                      MOSTRAR MÁS
                    </button>
                  )}

                  {!loading && all.length === 0 && (
                    <div className="text-xs text-gray-500">
                      Sin sistemas en este estado.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </section>

      {/* Modal nuevo apartado */}
      {openForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-xl rounded-xl p-4 space-y-3"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <h2 className="text-lg font-semibold text-cyan-300 uppercase">
              NUEVO SISTEMA DE APARTADO
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-sm mb-1 uppercase">
                  PRODUCTO *
                </label>
                <select
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={selProductId || ""}
                  onChange={(e) =>
                    setSelProductId(
                      e.target.value ? Number(e.target.value) : ("" as const)
                    )
                  }
                >
                  <option value="">SELECCIONE PRODUCTO</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name} ({toCOP(p.price)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1 uppercase">
                  PRECIO PRODUCTO
                </label>
                <input
                  disabled
                  className="w-full rounded px-3 py-2 text-gray-100"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={productPrice != null ? toCOP(productPrice) : ""}
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
                  onChange={(e) => setCustomerName(U(e.target.value))}
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

              <div>
                <label className="block text-sm mb-1 uppercase">
                  CIUDAD RESIDENCIA (OPCIONAL)
                </label>
                <input
                  className="w-full rounded px-3 py-2 text-gray-100 uppercase"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  value={city}
                  onChange={(e) => setCity(U(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-sm mb-1 uppercase">
                  ABONO INICIAL *
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
                  MÉTODO PAGO *
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

              <div className="md:col-span-2 text-xs text-gray-300 uppercase">
                💬 Al registrar el sistema de apartado se generará un{" "}
                <b>contrato PDF</b> que debe ser impreso y firmado por el
                cliente.
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
                onClick={createLayaway}
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
              ABONOS SISTEMA {rows.find((r) => r.id === paymentsOpenId)?.code}
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
                    </tr>
                  ))}
                  {currentPayments.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
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
      {contractLayaway && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3">
          <div
            className="w-full max-w-md rounded-xl p-4 space-y-3 text-center"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <h3 className="text-lg font-semibold text-cyan-300 uppercase">
              SISTEMA CREADO
            </h3>
            <p className="text-sm text-gray-200">
              Debes imprimir el contrato del sistema de apartado{" "}
              <b>{contractLayaway.code}</b> y hacer que el cliente lo firme.
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
              onClick={() => {
                generateContractPdf(contractLayaway);
                setContractLayaway(null);
              }}
            >
              IMPRIMIR CONTRATO
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
