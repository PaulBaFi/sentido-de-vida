# Módulo AUT — Autenticación inicial

> Documento técnico conservado con su historial. Las secciones de preparación no describen necesariamente el estado actual. Estado vigente y trazabilidad: [información maestra LRPD](../LRPD/INFORMACION_MAESTRA_LRPD.md). Las rutas de código sin enlace se interpretan desde la raíz del repositorio.


## Rutas y comportamiento

- /login: correo y contraseña con cuenta existente; no hay registro público.
- /dashboard: espacio neutral, dinámico y sin información sensible. No concede permisos administrativos.
- Inicio correcto: Server Action con signInWithPassword y redirección fija a /dashboard.
- Salida: Server Action con signOut de alcance local y redirección a /login?reason=signedout. Un error de salida se muestra sin afirmar que se cerró la sesión.
- Visitante sin sesión: redirección a /login. Una sesión inválida dirige a /login?reason=expired; un fallo de conexión tiene mensaje diferenciado.

No se crea un endpoint de registro, no se crean usuarios automáticamente y no se consulta ninguna tabla interna. Los servicios de dominio no se modifican.

## Límite de seguridad

El proxy renueva y verifica claims, preserva cookies al redirigir y establece cabeceras privadas sin almacenamiento en login y dashboard. El dashboard verifica además getUser en el servidor antes de renderizar. La presencia de cookies y getSession no autorizan acceso.

Las Server Actions mantienen las comprobaciones de origen y CSRF de Next.js; no se amplía allowedOrigins. Las mutaciones solo se exponen mediante formularios POST. Las cookies se escriben en el contexto de las acciones; un error de escritura no se ignora en ese contexto. Las respuestas de acción y las páginas personalizadas no deben almacenarse en cachés compartidas.

Los errores de credenciales mantienen un mensaje común; el caso explícito de confirmación se trata como se describe en la actualización de UX al final. Nunca se devuelven errores crudos del proveedor, contraseñas, tokens ni metadatos de usuario. Tampoco se confía en user_metadata ni se asignan roles de aplicación.

Sin variables válidas, las rutas protegidas fallan de forma cerrada y el formulario informa que el acceso no está disponible. La portada sigue siendo pública. Los destinos de redirección son locales y fijos, sin parámetro next proporcionado por el visitante.

## Interfaz

Interfaz responsive con Tailwind y los tokens existentes. Los componentes Button e Input usan la utilidad cn ya disponible. El formulario tiene etiquetas, autocompletado, estados pendientes, aviso accesible de errores y control para mostrar u ocultar la contraseña. El dashboard contiene únicamente un mensaje de bienvenida y cierre de sesión.

## Comprobaciones

```sh
npm run test:auth --workspace=@sentido/web
npm run typecheck
npm run lint
npm run build
```

Las pruebas de flujo usan dobles del SDK: login correcto e incorrecto, validación, red, límites de intentos, identidad verificada, sesión ausente o inválida, fallo de logout, rutas descendientes y conservación de cookies/cabeceras al redirigir.

Para comprobar por HTTP un servidor local de producción, usar dos terminales:

```sh
npm run start --workspace=@sentido/web -- --port 3100
```

En PowerShell:

```powershell
$env:AUTH_TEST_BASE_URL = "http://localhost:3100"
npm run test:auth-routes --workspace=@sentido/web
```

Estas pruebas no crean cuentas ni inician sesiones. Comprueban login accesible, protección del dashboard anónimo y rechazo de cookies arbitrarias. No simulan una sesión real de Supabase.

## Pendientes

- El usuario confirmó la prueba manual de entrada, dashboard y salida con una cuenta real. Sigue pendiente acordar y validar los escenarios de renovación y revocación; el agente no ha utilizado credenciales personales ni creado cuentas.
- Acordar ciclo de vida de sesiones, revocación, recuperación de acceso y posible MFA. Un cierre local no invalida inmediatamente todos los JWT ya emitidos antes de su caducidad.
- Revisar límites de intentos y protecciones antiabuso en el entorno de Auth antes de publicar. Esta entrega muestra el error 429, sin implementar un limitador distribuido propio.
- Definir autorización de negocio y permisos por dominio antes de añadir datos. Autenticación no equivale a privilegios administrativos.
- Verificar en el entorno de despliegue HTTPS, cookies y que proxies/CDN no almacenen respuestas de Auth o dashboard.

No se alteran esquemas, RLS, funciones ni migraciones. Se utilizan únicamente URL y publishable key.

## Referencias oficiales consultadas — 14 de noviembre de 2026

- [Next.js y clientes SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Inicio de sesión con contraseña](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [Verificación de usuario](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Cierre de sesión](https://supabase.com/docs/reference/javascript/auth-signout)

## Mejora de UX y clasificación de errores

El usuario confirmó que inicio, dashboard y cierre fueron probados satisfactoriamente con una cuenta real. Esa validación manual es un antecedente aportado por el usuario; no se han vuelto a solicitar ni usar sus credenciales.

La validación compartida se ejecuta en navegador y servidor. Los campos vacíos o inválidos se señalan junto al campo, con aria-invalid, aria-describedby e iconos discretos; un resumen general conserva role=alert. Se enfoca el primer campo con error o el mensaje general. Los inputs son controlados para conservar correo y contraseña en memoria al recibir errores; el servidor nunca devuelve estos valores, no se almacenan en localStorage/sessionStorage y no se incluyen en logs. Al navegar fuera o recargar, se pierde el estado del componente.

La validación usa noValidate para mostrar los mensajes propios en lugar de los avisos variables de cada navegador; required y los tipos/autocompletado permanecen como semántica accesible. El estado pendiente deshabilita el formulario y un bloqueo por referencia impide duplicados antes de que React muestre ese estado.

| Escenario | Mensaje |
| --- | --- |
| Correo vacío | Ingresa tu correo electrónico. |
| Formato inválido | Ingresa un correo electrónico válido. |
| Contraseña vacía | Ingresa tu contraseña. |
| Credenciales incorrectas o correo no registrado | El correo o la contraseña son incorrectos. Verifica tus datos e inténtalo nuevamente. |
| Confirmación explícita | Debes confirmar tu correo electrónico antes de iniciar sesión. |
| Límite de intentos | Has realizado demasiados intentos. Espera unos minutos antes de volver a intentarlo. |
| Red | No pudimos conectarnos al servidor. Comprueba tu conexión e inténtalo nuevamente. |
| Servicio no disponible | El servicio de autenticación no está disponible en este momento. Inténtalo más tarde. |
| Sesión expirada | Tu sesión ha expirado. Inicia sesión nuevamente. |
| Error inesperado | Ocurrió un problema inesperado. Inténtalo nuevamente. |

No se distingue correo inexistente de contraseña incorrecta. La confirmación se muestra únicamente para email_not_confirmed con HTTP 400 o 422 en el flujo de contraseña. El código oficial actual verifica la contraseña antes de emitir ese error; no se consulta la existencia de la cuenta ni se deduce de mensajes ambiguos. Si el proveedor cambia ese contrato habrá que revalidar esta distinción.

La clasificación usa code, status y clases/nombres del SDK. HTTP 5xx se separa de fallos de red incluso cuando el SDK lo representa como AuthRetryableFetchError. Los textos de respuesta no se inspeccionan ni se muestran. Códigos nuevos o ambiguos reciben un mensaje seguro de reserva.

Pruebas ampliadas en auth-errors.test.mjs para todos los escenarios, confirmación ambigua, prioridad de 5xx, excepciones y ausencia de información sensible. El comando test:auth incluye estas pruebas y conserva las anteriores.

La [propuesta de autorización](AUTHORIZATION_PROPOSAL.md) documenta la relación Auth/perfiles, los cuatro roles y su matriz inicial. Se basa en documentos locales leídos sin modificarlos; no certifica el estado remoto ni implementa permisos. La autenticación sigue sin equivaler a autorización de negocio.

Referencias: [códigos de error oficiales](https://supabase.com/docs/guides/auth/debugging/error-codes) y [flujo oficial de contraseña](https://github.com/supabase/auth/blob/master/internal/api/token.go).

### Comprobación de interfaz en navegador

Con el servidor local iniciado, ejecutar:

```sh
npm run test:auth-ux --workspace=@sentido/web
```

Usa Chromium/Chrome/Edge headless con un perfil aislado bajo .next; puede indicarse AUTH_BROWSER_PATH y AUTH_TEST_BASE_URL. No instala paquetes adicionales, no utiliza el perfil personal del navegador y no envía credenciales válidas.

Se comprobaron cinco aspectos: campos vacíos y mensajes accesibles; formato inválido conservando los valores; contraseña requerida con aria-invalid/aria-describedby; teclado y control de visibilidad; ancho móvil sin desbordamiento. Estas comprobaciones de conservación corresponden a validación local; los errores del proveedor se prueban con dobles del SDK. No se ha repetido el login real del usuario.

Resultado de esta actualización: 49 pruebas de Auth, 3 pruebas HTTP y 5 comprobaciones de navegador correctas; TypeScript, ESLint y build correctos. Los avisos de detección ESM de Node al ejecutar directamente archivos TypeScript no son fallos de pruebas; lint no presenta advertencias.
