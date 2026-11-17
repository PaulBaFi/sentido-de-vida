"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialAuthState, validateLoginInput, type LoginFieldErrors } from "@/lib/auth/flows";
import { loginAction } from "./actions";

export function LoginForm({ disabled = false }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, initialAuthState);
  const [visible, setVisible] = useState(false);
  // Solo memoria del componente: nunca devolver contraseñas desde la Server Action.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientErrors, setClientErrors] = useState<LoginFieldErrors>({});
  const [edited, setEdited] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const submitLock = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    submitLock.current = false;
    if (state.status === "error") {
      if (state.fieldErrors?.email) emailRef.current?.focus();
      else if (state.fieldErrors?.password) passwordRef.current?.focus();
      else errorRef.current?.focus();
    }
  }, [state]);

  const errors = Object.keys(clientErrors).length ? clientErrors : edited ? {} : state.fieldErrors ?? {};
  const generalMessage = Object.keys(clientErrors).length
    ? "Revisa los campos indicados."
    : !edited && state.status === "error" ? state.message : "";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (submitLock.current || pending || disabled) {
      event.preventDefault();
      return;
    }
    const nextErrors = validateLoginInput(email, password);
    setClientErrors(nextErrors);
    setEdited(false);
    if (Object.keys(nextErrors).length) {
      event.preventDefault();
      if (nextErrors.email) emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }
    submitLock.current = true;
  }

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="mt-8 space-y-5" aria-label="Iniciar sesión" aria-busy={pending}>
      <fieldset disabled={pending || disabled} className="space-y-5">
        <legend className="sr-only">Tus credenciales de acceso</legend>
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-semibold">Correo electrónico</label>
          <Input ref={emailRef} id="email" name="email" type="email" autoComplete="username" inputMode="email" maxLength={254} required placeholder="tu@correo.com"
            value={email} onChange={event => { setEmail(event.target.value); setEdited(true); setClientErrors({}); }}
            aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined}
            className={errors.email ? "border-red-500 focus-visible:outline-red-600" : undefined} />
          {errors.email && <p id="email-error" className="flex items-start gap-2 text-sm text-red-800"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{errors.email}</p>}
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-semibold">Contraseña</label>
          <div className="relative">
            <Input ref={passwordRef} id="password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" maxLength={1024} required
              value={password} onChange={event => { setPassword(event.target.value); setEdited(true); setClientErrors({}); }}
              aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : undefined}
              className={errors.password ? "border-red-500 pr-14 focus-visible:outline-red-600" : "pr-14"} />
            <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={visible} className="absolute inset-y-0 right-1 flex min-w-11 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary">
              {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
            </button>
          </div>
          {errors.password && <p id="password-error" className="flex items-start gap-2 text-sm text-red-800"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{errors.password}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={pending || disabled}>
          {pending ? <><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Iniciando sesión…</> : <>Iniciar sesión <ArrowRight className="size-4" aria-hidden="true" /></>}
        </Button>
      </fieldset>
      {generalMessage && <div ref={errorRef} tabIndex={-1} role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{generalMessage}</span></div>}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">Acceso con una cuenta previamente habilitada por el centro.</p>
    </form>
  );
}
