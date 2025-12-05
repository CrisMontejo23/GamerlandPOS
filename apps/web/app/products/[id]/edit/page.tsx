import ProductForm from "../../_components/ProductForm";

type PageProps = {
  params: { id?: string };
  searchParams?: {
    from?: string;
    q?: string;
    page?: string;
    sku?: string;
  };
};

export default function EditProductPage({ params, searchParams }: PageProps) {
  // Si aún no está disponible, no renderices nada
  if (!params?.id) {
    return <div className="p-6 text-gray-300">Cargando…</div>;
  }

  const numId = Number(params.id);

  // Si el id no es número válido
  if (Number.isNaN(numId) || numId <= 0) {
    return <div className="p-6 text-gray-300">ID inválido</div>;
  }

  const backParams = {
    q: searchParams?.q,
    page: searchParams?.page,
    sku: searchParams?.sku,
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