import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HeartHandshake, Check, Sprout } from "lucide-react";
import { getDashboardProfile } from "@/lib/users/server";
import { profileNotice } from "@/lib/users/profile";
import { loginDestination } from "@/lib/auth/flows";
import { LogoutForm } from "./logout-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi espacio | Sentido de Vida", robots: { index: false, follow: false } };

export default async function DashboardPage() {
  const profile = await getDashboardProfile();
  if (profile.status === "anonymous" || profile.status === "expired" ||
      profile.status === "connection" || profile.status === "unavailable") redirect(loginDestination(profile));
  const notice = profileNotice(profile.status);

  return (
    <div className="min-h-dvh bg-[#f8faf8]">
      <a href="#contenido" className="sr-only rounded bg-white p-3 focus:not-sr-only focus:absolute focus:z-10">Saltar al contenido</a>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-6 py-5 sm:px-10">
          <div className="flex items-center gap-3"><HeartHandshake className="size-8 text-primary" aria-hidden="true" /><span className="text-lg font-semibold tracking-tight">Sentido de Vida</span></div>
          <LogoutForm />
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Mi espacio</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{profile.status === "ready" ? `Bienvenido, ${profile.displayName}` : "Bienvenido a Sentido de Vida"}</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">Tu sesión está activa. Este es tu punto de entrada al centro.</p>
        {profile.status === "ready" && <Link href="/dashboard/mi-perfil" className="mt-4 inline-block rounded text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Ver mi perfil de acceso</Link>}
        {notice && <div role="alert" className="mt-6 max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p>{notice}</p>
          {profile.status !== "forbidden" && <a href="/dashboard" className="mt-2 inline-block rounded font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Volver a intentar</a>}
        </div>}
        <section aria-labelledby="space-title" className="mt-10 grid overflow-hidden rounded-2xl border bg-white md:grid-cols-[1fr_220px]">
          <div className="p-7 sm:p-10">
            <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900"><Check className="size-3.5" aria-hidden="true" /> {profile.status === "ready" ? "Acceso verificado" : "Sesión autenticada"}</span>
            <h2 id="space-title" className="mt-6 text-xl font-semibold">Estamos preparando tu espacio</h2>
            <p className="mt-3 max-w-lg text-sm leading-7 text-muted-foreground">Las opciones de atención se incorporarán próximamente. Por ahora, puedes acceder y cerrar tu sesión de forma segura.</p>
          </div>
          <div className="flex min-h-40 items-center justify-center bg-teal-50 text-teal-700"><Sprout className="size-20 stroke-1" aria-hidden="true" /></div>
        </section>
        <p className="mt-8 text-xs leading-6 text-muted-foreground">Al terminar, cierra tu sesión, especialmente si utilizas un equipo compartido.</p>
      </main>
      <footer className="mx-auto max-w-6xl px-6 pb-8 text-xs text-muted-foreground sm:px-10">Centro Psicológico Particular Sentido de Vida · Ica, Perú</footer>
    </div>
  );
}
