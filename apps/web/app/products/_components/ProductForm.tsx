"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";

export type Product = {
  id?: number;
  sku: string;
  barcode?: string | null;
  name: string;
  cost: number | string;
  price: number | string;
  taxRate?: number | string;
  active?: boolean;
  // En el back guardamos category como STRING; aquí usamos categoryId sólo para el <select>
  categoryId?: number | null;
};

type Category = { id: number; name: string };

const toUpper = (s: string) => s.toUpperCase();
const toCOP = (n: number) =>
  isNaN(n)
    ? ""
    : n.toLocaleString("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      });

// Paleta usada en todo el sistema
const COLORS = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  cyan: "#00FFFF",
  pink: "#FF00FF",
  text: "#E5E5E5",
};

// Fallback de SKU si aún no hay categoría elegida
const genSku = () => `SKU-${Date.now().toString().slice(-6)}`;

export default function ProductForm({
  id,
  initial,
}: {
  id?: number;
  initial?: Partial<Product>;
}) {
  const isEdit = !!id;

  const [form, setForm] = useState<Product>({
    sku: initial?.sku || "",
    barcode: initial?.barcode ?? "",
    name: initial?.name || "",
    cost: initial?.cost ?? "",
    price: initial?.price ?? "",
    taxRate: 0,
    active: initial?.active ?? true,
    categoryId: initial?.categoryId ?? null,
  });

  const [cats, setCats] = useState<Category[]>([]);
  const [msg, setMsg] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [loadingSku, setLoadingSku] = useState(false);
  const [loadedCategoryName, setLoadedCategoryName] = useState<string | null>(
    null
  );

  // Cargar producto si es edición
  useEffect(() => {
    const run = async () => {
      if (!id) return;
      try {
        const r = await apiFetch(`/products/${id}`);
        const p = await r.json();
        setForm((f) => ({
          ...f,
          sku: p.sku,
          barcode: p.barcode ?? "",
          name: p.name,
          cost: Number(p.cost),
          price: Number(p.price),
          taxRate: 0,
          active: Boolean(p.active ?? true),
          // category se guarda como string en el back; mapeamos a id cuando ya tengamos cats
          categoryId: null,
        }));
        setLoadedCategoryName(p.category ?? null);
      } catch {
        setMsg("No se pudo cargar el producto");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [id]);

  // Cargar categorías fijas
  useEffect(() => {
    setCats([
      { id: 1, name: "ACCESORIOS" },
      { id: 2, name: "CABLES" },
      { id: 3, name: "COMPONENTES" },
      { id: 4, name: "CONSOLAS" },
      { id: 5, name: "CONTROLES" },
      { id: 6, name: "JUEGOS" },
      { id: 7, name: "REPUESTOS" },
      { id: 8, name: "SERVICIOS" },
      { id: 9, name: "PAPELERIA" },
    ]);
  }, []);

  // Si estoy editando y ya conozco el nombre de categoría, mapea a su id
  useEffect(() => {
    if (isEdit && loadedCategoryName && cats.length) {
      const match = cats.find((c) => c.name === loadedCategoryName);
      if (match) setForm((f) => ({ ...f, categoryId: match.id }));
    }
  }, [isEdit, loadedCategoryName, cats]);

  // Si es NUEVO y aún no hay SKU, genera uno provisional
  useEffect(() => {
    if (!isEdit) {
      setForm((f) => ({
        ...f,
        sku: f.sku?.trim() ? toUpper(f.sku) : genSku(),
      }));
    }
  }, [isEdit]);

  // Pide al back el próximo SKU según categoría (cuando se selecciona)
  const fetchNextSkuByCategory = async (catId: number | null) => {
    if (!catId) {
      setForm((f) => ({ ...f, sku: "" }));
      return;
    }
    const catName = cats.find((c) => c.id === catId)?.name ?? "";
    if (!catName) {
      setForm((f) => ({ ...f, sku: "" }));
      return;
    }
    setLoadingSku(true);
    try {
      const r = await apiFetch(`/products/next-sku?category=${encodeURIComponent(catName)}`);
      const data = await r.json();
      setForm((f) => ({ ...f, sku: data.sku || "" }));
    } finally {
      setLoadingSku(false);
    }
  };

  const pricePreview = useMemo(() => toCOP(Number(form.price)), [form.price]);
  const costPreview = useMemo(() => toCOP(Number(form.cost)), [form.cost]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (isEdit && !String(form.sku).trim()) e.sku = "Requerido"; // en nuevo lo generamos
    if (!String(form.name).trim()) e.name = "Requerido";
    const c = Number(form.cost);
    const p = Number(form.price);
    if (isNaN(c) || c < 0) e.cost = "Monto inválido";
    if (isNaN(p) || p < 0) e.price = "Monto inválido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);

    const chosenCategoryName =
      cats.find((c) => c.id === form.categoryId)?.name ?? null;

    // Si es nuevo y borraron el SKU, regénéralo como safety net
    const finalSku = form.sku?.trim() ? toUpper(String(form.sku)) : genSku();

    const payload = {
      sku: finalSku,
      barcode: form.barcode ? toUpper(String(form.barcode)) : undefined,
      name: toUpper(String(form.name)),
      cost: Number(form.cost),
      price: Number(form.price),
      taxRate: 0,
      active: !!form.active,
      category: chosenCategoryName, // back espera string|null
    };

    const method = isEdit ? "PATCH" : "POST";
    const url = isEdit ? `/products/${id}` : `/products`;

    const r = await apiFetch(url, { method, body: JSON.stringify(payload) });

    setMsg(
      r.ok
        ? "Guardado ✅"
        : "Error: " +
            (await r
              .json()
              .then((x) => x?.error)
              .catch(() => "No se pudo guardar"))
    );
    setSaving(false);
    setTimeout(() => setMsg(""), 2500);
  };

  if (loading) {
    return (
      <div
        className="rounded-xl p-4 text-gray-300"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-6 text-gray-200">
      {/* Identificación */}
      <section
        className="rounded-xl p-4"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <h2 className="text-lg font-semibold mb-3 text-cyan-300">
          Identificación
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* SKU */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">SKU *</label>
            {isEdit ? (
              <input
                className="rounded px-3 py-2 w-full text-gray-100 outline-none"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                }}
                value={form.sku}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))
                }
              />
            ) : (
              <div
                className="rounded px-3 py-2 w-full flex justify-between items-center"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <span className="font-mono">{form.sku || "—"}</span>
                {loadingSku && (
                  <span className="text-xs text-gray-400">generando…</span>
                )}
              </div>
            )}
            {errors.sku && (
              <p className="text-xs text-pink-300 mt-1">{errors.sku}</p>
            )}
          </div>

          {/* Barcode */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              CÓDIGO DE BARRAS
            </label>
            <input
              className="rounded px-3 py-2 w-full text-gray-100 outline-none"
              style={{
                backgroundColor: COLORS.input,
                border: `1px solid ${COLORS.border}`,
              }}
              value={form.barcode ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, barcode: toUpper(e.target.value) }))
              }
            />
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">NOMBRE *</label>
            <input
              className="rounded px-3 py-2 w-full text-gray-100 outline-none"
              style={{
                backgroundColor: COLORS.input,
                border: `1px solid ${COLORS.border}`,
              }}
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: toUpper(e.target.value) }))
              }
            />
            {errors.name && (
              <p className="text-xs text-pink-300 mt-1">{errors.name}</p>
            )}
          </div>
        </div>
      </section>

      {/* Precios */}
      <section
        className="rounded-xl p-4"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <h2 className="text-lg font-semibold mb-3 text-cyan-300">Precios</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Costo */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              COSTO (COP)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-400">$</span>
              <input
                className="rounded pl-7 pr-3 py-2 w-full text-gray-100 outline-none"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                }}
                inputMode="numeric"
                value={form.cost}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    cost: e.target.value.replace(/[^\d.]/g, ""),
                  }))
                }
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Vista previa: {costPreview || "—"}
            </p>
            {errors.cost && (
              <p className="text-xs text-pink-300 mt-1">{errors.cost}</p>
            )}
          </div>

          {/* Precio */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              PRECIO VENTA (COP)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-400">$</span>
              <input
                className="rounded pl-7 pr-3 py-2 w-full text-gray-100 outline-none"
                style={{
                  backgroundColor: COLORS.input,
                  border: `1px solid ${COLORS.border}`,
                }}
                inputMode="numeric"
                value={form.price}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    price: e.target.value.replace(/[^\d.]/g, ""),
                  }))
                }
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Vista previa: {pricePreview || "—"}
            </p>
            {errors.price && (
              <p className="text-xs text-pink-300 mt-1">{errors.price}</p>
            )}
          </div>

          {/* Categoría */}
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-300 mb-1">
              CATEGORÍA
            </label>
            <select
              className="rounded px-3 py-2 w-full text-gray-100 outline-none"
              style={{
                backgroundColor: COLORS.input,
                border: `1px solid ${COLORS.border}`,
              }}
              value={form.categoryId ?? ""}
              onChange={(e) => {
                const val =
                  e.target.value === "" ? null : Number(e.target.value);
                setForm((f) => ({ ...f, categoryId: val }));
                if (!isEdit) fetchNextSkuByCategory(val); // genera SKU por categoría en creación
              }}
            >
              <option value="">(SIN CATEGORÍA)</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Estado + Guardar */}
      <section
        className="rounded-xl p-4"
        style={{
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <input
            id="active"
            type="checkbox"
            checked={!!form.active}
            onChange={(e) =>
              setForm((f) => ({ ...f, active: e.target.checked }))
            }
          />
          <label htmlFor="active" className="text-gray-300">
            ACTIVO
          </label>
        </div>

        <button
          className="w-full md:w-auto px-5 py-2.5 rounded-lg font-semibold disabled:opacity-60"
          style={{
            color: "#001014",
            background:
              "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
            boxShadow:
              "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
          }}
          onClick={save}
          disabled={saving}
          title={isEdit ? "Actualizar producto" : "Crear producto"}
        >
          {saving ? "Guardando…" : isEdit ? "Actualizar" : "Crear"}
        </button>

        {!!msg && <div className="text-sm mt-3 text-cyan-300">{msg}</div>}
      </section>
    </div>
  );
}
