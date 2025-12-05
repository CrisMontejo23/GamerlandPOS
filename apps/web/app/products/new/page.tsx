import ProductForm from "../_components/ProductForm";

export default function NewProductPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const backParams = {
    q: typeof searchParams.q === "string" ? searchParams.q : undefined,
    page: typeof searchParams.page === "string" ? searchParams.page : undefined,
    sku: typeof searchParams.sku === "string" ? searchParams.sku : undefined,
  };

  return (
    <div className="p-6 max-w-4xl mx-auto text-gray-200">
      <h1 className="text-2xl font-bold mb-4 text-cyan-400">Nuevo producto</h1>
      <ProductForm backParams={backParams} />
    </div>
  );
}