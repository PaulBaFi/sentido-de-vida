import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HeartHandshake } from "lucide-react";
import { getDashboardProfile } from "@/lib/users/server";
import { profileNotice } from "@/lib/users/profile";
import { loginDestination } from "@/lib/auth/flows";
import { LogoutForm } from "../logout-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi perfil | Sentido de Vida", robots: { index: false, follow: false } };

export default async function OwnAccessProfilePage() {
  const profile = await getDashboardProfile();
  if (profile.status === "anonymous" || profile.status === "expired" ||
      profile.status === "connection" || profile.status === "unavailable") redirect(loginDestination(profile));
  const notice = profileNotice(profile.status);
  return <div className="min-h-dvh bg-[#f8faf8]">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-6 py-5 sm:px-10">
      <span className="flex items-center gap-3 text-lg font-semibold"><HeartHandshake className="size-8 text-primary" aria-hidden="true" />Sentido de Vida</span>
      <LogoutForm />
    </div></header>
    <main id="contenido" className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <Link href="/dashboard" className="rounded text-sm underline underline-offset-4 focus-visible:outline-2">Volver a mi espacio</Link>
      <h1 className="mt-6 text-3xl font-semibold">Mi perfil de acceso</h1>
      {notice && <p role="alert" className="mt-6 max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{notice}</p>}
      {profile.status === "ready" && <section aria-labelledby="profile-name" className="mt-6 max-w-xl rounded-2xl border bg-white p-7">
        <h2 id="profile-name" className="text-sm text-muted-foreground">Nombre registrado</h2>
        <p className="mt-2 break-words text-xl font-semibold">{profile.displayName}</p>
      </section>}
      <p className="mt-6 max-w-xl text-sm leading-7 text-muted-foreground">Este perfil identifica tu acceso al sistema. No confirma que tengas una ficha de paciente registrada. La consulta de fichas y la edición de contactos aún no están disponibles.</p>
    </main>
  </div>;
}
