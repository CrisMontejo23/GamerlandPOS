import ProductForm from "../../_components/ProductForm";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);

  if (Number.isNaN(numId)) {
    return <div className="p-6 text-gray-300">Cargando...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto text-gray-200">
      <h1 className="text-2xl font-bold mb-4 text-cyan-400">
        Editar producto #{numId}
      </h1>
      <ProductForm id={numId} />
    </div>
  );
}