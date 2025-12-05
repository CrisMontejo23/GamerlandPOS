"use client";

import { useParams, useSearchParams } from "next/navigation";
import ProductForm from "../../_components/ProductForm";

export default function EditProductPage() {
  const params = useParams<{ id?: string }>();
  const searchParams = useSearchParams();

  const rawId = params?.id;
  const numId = rawId ? Number(rawId) : NaN;

  if (!rawId || Number.isNaN(numId) || numId <= 0) {
    return (
      <div className="p-6 text-gray-300">
        ID inválido recibido: <b>{String(rawId)}</b>
      </div>
    );
  }

  // Si quieres preservar filtros al volver al listado:
  const backParams = {
    q: searchParams.get("q") || undefined,
    page: searchParams.get("page") || undefined,
    // OJO: ahora vienes con "cat" en la URL, pero ProductForm espera "sku"
    // luego si quieres, ajustamos esto para que use "cat" correctamente
    sku: searchParams.get("cat") || undefined,
  };

  return (
    <div className="p-6 max-w-4xl mx-auto text-gray-200">
      <h1 className="text-2xl font-bold mb-4 text-cyan-400">
        Editar producto #{numId}
      </h1>
      <ProductForm id={numId} backParams={backParams} />
    </div>
  );
}
