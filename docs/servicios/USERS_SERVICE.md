# Microservicio Usuarios — Fase 3.1

> Documento técnico conservado con su historial. Las secciones de preparación no describen necesariamente el estado actual. Estado vigente y trazabilidad: [información maestra LRPD](../LRPD/INFORMACION_MAESTRA_LRPD.md). Las rutas de código sin enlace se interpretan desde la raíz del repositorio.


## Estado

API preparada, sin acceso a datos reales. El arranque local está cerrado por defecto: no configura ni instancia conexiones PostgreSQL o Supabase Auth. No lee apps/web/.env.local, no utiliza credenciales técnicas y no proporciona datos simulados fuera de las pruebas.

La factoría del adaptador Supabase existe para una integración futura explícita, pero no se conecta desde composition.ts. No hay variable de entorno que habilite silenciosamente esa conexión. El repositorio y la auditoría de producción permanecen no disponibles.

## Endpoint preparado

`GET /v1/users/me/profile`

Requiere Authorization: Bearer <JWT>. No acepta parámetros de consulta, cuerpo, identificadores de usuario/perfil ni cabeceras x-user-id, x-profile-id, x-role o x-roles. Una cookie por sí sola no autentica. No existe una ruta de consulta por ID.

Contrato de éxito (solo se obtiene con dependencias controladas en pruebas en esta fase):

```json
{
  "data": {
    "profile": {
      "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "displayName": "Persona Sintética"
    }
  }
}
```

La proyección excluye teléfono, DNI, correo, rol, activo, tokens y metadatos. displayName se construye a partir de nombres/apellidos y solo se entrega al titular autenticado. El contrato propone hasta 100 caracteres por componente y 201 en el nombre completo; son límites de API, no cambios ni límites nuevos en PostgreSQL. Deben contrastarse antes de conectar un repositorio real.

Tipos compartidos: OwnProfileRequest, OwnProfileResponse y UsersErrorResponse en packages/contracts/src/users.ts. La validación de transporte y de respuesta es explícita y no instala un framework HTTP ni un validador adicional.

| HTTP | Condición |
| --- | --- |
| 200 | Identidad verificada, perfil presente y activo, permiso propio concedido, auditoría confirmada y proyección válida; solo probado con dependencias de test |
| 400 | Query/body o cabeceras que intentan enviar identidad/roles |
| 401 | Bearer ausente/malformado, JWT inválido o identidad caducada |
| 403 | Perfil ausente/inactivo, rol desconocido, vínculo distinto o decisión de autorización denegada |
| 404 | Ruta no preparada, incluidas rutas por identificador |
| 405 | Método distinto de GET |
| 503 | Identidad/repositorio/auditoría no disponibles, respuesta malformada o fallo inesperado de dependencia |

Los errores contienen únicamente code y un mensaje público fijo. El mismo 403 cubre los motivos de falta de autorización. No se devuelven excepciones, detalles de SQL, tokens ni cadenas de conexión. Se generan request IDs en servidor y se usa Cache-Control private, no-store; 401 incluye WWW-Authenticate y 503 Retry-After.

En el arranque actual: un visitante anónimo recibe 401; un Bearer de forma válida recibe 503 porque las dependencias no se han habilitado. No se afirma que ese 503 haya validado el JWT.

## Estructura

```text
services/users/
  src/
    main.ts                         Arranque local, solo PORT
    composition.ts                  Dependencias cerradas por defecto
    index.ts                        Exportaciones para composición explícita
    transport/server.ts             Adaptador HTTP nativo de Node
    http/handler.ts                 Routing, estados y cabeceras seguras
    http/validation.ts              Validación de petición/proyección
    application/ports.ts            IdentityVerifier, ProfileRepository, AuthorizationAudit
    application/get-own-profile.ts  Caso de uso, autorización compartida y proyección
    domain/profile.ts               Modelo mínimo y validación del resultado del repositorio
    domain/errors.ts                Errores tipados sin detalles sensibles
    security/supabase-identity.ts   Adaptador oficial preparado; no activado
    security/identity-validation.ts Comprobación de claims ya verificados
    repositories/unavailable-profile-repository.ts
  tests/
    fixtures.mjs                    Repositorio y auditoría simulados, solo para pruebas
    users.test.mjs
    identity.test.mjs
  scripts/build.mjs                 Emisión ESM mediante TypeScript
```

El repositorio devuelve unknown para que el caso de uso valide el contrato incluso ante un adaptador defectuoso. No se exporta un repositorio en memoria desde src ni se compilan las pruebas a dist.

## Identidad y autorización

El adaptador usa @supabase/supabase-js con getClaims(jwt), sin persistencia ni renovación de sesiones y sin detección de sesión en URL. El SDK verifica la firma; después se comprueban emisor del proyecto configurado, audiencia authenticated, subject UUID, caducidad, iat y nbf si existe. No se decodifica un JWT sin verificar para autorizar.

Para claves asimétricas el SDK consulta JWKS del proyecto fijo; con otras configuraciones puede recurrir a GET /auth/v1/user. El fetch del adaptador solo admite esos GET en el origen configurado, bloquea redirecciones y limita cada solicitud a diez segundos. No se permite ninguna consulta de tablas ni mutación de Auth. Las pruebas sustituyen toda esa red por respuestas sintéticas.

El rol estándar del JWT authenticated identifica la clase de token, no el rol de aplicación. user_metadata, roles del navegador y IDs arbitrarios nunca construyen el contexto de negocio.

El caso de uso busca por subject verificado, valida el resultado y construye una petición a decidePermission de @sentido/contracts/authorization-design. Reutiliza users.profile.read y la política existente; no contiene una segunda matriz. El evaluador comprueba rol conocido, activo, identidad/perfil coincidentes, target y vigencia. Incluso administrador queda limitado al perfil propio por la petición de este endpoint.

El allow debe tener scope=self y projection=profile-contact. Se registra la auditoría mínima requerida antes de responder; si esta dependencia falla no se entrega el perfil. Los eventos no contienen nombres, contraseñas ni tokens. La persistencia y la retención de auditoría quedan pendientes; la composición actual no simula un registro duradero.

Los casts nominales se limitan a las fronteras de datos ya verificados y al candidato que valida la política. Los tipos no prueban por sí solos el origen: no se aceptan contextos serializados del visitante ni se hace cast de req.body como identidad.

## Ejecución y build

Desde la raíz:

```sh
npm run test --workspace=@sentido/users
npm run typecheck
npm run lint
npm run build
npm run start --workspace=@sentido/users
```

Por defecto escucha solo en 127.0.0.1:4001. PORT permite elegir un puerto válido. No se habilita CORS ni se confía en cabeceras de proxy; una integración futura deberá acordar acceso entre la web y el servicio. El servidor impone límites de cabeceras y tiempos HTTP.

Node.js 24 ejecuta el código TypeScript del workspace en desarrollo. El build primero comprueba tipos y después emite módulos ESM de src a dist con la API de TypeScript, reescribiendo extensiones relativas .ts a .js. El artefacto requiere el workspace @sentido/contracts, npm install y Node 24; no se presenta como un binario o bundle autónomo. No se incluyen pruebas, variables privadas ni credenciales en dist.

## Pruebas

Se comprueban los cuatro roles sobre perfil propio, ausencia de autenticación, JWT rechazado, perfil inexistente/inactivo, ID distinto incluso para administrador, rol inválido, query/cabeceras manipuladas, métodos/rutas, fallos de identidad/repositorio/auditoría, contrato de salida estricto y arranque deshabilitado.

La verificación del SDK se prueba con firma ES256 real, claves y JWKS creados en memoria exclusivamente para tests. Se alteran firma, emisor, audiencia, fechas y subject para comprobar rechazo. También se prueban fallos de JWKS y rechazo de configuraciones privilegiadas. No se crean cuentas ni sesiones reales. La prueba HTTP levanta un servidor loopback con datos sintéticos y lo cierra al terminar.

## Pendientes antes de PostgreSQL

1. Aprobar una identidad de conexión restringida para Usuarios: svc_usuarios es NOLOGIN, no una credencial. No usar postgres, propietario de tablas, BYPASSRLS, service_role ni una secret key como solución temporal.
2. Definir cómo el login técnico adquiere exclusivamente los privilegios de svc_usuarios, revisar membresías/herencia y probar denegaciones cruzadas. No se crean esas cuentas o grants aquí.
3. Implementar un repositorio real con consultas parametrizadas y lectura fresca, sin caché hasta aprobar caducidad/revocación. Resolver coherencia de perfiles y estado de aplicación; no promover ni crear perfiles automáticamente.
4. Aprobar la política todavía marcada phase-2.3-draft y la proyección mínima, así como sus límites de longitud, antes de activar datos reales.
5. Definir auditoría duradera, controles de acceso, retención y comportamiento ante fallos. No convertir la auditoría de test en un fallback.
6. Acordar revocación y comprobaciones de estado actuales: verificar una firma JWT válida no garantiza revocación inmediata ni refleja cambios posteriores del perfil.
7. Revisar exposición Data API pendiente, TLS, autenticación entre servicios, límites antiabuso y política CORS/orígenes.
8. Integrar la web solamente después de pruebas autorizadas de lectura permitida/denegada. El dashboard actual no consume esta API.

## Fuentes oficiales

- [Supabase getUser y verificación en servidor](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Verificación de claims](https://supabase.com/docs/reference/javascript/auth-getclaims)
- [JWT y claves de firma](https://supabase.com/docs/guides/auth/jwts)
- [Changelog consultado](https://supabase.com/changelog)

## Fase 3.2A: diseño PostgreSQL

Ver [USERS_POSTGRES_DESIGN.md](../base-de-datos/USERS_POSTGRES_DESIGN.md). Incluye comparación de identidades, TLS/pooler, auditoría y SQL en borrador no ejecutado. Se añade un plan puro de consultas parametrizadas con pruebas; no implementa el repositorio ni se importa en la composición. La API permanece cerrada, sin driver, secretos o conexiones reales.

> Fase 3.2B: repositorio PostgreSQL implementado y deshabilitado por defecto. Migración preparada, no ejecutada. Procedimiento vigente: [activación segura](../base-de-datos/USERS_POSTGRES_ACTIVATION.md).
