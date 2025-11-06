import ProductForm from "../_components/ProductForm";

export default function NewProductPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto text-gray-200">
      <h1 className="text-2xl font-bold mb-4 text-cyan-400">Nuevo producto</h1>
      <ProductForm />
    </div>
  );
}
