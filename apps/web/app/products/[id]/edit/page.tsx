import ProductForm from "../../_components/ProductForm";

export default function EditProductPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const numId = Number(params.id);

  if (Number.isNaN(numId)) {
    return <div className="p-6 text-gray-300">Cargando...</div>;
  }

  const backParams = {
    q: typeof searchParams.q === "string" ? searchParams.q : undefined,
    page: typeof searchParams.page === "string" ? searchParams.page : undefined,
    sku: typeof searchParams.sku === "string" ? searchParams.sku : undefined,
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