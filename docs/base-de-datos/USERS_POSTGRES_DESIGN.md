# Usuarios PostgreSQL — diseño de conexión segura, Fase 3.2A

> Documento técnico conservado con su historial. Las secciones de preparación no describen necesariamente el estado actual. Estado vigente y trazabilidad: [información maestra LRPD](../LRPD/INFORMACION_MAESTRA_LRPD.md). Las rutas de código sin enlace se interpretan desde la raíz del repositorio.


**Borrador para revisión humana. No ejecutar los bloques SQL.** No se ha instalado un driver, habilitado una conexión, creado una credencial ni cambiado el arranque cerrado de Usuarios. El dashboard no consume el servicio.

## 1. Alcance, evidencia y límites

Se revisaron docs/servicios/USERS_SERVICE.md, docs/seguridad/AUTHORIZATION_PROPOSAL.md, puertos, caso de uso, composición, adaptador de identidad y política compartida. La base de datos y los roles existentes se conservan.

El 14/11/2026 se ejecutaron exclusivamente SELECT de metadatos mediante la conexión autorizada: columnas, restricciones, RLS, ACL y nombres de tablas. No se seleccionaron filas de perfiles, pacientes, cuentas ni eventos. No se consultaron secretos ni hashes de contraseñas. No se comprobó una conexión de aplicación: todavía no existe su credencial aprobada.

Hechos de fases anteriores: perfiles tiene PK/FK a auth.users, rol con CHECK para los cuatro roles y activo NOT NULL; svc_usuarios es NOLOGIN con CRUD amplio en usuarios. Las políticas svc_* con condiciones true no filtran por actor.

Hallazgos comprobados ahora:

| Objeto | Resultado |
| --- | --- |
| usuarios | Tablas perfiles, pacientes y consultas_dni; no hay tabla de auditoría en este esquema |
| citas.auditoria | cita_id obligatorio y FK a citas.citas; no representa una lectura de perfil |
| pagos.auditoria | devolucion_id obligatorio y FK a pagos.devoluciones; no representa una lectura de perfil |
| administracion.auditoria | Admite actor_id, dominio, entidad, entidad_id, operacion, detalles JSONB y fecha; no tiene FK de evento a un recurso de Citas/Pagos |
| Acceso técnico a las tres auditorías | svc_usuarios no tiene USAGE del esquema ni INSERT en la tabla |
| RLS de administracion.auditoria | Política ALL para authenticated con USING=false y WITH CHECK=false; no autoriza a Usuarios |
| perfiles | RLS habilitado, FORCE=false, propietario postgres |
| PUBLIC | Tiene USAGE en public, no en los esquemas privados consultados; no se observaron privilegios PUBLIC de tablas/vistas ni rutinas SECURITY DEFINER públicas en public |

La última comprobación es acotada: no es una auditoría global de extensiones, objetos futuros, privilegios por columna de todos los esquemas ni de todas las rutas indirectas. Los privilegios efectivos de un LOGIN nuevo tendrán que comprobarse después de su creación autorizada.

## 2. Comparación de identidades técnicas

| Alternativa | RLS y privilegios | Operación | Evaluación para perfil propio |
| --- | --- | --- | --- |
| LOGIN con privilegios directos | Columnas/operaciones explícitas. Sin membresía svc_usuarios, sus políticas no son aplicables; requiere política propia aprobada | No necesita cambiar rol por petición. Rotación obliga a conservar grants/políticas equivalentes | **Recomendada:** permite lectura mínima y solo INSERT de auditoría |
| LOGIN heredando svc_usuarios | En PostgreSQL 17 la opción INHERIT de la membresía controla la disponibilidad de privilegios; no basta mirar el atributo global | Pocas instrucciones por petición; acumula también concesiones futuras del rol técnico | No recomendada ahora: heredaría CRUD de tres tablas y políticas sin filtro por usuario |
| LOGIN con SET ROLE controlado | Membresía sin herencia y con SET autorizado; SET LOCAL ROLE fijo dentro de transacción | Añade estado y riesgo de fugas si se reutiliza conexión; hay que probar cleanup y modo de pooler | No recomendada ahora: al cambiar a svc_usuarios obtiene el mismo alcance excesivo |

En las alternativas de membresía se debe fijar también ADMIN OPTION=false y revisar caminos transitivos. SET ROLE no recibe nunca un rol del navegador. SET LOCAL ROLE limita la duración, no reduce los privilegios del rol destino. Ninguna alternativa puede ejecutar como propietario, superusuario o BYPASSRLS.

**Recomendación concreta:** LOGIN propuesto sdv_users_app, sin pertenecer a svc_usuarios, con SELECT de id/nombres/apellidos/rol/activo en perfiles y, si se aprueba la auditoría local, INSERT de columnas concretas en una tabla nueva del propio dominio. Sin permisos sobre pacientes, consultas_dni, otros dominios o tablas Auth. La separación es deliberadamente más estrecha que el rol técnico general.

No se convierte svc_usuarios en LOGIN ni se modifican sus políticas o membresías actuales. No se utiliza un rol administrador de aplicación para decidir identidad PostgreSQL.

NOINHERIT no elimina concesiones a PUBLIC. La revisión de permisos efectivos y funciones accesibles es un prerrequisito, no se intenta resolver con revocaciones globales que puedan romper Supabase.

## 3. Conexión, pooler y TLS

Para este proceso Node persistente, preferir conexión directa y pool pequeño si el entorno tiene conectividad adecuada. En una red solo IPv4, evaluar Supavisor en modo sesión. Si se adopta serverless, reevaluar modo transacción. Host, puerto, región y nombre de usuario deben obtenerse del diálogo Connect aprobado, no inventarse.

Con rol personalizado el usuario del pooler compartido tiene forma ROLE.PROJECT_REF; en conexión directa se usa el rol directamente. Copiar ejemplos de documentación que usan postgres no autoriza a ejecutar como ese rol.

Pool inicial propuesto: dos conexiones por proceso, presupuesto total por réplicas y reserva para Auth/operación. El límite definitivo depende del entorno y capacidad. CONNECTION LIMIT del rol y límites del pooler no sustituyen el presupuesto de clientes por instancia. Ningún valor se configura en esta fase.

En modo transacción no asumir estado de sesión entre operaciones. Cada solicitud debe adquirir un cliente y usarlo hasta COMMIT/ROLLBACK, sin repartir sentencias entre llamadas pool.query. No usar prepared statements con nombre en el pooler compartido en modo transacción; parametrizar valores sigue siendo obligatorio y compatible. El plan preparado no incluye name.

TLS obligatorio: validar cadena y hostname, equivalente a verify-full. Con un futuro driver Node se propone ssl.rejectUnauthorized=true, hostname DNS correcto y CA correspondiente al endpoint aprobado. Probar la cadena real del pooler: no asumir que la CA de conexión directa cubre cualquier endpoint. Nunca usar rejectUnauthorized=false ni desactivar validación para resolver errores.

Evitar mezclar parámetros sslmode/sslrootcert de una URI con un objeto ssl: node-postgres advierte que pueden sobrescribirlo. Preferir campos separados de configuración. No se descargaron certificados ni se cambió SSL enforcement; activar enforcement remotamente requiere aprobación y puede reiniciar la base.

Límites propuestos, pendientes de carga: adquisición/conexión 3 s, statement_timeout 2 s, lock_timeout 500 ms y transacción inactiva 5 s. Se requieren deadline y cancelación de extremo a extremo, rollback y descarte de conexiones cuyo estado no se conozca. El requestTimeout HTTP actual no es un deadline del caso de uso ni cancela por sí solo una consulta.

## 4. Secretos exclusivamente del servidor

Propuesta de configuración, todavía sin consumidor ni valores:

| Nombre propuesto | Tratamiento |
| --- | --- |
| USERS_PG_HOST / PORT / DATABASE / USER | Parámetros aprobados del entorno backend; no derivados de una solicitud |
| USERS_PG_PASSWORD_FILE | Ruta de montaje del secreto, fuera del checkout; solo legible por la identidad del proceso |
| USERS_PG_CA_FILE | CA de confianza para el endpoint elegido, obtenida por canal aprobado |
| USERS_PG_POOL_MAX | Presupuesto explícito de conexiones por instancia |
| USERS_PG_MODE | Modo aprobado: direct, session o transaction |

El gestor de secretos del entorno de ejecución entregaría la contraseña montada o mediante su API autenticada. No escribirla en .env.example, código, documentación, comandos de historial o artefactos. No usar NEXT_PUBLIC_* ni pasar credenciales a la web. La publishable key de Auth no es una contraseña PostgreSQL.

No cargar apps/web/.env.local ni reutilizar una DATABASE_URL administrativa. Si se admiten variables de entorno en un desarrollo posterior, serán solo del proceso backend, privadas e ignoradas; esta fase no solicita ni almacena ningún valor.

Los secretos de Supabase Edge Functions son propios de ese runtime: no se inyectan automáticamente en este servicio Node. No se ejecuta secrets set ni se usa una API administrativa para aprovisionarlos.

El logger debe registrar códigos internos de categoría, requestId y tiempos, sin serializar config, URI, errores crudos del driver, JWT, parámetros SQL o filas. Revisar también APM, trazas, volcados y configuración de logs del servidor antes de activar credenciales.

Rotación: generar una credencial por servicio y entorno por canal externo, actualizar el secreto y reciclar el pool con control. Probar credencial nueva, drenaje de conexiones anteriores y comportamiento del pooler ante caché de autenticación. Fallos continuados no deben disparar reintentos ilimitados ni usar una cuenta privilegiada como fallback.

## 5. Repositorio de perfiles propuesto

Se añadió únicamente un plan puro de consulta y mapeo en services/users/src/repositories/postgres-profile-plan.ts. No implementa ProfileRepository, no importa un driver, no abre sockets ni se importa desde composition.ts/index.ts. No es un adaptador PostgreSQL activable.

Consulta fija:

```sql
-- Consulta parametrizada propuesta; no ejecutada.
SELECT id, nombres, apellidos, rol, activo
FROM usuarios.perfiles
WHERE id = $1::uuid;
```

$1 procede exclusivamente del subject verificado. No hay nombres de tabla dinámicos, SELECT *, JOIN a otros dominios ni filtros suministrados por el visitante.

El resultado tiene cardinalidad cero o uno por la PK. Cero se mapea a null y el caso de uso responde 403. Más de uno, columnas extra/ausentes o tipos inválidos son fallo de dependencia (503). El mapeo conserva rol y activo, incluso si el perfil está inactivo: no los reemplaza con paciente/true. La política compartida sigue decidiendo el acceso. La respuesta HTTP continúa limitada a id/displayName.

El plan también describe SELECT set_config('app.auth_subject', $1::text, true). El tercer argumento true exige contexto local de una transacción explícita. No debe ejecutarse como llamada aislada autocommit. La conexión, orden y transacción deberán implementarse y probarse en una etapa posterior.

La política RLS propuesta compara el id con ese contexto. Si el contexto no está definido, no autoriza filas. Un UUID malformado debe rechazarse antes de llegar al driver.

**Límite de confianza:** PostgreSQL directo no verifica el JWT a partir de esta variable. El backend la afirma después de verificar identidad. Quien posea la credencial técnica o logre ejecutar SQL arbitrario puede intentar cambiar un GUC propio y consultar otro actor dentro de las columnas concedidas. La política es defensa contra errores de filtrado, no protección criptográfica frente a una credencial robada. Parámetros, mínimos privilegios, aislamiento de red y gestión de secretos siguen siendo necesarios.

## 6. Auditoría persistente

### Reutilización de tablas existentes

- citas.auditoria y pagos.auditoria no son compatibles semánticamente y exigirían referencias ajenas. No insertar eventos ficticios de cita/devolución.
- administracion.auditoria podría representar el evento, pero una escritura directa desde Usuarios rompe el límite actual y exige nuevos permisos/RLS de infraestructura compartida.
- usuarios no tiene un destino local existente.

No hay una tabla existente reutilizable directamente bajo los permisos y límites actuales. No se amplían privilegios para aparentar que la auditoría está resuelta.

### Recomendación para aprobación

Proponer usuarios.auditoria_accesos, append-only para la aplicación, con request_id, actor_id, recurso_id, operacion, policy_version, resultado y fecha del servidor. Sin nombres, correo, teléfono, DNI, JWT, IP, user agent ni detalles JSON libres. No necesita secuencia: el requestId UUID ya lo genera el servidor.

No tendrá FK a recursos de otros dominios ni a auth.users. Se propone no añadir FK al perfil para conservar un evento autorizado aunque después desaparezca la cuenta; retención y eventual anonimización de UUID deben acordarse por tratarse de identificadores personales.

La aplicación solo insertaría un evento allowed de autorización de lectura propia; no podría leer, modificar, borrar eventos ni proporcionar su timestamp. No significa que el usuario haya recibido o visto la respuesta. Un administrador de base de datos todavía puede modificar la tabla: append-only de aplicación no equivale a almacenamiento inmutable ante el propietario.

Si se compromete la credencial técnica, también pueden fabricarse eventos afirmando otro contexto GUC: el log no constituye prueba criptográfica del actor. Los accesos denegados requieren un diseño separado de telemetría de seguridad y retención. El puerto actual registra solo autorizaciones permitidas; no se afirma que ya audite rechazos.

Alternativa sin nueva tabla: sink/colector persistente desacoplado con confirmación duradera antes de responder. Evita SQL cruzado de Usuarios, pero añade disponibilidad, retención y operación; stdout o un buffer en memoria no cumplen esa garantía. No se implementa ni se crea un sexto dominio de negocio.

### Atomicidad y cambios de interfaces pendientes

Si se aprueba la tabla local, se propone una unidad de trabajo: checkout de un cliente, BEGIN, contexto local, SELECT fresco, política compartida, INSERT de auditoría, COMMIT y solo después respuesta. Ante error: ROLLBACK y 503 sin perfil. Aunque la API sea GET, la transacción no será READ ONLY porque inserta auditoría.

Los puertos actuales ProfileRepository y AuthorizationAudit son independientes; por sí solos no garantizan compartir transacción. Antes de conectar datos deben coordinarse mediante una unidad de trabajo explícita, manteniendo decidePermission como único evaluador y sin pasar conexión al transporte HTTP. No se ha realizado ese refactor.

No usar ON CONFLICT DO NOTHING como confirmación de un evento: podría ocultar una colisión o registro distinto. Un conflicto de request_id falla cerrado. Si se pierde la conexión durante COMMIT, el resultado es incierto: no responder 200 ni reintentar una escritura a ciegas. Cada nuevo intento HTTP tendrá su requestId; diseñar idempotencia si se necesita correlacionar reintentos.

READ COMMITTED y una lectura fresca establecen el estado al autorizar, no una revocación instantánea frente a cambios concurrentes posteriores. Mantener transacciones cortas, sin llamadas remotas mientras se retienen conexiones y sin caché de perfil. No añadir FOR SHARE/FOR UPDATE sin revisar privilegios: no se concederá UPDATE en perfiles solo para tomar locks de lectura.

## 7. Borrador SQL revisable — NO EJECUTADO

Este bloque **no es una migración ni un script instalado**. Nombres y límites son propuestos; verificar que no existen y que el operador autorizado puede aplicar el DDL. No ejecutarlo como parte del build. Ningún secreto está contenido en él.

La base del proyecto se llama postgres; ese identificador de base no indica que la aplicación deba conectarse con el rol postgres.

```sql
-- BORRADOR. NO EJECUTAR SIN APROBACIÓN HUMANA Y PRUEBAS AISLADAS.
BEGIN;

-- Rol nuevo propuesto, sin contraseña configurada ni membresías técnicas.
CREATE ROLE sdv_users_app
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD NULL;

GRANT CONNECT ON DATABASE postgres TO sdv_users_app;
GRANT USAGE ON SCHEMA usuarios TO sdv_users_app;
GRANT SELECT (id, nombres, apellidos, rol, activo)
  ON TABLE usuarios.perfiles TO sdv_users_app;

ALTER ROLE sdv_users_app SET search_path = pg_catalog;
ALTER ROLE sdv_users_app SET row_security = on;
ALTER ROLE sdv_users_app SET statement_timeout = '2s';
ALTER ROLE sdv_users_app SET lock_timeout = '500ms';
ALTER ROLE sdv_users_app SET idle_in_transaction_session_timeout = '5s';

-- No se aplica la política ALL de svc_usuarios a este LOGIN sin membresía.
CREATE POLICY sdv_users_app_perfil_propio
  ON usuarios.perfiles FOR SELECT TO sdv_users_app
  USING (
    id = NULLIF(pg_catalog.current_setting('app.auth_subject', true), '')::uuid
  );

-- Decisión independiente pendiente: crear destino local de auditoría.
CREATE TABLE usuarios.auditoria_accesos (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  recurso_id uuid NOT NULL,
  operacion text NOT NULL CHECK (operacion = 'users.profile.read'),
  policy_version text NOT NULL CHECK (
    pg_catalog.length(policy_version) BETWEEN 1 AND 80
  ),
  resultado text NOT NULL CHECK (resultado = 'allowed'),
  fecha timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (recurso_id = actor_id)
);
ALTER TABLE usuarios.auditoria_accesos ENABLE ROW LEVEL SECURITY;

-- Solo sobre la tabla NUEVA: neutralizar ACL heredadas de defaults del creador.
-- No alterar privilegios por defecto ni tablas existentes de la plataforma.
REVOKE ALL ON TABLE usuarios.auditoria_accesos
  FROM PUBLIC, anon, authenticated, svc_usuarios;
GRANT INSERT (
  request_id, actor_id, recurso_id, operacion, policy_version, resultado
) ON TABLE usuarios.auditoria_accesos TO sdv_users_app;

CREATE POLICY sdv_users_app_auditoria_insert
  ON usuarios.auditoria_accesos FOR INSERT TO sdv_users_app
  WITH CHECK (
    actor_id = NULLIF(
      pg_catalog.current_setting('app.auth_subject', true), ''
    )::uuid
    AND recurso_id = actor_id
    AND operacion = 'users.profile.read'
    AND resultado = 'allowed'
  );

COMMIT;
-- FIN DEL BORRADOR. NO SE HA ENVIADO A POSTGRESQL.
```

La contraseña nula mantiene deshabilitada la autenticación por contraseña hasta un aprovisionamiento posterior aprobado y externo al repositorio. Revisar también métodos de autenticación del endpoint; PASSWORD NULL no afirma impedir cualquier mecanismo distinto de contraseña.

No se concede svc_usuarios, ni ADMIN OPTION/SET OPTION de roles, CREATE de esquema, acceso a pacientes, SELECT * en perfiles, UPDATE/DELETE/TRUNCATE ni SELECT de auditoría. Las concesiones PUBLIC siguen siendo acumulativas: no se compensan revocando solo al rol; si una comprobación posterior muestra acceso indebido por PUBLIC o herencia, detener la activación y diseñar corrección específica antes de aprovisionar secretos.

Los defaults existentes de postgres en usuarios conceden CRUD a svc_usuarios para nuevas tablas. Por eso el borrador revoca esos permisos exclusivamente en la auditoría nueva. No se cambian los defaults del esquema.

Si se elige colector externo en lugar de tabla local, retirar todo el bloque de tabla y políticas de auditoría; no ejecutar un diseño parcial que deje el puerto de auditoría sin persistencia.

Inserción parametrizada propuesta, también no ejecutada:

```sql
INSERT INTO usuarios.auditoria_accesos
  (request_id, actor_id, recurso_id, operacion, policy_version, resultado)
VALUES ($1::uuid, $2::uuid, $2::uuid,
        'users.profile.read', $3::text, 'allowed');
```

El rol no necesita RETURNING ni SELECT sobre auditoría. El adaptador debe confirmar una fila insertada y COMMIT antes del éxito HTTP. Retención, purga y revisión de auditoría pertenecerán a un proceso/identidad separado, no al LOGIN de ejecución.

## 8. Comportamiento ante fallos e identidad obsoleta

| Caso | Diseño propuesto |
| --- | --- |
| Conexión, TLS, pool o consulta caídos | 503 genérico, sin perfil, rollback/descartar si hay duda del estado; no fallback |
| Credencial técnica rechazada | 503, alertar por categoría sin mostrar credencial; nunca usar cuenta administrativa |
| Perfil ausente o inactivo | 403 común; no crear perfil ni activar cuenta |
| Perfil con UUID diferente | 403 aunque el rol sea administrador |
| Rol recién cambiado | Leer rol/activo de perfiles en cada petición; no tomar rol de JWT ni de caché local |
| Rol desconocido | Denegar mediante política compartida, no asumir paciente |
| Auditoría no confirmada | 503; sin exponer datos antes de confirmar persistencia |
| JWT expirado o fallo de verificación | 401 |
| JWT criptográficamente válido pero sesión revocada | La verificación local actual no prueba revocación; requiere decisión adicional antes de activar datos |

Supabase documenta que los JWT pueden seguir siendo utilizables hasta su caducidad y que garantías más fuertes requieren comprobar el estado de sesión. getUser puede aportar estado actual del usuario, pero no se dará por equivalente a un control de revocación global sin probar el contrato concreto.

Opciones a aprobar: aceptar y documentar una ventana de validez compatible con el riesgo, o incorporar un verificador confiable de estado de sesión/revocación. Para revocación estricta, identidad conocida como revocada produce 401; dependencia de comprobación requerida no disponible produce 503. No se añadirá SELECT de auth.sessions al rol de Usuarios ni una clave administrativa como atajo.

La correspondencia de session_id con sesiones vigentes puede requerir una capacidad separada autorizada; no existe en el puerto actual. Un denylist local que no reciba todas las revocaciones tampoco garantiza esa propiedad. Es un bloqueo de diseño si se exige revocación inmediata.

El umbral de 60 segundos de la política de diseño no sustituye lectura fresca ni garantiza que un rol no cambió después de tomar la instantánea. Deben aprobarse semántica de concurrencia y latencia de revocación antes de prometer efecto inmediato.

## 9. Pruebas: realizadas y pendientes de autorización

Realizadas sin conexión PostgreSQL: plan fijo y parámetros, contexto transaccional local, identidad manipulada/inyección rechazada, cinco columnas exactas, cardinalidad, filas malformadas, inactividad/rol desconocido sin respaldo y ausencia de mutaciones del resultado.

Se conservan pruebas de Usuarios, autorización y Auth. Ninguna prueba de plan demuestra que los permisos del LOGIN nuevo funcionen: el rol y la auditoría del borrador no existen.

Plan de integración futura, en entorno aislado aprobado y con datos sintéticos:

| Prueba | Resultado esperado |
| --- | --- |
| Conectar con LOGIN propuesto y TLS correcto | session_user/current_user corresponden al LOGIN aprobado, sin atributos peligrosos |
| Acceso perfiles: cinco columnas, actor propio y contexto local | Una fila propia |
| Sin contexto o sujeto distinto | Cero filas por RLS; no lectura ajena |
| SELECT de teléfono o SELECT * | 42501 por privilegio de columna |
| Acceso a usuarios.pacientes/consultas_dni | 42501; no necesario para este endpoint |
| SELECT a catalogo, citas, pagos, notificaciones | 42501 incluso usando nombres cualificados |
| INSERT/UPDATE/DELETE de perfiles | 42501 |
| SET ROLE svc_usuarios u otro rol | Denegado; no membresía ni camino transitivo |
| Cambiar rol de negocio o activo por payload | Rechazado por contrato y permisos, sin mutación |
| Auditoría: INSERT mínimo propio | Confirmación de una fila tras COMMIT |
| Leer/actualizar/borrar auditoría o fijar fecha | Denegado |
| Auditoría con actor distinto o colisión de request_id | Rechazado, sin respuesta de perfil |
| Fallo de INSERT o COMMIT | 503 sin datos; tratar estado incierto sin reintento ciego |
| Dos actores secuenciales/concurrentes en pool | Sin fuga de GUC ni cambio de rol tras commit/rollback |
| Excepción, cancelación o timeout dentro de transacción | Rollback antes de reutilizar conexión; descarte si no se puede confirmar |
| Certificado/CA/hostname incorrectos o TLS deshabilitado | Conexión rechazada, nunca relajar verificación |
| Caída/reinicio y agotamiento del pool | 503 acotado, recuperación controlada |
| Cambio de rol/estado entre peticiones | Se usa estado fresco; no privilegio previo en caché |
| Logout/revocación con JWT aún no expirado | Medir ventana; si se exige revocación estricta, probar verificador adicional antes de activar |
| Credencial rotada, sesiones antiguas y pooler | Rotación y drenaje probados sin fallback privilegiado |

No ejecutar las pruebas de escritura, creación de fixtures o modificación de estado contra producción. Las pruebas negativas no se deben realizar con la conexión de metadatos ni con postgres: deben usar la futura identidad real restringida. Revisar ACL efectivas, PUBLIC, membresías y políticas aplicables antes de interpretar un resultado como aislamiento validado.

## 10. Aprobaciones humanas y siguiente etapa

1. Aprobar LOGIN directo y el alcance mínimo; revalidar que no hay caminos de herencia/PUBLIC inesperados.
2. Aprobar política RLS específica y aceptar explícitamente el límite de confianza del GUC afirmado por backend.
3. Elegir auditoría local o colector persistente; aprobar DDL, retención, anonimización y propiedad operativa.
4. Aprobar modo de conexión, endpoint, certificados, límites y gestor de secretos.
5. Acordar revocación, concurrencia, contratos de unidad de trabajo y deadlines.
6. Revisar el SQL fuera del circuito de ejecución; solo una etapa posterior autorizada podrá crear recursos y aprovisionar secretos.
7. Exigir pruebas de integración con identidad restringida antes de conectar el repositorio al caso de uso real o al dashboard.

Estado final de 3.2A: diseño y plan puro preparados, sin driver ni credenciales, con composición cerrada conservada. No se han ejecutado DDL/DML remotos ni modificado tablas, roles, políticas, migraciones o cuentas.

## Referencias oficiales consultadas — 14 de noviembre de 2026

- [Supabase: conexiones](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase: límites y pooling](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- [Supabase: roles personalizados](https://supabase.com/docs/guides/database/postgres/roles)
- [Supabase: TLS y verify-full](https://supabase.com/docs/guides/platform/ssl-enforcement)
- [Supabase: secretos de Edge Functions; alcance del runtime](https://supabase.com/docs/guides/functions/secrets)
- [Supabase: sesiones y revocación](https://supabase.com/docs/guides/auth/sessions)
- [PostgreSQL 17: membresías](https://www.postgresql.org/docs/17/role-membership.html)
- [PostgreSQL 17: GRANT](https://www.postgresql.org/docs/17/sql-grant.html)
- [PostgreSQL 17: SET ROLE](https://www.postgresql.org/docs/17/sql-set-role.html)
- [node-postgres: TLS](https://node-postgres.com/features/ssl)
- [node-postgres: transacciones](https://node-postgres.com/features/transactions)

### Resultado de validaciones de Fase 3.2A

- Usuarios: 40 pruebas correctas, incluidas las ocho del plan PostgreSQL.
- Autorización compartida: 70 pruebas correctas.
- Auth: 49 pruebas correctas.
- TypeScript, ESLint y build de web/Usuarios: correctos.
- No se ejecutaron pruebas contra una identidad PostgreSQL nueva ni pruebas remotas de escritura.
- Se utilizó npm.cmd porque PowerShell bloquea npm.ps1; no se cambió ExecutionPolicy.

El plan puro y sus pruebas no demuestran que el borrador DDL sea ejecutable en el entorno ni que las nuevas ACL/RLS estén activas. Eso requiere revisión humana y un entorno de integración autorizado.

> Fase 3.2B: repositorio PostgreSQL implementado y deshabilitado por defecto. Migración preparada, no ejecutada. Procedimiento vigente: [activación segura](USERS_POSTGRES_ACTIVATION.md).
