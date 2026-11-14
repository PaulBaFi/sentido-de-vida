# Convenciones del proyecto

- Proyecto académico Sentido de Vida, Ica, 2026. Documentación y comunicación en español.
- Node.js 24, npm 11 y TypeScript estricto. Usar npm workspaces y conservar package-lock.json cuando se genere.
- Mantener apps/, services/ y docs/. No borrar ni sobrescribir documentación existente.
- docs/ permanece ignorado según la política original.
- Web en apps/web: Next.js App Router, Tailwind CSS, shadcn/ui y Lucide.
- Dominios independientes: users, catalog, appointments, payments, notifications.
- Cada servicio es propietario lógico de sus datos. No consultar tablas de otros dominios.
- El frontend consume APIs backend; nunca accede directamente a tablas internas de Supabase.
- Supabase PostgreSQL y Auth ya existen. No recrear la base de datos.
- packages/contracts contiene contratos públicos compartidos; no dependencias de persistencia.
- No implementar APIs, acceso a datos ni funcionalidades de negocio durante esta etapa.
- Secretos solo en entornos privados. Nunca usar NEXT_PUBLIC_ para credenciales privilegiadas.
- No ejecutar commits, push, despliegues ni migraciones sin aprobación explícita del usuario.
- Antes de entregar cambios ejecutar npm run typecheck, npm run lint y npm run build según corresponda.
