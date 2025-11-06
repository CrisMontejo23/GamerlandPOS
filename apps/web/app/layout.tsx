import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "./ClientLayout";
import AuthProvider from "./auth/AuthProvider";

export const metadata: Metadata = {
  title: "GAMERLAND POS",
  description: "Sistema de punto de venta e inventario para Gamerland PC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="theme-gamer min-h-screen flex text-[17px] md:text[18px]">
        <AuthProvider>
          <ClientLayout>{children}</ClientLayout>
        </AuthProvider>
      </body>
    </html>
  );
}