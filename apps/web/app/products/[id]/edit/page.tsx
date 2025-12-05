import ProductForm from "../../_components/ProductForm";

type PageProps = {
  params: { id: string };
  searchParams?: {
    from?: string;
    q?: string;
    page?: string;
    cat?: string; // ahora usamos "cat", no "sku"
  };
};

export default function EditProductPage({ params, searchParams }: PageProps) {
  const rawId = params?.id;
  const numId = Number(rawId);

  // Si por alguna razón no viene bien el id, mostramos algo útil
  if (!rawId || Number.isNaN(numId) || numId <= 0) {
    return (
      <div className="p-6 text-gray-300">
        ID inválido recibido: <b>{String(rawId)}</b>
      </div>
    );
  }

  const backParams = {
    q: searchParams?.q,
    page: searchParams?.page,
    cat: searchParams?.cat,
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