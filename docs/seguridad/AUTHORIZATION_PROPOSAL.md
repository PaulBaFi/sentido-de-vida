# Propuesta inicial de autorización por roles

> Documento técnico conservado con su historial. Las secciones de preparación no describen necesariamente el estado actual. Estado vigente y trazabilidad: [información maestra LRPD](../LRPD/INFORMACION_MAESTRA_LRPD.md). Las rutas de código sin enlace se interpretan desde la raíz del repositorio.


Estado: Fase 2.3, verificación remota de metadatos y diseño de contratos/evaluador aislado. No se activan permisos en aplicaciones, consultas de perfiles ni asignaciones de roles. Ver resultados y límites al final.

## Fuentes y hechos documentados

Se revisaron en modo de solo lectura:

- docs/Documentacion_Unica_Base_de_Datos_Sentido_de_Vida.docx, versión 1.0, 14/11/2026, apartados 4.1, 4.2, 5, 6 y 7.
- docs/Capitulo_III_Analisis_y_Modelado_Sentido_de_Vida.docx: actores y casos de uso.
- docs/DIAGRAMA DE CLASES ARQUIT SOFT.txt: modelo conceptual de Usuario, Rol y Permiso.
- docs/seguridad/AUT.md y docs/arquitectura/SUPABASE_INTEGRATION.md: límites actuales de autenticación e integración.

El documento de base de datos describe usuarios.perfiles.id como PK/FK a auth.users.id. perfiles contiene rol (text) y activo (boolean). usuarios.pacientes tiene id propio y perfil_id único/FK a perfiles.id. catalogo.psicologos también tiene id propio y perfil_id único, pero esta última referencia entre dominios no tiene FK física.

Por tanto, el UUID verificado por Auth identifica al perfil; no debe confundirse con pacientes.id ni con psicologos.id. Para comprobar propiedad se necesitará resolver la relación correspondiente por las APIs de los dominios, sin que estos lean tablas ajenas.

La fuente describe un trigger que crea un perfil provisional de paciente al crear una cuenta Auth. Esto no prueba que cada cuenta actual tenga perfil válido, activo y coherente con su ficha; debe comprobarse antes de autorizar datos.

Según el documento, las 22 tablas tienen RLS; anon y authenticated no tienen acceso directo a los esquemas internos. Los roles svc_usuarios, svc_catalogo, svc_citas, svc_pagos y svc_notificaciones son NOLOGIN, y svc_access_* limita su ámbito técnico. Estas políticas no constituyen reglas de negocio de administrador, recepcionista, psicólogo y paciente.

Las descripciones anteriores proceden de documentación local. La verificación remota de metadatos realizada en Fase 2.3 se distingue en la sección final; no es una auditoría de datos de usuarios.

## Diferencias que deben resolverse

El diagrama conceptual presenta entidades Rol y Permiso; el inventario físico describe un campo perfiles.rol de texto, no demuestra tablas de permisos ni un modelo multirrol. La verificación de Fase 2.3 confirma los cuatro valores canónicos del CHECK y un campo de rol por perfil. Sigue pendiente aprobar si el negocio necesita un modelo multirrol, que no se implementa aquí. No se inventan tablas. La Fase 2.3 refleja en TypeScript los cuatro valores del CHECK comprobado, sin crear un catálogo persistente.

Administrador de aplicación no equivale a postgres, service_role, una secret key ni un rol técnico svc_*. El claim estándar role=authenticated tampoco identifica un rol de negocio.

## Matriz propuesta — no implementada

Cada celda expresa el máximo a evaluar; todavía no concede acceso. Las operaciones dependen además de propiedad, relación asistencial, estado y reglas de negocio.

| Módulo / dominio | Administrador | Recepcionista | Psicólogo | Paciente |
| --- | --- | --- | --- | --- |
| AUT y perfil propio | Acceso y perfil propio | Acceso y perfil propio | Acceso y perfil propio | Acceso y perfil propio |
| Usuarios | Gestionar perfiles/estado; cambios de rol mediante operación separada y auditada | Alta y actualización de datos identificativos de pacientes; sin roles ni personal | Perfil profesional propio; identificación mínima de pacientes asignados | Consultar/corregir campos autorizados del perfil propio |
| Catálogo | Gestionar profesionales y servicios | Consultar catálogo operativo | Consultar catálogo y ficha propia; solicitar correcciones | Consultar oferta pública habilitada |
| Citas y disponibilidad | Configuración operativa y supervisión; sin saltar reglas de agenda | Gestionar citas conforme a estados y reglas aprobadas | Agenda propia, disponibilidad propia y atención de citas asignadas | Solicitar/consultar citas propias; cambios según política |
| Pagos | Conciliación y autorizaciones de devolución auditadas | Registrar y verificar operaciones permitidas; sin aprobar devoluciones por defecto | Sin acceso al módulo financiero | Consultar operaciones y comprobantes propios |
| Notificaciones | Supervisar envíos y reintentos con alcance mínimo | Consultar estado de avisos operativos necesarios para atención | Recibir/consultar avisos propios | Recibir/consultar avisos propios |
| Reportes | Agregados operativos aprobados; sin acceso automático a información clínica | Solo vistas operativas que se aprueben | Solo agenda/actividad propia que se apruebe | Sin reportes generales |

Reportes no introduce un sexto microservicio: una etapa posterior decidirá la composición a través de APIs de los cinco dominios. No se propone acceso SQL cruzado para obtenerlos. No se incorpora historia clínica ni se asume que administrador puede ver cualquier dato sensible.

## Fuente de verdad y flujo propuesto

1. Verificar en servidor el usuario Auth. No aceptar un perfil_id o rol enviado por navegador como identidad del actor.
2. Una futura API de Usuarios resolvería el perfil por el UUID Auth verificado, devolvería solo rol/estado/identificadores necesarios y mantendría la fuente de verdad de autorización.
3. Perfil ausente, inactivo, rol desconocido o relación profesional/paciente incoherente: denegar operaciones de negocio, sin asignar por defecto paciente o administrador.
4. Cada dominio autorizaría cada operación y cada recurso usando esa identidad, con denegación por defecto y comprobaciones de propiedad/asignación. El frontend solo ajustaría la presentación.
5. Comunicación entre servicios con identidad técnica independiente y contexto del actor verificado. No confiar en cabeceras de rol accesibles al navegador.

La elección de credenciales técnicas sigue pendiente: los svc_* NOLOGIN no son contraseñas ni conexiones utilizables por sí solos. No suplir esta falta con service_role o una conexión administrativa compartida.

## Controles contra escalamiento

- No leer roles de user_metadata, almacenamiento local, formularios, querystrings ni cookies sin verificar.
- Si se consideran app_metadata o claims propios en el futuro, solo una autoridad de confianza podrá emitirlos. Deben resolverse cambios de rol/estado, caducidad y cachés; un JWT antiguo no debe mantener privilegios revocados indefinidamente.
- Excluir rol, activo, perfil_id y membresías de actualizaciones de perfil genéricas. Usar listas explícitas de campos permitidos para evitar asignación masiva.
- Cambios de rol por operación administrativa separada: autenticar de nuevo cuando corresponda, verificar permiso específico, registrar actor/valor anterior/valor nuevo y acordar aprobación adicional para privilegios elevados. No permitir autoascenso.
- No implementar un rol inicial automático elevado. Definir y auditar el alta inicial de administrador antes de desarrollarla.
- Verificar IDs de recursos para impedir IDOR/BOLA. Ser psicólogo no permite acceder a todas las citas o pacientes; ser paciente no permite elegir otro paciente_id.
- Mantener mínimo privilegio, permisos efectivos y RLS existentes. Un permiso técnico de esquema no autoriza automáticamente una acción del actor.
- Probar matriz de permitidos/denegados, perfiles faltantes/inactivos, manipulación de rol y IDs, cambios concurrentes y revocación. Mantener auditoría sin contraseñas ni tokens.

## Decisiones pendientes

Aprobar la matriz con el centro; completar la verificación de exposición y de adaptadores; decidir el modelo de uno o varios roles; definir el contrato operativo de Usuarios, credenciales técnicas, revocación/cachés, auditoría y operaciones sensibles. Los valores de rol y metadatos ya comprobados se detallan en Fase 2.3. El dashboard permanece neutral y no consulta perfiles ni aplica roles reales.

## Referencias oficiales

- [Datos de usuario y relación con auth.users](https://supabase.com/docs/guides/auth/managing-user-data)
- [RLS y metadatos](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Roles PostgreSQL](https://supabase.com/docs/guides/database/postgres/roles)

## Fase 2.3 — evidencia remota y diseño ejecutable aislado

### Alcance de la comprobación — 14/11/2026

Se utilizó la conexión Supabase autorizada para sentido-de-vida. Todas las consultas ejecutadas fueron SELECT sobre catálogos de PostgreSQL y funciones de inspección de privilegios. No se seleccionaron filas de perfiles, cuentas Auth ni tablas de negocio. No se obtuvieron claves ni se cambiaron credenciales, roles, datos, políticas o configuraciones.

Consultados: pg_attribute, pg_attrdef, pg_constraint, pg_roles, pg_policies, pg_class, pg_namespace, pg_auth_members, pg_db_role_setting, pg_default_acl y pg_proc; funciones format_type, pg_get_expr, pg_get_constraintdef, has_schema_privilege, has_table_privilege, has_any_column_privilege, has_sequence_privilege, has_function_privilege, pg_has_role y current_setting.

La comprobación de ACL incluye herencia y privilegios de columna, pero no simula operaciones como los roles ni prueba operaciones DML. No es una auditoría exhaustiva de todos los objetos de la instancia.

### Hechos comprobados mediante SQL en esta tarea

| Aspecto | Resultado |
| --- | --- |
| usuarios.perfiles.id | UUID NOT NULL, PK y FK a auth.users(id), ON DELETE CASCADE |
| usuarios.perfiles.rol | TEXT NOT NULL, sin valor por defecto; CHECK validado: administrador, recepcionista, psicologo, paciente |
| usuarios.perfiles.activo | BOOLEAN NOT NULL, default true |
| Restricciones de perfiles | PK, FK y CHECK consultados con convalidated=true |
| usuarios.pacientes.perfil_id | FK a usuarios.perfiles(id) y UNIQUE; pacientes.id es una PK distinta |
| catalogo.psicologos.perfil_id | UNIQUE; no hay FK declarada en esa tabla |
| Cinco dominios internos | 20 tablas: usuarios 3, catalogo 3, citas 8, pagos 4, notificaciones 2 |
| RLS de las 20 tablas | Habilitado, FORCE RLS=false; propietario postgres |
| Políticas | 20 políticas PERMISSIVE/ALL para svc_* de su dominio; USING=true y WITH CHECK=true |
| Cinco roles svc_* | NOLOGIN, INHERIT, sin superusuario, BYPASSRLS ni CREATEROLE |
| anon y authenticated | Sin USAGE de los cinco esquemas ni SELECT por tabla/columna, INSERT, UPDATE, DELETE, TRUNCATE o EXECUTE en sus objetos consultados |
| Cada svc_* | USAGE y CRUD sobre todas las tablas de su esquema; sin USAGE ni CRUD sobre los otros cuatro |
| TRUNCATE técnico | No concedido en los cinco dominios consultados |
| Secuencias existentes | USAGE en una secuencia de citas para svc_citas y una de pagos para svc_pagos; sin acceso cruzado observado |
| Funciones de los cinco dominios | No se observó EXECUTE concedido a los siete roles evaluados, incluidas SECURITY DEFINER |
| Membresías | anon, authenticated y authenticator no son miembros transitivos de svc_* según pg_has_role; no se observaron miembros de esos roles salvo postgres con ADMIN OPTION, INHERIT OPTION=false y SET OPTION=false |
| Esquemas auxiliares interno y administracion | Sin USAGE para anon, authenticated y los cinco svc_*; cero funciones SECURITY DEFINER con EXECUTE concedido a ellos en esos esquemas |
| Privilegios por defecto de postgres | CRUD de tablas y lectura/uso de secuencias para el svc_* del esquema correspondiente |

Las 20 tablas anteriores no contradicen el inventario documental de 22: esta comprobación de RLS se limita a los cinco dominios y no incluye tablas transversales de administracion.

RLS técnico protege la separación de dominios, pero no restringe filas dentro del dominio para su svc_*. Usar la conexión propietaria postgres eludiría la protección normal de RLS; no se propone como identidad de aplicación. No hay una credencial de servicio utilizable aprobada por el hecho de que existan roles NOLOGIN.

### Exposición: qué está y qué no está comprobado

Está comprobada la falta de privilegios efectivos de anon/authenticated sobre los esquemas internos indicados. Esto no demuestra cuál es la lista configurada en la Data API.

No se encontró pgrst.db_schemas en pg_db_role_setting y current_setting('pgrst.db_schemas', true) devolvió NULL en el contexto SQL consultado. El proceso PostgREST puede recibir configuración por otra vía. La exposición real de esquemas queda pendiente de revisar mediante la configuración autorizada de la plataforma, sin solicitar ni emplear claves administrativas.

No se afirma que la ausencia de ese ajuste signifique que los esquemas no están expuestos. Tampoco se certifica aquí la ausencia de vías indirectas a través de todos los objetos public/GraphQL/Storage de la instancia.

### Información que sigue siendo documental

La creación de un perfil provisional por trigger, los casos de uso completos, la automatización de citas y el inventario transversal proceden de los documentos locales. No se inspeccionaron cuerpos de funciones ni se ejecutaron automatizaciones en esta tarea. La existencia y coherencia de los perfiles reales, el estado de cuentas concretas y el funcionamiento del trigger no fueron comprobados.

### Contratos TypeScript propuestos

En packages/contracts/src/authorization.ts:

- ApplicationRole: unión exacta de los cuatro valores confirmados del CHECK; psicologo sin tilde en el contrato.
- UUID: identificador nominal, validado en ejecución al decidir.
- VerifiedIdentity: subject, verificationMethod (getUser/getClaims), verifiedAt y expiresAt, sin tokens.
- ActiveProfile: id, role, active=true y checkedAt, sin devolver la fila completa de perfiles.
- AuthorizationContext: identidad, perfil, requestId y policyVersion.
- ResourceEvidence: identificador del recurso y metadatos mínimos de propiedad/asignación resueltos por el dominio; usa UUID de perfil para las relaciones de actor, no IDs de fichas.
- AuthorizationRequest: contexto, permiso, target solicitado, evidencia resuelta, campos a modificar y hora confiable.
- AuthorizationDecision: denegación con razón interna o permiso condicionado a obligaciones de alcance, proyección, auditoría y campos escribibles.

Los tipos nominales de identidad y perfil dificultan construirlos accidentalmente sin un adaptador explícito. **No son una verificación criptográfica ni una validación de origen de JSON.** No hay constructores conectados ni una consulta de perfiles. El futuro adaptador de Usuarios deberá verificar Auth y cargar/validar el perfil desde una fuente autorizada. No podrá hacer cast de req.body, cookies o user_metadata a estos tipos.

Los tiempos son segundos Unix. Se propone una antigüedad máxima de 60 segundos para identidad, perfil y evidencia, además de comprobar caducidad de identidad y rechazar tiempos futuros. Ese umbral es un parámetro de diseño pendiente de aprobar, no una garantía de revocación inmediata. now proviene del servidor, nunca de datos del visitante.

### Función pura de referencia

decidePermission está en packages/contracts/src/authorization-policy.ts y solo se expone mediante el subpath explícito @sentido/contracts/authorization-design. El índice principal exporta únicamente tipos. No se importa desde apps/web. En Fase 3.1 Usuarios lo reutiliza en su caso de uso preparado, con repositorio e identidad de arranque deshabilitados y sin acceso a datos reales.

No realiza red, consultas, lectura de entorno, reloj global ni mutaciones. Deniega por defecto; no hay comodines ni privilegio universal del administrador. Valida contexto, perfil activo, rol conocido, identidad/perfil coincidentes, vigencia y relación entre target y evidencia antes de permitir.

Un ID de recurso manipulado se rechaza si no coincide con la evidencia. La propiedad solo se toma del campo correspondiente al tipo de recurso: añadir un profileId alternativo no cambia el propietario de un pago. La evidencia debe resolverla un servicio confiable: esta función no puede detectar una evidencia íntegramente falsificada por quien la invoca.

### Matriz exacta del evaluador de referencia

Esta matriz es un subconjunto conservador de la propuesta de negocio anterior. No habilita permisos reales. Los casos aún sin contrato suficientemente específico se deniegan.

| Permiso | Administrador | Recepcionista | Psicólogo | Paciente |
| --- | --- | --- | --- | --- |
| users.profile.read | Propio u otro, proyección mínima | Propio | Propio | Propio |
| users.profile.update-contact | Propio u otro, solo telefono | Propio, solo telefono | Propio, solo telefono | Propio, solo telefono |
| catalog.service.read | Catálogo operativo | Catálogo operativo | Solo publicado | Solo publicado |
| catalog.service.manage | Servicio existente | No | No | No |
| appointments.read | Operativo | Operativo | Solo asignadas | Solo propias |
| appointments.reschedule | Operativo | Operativo | No | Solo propias |
| payments.read | Resumen operativo | Resumen operativo | No | Resumen propio |
| payments.record | Operación de transacción existente | Operación de transacción existente | No | No |
| notifications.read | Estado operativo | Solo propias | Solo propias | Solo propias |
| notifications.retry | Operativo | No | No | No |
| users.roles.assign | Pendiente, denegado | Denegado | Denegado | Denegado |
| payments.refund.approve | Pendiente, denegado | Denegado | Denegado | Denegado |
| reports.read / clinical.read | Pendiente, denegado | Denegado | Denegado | Denegado |

El acceso de recepción a perfiles de pacientes y el de psicólogos a identidad mínima de pacientes asignados siguen siendo propuestas, no se cubren con un permiso genérico de leer cualquier perfil. Necesitan contratos específicos.

No se autorizan creación de recursos ni listados sin alcance mediante esta función de recurso individual. catalog.service.manage y payments.record no autorizan crear filas, borrar arbitrariamente ni cambiar cualquier campo: expresan permisos propuestos sobre un recurso ya resuelto; el futuro servicio debe definir validación de payload y operación exacta antes de usarlos.

Las proyecciones retornadas son obligaciones, no filtros ya implementados: profile-contact, catalog, appointment-operational, payment-summary y notification-status. Antes de conectar un endpoint deben traducirse en listas explícitas de campos, sin contenido clínico ni payloads de notificación indiscriminados. Solo update-contact incluye una lista escribible concreta: telefono. Campos rol, activo, id o perfil_id se rechazan en esa operación para todos los roles.

Un allow no sustituye límites de estado de citas, disponibilidad, validaciones financieras, idempotencia, restricciones legales ni aprobación adicional. Los códigos internos de denegación no deben exponerse sin filtrado al usuario.

### Pruebas ejecutadas y límites

70 pruebas del diseño: cuatro roles por operación, denegaciones para operaciones reservadas incluso al administrador, perfil inactivo/ausente, rol inválido, relaciones ajenas, IDs manipulados, confusión entre UUID Auth y ficha, evidencia faltante, entradas malformadas, snapshots obsoletos, campos sensibles, pureza y obligaciones.

También pasaron las 49 pruebas existentes de Auth, npm run typecheck, npm run lint y npm run build. Los fixtures son sintéticos: no certifican un adaptador real ni las credenciales de servicio.

Comandos:

```sh
npm run test --workspace=@sentido/contracts
npm run test:auth --workspace=@sentido/web
npm run typecheck
npm run lint
npm run build
```

### Antes de implementar Usuarios

1. Aprobar matriz, proyecciones y payloads exactos; resolver expresamente los permisos hoy denegados y las operaciones de creación/listado.
2. Diseñar la identidad técnica y conexión de Usuarios sin propietario, BYPASSRLS ni clave administrativa; revisar los permisos efectivos del mecanismo elegido.
3. Definir el adaptador confiable Auth → perfil activo → contexto: estado desconocido, ausencia de perfil o fallo de dependencia deben denegar, no asignar rol de respaldo.
4. Acordar reloj, expiración, revocación, versión de autorización y límites de caché. Una instantánea válida no detecta por sí sola un cambio de rol posterior.
5. Definir resolución de propiedad/asignación por APIs, sin SQL cruzado ni identificadores del visitante tomados como prueba.
6. Implementar auditoría y validar proyecciones/filtrado antes de entregar datos; evaluar autorización en cada operación y recurso, no solo en la interfaz.
7. Revisar la lista efectiva de esquemas expuestos en la plataforma. No darla por validada por el resultado NULL de SQL.
8. Diseñar pruebas de integración permitidas/denegadas con identidades autorizadas antes de activar el evaluador en endpoints o dashboard.

No se han creado ni modificado cuentas, roles, datos, SQL persistente, políticas, migraciones o credenciales.

## Fase 3.1 — preparación de Usuarios

El caso de uso de [Usuarios](../servicios/USERS_SERVICE.md) reutiliza users.profile.read, las obligaciones y las denegaciones existentes. No se duplica la matriz ni se aprueba la política para datos reales. La composición por defecto devuelve 503 con Bearer de forma válida porque no hay dependencias activadas. Los contratos de perfil propio se añaden a @sentido/contracts; no se conecta el dashboard.

Nota de publicación: los documentos académicos originales citados (DOCX, PDF y modelo TXT) son fuentes locales no publicadas. Sus referencias se conservan para trazabilidad; deben solicitarse al responsable del proyecto y no forman parte de este repositorio.
