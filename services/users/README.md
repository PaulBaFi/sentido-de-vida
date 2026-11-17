# Usuarios

Estado vigente: `GET /v1/users/me/profile` funcional con pg, TLS, preflight y autorización; Fase 3.2E 13/13 reales y Fase 3.3 integrada al dashboard SSR. El servicio permanece cerrado por defecto y requiere activación privada explícita. Ver [contratos e historial](../../docs/servicios/USERS_SERVICE.md), [activación](../../docs/base-de-datos/USERS_POSTGRES_ACTIVATION.md) y [maestro LRPD](../../docs/LRPD/INFORMACION_MAESTRA_LRPD.md).

> Notas hist?ricas conservadas:


API preparada, cerrada por defecto y sin datos reales. Ver [USERS_SERVICE.md](../../docs/servicios/USERS_SERVICE.md) para contratos, estructura, comandos y decisiones pendientes.

> Fase 3.2B: repositorio PostgreSQL implementado y deshabilitado por defecto. Migración preparada, no ejecutada. Procedimiento vigente: [activación segura](../../docs/base-de-datos/USERS_POSTGRES_ACTIVATION.md).
