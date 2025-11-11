"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

// ===== Tipos =====
type Product = {
  id: number;
  sku: string;
  name: string;
  price: string;
  cost: string;
  stock?: number;
};
type CartItem = { product: Product; qty: number; unitPrice: number };
type PayMethod = "EFECTIVO" | "QR_LLAVE" | "DATAFONO";

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
            {/* Icono simple con CSS (✔ / ! / i) */}
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

  // Toast global de esta pantalla
  const [toast, setToast] = useState<ToastState>({
    open: false,
    kind: "success",
    title: "",
  });
  const hideToast = () => setToast((t) => ({ ...t, open: false }));

  const searchRef = useRef<HTMLInputElement>(null);
  const receivedRef = useRef<HTMLInputElement>(null);

  // Buscar
  useEffect(() => {
    let abort = false;
    const run = async () => {
      if (!q) {
        setFound([]);
        return;
      }
      setLoading(true);
      try {
        const url = new URL(`/products`, window.location.origin);
        url.searchParams.set("q", q);
        url.searchParams.set("withStock", "true");
        const r = await apiFetch(`/products?${url.searchParams.toString()}`);
        const data: Product[] = await r.json();
        if (!abort) setFound(data);
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

  // Carrito
  const add = (p: Product) => {
    const currentStock = Number(p.stock ?? 0);
    if (currentStock <= 0) {
      if (confirm("Este producto no tiene stock. ¿Ir a cargar stock ahora?"))
        window.location.href = "/stock-in";
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
  };
  const remove = (id: number) =>
    setCart((prev) => prev.filter((i) => i.product.id !== id));
  const clearCart = () => {
    setCart([]);
    setReceived(0);
  };
  const inc = (id: number) =>
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === id
          ? { ...i, qty: Math.min((i.product.stock ?? 0) as number, i.qty + 1) }
          : i
      )
    );
  const dec = (id: number) =>
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === id ? { ...i, qty: Math.max(1, i.qty - 1) } : i
      )
    );
  const setPrice = (id: number, val: string) =>
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === id ? { ...i, unitPrice: Number(val || 0) } : i
      )
    );
  const addOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && found[0]) add(found[0]);
  };

  // Derivados
  const subtotal = useMemo(
    () => cart.reduce((a, i) => a + i.unitPrice * i.qty, 0),
    [cart]
  );
  const fee = useMemo(
    () => (payMethod === "DATAFONO" ? Math.round(subtotal * 0.05) : 0),
    [subtotal, payMethod]
  );
  const uiTotal = subtotal + fee;
  const change = useMemo(
    () => Math.max(0, received - uiTotal),
    [received, uiTotal]
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
      // (opcional) toast de error
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

  // Atajos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        checkout();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checkout]);

  // PAPELERÍA
  const addPaperItem = async () => {
    const toProduct = (raw: unknown): Product => {
      const r = raw as Partial<Product>;
      return {
        id: Number(r.id ?? 0),
        sku: String(r.sku ?? ""),
        name: String(r.name ?? "PAPELERIA"),
        price: String(r.price ?? "0"),
        cost: String(r.cost ?? "0"),
        stock: Number(r.stock ?? 0),
      };
    };
    const r = await apiFetch(`/products?q=PAPELERIA&withStock=true`);
    const list: unknown = await r.json();
    let raw = Array.isArray(list)
      ? (list.find(
          (x) =>
            typeof x === "object" &&
            x !== null &&
            String((x as { name?: string }).name ?? "").toUpperCase() ===
              "PAPELERIA"
        ) as Partial<Product> | undefined)
      : undefined;
    if (!raw) {
      const created = await apiFetch(`/products`, {
        method: "POST",
        body: JSON.stringify({
          name: "PAPELERIA",
          sku: "",
          category: "SERVICIOS",
          cost: 0,
          price: 0,
          taxRate: 0,
          active: true,
          minStock: 0,
        }),
      });
      raw = (await created.json()) as Partial<Product>;
    }
    const paper = toProduct(raw);
    setCart((prev): CartItem[] => [
      ...prev,
      { product: { ...paper, stock: 9999 }, qty: 1, unitPrice: 0 },
    ]);
  };

  return (
    <div className="mx-auto text-gray-200">
      <h1 className="text-2xl font-bold mb-4 text-cyan-400">POS</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Columna izquierda */}
        <section className="lg:col-span-2 space-y-3">
          <div
            className="rounded-xl p-3"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
          >
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
                onKeyDown={addOnEnter}
                autoFocus
              />
              <button
                onClick={addPaperItem}
                className="px-3 py-2 rounded-lg text-sm font-medium transition shadow"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,255,255,0.15), rgba(255,0,255,0.15))",
                  border: `1px solid ${COLORS.border}`,
                }}
                title="Agregar item de servicio PAPELERÍA"
              >
                <span className="text-cyan-300">+ PAPELERÍA</span>
              </button>
            </div>

            {loading && (
              <div className="text-sm mt-2 text-gray-400">Buscando…</div>
            )}
            {found.length > 0 && (
              <div
                className="rounded-lg p-2 mt-2 max-h-72 overflow-auto"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <ul className="divide-y divide-[#1E1F4B]">
                  {found.map((p) => (
                    <li key={p.id} className="py-2">
                      <button
                        className="w-full text-left rounded-lg p-2 transition"
                        onClick={() => add(p)}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = "#191B4B")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "transparent")
                        }
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs text-gray-400 font-mono">
                              {p.sku}
                            </div>
                            <div className="font-medium">{p.name}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-cyan-300">
                              {fmt(Number(p.price))}
                            </div>
                            <div className="text-[11px]">
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: "#1E1F4B" }}
                              >
                                Stock: {Number(p.stock ?? 0)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Carrito */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: `1px solid ${COLORS.border}` }}
            >
              <div className="font-semibold text-cyan-300">Carrito</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearCart}
                  className="text-sm px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  disabled={cart.length === 0}
                >
                  Vaciar
                </button>
              </div>
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
                      <td className="py-6 px-4 text-gray-400" colSpan={7}>
                        Carrito vacío. Busca productos y presiona <b>Enter</b>{" "}
                        para agregarlos.
                      </td>
                    </tr>
                  )}
                  {cart.map((i) => (
                    <tr
                      key={i.product.id}
                      style={{ borderBottom: `1px solid ${COLORS.border}` }}
                      className="hover:bg-[#191B4B]"
                    >
                      <td className="py-2 px-4 font-mono text-sm text-gray-300">
                        {i.product.sku}
                      </td>
                      <td className="px-3">
                        <div className="font-medium">{i.product.name}</div>
                        <div className="text-xs text-gray-400">
                          Stock: {Number(i.product.stock ?? 0)}
                        </div>
                      </td>
                      <td className="px-3 text-right whitespace-nowrap">
                        {fmt(Number(i.product.cost))}
                      </td>
                      <td className="px-3 text-right">
                        <input
                          className="rounded px-2 py-1 w-28 text-right outline-none"
                          style={{
                            backgroundColor: COLORS.input,
                            border: `1px solid ${COLORS.border}`,
                          }}
                          inputMode="numeric"
                          value={String(i.unitPrice)}
                          onChange={(e) =>
                            setPrice(
                              i.product.id,
                              e.target.value.replace(/[^\d]/g, "")
                            )
                          }
                        />
                      </td>
                      <td className="px-3 text-center">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => dec(i.product.id)}
                            className="px-2 rounded"
                            style={{
                              backgroundColor: COLORS.input,
                              border: `1px solid ${COLORS.border}`,
                            }}
                          >
                            -
                          </button>
                          <span className="min-w-[1.5rem] text-center">
                            {i.qty}
                          </span>
                          <button
                            onClick={() => inc(i.product.id)}
                            className="px-2 rounded"
                            style={{
                              backgroundColor: COLORS.input,
                              border: `1px solid ${COLORS.border}`,
                            }}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-3 text-right whitespace-nowrap text-cyan-300">
                        {fmt(i.unitPrice * i.qty)}
                      </td>
                      <td className="px-3 text-right">
                        <button
                          onClick={() => remove(i.product.id)}
                          className="text-pink-400 underline"
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Columna derecha */}
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-6">
            <div
              className="rounded-xl p-4 space-y-3"
              style={{
                backgroundColor: COLORS.bgCard,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div>
                <div className="text-sm mb-1 text-gray-300">Método de pago</div>
                <div className="grid grid-cols-3 gap-2">
                  {(["EFECTIVO", "QR_LLAVE", "DATAFONO"] as PayMethod[]).map(
                    (m) => {
                      const active = payMethod === m;
                      return (
                        <button
                          key={m}
                          onClick={() => setPayMethod(m)}
                          className="px-2 py-2 text-sm rounded-lg transition"
                          style={{
                            border: `1px solid ${COLORS.border}`,
                            backgroundColor: active ? "#0D0F38" : COLORS.input,
                            boxShadow: active
                              ? `0 0 0.5rem rgba(0,255,255,.35), inset 0 0 0.5rem rgba(255,0,255,.15)`
                              : "none",
                            color: active ? COLORS.cyan : COLORS.text,
                          }}
                        >
                          {m === "QR_LLAVE" ? "QR / Llave" : m}
                        </button>
                      );
                    }
                  )}
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
                  className="space-y-2 pt-2"
                  style={{ borderTop: `1px solid ${COLORS.border}` }}
                >
                  <label className="text-sm text-gray-300">Recibido</label>
                  <input
                    ref={receivedRef}
                    className="rounded px-3 py-2 w-full text-right text-lg outline-none"
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
                className="w-full py-3 rounded-lg text-lg font-semibold transition"
                style={{
                  color: "#001014",
                  background:
                    "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                  boxShadow:
                    "0 0 18px rgba(0,255,255,.35), 0 0 28px rgba(255,0,255,.25)",
                }}
                onClick={checkout}
                disabled={cart.length === 0}
                title={`Ctrl + Enter para cobrar ${uiTotal.toLocaleString(
                  "es-CO"
                )}`}
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
                    <Link href="/stock-in" className="underline text-cyan-300">
                      Ingresa stock
                    </Link>{" "}
                    y vuelve.
                  </>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Toast Gamer */}
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
