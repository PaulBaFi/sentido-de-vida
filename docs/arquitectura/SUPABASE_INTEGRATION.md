# Preparación de Supabase Auth — Fase 2

> Documento técnico conservado con su historial. Las secciones de preparación no describen necesariamente el estado actual. Estado vigente y trazabilidad: [información maestra LRPD](../LRPD/INFORMACION_MAESTRA_LRPD.md). Las rutas de código sin enlace se interpretan desde la raíz del repositorio.


> Actualización: el módulo funcional AUT se describe en [AUT.md](../seguridad/AUT.md). Las secciones de preparación siguientes conservan las decisiones de la etapa previa; las rutas /login y /dashboard y la protección de acceso ya están implementadas.

Estado: utilidades preparadas; sin pantallas de sesión, endpoints de negocio ni acceso a datos. Se ha comprobado la conectividad de solo lectura con Auth. No se ha inspeccionado la base de datos remota ni validado sus permisos actuales.

## Alcance y funcionamiento

La web solo utiliza Supabase Auth. Las factorías de navegador y servidor devuelven una fachada con `auth`; no ofrecen métodos de tablas, esquemas, RPC, Storage ni Realtime. Esta restricción de código evita usos accidentales, pero no sustituye los permisos reales del proyecto remoto.

- `src/lib/supabase/browser.ts`: cliente de navegador, creado al invocar la factoría.
- `src/lib/supabase/server.ts`: cliente por petición, protegido con `server-only`; adapta `await cookies()`.
- `src/lib/supabase/env.ts`: validación diferida y mensajes sin valores sensibles.
- `src/lib/supabase/proxy.ts` y `src/proxy.ts`: renovación de sesión para Next.js 16.

El proxy comprueba claims y transmite cookies y cabeceras de caché del SDK. No determina permisos de negocio ni protege rutas. Si faltan ambas variables públicas, omite Auth y deja pasar la portada. Una configuración parcial o inválida provoca un error comprensible. Crear un cliente sin configuración siempre falla; no hay credenciales ficticias de respaldo.

Cuando se incorporen rutas protegidas, deberán exigir configuración y verificar identidad y autorización explícitamente. Un error o la ausencia de claims nunca concederá acceso. No basar autorización en `getSession()`, en una cookie sin verificar ni en `user_metadata`. Los futuros endpoints deberán decidir también si requieren comprobar el estado actual del usuario o revocación de sesión.

Los Server Components no pueden persistir cookies; el proxy realiza esa tarea antes del render. Las futuras respuestas de Auth o personalizadas deberán evitar cachés compartidas y preservar cookies y cabeceras al redirigir. No implementar mutaciones de Auth desde Server Components. Antes de añadir callbacks o Route Handlers, revisar su escritura de cookies y cabeceras `Cache-Control`, `Expires` y `Pragma`.

## Variables de entorno

La raíz `.env.example` es una plantilla documental. Next.js carga las variables de la aplicación desde `apps/web/.env.local`; no copiar toda la plantilla al frontend.

| Variable | Uso |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | URL HTTPS del proyecto; HTTP solo para Supabase local |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Clave pública con prefijo sb_publishable_ |
| SUPABASE_URL | Futuro backend: referencia al proyecto Auth |
| SUPABASE_PUBLISHABLE_KEY | Futuro backend: llamadas Auth no administrativas |
| DATABASE_URL | Propuesta, pendiente de aprobación: conexión propia y restringida de cada servicio |
| PORT | Puerto del servicio independiente |

No hay consumidores backend de estas variables todavía. No configurar un DATABASE_URL administrativo ni compartir la contraseña de postgres entre servicios. Las credenciales se entregarían por entorno y servicio mediante almacenamiento de secretos, con rotación independiente.

Una eventual operación administrativa de Auth podría requerir una credencial privilegiada, pero no se habilita ni se exige en esta fase. No se propone SUPABASE_SECRET_KEY ni service_role como acceso normal de los dominios. Una clave secreta distinta por servicio no proporciona por sí sola aislamiento por esquema.

Las dos variables NEXT_PUBLIC se incorporan al navegador al compilar; cambiar de proyecto requiere reconstruir la web. Son públicas por diseño. La validación solo comprueba presencia y formato; no verifica que URL y clave correspondan al mismo proyecto.

## Propuesta de aislamiento por dominio — pendiente de validar

| Servicio | Esquema interno de su responsabilidad |
| --- | --- |
| users | usuarios |
| catalog | catalogo |
| appointments | citas |
| payments | pagos |
| notifications | notificaciones |

La web consumirá las APIs de estos servicios. Las operaciones entre dominios deberán pasar por sus contratos y APIs, sin consultas SQL cruzadas.

Se propone evaluar una identidad PostgreSQL diferente por servicio y acceso por conexión backend. Cada identidad necesitaría únicamente las operaciones autorizadas sobre su esquema, sin superusuario, propiedad de tablas ni BYPASSRLS. Revisar también membresías heredadas, permisos de PUBLIC, secuencias, funciones, vistas y privilegios por defecto: limitar el search_path o elegir un esquema en el SDK no constituye aislamiento.

Antes de adoptar esta propuesta se debe inventariar el estado existente: esquemas expuestos por Data API, grants efectivos, propietarios, políticas RLS y roles a los que se aplican. Mantener usuarios, catalogo, citas, pagos y notificaciones fuera de la exposición directa al navegador. La clave pública de Auth no garantiza por sí sola esa separación. No se ha cambiado ninguna configuración remota.

RLS debe seguir evaluándose bajo las identidades acordadas. Las políticas existentes dirigidas a authenticated o basadas en auth.uid() pueden no funcionar con conexiones de servicio. PostgreSQL directo no recibe automáticamente el JWT ni los claims de Supabase Auth: no asumir equivalencia entre conexión backend y una petición PostgREST autenticada.

Queda por diseñar y validar cómo propagar identidad por petición, verificar firma, emisor, audiencia y caducidad de JWT, y autorizar operaciones. Si se requiere contexto transaccional para RLS, deberá ser verificado, limitado a una transacción y limpiado de forma segura al usar pools; no se implementa aquí. Las tareas sin usuario requieren permisos y políticas definidos expresamente.

La alternativa de Data API con publishable key y JWT aplica permisos del usuario, pero no distingue automáticamente qué microservicio llama ni permite acceder a esquemas no expuestos. No adoptarla como atajo ni exponer los esquemas internos para resolver errores de permisos.

## Decisiones necesarias antes de conectar servicios

1. Inventariar y validar permisos/RLS existentes con acceso autorizado; acordar la matriz de operaciones por dominio.
2. Aprobar PostgreSQL directo u otro mecanismo que mantenga los esquemas internos privados, identidades, roles y credenciales por servicio.
3. Definir cómo preservar autorización por usuario y aislamiento al reutilizar conexiones; probar accesos permitidos y denegados entre dominios.
4. Acordar autenticación entre servicios, tareas sin usuario, gestión de secretos, TLS, pool y rotación.
5. Validar configuración de Auth: proveedores, URLs permitidas y callbacks, sesiones y revocación, claves de firma y roles de aplicación.

Ninguna de estas decisiones crea ni modifica tablas, roles, grants, políticas, funciones o migraciones en esta entrega.

## Validación local

```sh
npm run test:auth-config --workspace=@sentido/web
npm run typecheck
npm run lint
npm run build
```

La portada y el build funcionan sin las variables Supabase. Las pruebas de configuración usan cadenas sintéticas y no realizan peticiones de red. El flujo real de inicio de sesión, renovación y revocación debe verificarse después con un entorno de Auth autorizado; esta fase no lo certifica.

## Referencias oficiales consultadas — 14 de noviembre de 2026

- [Clientes SSR, cookies y proxy](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Claves de API](https://supabase.com/docs/guides/getting-started/api-keys)
- [Roles PostgreSQL](https://supabase.com/docs/guides/database/postgres/roles)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Seguridad de Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Changelog](https://supabase.com/changelog)

## Comprobación real de conectividad Auth

Desde la raíz:

```sh
npm run check:auth-connectivity --workspace=@sentido/web
npm run test:auth --workspace=@sentido/web
```

El primer comando carga apps/web/.env.local sin imprimir valores y reutiliza la validación pública. Las variables ya presentes en el proceso tienen prioridad, como en Next.js. No ejecutar con credenciales de otro proyecto inyectadas en el entorno.

El diagnóstico realiza únicamente GET /auth/v1/settings y GET /auth/v1/user. El segundo pasa al SDK oficial un JWT deliberadamente inválido: su rechazo con bad_jwt es el resultado esperado, no un inicio de sesión. El cliente de diagnóstico no persiste sesiones, no detecta sesiones en la URL ni renueva tokens; no utiliza las cookies del cliente SSR.

La respuesta pública debe tener la estructura de Auth y aceptar la publishable key antes de probar el SDK. Los únicos resultados impresos son estado y código HTTP, sin cuerpos remotos, claves ni tokens. Hay límite de 15 segundos por petición y no se siguen redirecciones.

Estados: connected, network_error, invalid_credentials (HTTP 401), access_denied (HTTP 403 sin el rechazo esperado del JWT), service_error y unexpected_response. configuration_error indica un problema al validar las variables. Cualquier resultado diferente de connected termina con código de salida distinto de cero. Un getUser sin sesión puede fallar localmente sin contactar al servicio; por eso no se usa como prueba positiva por sí solo.

Una respuesta connected verifica acceso a Auth y aceptación de la clave pública, pero no certifica login, permisos sobre datos, políticas RLS, callbacks ni renovación de sesiones. Las pruebas test:auth son simuladas y no hacen peticiones de red; el diagnóstico es la comprobación real.

Referencia: [API oficial de Supabase Auth: settings y user](https://github.com/supabase/auth/blob/master/openapi.yaml).
