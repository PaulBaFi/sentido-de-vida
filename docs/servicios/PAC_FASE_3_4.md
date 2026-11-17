# PAC — Fase 3.4, preparación controlada

Fecha: 16/11/2026. **Estado parcial y bloqueado para acceso a fichas.** No se ejecutó SQL remoto, no se cambiaron privilegios/RLS ni se crearon datos. La lectura del perfil de acceso se reutiliza; no equivale a RF-PAC-06 completo.

## Inspección y fuentes

- `Documento de base de datos` (fuente local no publicada; excluida de GitHub), sección 4.1: pacientes tiene id UUID PK, perfil_id UUID UNIQUE/FK a perfiles, dni TEXT UNIQUE, fecha_nacimiento DATE, nombres/apellidos/telefono/correo TEXT, activo BOOLEAN y creado_en TIMESTAMPTZ. consultas_dni contiene paciente_id FK, dni, consultado_por, proveedor, estado y fecha. Es documentación verificable de 14/11, no una inspección remota nueva.
- [Migración aplicada de Usuarios](../../database/migrations/20261114182510_users_postgres_restricted.sql): sdv_users_app solo SELECT de cinco columnas de perfiles e INSERT mínimo de auditoria_accesos. No habilita pacientes/consultas_dni ni UPDATE de teléfonos.
- [Autorización](../seguridad/AUTHORIZATION_PROPOSAL.md) y [evaluador](../../packages/contracts/src/authorization-policy.ts): identidad/perfil activo/propiedad y denegación por defecto. Las nuevas operaciones PAC quedan expresamente pending_approval para todos los roles.
- El trigger Auth crea perfiles provisionales, no pacientes. No se infiere ficha por rol ni se intercambian pacientes.id y perfiles.id. No se usa perfil_id enviado por navegador como actor.

**Información insuficiente para registrar:** no está disponible en SQL local el DDL completo de pacientes/consultas_dni con nullability, defaults, CHECK, triggers e índices. fecha_nacimiento y generación de id deben verificarse antes de admitir INSERT. No se inventan restricciones físicas ni se publica un registro incompatible.

## Implementado ahora

- `/dashboard/mi-perfil`, Server Component protegido: muestra solo displayName del perfil de acceso mediante el endpoint existente, reutiliza Auth SSR y errores de Fase 3.3. No muestra DNI, teléfono, ficha supuesta ni formularios de operaciones bloqueadas. Todos los roles activos pueden consultar su propio perfil de acceso conforme al permiso ya existente.
- Validación local de DNI: exactamente ocho caracteres ASCII numéricos, sin coerción de números, espacios ni dígitos Unicode; conserva ceros iniciales. Comprueba formato, no existencia ni titularidad.
- Contratos públicos y validadores en `@sentido/contracts/patients`: registro mínimo, búsqueda administrativa por body, contacto permitido y proyecciones de respuesta. Son preparados, no endpoints disponibles. Se rechazan campos actorId, id, perfil_id, rol, activo, metadata y claves adicionales.
- Límites técnicos propuestos: nombres de 1–100 caracteres tras trim; teléfono de 8–15 dígitos con + opcional; correo de hasta 254 caracteres con formato básico. No son nuevas reglas legales ni una comprobación de existencia. Actualización exige al menos un campo; no admite borrar mediante null/cadena vacía hasta acordar reglas. Registro no recoge fecha de nacimiento sin confirmar necesidad y compatibilidad del DDL.

## Contratos y matriz prevista, no activada

| Operación propuesta | Acceso que se debe aprobar | Estado actual |
| --- | --- | --- |
| GET /v1/users/me/patient | Paciente activo, ficha existente/activa y perfil_id del actor verificado | Sin endpoint; 404; sin consultas SQL |
| PATCH /v1/users/me/patient/contact | Mismas comprobaciones; solo telefono/correo de la ficha propia | Sin endpoint; 404 |
| POST /v1/users/patients | Administrador/recepción; asociación Auth validada por backend, no actor del formulario | Contrato; registro bloqueado |
| POST /v1/users/patients/search | Administrador/recepción, finalidad operativa y auditoría; DNI en body, no URL | Contrato; consulta bloqueada |
| Actualización administrativa | Administrador/recepción, recurso validado, sin identidad/DNI/roles por asignación masiva | Diseño reservado; no contrato activo ni endpoint |
| Psicólogo | Sin acceso general a pacientes; relación asistencial no implementada | Denegado |

Ni administrador obtiene acceso operativo por el mero nombre de su rol. La matriz es propuesta: todos los permisos patients.* se deniegan en el evaluador compartido hasta aprobar su implementación. Datos de contacto de la ficha pertenecen a usuarios.pacientes; no son automáticamente perfiles.telefono ni auth.users.email. No se cambia correo de autenticación.

Las respuestas propuestas no devuelven DNI, fecha de nacimiento, perfil_id, roles o información clínica. El actor solo se obtiene de JWT verificado. La propiedad futura se resolverá en backend por perfil_id, nunca comparando patient.id directamente con Auth.id. Perfil activo sin ficha es un estado diferente; una falta de permisos/dependencia no se presentará como «no tienes ficha».

## Bloqueo SQL y decisión necesaria

[Propuesta SQL separada](../base-de-datos/propuestas/PAC_SELF_ACCESS_DRAFT.sql), completamente comentada y fuera del historial de migraciones. No aplicada, sin credenciales. Propone únicamente lectura mínima de ficha propia y UPDATE telefono/correo con RLS adicional propia (permisiva/restrictiva) y perfil activo de rol paciente. No otorga INSERT de pacientes, DNI, consultas_dni, administración o datos de otros dominios.

La auditoría vigente solo admite users.profile.read y actor_id=recurso_id; no se reutiliza falseando una lectura de perfil para escribir contactos o auditar un patient.id diferente. La propuesta incluye auditoría PAC separada y mínima. No se modifica la tabla o las políticas actuales.

**No basta aprobar/aplicar GRANT:** el preflight actual rechaza cualquier acceso a pacientes; la autorización sigue pending_approval y no existen repositorios/endpoints PAC. Tras aprobación se necesitará un cambio coordinado y probado de preflight, permisos de aplicación, repositorio parametrizado, transacción y auditoría. No omitir el preflight ni ampliar su allowlist automáticamente. Revisar primero DDL completo con permiso de inspección; esta tarea no ejecuta ni siquiera SELECT remoto.

Decisión solicitada para la siguiente operación: revisar y aprobar (o ajustar) lectura propia, dos campos de contacto y auditoría propuesta. El registro y búsqueda administrativa requieren otra revisión de permisos/DDL/privacidad; no quedan autorizados por aprobar solo contacto propio.

## Pruebas y alcance LRPD

Pruebas locales: DNI/campos inválidos, proyección mínima, asignación masiva, cuatro roles y recursos propios/ajenos denegados para patients.*, perfiles de acceso propios autorizados, perfiles ajenos rechazados, dependencia caída sin fallback, rutas PAC no expuestas y vista SSR sin botones de edición. Regresiones de Auth, Usuarios y dashboard incluidas. No se usan cuentas o datos reales.

Resultado local: **302 pruebas aprobadas, 0 fallidas** (90 contratos/autorización, 134 Usuarios, 49 Auth y 29 integración web). **4 pruebas HTTP aprobadas, 0 fallidas**, contra Next local: login y protección de dashboard/mi-perfil ante visitante anónimo o cookie arbitraria. Typecheck, lint y build correctos. El servidor temporal se cerró; no se inició Usuarios ni se ejecutaron las 13 pruebas PostgreSQL. Verificación estática: propuesta totalmente comentada; migración y archivos de los otros cuatro dominios sin cambios.

Para Word: RF-PAC-04 tiene validación técnica de formato implementada, sin flujo de registro/consulta habilitado. RF-PAC-01/02/03/05 siguen bloqueados. RF-PAC-06 sigue pendiente de lectura/actualización de ficha; la pantalla de perfil de acceso es apoyo seguro, no una ficha implementada. Las 13 pruebas PostgreSQL de Fase 3.2E siguen siendo evidencia histórica del alcance anterior, no pruebas PAC. No se repiten pruebas remotas en esta fase.

Referencias oficiales consultadas: [privilegios por columna Supabase](https://supabase.com/docs/guides/database/postgres/column-level-security), [combinación de políticas PostgreSQL 17](https://www.postgresql.org/docs/17/sql-createpolicy.html).
