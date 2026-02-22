"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import Image from "next/image";

// ===== Tipos =====
type Product = {
  id: number;
  sku: string;
  name: string;
  price: number;
  cost: number;
  stock?: number;
};
type CartItem = { product: Product; qty: number; unitPrice: number };
type PayMethod = "EFECTIVO" | "QR_LLAVE" | "DATAFONO";

// 👇 ahora es una unión: finalización de apartado y devolución 50%
type PosPreloadPayload =
  | {
      source: "LAYAWAY";
      layawayId: number;
      productId: number;
      productName: string;
      price: number;
      customerName?: string;
    }
  | {
      source: "LAYAWAY_REFUND";
      layawayId: number;
      refundAmount: number;
      customerName?: string;
    };

// ===== Helpers UI =====
const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
const parseMoneyInput = (v: string) => Number(v.replace(/[^\d]/g, "")) || 0;

// Paleta local
const COLORS = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  cyan: "#00FFFF",
  pink: "#FF00FF",
  text: "#E5E5E5",
};

/* ===== Toast Gamer reutilizable ===== */
type ToastKind = "success" | "error" | "info";
type ToastState = {
  open: boolean;
  kind: ToastKind;
  title: string;
  subtitle?: string;
};

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
      role="status"
      aria-live="polite"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-md rounded-2xl p-4 text-center select-none"
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
            style={{
              color:
                kind === "success"
                  ? "#7CF9FF"
                  : kind === "error"
                    ? "#ff90b1"
                    : COLORS.text,
            }}
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
                  : kind === "error"
                    ? "linear-gradient(90deg, rgba(255,99,132,.95), rgba(255,0,128,.9))"
                    : "linear-gradient(90deg, rgba(99,102,241,.95), rgba(168,85,247,.9))",
              boxShadow: "0 0 14px rgba(255,255,255,.15)",
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function POSPage() {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [payMethod, setPayMethod] = useState<PayMethod>("EFECTIVO");
  const [received, setReceived] = useState<number>(0);
  const { role } = useAuth(); // "ADMIN" | "EMPLOYEE" | null
  const resultsRef = useRef<HTMLDivElement>(null);
  const [openResults, setOpenResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Toast global de esta pantalla
  const [toast, setToast] = useState<ToastState>({
    open: false,
    kind: "success",
    title: "",
  });
  const hideToast = () => setToast((t) => ({ ...t, open: false }));

  const [tabStage, setTabStage] = useState<0 | 1>(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const receivedRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let abort = false;

    const run = async () => {
      if (!q) {
        setFound([]);
        setOpenResults(false);
        setActiveIndex(-1);
        return;
      }
      setLoading(true);
      try {
        const url = new URL(`/products`, window.location.origin);
        url.searchParams.set("q", q);
        url.searchParams.set("withStock", "true");

        const r = await apiFetch(`/products?${url.searchParams.toString()}`);
        const payload = (await r.json()) as
          | Product[]
          | { total: number; rows: Product[] };

        const list = Array.isArray(payload) ? payload : (payload?.rows ?? []);

        if (!abort) {
          setFound(list);
          const has = list.length > 0;
          setOpenResults(has);
          setActiveIndex(has ? 0 : -1);
        }
      } finally {
        if (!abort) setLoading(false);
      }
    };

    const t = setTimeout(run, 220);
    return () => {
      abort = true;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      const inSearch = !!searchRef.current && searchRef.current.contains(t);
      const inResults = !!resultsRef.current && resultsRef.current.contains(t);
      if (!inSearch && !inResults) setOpenResults(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenResults(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!openResults) return;
    if (activeIndex < 0) return;

    const el = itemRefs.current[activeIndex];
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, openResults]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!openResults || found.length === 0) {
      // comportamiento actual: Enter agrega el primero
      if (e.key === "Enter" && found[0]) add(found[0]);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(found.length - 1, i < 0 ? 0 : i + 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i < 0 ? 0 : i - 1));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const idx = activeIndex >= 0 ? activeIndex : 0;
      const p = found[idx];
      if (p) add(p);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpenResults(false);
      return;
    }
  };

  // Carrito
  const add = (p: Product) => {
    const currentStock = Number(p.stock ?? 0);
    if (currentStock <= 0) {
      if (
        confirm(
          "Este producto no tiene stock. ¿Ir a la página de PRODUCTOS para ajustar el inventario?",
        )
      ) {
        window.location.href = "/products";
      }
      return;
    }
    setCart((prev) => {
      const i = prev.findIndex((x) => x.product.id === p.id);
      if (i >= 0) {
        const wanted = prev[i].qty + 1;
        if (wanted > currentStock) {
          alert(`Solo hay ${currentStock} en stock.`);
          return prev;
        }
        const cp = [...prev];
        cp[i] = { ...cp[i], qty: wanted };
        return cp;
      }
      return [...prev, { product: p, qty: 1, unitPrice: Number(p.price) }];
    });
    setQ("");
    setFound([]);
    setOpenResults(false);
  };
  const remove = (id: number) =>
    setCart((prev) => prev.filter((i) => i.product.id !== id));
  const clearCart = () => {
    setCart([]);
    setReceived(0);
  };
  const inc = (id: number) =>
    setCart((prev) =>
      prev.map((i) => {
        if (i.product.id !== id) return i;

        const stock = Number(i.product.stock ?? 0);
        const isService = stock >= 9999;

        if (isService) return { ...i, qty: i.qty + 1 };
        if (stock <= 0) return i;

        const wanted = i.qty + 1;
        if (wanted > stock) return i;

        return { ...i, qty: wanted };
      }),
    );
  const dec = (id: number) =>
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === id ? { ...i, qty: Math.max(1, i.qty - 1) } : i,
      ),
    );
  const setPrice = (id: number, val: string) =>
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === id ? { ...i, unitPrice: Number(val || 0) } : i,
      ),
    );
  const addOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && found[0]) add(found[0]);
  };

  // Derivados
  const subtotal = useMemo(
    () => cart.reduce((a, i) => a + i.unitPrice * i.qty, 0),
    [cart],
  );
  const fee = useMemo(
    () => (payMethod === "DATAFONO" ? Math.round(subtotal * 0.05) : 0),
    [subtotal, payMethod],
  );
  const uiTotal = subtotal + fee;
  const change = useMemo(
    () => Math.max(0, received - uiTotal),
    [received, uiTotal],
  );

  useEffect(() => {
    if (payMethod !== "EFECTIVO") setReceived(uiTotal);
  }, [payMethod, uiTotal]);

  // Cobrar
  const checkout = useCallback(async () => {
    if (cart.length === 0) return;
    if (payMethod === "EFECTIVO" && received < uiTotal) {
      alert("Monto recibido insuficiente.");
      receivedRef.current?.focus();
      return;
    }
    const payload = {
      items: cart.map((i) => ({
        productId: i.product.id,
        qty: i.qty,
        unitPrice: i.unitPrice,
        taxRate: 0,
        discount: 0,
      })),
      payments: [{ method: payMethod, amount: subtotal }],
    };
    const r = await apiFetch(`/sales`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (r.ok) {
      setCart([]);
      setMsg("Venta creada ✅");
      setReceived(0);

      // === MOSTRAR TOAST ÉXITO 2s ===
      setToast({
        open: true,
        kind: "success",
        title: "¡Venta cobrada!",
        subtitle: `Total ${fmt(uiTotal)}`,
      });
      setTimeout(() => hideToast(), 2000);
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg("Error: " + (e?.error || "No se pudo crear la venta"));
      setToast({
        open: true,
        kind: "error",
        title: "Error al cobrar",
        subtitle: String(e?.error || "Intenta de nuevo"),
      });
      setTimeout(() => hideToast(), 2000);
    }

    setTimeout(() => setMsg(""), 2500);
  }, [cart, payMethod, subtotal, received, uiTotal]);

  // === PRELOAD DESDE SISTEMA DE APARTADOS (FINALIZACIÓN Y DEVOLUCIÓN) ===
  useEffect(() => {
    if (!role) return; // esperamos a conocer el rol (para crear SALDO VENTA si hace falta)

    try {
      const raw = window.localStorage.getItem("POS_PRELOAD");
      if (!raw) return;

      const data = JSON.parse(raw) as PosPreloadPayload;
      if (
        !data ||
        (data.source !== "LAYAWAY" && data.source !== "LAYAWAY_REFUND")
      ) {
        return;
      }

      (async () => {
        try {
          // ----- Caso 1: FINALIZAR VENTA DE APARTADO (ya existente) -----
          if (data.source === "LAYAWAY") {
            const r = await apiFetch(`/products/${data.productId}`);
            if (!r.ok) return;

            const p = await r.json();
            const prod: Product = {
              id: p.id,
              sku: p.sku,
              name: p.name,
              // Usamos el precio enviado desde el apartado (negociado),
              // si no viene, caemos al price del producto
              price: Number(data.price ?? p.price ?? 0),
              cost: Number(p.cost ?? 0),
              stock: Number(p.stock ?? 0),
            };

            setCart([
              {
                product: prod,
                qty: 1,
                unitPrice: prod.price,
              },
            ]);

            setMsg(
              `Producto de SISTEMA DE APARTADO cargado: ${prod.name} (${fmt(
                prod.price,
              )})`,
            );

            setToast({
              open: true,
              kind: "info",
              title: "Apartado cargado en POS",
              subtitle: `Sistema ${data.layawayId} – Cliente ${
                data.customerName ?? ""
              }`,
            });

            setTimeout(() => hideToast(), 2500);
          }

          // ----- Caso 2: DEVOLUCIÓN 50% (SALDO VENTA) -----
          if (data.source === "LAYAWAY_REFUND") {
            const amount = Number(data.refundAmount ?? 0);
            if (!amount || amount <= 0) return;

            // helper local para encontrar o crear producto SALDO VENTA
            const findOrCreateSaldoVenta =
              async (): Promise<Product | null> => {
                const r = await apiFetch(
                  `/products?q=SALDO%20VENTA&withStock=true`,
                );
                const rawList = await r.json();
                const list: Product[] = Array.isArray(rawList)
                  ? rawList
                  : (rawList?.rows ?? []);

                let p = list.find(
                  (x) =>
                    x &&
                    typeof x.name === "string" &&
                    x.name.toUpperCase() === "SALDO VENTA",
                );

                // Si no existe y eres ADMIN, lo creamos como servicio sin stock
                if (!p) {
                  if (role !== "ADMIN") {
                    alert(
                      "No existe el producto 'SALDO VENTA'. Pídele al administrador que lo cree en Productos.",
                    );
                    return null;
                  }

                  const created = await apiFetch(`/products`, {
                    method: "POST",
                    body: JSON.stringify({
                      name: "SALDO VENTA",
                      sku: "", // se autogenera en el backend
                      category: "SERVICIOS",
                      cost: 0,
                      price: 0,
                      taxRate: 0,
                      active: true,
                      minStock: 0,
                    }),
                  });

                  if (!created.ok) {
                    const err = await created.json().catch(() => ({}));
                    alert(
                      err?.error ||
                        "No se pudo crear el producto SALDO VENTA (se requiere rol ADMIN).",
                    );
                    return null;
                  }

                  const createdRaw = await created.json();
                  p = {
                    id: Number(createdRaw.id ?? 0),
                    sku: String(createdRaw.sku ?? ""),
                    name: String(createdRaw.name ?? "SALDO VENTA"),
                    price: Number(createdRaw.price ?? 0),
                    cost: Number(createdRaw.cost ?? 0),
                    stock: Number(createdRaw.stock ?? 0),
                  };
                }

                return p || null;
              };

            const baseProd = await findOrCreateSaldoVenta();
            if (!baseProd) return;

            const prod: Product = {
              ...baseProd,
              price: amount,
              stock: 9999, // servicio, sin control real de stock
            };

            // Carrito con 1 línea SALDO VENTA por el valor de la devolución
            setCart([{ product: prod, qty: 1, unitPrice: amount }]);
            setPayMethod("EFECTIVO"); // por defecto, luego lo puedes cambiar

            setMsg(`SALDO VENTA por devolución de apartado: ${fmt(amount)}`);
            setToast({
              open: true,
              kind: "info",
              title: "Devolución de apartado",
              subtitle: `Sistema ${data.layawayId} – Cliente ${
                data.customerName ?? ""
              }`,
            });
            setTimeout(() => hideToast(), 2500);
          }
        } finally {
          // Limpieza para que no se vuelva a cargar
          window.localStorage.removeItem("POS_PRELOAD");
        }
      })();
    } catch {
      window.localStorage.removeItem("POS_PRELOAD");
    }
  }, [role]); // 👈 se dispara cuando ya se conoce el rol

  // Atajos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // F2 => focus buscador
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      // Ctrl/⌘ + Enter => cobrar
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        checkout();
        return;
      }

      // TAB flow (solo si hay carrito, sin Shift+Tab, y estando en buscador o recibido)
      if (
        e.key === "Tab" &&
        !e.shiftKey &&
        cart.length > 0 &&
        (document.activeElement === searchRef.current ||
          document.activeElement === receivedRef.current)
      ) {
        e.preventDefault();

        // Paso 1: ir a Recibido y ponerlo igual al total
        if (tabStage === 0) {
          if (payMethod !== "EFECTIVO") setPayMethod("EFECTIVO");
          setReceived(uiTotal);
          // esperar un tick por si cambia el payMethod y aparece el input
          setTimeout(() => {
            receivedRef.current?.focus();
            receivedRef.current?.select();
          }, 0);
          setTabStage(1);
          return;
        }

        // Paso 2: cobrar
        setTabStage(0);
        checkout();

        // opcional: volver al buscador inmediatamente
        setTimeout(() => {
          searchRef.current?.focus();
          searchRef.current?.select();
        }, 0);

        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checkout, cart.length, payMethod, uiTotal, tabStage]);

  // Reset tabStage si el carrito queda vacío
  useEffect(() => {
    if (cart.length === 0) setTabStage(0);
  }, [cart.length]);

  // PAPELERÍA
  type ProductsResp = Product[] | { total: number; rows: Product[] };

  function asProduct(raw: unknown): Product | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Partial<Record<keyof Product, unknown>>;
    return {
      id: Number(r.id ?? 0),
      sku: String(r.sku ?? ""),
      name: String(r.name ?? "PAPELERIA"),
      price: Number(r.price ?? "0"),
      cost: Number(r.cost ?? "0"),
      stock: Number(r.stock ?? 0),
    };
  }

  const addPaperItem = async () => {
    // 1) Buscar si ya existe el producto PAPELERIA
    const r = await apiFetch(`/products?q=PAPELERIA&withStock=true`);
    const payload = (await r.json()) as ProductsResp;
    const list: Product[] = Array.isArray(payload) ? payload : payload.rows;

    let paper = list.find(
      (x) =>
        x && typeof x.name === "string" && x.name.toUpperCase() === "PAPELERIA",
    );

    // 2) Si no existe, crearlo (requiere rol ADMIN)
    if (!paper) {
      const created = await apiFetch(`/products`, {
        method: "POST",
        body: JSON.stringify({
          name: "PAPELERIA",
          sku: "", // se autogenera según tu backend
          category: "SERVICIOS",
          cost: 0,
          price: 0,
          taxRate: 0,
          active: true,
          minStock: 0,
        }),
      });

      if (!created.ok) {
        const err = await created.json().catch(() => ({}));
        alert(
          err?.error ||
            "No se pudo crear el item PAPELERIA (se requiere rol ADMIN).",
        );
        return;
      }

      const rawCreated = await created.json();
      const parsed = asProduct(rawCreated);
      if (!parsed) {
        alert("Respuesta inesperada al crear PAPELERIA.");
        return;
      }
      paper = parsed;
    }

    // 3) Agregar al carrito como servicio sin límite de stock
    setCart((prev): CartItem[] => [
      ...prev,
      { product: { ...paper!, stock: 9999 }, qty: 1, unitPrice: 0 },
    ]);
  };

  return (
    <div className="mx-auto text-gray-200 px-2 sm:px-4">
      <h1 className="text-xl sm:text-2xl font-bold mb-3 text-cyan-400">POS</h1>

      {/* ===================== MÓVIL ===================== */}
      <div className="lg:hidden">
        {/* Buscador */}
        <div
          className="rounded-xl p-3"
          style={{
            backgroundColor: COLORS.bgCard,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div className="relative">
            <div className="flex items-center gap-2">
              <input
                ref={searchRef}
                className="rounded px-3 py-3 w-full text-lg outline-none placeholder-gray-400 shadow-inner"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                }}
                placeholder="F2 para enfocar. Buscar por nombre o SKU / escanear código"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onSearchKeyDown}
                autoFocus
                onFocus={() => {
                  if (found.length > 0) setOpenResults(true);
                }}
              />

              <button
                onClick={addPaperItem}
                className="px-3 py-2 rounded-lg text-xs font-medium transition shadow"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,255,255,0.15), rgba(255,0,255,0.15))",
                  border: `1px solid ${COLORS.border}`,
                }}
                title="Agregar item de servicio PAPELERÍA"
              >
                <span className="text-cyan-300">+ PAP</span>
              </button>
            </div>

            {openResults && found.length > 0 && (
              <div
                ref={resultsRef}
                className="absolute left-0 right-0 z-[60] mt-2 rounded-xl overflow-hidden"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                  boxShadow:
                    "0 0 18px rgba(0,0,0,.35), 0 0 22px rgba(0,255,255,.07), 0 0 22px rgba(255,0,255,.07)",
                }}
              >
                <div className="max-h-56 overflow-auto">
                  <ul className="divide-y divide-[#1E1F4B]">
                    {found.map((p, idx) => (
                      <li key={p.id}>
                        <button
                          ref={(el) => {
                            itemRefs.current[idx] = el;
                          }}
                          className="w-full text-left rounded-lg p-2 transition"
                          style={{
                            backgroundColor:
                              idx === activeIndex ? "#191B4B" : "transparent",
                          }}
                          onClick={() => add(p)}
                          onMouseEnter={() => setActiveIndex(idx)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs text-gray-400 font-mono truncate">
                                {p.sku}
                              </div>
                              <div className="font-medium truncate">
                                {p.name}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-semibold text-cyan-300">
                                {fmt(Number(p.price))}
                              </div>
                              <div className="text-[11px] text-gray-300">
                                Stock: {Number(p.stock ?? 0)}
                              </div>
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Carrito scroll (deja espacio para el footer fijo) */}
        <div className="mt-3 pb-28">
          <div
            className="rounded-xl overflow-hidden"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              className="flex items-center justify-between px-3 py-3"
              style={{ borderBottom: `1px solid ${COLORS.border}` }}
            >
              <div className="font-semibold text-cyan-300">Carrito</div>
              <button
                onClick={clearCart}
                className="text-xs px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                }}
                disabled={cart.length === 0}
              >
                Vaciar
              </button>
            </div>

            {/* Cards móvil */}
            <div className="p-3 space-y-2">
              {cart.length === 0 && (
                <div
                  className="rounded-xl border p-3 text-center text-gray-400 text-sm"
                  style={{ borderColor: COLORS.border }}
                >
                  Carrito vacío. Busca productos y presiona <b>Enter</b>.
                </div>
              )}

              {cart.map((i) => {
                const stock = Number(i.product.stock ?? 0);
                const isService = stock >= 9999;
                const lineTotal = i.unitPrice * i.qty;

                return (
                  <div
                    key={i.product.id}
                    className="rounded-xl border p-3 space-y-2"
                    style={{
                      borderColor: COLORS.border,
                      backgroundColor: "rgba(0,0,0,0.25)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] text-gray-400 font-mono truncate">
                          {i.product.sku || "—"}
                        </div>
                        <div className="font-semibold text-cyan-200 break-words">
                          {i.product.name}
                        </div>
                        {!isService && (
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            Stock: {stock}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => remove(i.product.id)}
                        className="shrink-0 inline-flex items-center justify-center rounded-md p-2 hover:bg-white/5 transition"
                        aria-label="Eliminar"
                      >
                        <Image
                          src="/borrar.png"
                          alt="Eliminar"
                          width={18}
                          height={18}
                          className="opacity-90"
                        />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] uppercase text-gray-400 mb-1">
                          Precio unit.
                        </label>
                        <input
                          className="w-full rounded px-3 py-2 text-right outline-none"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                          inputMode="numeric"
                          value={i.unitPrice === 0 ? "" : String(i.unitPrice)}
                          placeholder="0"
                          onChange={(e) =>
                            setPrice(
                              i.product.id,
                              e.target.value.replace(/[^\d]/g, ""),
                            )
                          }
                        />
                      </div>

                      <div className="text-right">
                        <div className="text-[11px] uppercase text-gray-400 mb-1">
                          Total
                        </div>
                        <div className="text-lg font-semibold text-pink-300">
                          {fmt(lineTotal)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="text-xs text-gray-400">
                        Costo:{" "}
                        <span className="text-gray-200">
                          {fmt(Number(i.product.cost))}
                        </span>
                      </div>

                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => dec(i.product.id)}
                          className="px-3 py-2 rounded"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                        >
                          -
                        </button>
                        <span className="min-w-[2rem] text-center font-semibold">
                          {i.qty}
                        </span>
                        <button
                          onClick={() => inc(i.product.id)}
                          className="px-3 py-2 rounded"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {!isService && stock > 0 && i.qty >= stock && (
                      <div className="text-[11px] text-amber-300">
                        ⚠ Límite de stock ({stock})
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer fijo (móvil): método + total + cobrar */}
        <div
          className="fixed bottom-0 left-0 right-0 z-40 p-3"
          style={{
            backgroundColor: "rgba(10, 10, 25, 0.92)",
            backdropFilter: "blur(8px)",
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          <div className="max-w-6xl mx-auto space-y-2">
            {/* Método de pago (móvil) */}
            <div
              className="rounded-xl p-2"
              style={{
                backgroundColor: COLORS.bgCard,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div className="text-xs text-gray-300 mb-2">Método de pago</div>

              <div className="grid grid-cols-3 gap-2">
                {(["EFECTIVO", "QR_LLAVE", "DATAFONO"] as PayMethod[]).map(
                  (m) => {
                    const active = payMethod === m;
                    return (
                      <button
                        key={m}
                        onClick={() => setPayMethod(m)}
                        className="px-2 py-2 text-xs rounded-lg transition"
                        style={{
                          border: `1px solid ${COLORS.border}`,
                          backgroundColor: active ? "#0D0F38" : COLORS.input,
                          boxShadow: active
                            ? `0 0 0.5rem rgba(0,255,255,.35), inset 0 0 0.5rem rgba(255,0,255,.15)`
                            : "none",
                          color: active ? COLORS.cyan : COLORS.text,
                        }}
                      >
                        {m === "QR_LLAVE" ? "QR / LLAVE" : m}
                      </button>
                    );
                  },
                )}
              </div>

              {/* Recibido + cambio SOLO en efectivo */}
              {payMethod === "EFECTIVO" && (
                <div
                  className="mt-2 pt-2 space-y-2"
                  style={{ borderTop: `1px solid ${COLORS.border}` }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] uppercase text-gray-400 mb-1">
                        Recibido
                      </div>
                      <input
                        ref={receivedRef}
                        className="rounded px-3 py-2 w-full text-right text-base outline-none"
                        style={{
                          backgroundColor: COLORS.input,
                          border: `1px solid ${COLORS.border}`,
                        }}
                        inputMode="numeric"
                        value={received ? received.toString() : ""}
                        placeholder="0"
                        onChange={(e) =>
                          setReceived(parseMoneyInput(e.target.value))
                        }
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") checkout();
                        }}
                      />
                    </div>

                    <div className="text-right">
                      <div className="text-[11px] uppercase text-gray-400 mb-1">
                        Cambio
                      </div>
                      <div className="text-lg font-semibold text-cyan-300">
                        {fmt(change)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Total */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-300">Total</div>
              <div className="text-xl font-extrabold text-cyan-300">
                {fmt(uiTotal)}
              </div>
            </div>

            {/* Cobrar */}
            <button
              className="w-full py-3 rounded-lg text-lg font-semibold transition disabled:opacity-60"
              style={{
                color: "#001014",
                background:
                  "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                boxShadow:
                  "0 0 18px rgba(0,255,255,.35), 0 0 28px rgba(255,0,255,.25)",
              }}
              onClick={checkout}
              disabled={cart.length === 0}
            >
              Cobrar
            </button>

            {!!msg && <div className="text-sm text-cyan-300">{msg}</div>}
          </div>
        </div>
      </div>

      {/* ===================== DESKTOP ===================== */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Columna izquierda */}
          <section className="lg:col-span-2 space-y-3">
            {/* Buscar producto */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: COLORS.bgCard,
                border: `1px solid ${COLORS.border}`,
                boxShadow:
                  "0 0 22px rgba(0,255,255,.06), 0 0 30px rgba(255,0,255,.06)",
              }}
            >
              <div
                className="px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${COLORS.border}` }}
              >
                <div>
                  <div className="font-semibold text-cyan-300">
                    Buscar producto
                  </div>
                  <div className="text-xs text-gray-400">
                    F2 para enfocar • Enter para agregar el primero • Ctrl +
                    Enter para cobrar
                  </div>
                </div>

                <button
                  onClick={addPaperItem}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition shadow hover:scale-[1.01]"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(0,255,255,0.15), rgba(255,0,255,0.15))",
                    border: `1px solid ${COLORS.border}`,
                    boxShadow: "0 0 14px rgba(255,255,255,.07)",
                  }}
                  title="Agregar item de servicio PAPELERÍA"
                >
                  <span className="text-cyan-300">+ PAPELERÍA</span>
                </button>
              </div>

              {/* Input + Dropdown */}
              <div className="p-4">
                <div className="relative">
                  <input
                    ref={searchRef}
                    className="rounded-xl px-4 py-3 w-full text-lg outline-none placeholder-gray-400 shadow-inner"
                    style={{
                      backgroundColor: COLORS.input,
                      border: `1px solid ${COLORS.border}`,
                    }}
                    placeholder="Buscar por nombre o SKU / escanear código"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={onSearchKeyDown}
                    onFocus={() => {
                      if (found.length > 0) setOpenResults(true);
                    }}
                  />

                  {!!q && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      {loading ? "Buscando..." : "Enter ↵"}
                    </div>
                  )}

                  {openResults && found.length > 0 && (
                    <div
                      ref={resultsRef}
                      className="absolute left-0 right-0 z-[60] mt-2 rounded-xl overflow-hidden"
                      style={{
                        backgroundColor: COLORS.input,
                        border: `1px solid ${COLORS.border}`,
                        boxShadow:
                          "0 0 18px rgba(0,0,0,.35), 0 0 22px rgba(0,255,255,.07), 0 0 22px rgba(255,0,255,.07)",
                      }}
                    >
                      <div className="max-h-80 overflow-auto">
                        <ul className="divide-y divide-[#1E1F4B]">
                          {found.map((p, idx) => (
                            <li key={p.id}>
                              <button
                                ref={(el) => {
                                  itemRefs.current[idx] = el;
                                }}
                                className="w-full text-left px-3 py-3 transition"
                                style={{
                                  backgroundColor:
                                    idx === activeIndex
                                      ? "#191B4B"
                                      : "transparent",
                                }}
                                onClick={() => add(p)}
                                onMouseEnter={() => setActiveIndex(idx)}
                              >
                                {/* tu contenido igual */}
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-400 font-mono truncate">
                                      {p.sku}
                                    </div>
                                    <div className="font-medium truncate">
                                      {p.name}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="font-semibold text-cyan-300">
                                      {fmt(Number(p.price))}
                                    </div>
                                    <div className="text-[11px] text-gray-300">
                                      Stock: {Number(p.stock ?? 0)}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div
                        className="px-3 py-2 text-[11px] text-gray-400"
                        style={{ borderTop: `1px solid ${COLORS.border}` }}
                      >
                        ↑ ↓ para navegar • Enter agrega • Esc cierra
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Carrito */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: COLORS.bgCard,
                border: `1px solid ${COLORS.border}`,
                boxShadow: "0 0 20px rgba(0,0,0,.28)",
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: `1px solid ${COLORS.border}` }}
              >
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-cyan-300">Carrito</div>
                  <span
                    className="text-xs px-2 py-1 rounded-full"
                    style={{
                      backgroundColor: COLORS.input,
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    {cart.length} ítems
                  </span>
                </div>

                <button
                  onClick={clearCart}
                  className="text-sm px-3 py-1.5 rounded-lg transition disabled:opacity-50 hover:brightness-110"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  disabled={cart.length === 0}
                >
                  Vaciar
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr
                      style={{ borderBottom: `1px solid ${COLORS.border}` }}
                      className="text-left"
                    >
                      <th className="py-2 px-4 text-gray-300">SKU</th>
                      <th className="px-3 text-gray-300">Producto</th>
                      <th className="px-3 text-right text-gray-300">Costo</th>
                      <th className="px-3 text-right text-gray-300">Precio</th>
                      <th className="px-3 text-center text-gray-300">Cant.</th>
                      <th className="px-3 text-right text-gray-300">Total</th>
                      <th className="px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.length === 0 && (
                      <tr>
                        <td className="py-10 px-4 text-gray-400" colSpan={7}>
                          Carrito vacío. Busca productos y presiona <b>Enter</b>{" "}
                          para agregarlos.
                        </td>
                      </tr>
                    )}

                    {cart.map((i) => {
                      const stock = Number(i.product.stock ?? 0);
                      const isService = stock >= 9999;

                      return (
                        <tr
                          key={i.product.id}
                          style={{ borderBottom: `1px solid ${COLORS.border}` }}
                          className="hover:bg-[#191B4B]"
                        >
                          <td className="py-2 px-4 font-mono text-sm text-gray-300">
                            {i.product.sku || "—"}
                          </td>

                          <td className="px-3">
                            <div className="flex items-center gap-2">
                              <div className="font-medium">
                                {i.product.name}
                              </div>
                              {isService && (
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded-full"
                                  style={{
                                    backgroundColor: "rgba(255,0,255,.12)",
                                    border: `1px solid ${COLORS.border}`,
                                    color: "#ffb3ff",
                                  }}
                                >
                                  SERVICIO
                                </span>
                              )}
                            </div>
                            {!isService && (
                              <div className="text-xs text-gray-400">
                                Stock: {stock}
                                {stock > 0 && i.qty >= stock ? (
                                  <span className="ml-2 text-amber-300">
                                    ⚠ límite alcanzado
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </td>

                          <td className="px-3 text-right whitespace-nowrap">
                            {fmt(Number(i.product.cost))}
                          </td>

                          <td className="px-3 text-right">
                            <input
                              className="rounded-lg px-3 py-2 w-32 text-right outline-none"
                              style={{
                                backgroundColor: COLORS.input,
                                border: `1px solid ${COLORS.border}`,
                              }}
                              inputMode="numeric"
                              value={
                                i.unitPrice === 0 ? "" : String(i.unitPrice)
                              }
                              placeholder="0"
                              onChange={(e) =>
                                setPrice(
                                  i.product.id,
                                  e.target.value.replace(/[^\d]/g, ""),
                                )
                              }
                            />
                          </td>

                          <td className="px-3 text-center">
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => dec(i.product.id)}
                                className="px-2 py-1 rounded-lg hover:brightness-110"
                                style={{
                                  backgroundColor: COLORS.input,
                                  border: `1px solid ${COLORS.border}`,
                                }}
                              >
                                -
                              </button>

                              <span className="min-w-[1.5rem] text-center font-semibold">
                                {i.qty}
                              </span>

                              <button
                                onClick={() => inc(i.product.id)}
                                className="px-2 py-1 rounded-lg hover:brightness-110"
                                style={{
                                  backgroundColor: COLORS.input,
                                  border: `1px solid ${COLORS.border}`,
                                }}
                              >
                                +
                              </button>
                            </div>
                          </td>

                          <td className="px-3 text-right whitespace-nowrap text-cyan-300 font-semibold">
                            {fmt(i.unitPrice * i.qty)}
                          </td>

                          <td className="px-3 text-right">
                            <button
                              onClick={() => remove(i.product.id)}
                              className="inline-flex items-center justify-center rounded-md p-2 hover:bg-white/5 transition transform hover:scale-110"
                              aria-label="Eliminar producto"
                              title="Eliminar"
                            >
                              <Image
                                src="/borrar.png"
                                alt="Eliminar"
                                width={18}
                                height={18}
                                className="opacity-90"
                              />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Columna derecha */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-6 space-y-3">
              {/* Total */}
              <div
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: COLORS.bgCard,
                  border: `1px solid ${COLORS.border}`,
                  boxShadow:
                    "0 0 20px rgba(0,255,255,.06), 0 0 26px rgba(255,0,255,.06), 0 0 22px rgba(0,0,0,.35)",
                }}
              >
                <div
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div className="text-xs text-gray-400">Total a cobrar</div>
                  <div className="text-4xl font-extrabold text-cyan-300 leading-tight">
                    {fmt(uiTotal)}
                  </div>
                  {payMethod === "DATAFONO" && (
                    <div className="text-xs text-gray-400 mt-1">
                      Incluye comisión: {fmt(fee)}
                    </div>
                  )}
                </div>

                {/* Panel de pago */}
                <div
                  className="mt-3 rounded-xl p-4 space-y-3"
                  style={{
                    backgroundColor: "rgba(0,0,0,.22)",
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div>
                    <div className="text-sm mb-1 text-gray-300">
                      Método de pago
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        ["EFECTIVO", "QR_LLAVE", "DATAFONO"] as PayMethod[]
                      ).map((m) => {
                        const active = payMethod === m;
                        return (
                          <button
                            key={m}
                            onClick={() => setPayMethod(m)}
                            className="px-2 py-2 text-sm rounded-lg transition"
                            style={{
                              border: `1px solid ${COLORS.border}`,
                              backgroundColor: active
                                ? "#0D0F38"
                                : COLORS.input,
                              boxShadow: active
                                ? `0 0 0.5rem rgba(0,255,255,.35), inset 0 0 0.5rem rgba(255,0,255,.15)`
                                : "none",
                              color: active ? COLORS.cyan : COLORS.text,
                            }}
                          >
                            {m === "QR_LLAVE" ? "QR / LLAVE" : m}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Row label="Subtotal" value={subtotal} />
                    {payMethod === "DATAFONO" && (
                      <Row label="Comisión DATAFONO (5%)" value={fee} />
                    )}
                    <Row label="Total" value={uiTotal} big />
                  </div>

                  {payMethod === "EFECTIVO" && (
                    <div
                      className="space-y-2 pt-3"
                      style={{ borderTop: `1px solid ${COLORS.border}` }}
                    >
                      <label className="text-sm text-gray-300">Recibido</label>
                      <input
                        ref={receivedRef}
                        className="rounded-xl px-4 py-3 w-full text-right text-xl outline-none"
                        style={{
                          backgroundColor: COLORS.input,
                          border: `1px solid ${COLORS.border}`,
                        }}
                        inputMode="numeric"
                        value={received ? received.toString() : ""}
                        placeholder="0"
                        onChange={(e) =>
                          setReceived(parseMoneyInput(e.target.value))
                        }
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") checkout();
                        }}
                      />
                      <Row label="Cambio" value={change} big />
                    </div>
                  )}

                  <button
                    className="w-full py-3 rounded-xl text-lg font-semibold transition disabled:opacity-60 hover:brightness-110"
                    style={{
                      color: "#001014",
                      background:
                        "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                      boxShadow:
                        "0 0 18px rgba(0,255,255,.35), 0 0 28px rgba(255,0,255,.25)",
                    }}
                    onClick={checkout}
                    disabled={cart.length === 0}
                    title={`Ctrl + Enter para cobrar ${uiTotal.toLocaleString("es-CO")}`}
                  >
                    Cobrar
                  </button>

                  {!!msg && <div className="text-sm text-cyan-300">{msg}</div>}

                  <div className="text-xs text-gray-400">
                    {role === "EMPLOYEE" ? (
                      <>
                        ¿Sin stock cargado?{" "}
                        <span className="text-cyan-300">
                          Contacta al administrador
                        </span>{" "}
                        para incluir stock.
                      </>
                    ) : (
                      <>
                        ¿Sin stock cargado?{" "}
                        <Link
                          href="/stock-in"
                          className="underline text-cyan-300"
                        >
                          Ingresa stock
                        </Link>{" "}
                        y vuelve.
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

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

function Row({
  label,
  value,
  big = false,
}: {
  label: string;
  value: number;
  big?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        big ? "text-xl font-semibold" : ""
      }`}
    >
      <span className="text-gray-300">{label}</span>
      <span className={big ? "text-cyan-300" : ""}>{fmt(value)}</span>
    </div>
  );
}
