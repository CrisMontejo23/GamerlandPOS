import ProductForm from "../../_components/ProductForm";

type PageProps = {
  params: { id: string };
  searchParams?: {
    from?: string;
    q?: string;
    page?: string;
    sku?: string; // o cat si luego cambias el nombre del parámetro
  };
};

export default function EditProductPage({ params, searchParams }: PageProps) {
  // Parseamos el id, pero ya no mostramos "ID inválido"
  const numId = Number(params.id || 0);

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