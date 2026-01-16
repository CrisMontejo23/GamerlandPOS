import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "./ClientLayout";
import AuthProvider from "./auth/AuthProvider";

export const metadata: Metadata = {
  title: "GAMERLAND POS",
  description: "Sistema de punto de venta e inventario para Gamerland PC",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="theme-gamer h-[100dvh] overflow-hidden flex text-[16px] md:text-[16px]">
        <AuthProvider>
          <ClientLayout>{children}</ClientLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
