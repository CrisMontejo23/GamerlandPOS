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

type JsPDFWithAutoTable = jsPDF & {
  lastAutoTable?: { finalY: number };
};

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
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "letter", // carta
    }) as JsPDFWithAutoTable;

    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 15;
    let y = 12;

    // ==== ENCABEZADO GAMER ====
    try {
      const imgSrc = (logo as StaticImageData).src;
      // logo a la izquierda
      doc.addImage(imgSrc, "PNG", marginX, y - 4, 28, 18);
    } catch {
      /* noop */
    }

    // barra gamer superior
    doc.setFillColor(5, 10, 40);
    doc.rect(0, 0, pageWidth, 20, "F");

    doc.setFontSize(14);
    doc.setTextColor(0, 255, 255);
    doc.text("GAMERLAND PC", pageWidth / 2, 9, { align: "center" });

    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("Facatativá, Cundinamarca", pageWidth / 2, 13, {
      align: "center",
    });
    doc.text("Carrera 3 #4-13 Local 1", pageWidth / 2, 17, { align: "center" });
    doc.text("NIT 1003511062-1", pageWidth / 2, 21, { align: "center" });

    // línea neon
    doc.setDrawColor(0, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(marginX, 25, pageWidth - marginX, 25);

    // Título
    y = 32;
    doc.setFontSize(12);
    doc.setTextColor(0, 255, 255);
    doc.text("CONTRATO DE SISTEMA DE APARTADO", pageWidth / 2, y, {
      align: "center",
    });

    // Subtítulo
    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    doc.text(`FACATATIVÁ, ${fmt(lay.createdAt)}`, pageWidth / 2, y, {
      align: "center",
    });

    // ==== TABLA RESUMEN (tipo ficha) ====
    y += 6;

    const resumenBody = [
      ["CÓDIGO", lay.code],
      ["CLIENTE", lay.customerName],
      ["WHATSAPP", lay.customerPhone],
      ["CIUDAD", lay.city || "NO REGISTRA"],
      ["PRODUCTO", lay.productName],
      ["PRECIO DEL PRODUCTO", toCOP(lay.totalPrice)],
      ["ABONO INICIAL", toCOP(lay.initialDeposit)],
      ["TOTAL ABONADO A LA FECHA", toCOP(lay.totalPaid)],
    ];

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["DATO", "VALOR"]],
      body: resumenBody,
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [30, 31, 75],
        lineWidth: 0.1,
        textColor: [255, 255, 255],
        fillColor: [15, 16, 48],
      },
      headStyles: {
        fillColor: [0, 255, 255],
        textColor: [0, 16, 20],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [10, 11, 38],
      },
    });

    // posición después de la tabla
    const lastY = doc.lastAutoTable?.finalY ?? y;
    y = lastY + 8;

    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);

    // Helper para escribir párrafos con salto automático
    const writeParagraph = (text: string, extraSpace = 3) => {
      const maxWidth = pageWidth - marginX * 2;
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, marginX, y, { maxWidth, lineHeightFactor: 1.4 });
      y += lines.length * 4 + extraSpace;
    };

    // ==== CUERPO LEGAL (CLÁUSULAS) ====
    writeParagraph(
      `Entre GAMERLAND PC, identificado con NIT 1003511062-1, ubicado en Facatativá, Cundinamarca, en adelante "LA TIENDA", y el(la) cliente ${lay.customerName}, identificado para efectos de contacto con el número de WhatsApp ${lay.customerPhone}, en adelante "EL CLIENTE", se celebra el presente contrato de sistema de apartado, el cual se regirá por las siguientes cláusulas:`,
      5
    );

    doc.setFontSize(10);
    doc.setTextColor(0, 255, 255);
    doc.text("CLÁUSULA PRIMERA – OBJETO", marginX, y);
    y += 5;
    doc.setTextColor(255, 255, 255);
    writeParagraph(
      `El objeto del presente contrato es la reserva, a favor de EL CLIENTE, del producto ${
        lay.productName
      }, por un valor estimado de ${toCOP(
        lay.totalPrice
      )}, mediante el sistema de apartado ofrecido por LA TIENDA.`
    );

    doc.setTextColor(0, 255, 255);
    doc.text("CLÁUSULA SEGUNDA – VALOR Y FORMA DE PAGO", marginX, y);
    y += 5;
    doc.setTextColor(255, 255, 255);
    writeParagraph(
      `EL CLIENTE realiza un abono inicial de ${toCOP(
        lay.initialDeposit
      )}, el cual constituye parte del precio total del producto y no corresponde a una reserva gratuita. EL CLIENTE se compromete a efectuar los abonos posteriores hasta completar el valor total del producto, en los plazos y montos que libremente acuerde con LA TIENDA.`
    );

    doc.setTextColor(0, 255, 255);
    doc.text("CLÁUSULA TERCERA – CANCELACIÓN DEL SISTEMA", marginX, y);
    y += 5;
    doc.setTextColor(255, 255, 255);
    writeParagraph(
      `En caso de que EL CLIENTE decida cancelar el sistema de apartado en cualquier momento, acepta y reconoce que LA TIENDA devolverá únicamente el cincuenta por ciento (50%) del valor total abonado hasta la fecha de la cancelación. El cincuenta por ciento (50%) restante se entenderá como compensación por costos administrativos, logísticos y comerciales asumidos por LA TIENDA.`
    );

    doc.setTextColor(0, 255, 255);
    doc.text("CLÁUSULA CUARTA – AVISO PARA RECLAMAR EL PRODUCTO", marginX, y);
    y += 5;
    doc.setTextColor(255, 255, 255);
    writeParagraph(
      `Para reclamar el producto apartado, EL CLIENTE deberá informar a LA TIENDA con un mínimo de una (1) semana de anticipación, a través de los medios de contacto disponibles, con el fin de garantizar la disponibilidad del producto en inventario y su correcta preparación para la entrega.`
    );

    doc.setTextColor(0, 255, 255);
    doc.text("CLÁUSULA QUINTA – GARANTÍA DEL PRODUCTO", marginX, y);
    y += 5;
    doc.setTextColor(255, 255, 255);
    writeParagraph(
      `La garantía legal y/o comercial aplicable al producto comenzará a regir a partir de la fecha efectiva de entrega del mismo a EL CLIENTE. La cobertura, plazos y condiciones de garantía se sujetarán a las políticas vigentes de LA TIENDA y, en lo pertinente, a la normatividad de protección al consumidor.`
    );

    doc.setTextColor(0, 255, 255);
    doc.text("CLÁUSULA SEXTA – VARIACIÓN DEL PRECIO", marginX, y);
    y += 5;
    doc.setTextColor(255, 255, 255);
    writeParagraph(
      `EL CLIENTE reconoce que el precio del producto puede estar sujeto a variación según las condiciones del mercado, la tasa de cambio y otros factores externos. En caso de que el tiempo transcurrido para completar el pago sea considerable, LA TIENDA podrá actualizar el valor del producto. En todo caso, LA TIENDA informará previamente a EL CLIENTE sobre cualquier ajuste de precio antes de la cancelación del saldo final.`
    );

    doc.setTextColor(0, 255, 255);
    doc.text("CLÁUSULA SÉPTIMA – ACEPTACIÓN", marginX, y);
    y += 5;
    doc.setTextColor(255, 255, 255);
    writeParagraph(
      `Firmado el presente documento, EL CLIENTE manifiesta que ha leído, entendido y aceptado en su totalidad las cláusulas del contrato de sistema de apartado, y declara recibir una copia de este documento generado en la tienda.`,
      8
    );

    // ==== FIRMAS ====
    const firmaY = doc.internal.pageSize.getHeight() - 40;

    doc.setDrawColor(255, 255, 255);
    doc.line(marginX, firmaY, marginX + 70, firmaY);
    doc.line(pageWidth - marginX - 70, firmaY, pageWidth - marginX, firmaY);

    doc.setFontSize(9);
    doc.text("EL CLIENTE", marginX + 35, firmaY + 5, { align: "center" });
    doc.text("GAMERLAND PC", pageWidth - marginX - 35, firmaY + 5, {
      align: "center",
    });

    doc.output("dataurlnewwindow");
  }

  function generatePaymentReceiptPdf(lay: Layaway, payment: LayawayPayment) {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "letter", // carta completa
    }) as JsPDFWithAutoTable;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 10;
    const usableHeight = pageHeight / 2 - 10; // solo media carta (zona superior)

    let y = 8;

    // Fondo barra gamer superior
    doc.setFillColor(5, 10, 40);
    doc.rect(0, 0, pageWidth, 20, "F");

    try {
      const imgSrc = (logo as StaticImageData).src;
      doc.addImage(imgSrc, "PNG", marginX, y - 2, 22, 14);
    } catch {
      /* noop */
    }

    // Encabezado texto
    doc.setFontSize(11);
    doc.setTextColor(0, 255, 255);
    doc.text("RECIBO DE ABONO – SISTEMA DE APARTADO", pageWidth / 2 + 10, 9, {
      align: "center",
    });

    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text("GAMERLAND PC", pageWidth / 2 + 10, 13, { align: "center" });
    doc.text("Facatativá, Cundinamarca", pageWidth / 2 + 10, 16, {
      align: "center",
    });
    doc.text("Carrera 3 #4-13 Local 1", pageWidth / 2 + 10, 19, {
      align: "center",
    });
    doc.text("NIT 1003511062-1", pageWidth / 2 + 10, 22, { align: "center" });

    // Línea separadora
    doc.setDrawColor(0, 255, 255);
    doc.setLineWidth(0.4);
    doc.line(marginX, 26, pageWidth - marginX, 26);

    // Datos básicos
    y = 32;
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);

    doc.text(`Sistema de apartado: ${lay.code}`, marginX, y);
    y += 4;
    doc.text(`Cliente: ${lay.customerName}`, marginX, y);
    y += 4;
    doc.text(`WhatsApp: ${lay.customerPhone}`, marginX, y);
    y += 4;
    if (lay.city) {
      doc.text(`Ciudad: ${lay.city}`, marginX, y);
      y += 4;
    }

    doc.text(`Producto: ${lay.productName}`, marginX, y);
    y += 4;
    doc.text(
      `Precio objetivo del producto: ${toCOP(lay.totalPrice)}`,
      marginX,
      y
    );
    y += 5;

    // Tabla tipo resumen del abono
    const saldo = lay.totalPrice - lay.totalPaid;

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["CONCEPTO", "VALOR"]],
      body: [
        ["Fecha del abono", fmt(payment.createdAt)],
        ["Método de pago", PaymentLabels[payment.method]],
        ["Valor del abono", toCOP(payment.amount)],
        ["Total abonado a la fecha", toCOP(lay.totalPaid)],
        ["Saldo pendiente", toCOP(saldo)],
      ],
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [30, 31, 75],
        lineWidth: 0.1,
        textColor: [255, 255, 255],
        fillColor: [15, 16, 48],
      },
      headStyles: {
        fillColor: [0, 255, 255],
        textColor: [0, 16, 20],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [10, 11, 38],
      },
    });

    const lastY = doc.lastAutoTable?.finalY ?? y;
    y = lastY + 4;

    if (y < usableHeight - 16) {
      doc.setFontSize(7.5);
      doc.setTextColor(200, 200, 200);
      const notaLines = doc.splitTextToSize(
        `Este comprobante acredita el abono realizado al sistema de apartado indicado. La suma abonada hace parte del valor total del producto y se rige por las condiciones establecidas en el contrato de sistema de apartado firmado por el cliente.`,
        pageWidth - marginX * 2
      );
      doc.text(notaLines, marginX, y, {
        maxWidth: pageWidth - marginX * 2,
        lineHeightFactor: 1.35,
      });
      y += notaLines.length * 3.5 + 4;
    }

    // Pequeña sección de firma opcional dentro de la media carta
    const firmaY = Math.min(usableHeight - 10, y + 6);

    doc.setDrawColor(255, 255, 255);
    doc.line(marginX, firmaY, marginX + 60, firmaY);
    doc.setFontSize(8);
    doc.text("Firma recibido cliente", marginX + 30, firmaY + 4, {
      align: "center",
    });

    // (La parte inferior de la hoja queda libre, por si luego quieres imprimir otro medio recibo)
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
