"use client";

import { useActionState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { initialAuthState } from "@/lib/auth/flows";
import { logoutAction } from "./actions";

export function LogoutForm() {
  const [state, action, pending] = useActionState(logoutAction, initialAuthState);
  return <form action={action} aria-label="Cerrar sesión" aria-busy={pending}>
    <Button type="submit" disabled={pending} className="border border-border bg-white text-foreground hover:bg-neutral-100">
      <LogOut className="size-4" aria-hidden="true" /> {pending ? "Cerrando sesión…" : "Cerrar sesión"}
    </Button>
    {state.status === "error" && <p role="alert" className="mt-3 max-w-xs text-sm text-destructive">{state.message}</p>}
  </form>;
}
