"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Product = {
  id: number;
  sku: string;
  name: string;
  stock?: number;
  cost?: string | number;
};

type ProductApiRow = {
  id: number;
  sku: string;
  name: string;
  stock?: number;
  cost?: string | number | null;
};

const COLORS = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  cyan: "#00FFFF",
  pink: "#FF00FF",
  text: "#E5E5E5",
};

type MovementType = "in" | "out";

export default function StockInPage() {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState<number | "">("");
  const [unitCost, setUnitCost] = useState<number | "">("");
  const [msg, setMsg] = useState("");

  // NUEVO: tipo de movimiento (entrada/salida)
  const [movementType, setMovementType] = useState<MovementType>("in");

  // Buscar productos
  useEffect(() => {
    let abort = false;

    const run = async () => {
      if (!q.trim()) {
        setFound([]);
        return;
      }

      const params = new URLSearchParams();
      params.set("q", q.trim());
      params.set("withStock", "true");
      params.set("includeInactive", "false");
      params.set("pageSize", "50");

      try {
        const r = await apiFetch(`/products?${params.toString()}`);
        const json = (await r.json()) as {
          total: number;
          rows: ProductApiRow[];
        };

        if (!abort) {
          const mapped: Product[] = json.rows.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            stock: p.stock,
            cost: p.cost ?? undefined,
          }));
          setFound(mapped);
        }
      } catch {
        if (!abort) setFound([]);
      }
    };

    const t = setTimeout(run, 200);
    return () => {
      abort = true;
      clearTimeout(t);
    };
  }, [q]);

  const choose = async (p: Product) => {
    if (p.cost === undefined) {
      try {
        const r = await apiFetch(`/products/${p.id}`);
        const full = await r.json();
        setSelected({ ...p, cost: full?.cost });
        return;
      } catch {
        setSelected(p);
        return;
      }
    }
    setSelected(p);
  };

  const resetAll = () => {
    setSelected(null);
    setQty("");
    setUnitCost("");
    setQ("");
    setFound([]);
    setMovementType("in");
  };

  const save = async () => {
    if (!selected || !qty) return;
    if (Number(qty) <= 0) return;

    try {
      if (movementType === "in") {
        if (unitCost === "" || Number(unitCost) < 0) return;

        const payload = {
          productId: selected.id,
          qty: Number(qty),
          unitCost: Number(unitCost),
          reference: "COMPRA",
        };

        const r = await apiFetch(`/stock/in`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          setMsg("Error: " + (e?.error || "No se pudo registrar el ingreso"));
        } else {
          setMsg("Ingreso registrado ✅");
          resetAll();
        }
      } else {
        // movementType === "out"
        const payload = {
          productId: selected.id,
          qty: Number(qty),
          reference: "AJUSTE",
        };

        const r = await apiFetch(`/stock/out`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          setMsg("Error: " + (e?.error || "No se pudo registrar la salida"));
        } else {
          setMsg("Salida de stock registrada ✅");
          resetAll();
        }
      }
    } catch {
      setMsg("Error de comunicación con el servidor");
    }

    setTimeout(() => setMsg(""), 2500);
  };

  const fmtCOP = (v: unknown) => {
    const n = Number(v);
    return isNaN(n) ? "—" : `$${n.toLocaleString("es-CO")}`;
  };

  const saveDisabled =
    !selected ||
    !qty ||
    Number(qty) <= 0 ||
    (movementType === "in" &&
      (unitCost === "" || Number(unitCost) < 0 || isNaN(Number(unitCost))));

  return (
    <div className="max-w-3xl mx-auto text-gray-200 space-y-6">
      <h1 className="text-2xl font-bold text-cyan-400">Ajuste de stock</h1>

      {/* Selector tipo de movimiento */}
      <div className="flex gap-3 items-center">
        <span className="text-sm text-gray-300">Tipo de movimiento:</span>
        <div className="flex gap-2">
          <button
            className={[
              "px-3 py-1.5 rounded-lg text-sm",
              movementType === "in" ? "bg-[#1E1F4B] text-cyan-300" : "border",
            ].join(" ")}
            style={{ borderColor: COLORS.border }}
            onClick={() => setMovementType("in")}
          >
            Entrada
          </button>
          <button
            className={[
              "px-3 py-1.5 rounded-lg text-sm",
              movementType === "out" ? "bg-[#1E1F4B] text-pink-300" : "border",
            ].join(" ")}
            style={{ borderColor: COLORS.border }}
            onClick={() => setMovementType("out")}
          >
            Salida
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div
        className="rounded-xl p-4"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <input
          className="rounded px-3 py-2 w-full text-gray-100 placeholder-gray-400 outline-none"
          style={{
            backgroundColor: COLORS.input,
            border: `1px solid ${COLORS.border}`,
          }}
          placeholder="Buscar producto por nombre o SKU"
          value={q}
          onChange={(e) => setQ(e.target.value.toUpperCase())}
        />

        {found.length > 0 && (
          <div
            className="rounded p-2 mt-2 max-h-60 overflow-y-auto"
            style={{
              backgroundColor: "#0F1030",
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {found.map((p) => (
              <button
                key={p.id}
                onClick={() => choose(p)}
                className="block w-full text-left p-2 rounded hover:bg-[#1E1F4B]"
              >
                <span className="font-mono text-cyan-300">{p.sku}</span>{" "}
                <span>{p.name}</span>
                {typeof p.stock !== "undefined" && (
                  <span className="ml-2 text-xs text-gray-400">
                    • Stock: {p.stock}
                  </span>
                )}
                {typeof p.cost !== "undefined" && (
                  <span className="ml-2 text-xs text-gray-400">
                    • Costo: {fmtCOP(p.cost)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detalle producto seleccionado */}
      {selected && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{
            backgroundColor: COLORS.bgCard,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div>
            <b className="text-cyan-300">Producto:</b>{" "}
            <span className="font-mono text-pink-300">{selected.sku}</span> —{" "}
            {selected.name}
          </div>

          <div className="text-sm text-gray-300 space-y-1">
            <div>
              <b>Stock actual:</b>{" "}
              <span
                className="inline-block px-2 py-0.5 rounded"
                style={{ backgroundColor: COLORS.input }}
              >
                {typeof selected.stock === "number" ? selected.stock : "—"}
              </span>
            </div>
            <div>
              <b>Costo actual:</b>{" "}
              <span
                className="inline-block px-2 py-0.5 rounded"
                style={{ backgroundColor: COLORS.input }}
              >
                {fmtCOP(selected.cost)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Cantidad a {movementType === "in" ? "ingresar" : "retirar"}
              </label>
              <input
                className="rounded px-3 py-2 w-full text-gray-100 outline-none"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                }}
                type="number"
                placeholder="Cantidad"
                value={qty}
                onChange={(e) =>
                  setQty(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </div>

            {movementType === "in" && (
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Nuevo costo unitario (COP)
                </label>
                <input
                  className="rounded px-3 py-2 w-full text-gray-100 outline-none"
                  style={{
                    backgroundColor: COLORS.input,
                    border: `1px solid ${COLORS.border}`,
                  }}
                  type="number"
                  placeholder="Costo unitario"
                  value={unitCost}
                  onChange={(e) =>
                    setUnitCost(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                />
              </div>
            )}

            <div className="mt-2 sm:mt-0">
              <button
                className="w-full px-5 py-2.5 rounded-lg font-semibold disabled:opacity-60"
                style={{
                  color: "#001014",
                  background:
                    "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                  boxShadow:
                    "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
                }}
                onClick={save}
                disabled={saveDisabled}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {!!msg && <div className="text-sm text-cyan-300">{msg}</div>}
    </div>
  );
}