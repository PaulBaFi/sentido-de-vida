import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentido de Vida",
  description: "Sistema de control de citas psicológicas — Ica, 2026",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
