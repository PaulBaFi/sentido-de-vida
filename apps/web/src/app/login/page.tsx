import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HeartHandshake, ShieldCheck, ArrowLeft } from "lucide-react";
import { getIdentity } from "@/lib/auth/identity";
import { loginNotice } from "@/lib/auth/flows";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Iniciar sesión | Sentido de Vida", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const { reason } = await searchParams;
  const identity = await getIdentity();
  if (identity.status === "authenticated" && reason !== "expired") redirect("/dashboard");
  const unavailable = identity.status === "unavailable";
  const notice = loginNotice(unavailable ? "unavailable" : identity.status === "connection" ? "connection" : reason);

  return (
    <main id="contenido" className="grid min-h-dvh bg-[#f8faf8] lg:grid-cols-2">
      <section aria-label="Sentido de Vida" className="relative flex flex-col justify-between overflow-hidden bg-teal-950 px-7 py-10 text-white sm:px-12 lg:p-16">
        <div className="absolute -right-32 top-24 size-96 rounded-full border border-white/10" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-teal-800/30" aria-hidden="true" />
        <Link href="/" className="relative flex w-fit items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          <HeartHandshake className="size-9 text-teal-200" aria-hidden="true" />
          <span className="text-xl font-semibold tracking-tight">Sentido de Vida</span>
        </Link>
        <div className="relative max-w-lg py-12 lg:py-20">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">Centro Psicológico Particular · Ica</p>
          <h1 className="text-4xl font-medium leading-tight tracking-tight sm:text-5xl">Un espacio para<br />seguir adelante.</h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-teal-100">Acompañamos cada paso con respeto, cercanía y compromiso con tu bienestar.</p>
        </div>
        <p className="relative text-xs text-teal-200">Sentido de Vida · Ica, Perú</p>
      </section>
      <section aria-labelledby="login-title" className="flex items-center justify-center px-6 py-12 sm:px-12 lg:py-20">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-10 inline-flex items-center gap-2 rounded text-sm text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"><ArrowLeft className="size-4" aria-hidden="true" /> Volver al inicio</Link>
          <div className="mb-5 flex size-12 items-center justify-center rounded-xl border border-teal-100 bg-teal-50 text-primary"><ShieldCheck className="size-6" aria-hidden="true" /></div>
          <h2 id="login-title" className="text-3xl font-semibold tracking-tight">Te damos la bienvenida</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Ingresa tus credenciales para acceder a tu espacio en Sentido de Vida.</p>
          {notice && <p role="status" className="mt-6 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-teal-950">{notice}</p>}
          <LoginForm disabled={unavailable} />
          <p className="mt-10 border-t pt-6 text-center text-xs leading-5 text-muted-foreground">¿Necesitas ayuda con tu acceso? Comunícate con el centro.</p>
        </div>
      </section>
    </main>
  );
}
