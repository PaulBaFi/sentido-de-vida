# PostgreSQL Usuarios — pruebas sintéticas en el proyecto actual

> Documento técnico conservado con su historial. Las secciones de preparación no describen necesariamente el estado actual. Estado vigente y trazabilidad: [información maestra LRPD](../LRPD/INFORMACION_MAESTRA_LRPD.md). Las rutas de código sin enlace se interpretan desde la raíz del repositorio.


**Resultado vigente: 13 pruebas reales aprobadas, 0 fallidas.** Ejecución autorizada secuencial, detenible ante el primer fallo, usando solo los dos perfiles sintéticos verificados, sdv_users_app y TLS verificado por el driver. Cada prueba confirmó ROLLBACK y cierre; una inspección posterior acotada al request_id del INSERT confirmó cero registros de auditoría persistidos. El manifiesto, los resultados y los UUID permanecen únicamente fuera del repositorio. USERS_PG_ENABLED=false; backend y dashboard no iniciados. Fase 3.2E de conexión e integración PostgreSQL completada. Las referencias a preparación/autorizaciones pendientes de abajo se conservan como historial previo a esta ejecución; no autorizan nuevas ejecuciones.

Estado: procedimiento preparado; **no se crearon cuentas ni registros y no se ejecutaron las 13 pruebas**. Proyecto único: `exzxhqwladlvsjyujgmj`. Migración ya aplicada; no repetirla. El dashboard permanece desconectado.

## Viabilidad y comprobaciones realizadas

Pueden proponerse las pruebas en este proyecto con **aislamiento lógico por dos UUID sintéticos**, previa autorización explícita para compartir infraestructura con datos reales. No equivalen a un proyecto o branch aislado. Las cuentas y sus perfiles se crearán persistentemente antes de las pruebas; su creación no queda cubierta por el ROLLBACK de estas.

Solo se ejecutaron SELECT de catálogos, sin leer pacientes ni cuentas reales. Restricciones comprobadas:

- `perfiles.id`: UUID, PK y FK a `auth.users(id)` con ON DELETE CASCADE. No se puede inventar un UUID e insertar un perfil sin una cuenta Auth correspondiente.
- `nombres`, `apellidos`, `rol`: TEXT NOT NULL, sin default. Nombres y apellidos deben ser no vacíos tras btrim. CHECK de rol: administrador, recepcionista, psicologo o paciente. `activo`: NOT NULL, default true. Teléfono nullable; fechas NOT NULL con default now().
- Trigger activo `auth.users.crear_perfil_usuario`: AFTER INSERT llama `usuarios.crear_perfil_auth`, que inserta exclusivamente el perfil con el UUID Auth, nombres/apellidos `Pendiente` y rol `paciente`, ON CONFLICT(id) DO NOTHING. No crea una ficha en `usuarios.pacientes`. No hay que insertar perfiles manualmente ni asignar roles por user_metadata.
- Trigger de perfiles: BEFORE UPDATE OF rol impide cambios no autorizados; no se necesita cambiar roles en esta preparación. La FK `usuarios.pacientes.perfil_id → perfiles.id` no tiene ON DELETE CASCADE: una relación inesperada puede impedir la limpieza y exige detenerse, no borrar relaciones en cascada.
- Auditoría: RLS y CHECK de actor=recurso, operación fija, resultado allowed y versión de política de longitud 1–80. PK request_id UUID; fecha default now(). No hay secuencias, triggers de usuario ni reglas de reescritura observados en auditoría. No se observaron reglas de reescritura en perfiles ni triggers de sentencia de UPDATE de perfiles. Las tablas nombradas por los casos negativos existen.
- RLS vigente: perfil propio con una política permisiva y otra restrictiva; INSERT de auditoría limitado al actor del contexto. sdv_users_app no es superusuario ni BYPASSRLS. El preflight y la conexión real con ese LOGIN siguen sin ejecutarse; revalidar metadatos inmediatamente antes de probar si cambian los objetos.

## Procedimiento mínimo, después de autorizarlo

1. **Identidades:** desde Authentication → Users → Add user/Create user, un operador autorizado crea solo dos cuentas de prueba con contraseñas distintas en su gestor privado. No usar Invite ni enviar mensajes a terceros. Elegir direcciones inequívocamente sintéticas de un dominio reservado, por ejemplo `sdv-pg-a-<lote>@example.invalid` y `sdv-pg-b-<lote>@example.invalid`, si el formulario las admite; si las rechaza, detenerse y acordar un dominio de pruebas controlado. Si hace falta confirmar correo para una prueba Auth posterior, aprobar expresamente la confirmación de esas dos cuentas. No abrir registro público ni cambiar ajustes globales.
2. **Perfiles:** el trigger debe crear ambos perfiles automáticamente. Registrar los dos UUID devueltos en un manifiesto privado; un operador comprueba exclusivamente esos UUID, rol paciente y activo=true. Dejar `Pendiente` es suficiente para las 13 pruebas. Si falta un perfil, hay conflicto o aparecen efectos no esperados, detenerse: no usar UPSERT ni reconstruir datos manualmente. No crear pacientes, profesionales, citas, pagos o notificaciones; no asociar los UUID sintéticos a recursos reales.
3. **Connect:** abrir Connect en ese mismo proyecto y copiar host DNS, puerto, base y modo exactos. Evaluar direct para el proceso local persistente y session si se necesita el pooler por conectividad; comprobar soporte del LOGIN personalizado. Usuario direct: `sdv_users_app`; pooler compatible: `sdv_users_app.exzxhqwladlvsjyujgmj`. No copiar el usuario administrativo de la cadena de ejemplo ni deducir un hostname de pooler.
4. **TLS:** descargar la CA desde Database Settings → SSL Configuration → Download Certificate para el endpoint elegido. Guardar fuera del repositorio; comprobar vigencia y que el driver valida cadena y hostname. No bastan `sslmode=require` ni una descarga para demostrar TLS. No modificar enforcement remoto ni desactivar `rejectUnauthorized`.
5. **Secreto técnico:** si aún no existe, generar la contraseña de sdv_users_app en un gestor privado y aprovisionarla por un operador mediante `\password sdv_users_app` en psql con TLS verify-full. No escribir contraseña literal en SQL Editor, argumentos, código, chat o historial. psql no se encontró en PATH en esta revisión; se necesita una herramienta operadora autorizada que ofrezca ese flujo seguro. No usar credenciales operadoras para el backend. Este paso requiere autorización si falta el secreto o se necesita rotarlo.
6. **Configuración:** ya se creó la plantilla privada descrita abajo. Completarla localmente sin mostrar su contenido. Mantener inicialmente USERS_PG_ENABLED=false y USERS_PG_INTEGRATION_TESTS vacío. Los dos UUID sintéticos se colocan en USERS_PG_TEST_SUBJECT y USERS_PG_TEST_OTHER_SUBJECT. Estas pruebas SQL no requieren JWT ni iniciar sesión: establecen el contexto de forma controlada para comprobar RLS y no prueban el adaptador Auth del endpoint.
7. **Ejecución futura separadamente autorizada:** validar archivos privados, ACL, CA y conectividad; habilitar USERS_PG_ENABLED=true únicamente para el proceso de prueba y establecer USERS_PG_INTEGRATION_TESTS=approved-isolated. El nombre de este opt-in no prueba aislamiento físico: registrar la aprobación de aislamiento lógico en el proyecto compartido. Ejecutar la batería sin arrancar el servidor HTTP y con concurrencia 1. No ejecutar ahora ni omitir el preflight. Tras finalizar, restaurar flag deshabilitado y eliminar el opt-in del proceso. El runner corregido rechaza explícitamente la prueba ante fallos de rollback, liberación o cierre; un resultado de limpieza incierto nunca certifica éxito.
8. **Limpieza futura:** solo con autorización separada y comprobación por los dos UUID exactos, eliminar esas dos cuentas Auth por el mecanismo oficial; la FK elimina sus perfiles. Si hay relaciones inesperadas, detener la eliminación. No usar patrones de correo, borrados masivos, TRUNCATE ni borrar registros ajenos. No suponer que ROLLBACK elimina las cuentas o los logs de plataforma. Si se llegara a probar el GET, su auditoría sí se confirma con COMMIT y requiere tratamiento conforme a la política aprobada; ese GET no forma parte de esta autorización ni de las 13 pruebas.

## Qué pueden escribir las 13 pruebas

| Casos | Operación | Contención y resultado requerido |
| --- | --- | --- |
| 1 | Identidad técnica, TLS y preflight | SELECT de metadatos; sin datos de negocio |
| 2 | Leer perfil A/B y cambiar contexto | WHERE id ligado a los UUID sintéticos; RLS debe ocultar el otro; ROLLBACK + BEGIN prueba que no queda contexto |
| 3–8 | SELECT de cuatro dominios, pacientes y columnas prohibidas | WHERE false, sin materializar filas; exigir SQLSTATE 42501 |
| 9 | UPDATE perfiles SET rol con WHERE false | Intenta DML, pero afecta cero filas incluso ante una concesión indebida; exigir 42501 y ROLLBACK |
| 10 | SET LOCAL ROLE svc_usuarios | Debe fallar con 42501; si funciona, falla la prueba y se revierte el estado local sin más consultas de negocio |
| 11 | SELECT de auditoría | WHERE false; exigir 42501 |
| 12 | DELETE de auditoría | WHERE false; cero filas aun ante permisos incorrectos; exigir 42501 y ROLLBACK |
| 13 | INSERT de auditoría de A | Única inserción esperada: request_id aleatorio, actor=recurso=A, sin RETURNING; ROLLBACK siempre |

Cada caso usa un cliente y BEGIN; `finally` intenta ROLLBACK, liberación y cierre del pool de forma independiente; no hay COMMIT en el archivo. Se exige el command tag ROLLBACK, también en el rollback intermedio del caso 2. Si falla, se solicita destruir la conexión y la prueba falla explícitamente. Aunque falle la liberación se intenta cerrar el pool. Los errores del cuerpo y de cada etapa de limpieza se acumulan en un AggregateError sanitizado, sin causes ni errores crudos del driver; no se devuelve éxito antes de terminar la limpieza. Si no se confirma el cierre, no se puede afirmar que el servidor haya revertido y la ejecución queda fallida, pendiente de revisión. No confundir ausencia de COMMIT con ausencia de WAL, logs, bloqueos breves o consumo compartido. Ahora mismo no hay triggers externos observados en las escrituras de prueba, pero ROLLBACK no revertiría una llamada externa o un avance de secuencia si se añadiesen después. Revalidar esa condición, no desactivar triggers.

## Plantilla privada preparada

Ubicación: `%LOCALAPPDATA%\SentidoDeVida\users-integration\backend.env`.

Se creó fuera de Git, sin sobrescribir archivos previos, con ACL de carpeta limitada al usuario Windows actual, heredada por el archivo. Contiene únicamente los nombres de variables del ejemplo, la conexión deshabilitada, el LOGIN restringido y rutas a los futuros archivos `password.txt` y `supabase-ca.pem` de esa misma carpeta. No contiene contraseñas, CA, UUID, host ni valores inventados de Connect. Los archivos de contraseña y CA **no fueron creados**. Si se elige pooler, ajustar el usuario al formato anterior. No imprimir el archivo al completar secretos; compartir solo su ruta.

## Autorizaciones y bloqueos concretos

- **Requiere autorización:** usar este proyecto compartido con aislamiento lógico y crear exactamente dos cuentas sintéticas con sus dos perfiles automáticos persistentes; aprobar el mecanismo de confirmación de correo si se necesita. No autorizado aún.
- **Requiere autorización si falta/rota:** aprovisionar contraseña restringida; la configuración sin secretos ya preparada no hace ese cambio remoto.
- **Requiere autorización posterior:** activar temporalmente el proceso de pruebas y ejecutar las 13 pruebas, incluida la inserción de auditoría revertida. No autorizado en este turno.
- **Requiere autorización separada:** limpieza de las dos cuentas/perfiles; login de prueba y GET, que crearían sesión/auditoría persistente. No necesarios para estas 13 pruebas.
- **Faltan materialmente:** valores de Connect elegidos, CA, contraseña privada disponible, dos UUID sintéticos y aceptación explícita del aislamiento lógico. TLS, preflight real e integración siguen pendientes. No hace falta repetir migración ni conceder permisos adicionales.
- **Bloqueo local de limpieza corregido:** el runner compartido de pruebas confirma ROLLBACK, espera liberación y cierre, y propaga cualquier fallo de esas etapas explícitamente. Las pruebas locales simulan éxito, errores individuales y simultáneos, respuesta ROLLBACK inesperada, fallo del cuerpo, inspección, adquisición e inicio; también verifican que no se devuelva éxito con el cierre pendiente. Una comprobación estática protege la ausencia de COMMIT y WHERE false en los dos DML negativos. No se ha ejecutado ninguna de las 13 pruebas reales ni se han creado cuentas. Los prerrequisitos remotos y las autorizaciones anteriores siguen pendientes.

Validación local de esta corrección: `npm run test --workspace=@sentido/users` pasó 110 casos (15 nuevos del runner); autorización pasó 70 y Auth 49. `npm run typecheck`, `npm run lint` y `npm run build` finalizaron correctamente. `node --check` validó la sintaxis del archivo de integración y del helper sin ejecutar las pruebas reales. No se invocó `test:postgres-integration`, no se cargaron secretos y no se modificó Supabase.

Referencias oficiales: [usuarios Auth y triggers de perfiles](https://supabase.com/docs/guides/auth/managing-user-data), [Connect y CA](https://supabase.com/docs/guides/database/connecting-to-postgres), [ROLLBACK PostgreSQL 17](https://www.postgresql.org/docs/17/sql-rollback.html), [contraseña mediante psql](https://www.postgresql.org/docs/17/app-psql.html).
