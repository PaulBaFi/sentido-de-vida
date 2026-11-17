import Link from "next/link";
import { HeartHandshake } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <HeartHandshake className="size-12 text-primary" aria-hidden="true" />
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">Ica · 2026</p>
      <h1 className="text-4xl font-semibold tracking-tight">Sentido de Vida</h1>
      <p className="text-lg text-muted-foreground">Sistema Web para Mejorar el Control de Citas Psicológicas en el Centro Psicológico Particular Sentido de Vida.</p>
      <p className="rounded-lg border bg-card p-5 text-card-foreground">Estructura inicial del proyecto académico. Las funcionalidades se incorporarán en próximas etapas.</p>
    <Link href="/login" className="w-fit rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Iniciar sesión</Link>
    </main>
  );
}
