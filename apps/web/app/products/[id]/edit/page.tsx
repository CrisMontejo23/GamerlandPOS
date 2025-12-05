import ProductForm from "../../_components/ProductForm";

type PageProps = {
  params: { id: string };
  searchParams?: {
    from?: string;
    q?: string;
    page?: string;
    sku?: string;
  };
};

export default function EditProductPage({ params, searchParams }: PageProps) {
  const numId = Number(params.id);

  if (Number.isNaN(numId)) {
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