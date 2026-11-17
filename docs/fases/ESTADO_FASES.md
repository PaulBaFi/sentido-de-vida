# Estado de fases y alcance vigente

Revisión documental: 15/11/2026. Los números de ejecución de las conversaciones no equivalen automáticamente a la secuencia de planificación del Plan Maestro original. Este índice remite al [maestro LRPD](../LRPD/INFORMACION_MAESTRA_LRPD.md), sin sustituir los documentos históricos.

| Avance | Estado sustentado | Trazabilidad |
| --- | --- | --- |
| Monorepositorio / npm workspaces | Web, cinco servicios y contratos preparados; siete workspaces más raíz | [package.json](../../package.json), [lock](../../package-lock.json) |
| AUT | Login, logout, proxy SSR, rutas protegidas, UX de errores | [AUT](../seguridad/AUT.md), [código](../../apps/web/src/lib/auth/flows.ts) |
| Autorización Fase 2.3 | Contratos y evaluador con denegación por defecto; matriz amplia aún propuesta | [propuesta](../seguridad/AUTHORIZATION_PROPOSAL.md), [evaluador](../../packages/contracts/src/authorization-policy.ts) |
| Usuarios 3.1 | HTTP/puertos/caso de uso; perfil propio y fallos seguros | [servicio](../servicios/USERS_SERVICE.md) |
| PostgreSQL 3.2A–C | Diseño, pg, transacción/auditoría y preflight | [diseño](../base-de-datos/USERS_POSTGRES_DESIGN.md), [activación](../base-de-datos/USERS_POSTGRES_ACTIVATION.md) |
| PostgreSQL 3.2E | 13/13 reales, ROLLBACK y cero auditorías residuales de esas pruebas | [evidencia](../evidencias/VALIDACIONES.md) |
| Integración 3.3 | Dashboard obtiene nombre real desde Usuarios, solo servidor; 271 locales, 10 comprobaciones reales y 3 HTTP satisfactorias | [adaptador](../../apps/web/src/lib/users/profile.ts), [dashboard](../../apps/web/src/app/dashboard/page.tsx) |
| PAC 3.4 | PARCIAL: perfil de acceso propio reutilizado, validadores y contratos; ficha/contactos/administración bloqueados hasta aprobar permisos | [alcance y propuesta](../servicios/PAC_FASE_3_4.md) |
| Catálogo, Citas, Pagos, Notificaciones | Scaffolding; APIs y funcionalidades de negocio pendientes | [servicios](../../services) |
| Despliegue y evaluación integral | PENDIENTE | [apartados 6–8 del maestro](../LRPD/INFORMACION_MAESTRA_LRPD.md) |

La base existente contiene más dominios que las APIs implementadas. No usar existencia de tablas como evidencia de funcionalidades web. Solo el permiso de lectura de perfil propio del evaluador está conectado al servicio; no hay permisos administrativos en el dashboard.

La activación de Usuarios es explícita por proceso local, con TLS y preflight obligatorios; el archivo privado permanece deshabilitado por defecto. No se documentan aquí rutas privadas ni identificadores de cuentas.

**Pendiente académico:** capítulos I–III armonizados con el estado actual, diagramas obligatorios actualizados/renderizados, capturas sanitizadas, línea base/indicadores, evaluación con usuarios, carga/concurrencia/restauración y referencias académicas verificables. La lista detallada está en 8.2 del maestro. No se declara completado el sistema integral de citas.
