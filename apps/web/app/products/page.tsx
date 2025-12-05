import { Suspense } from "react";
import ProductsPageInner from "./ProductsPageInner";

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="text-gray-300 p-6">Cargando…</div>}>
      <ProductsPageInner />
    </Suspense>
  );
}