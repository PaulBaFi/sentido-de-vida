# Validaciones y trazabilidad

## Fase 3.4 — 16/11/2026, únicamente local

302 pruebas aprobadas y 0 fallidas: contratos/autorización 90, Usuarios 134, Auth 49 y web/perfil 29. Se incluyen las 271 regresiones anteriores más 31 casos nuevos. Además, 4 HTTP locales aprobadas y 0 fallidas (el conjunto anterior de tres más protección de mi-perfil). Typecheck/lint/build correctos. No hubo SQL remoto, cuentas, fichas, datos reales ni cambios de permisos. Los resultados 13 PG / 10 comprobaciones reales / 3 HTTP de fases anteriores siguen siendo históricos, no pruebas PAC.

Comandos adicionales: `npm run test --workspace=@sentido/contracts` incluye patients.test.mjs; `npm run test --workspace=@sentido/users` incluye pac-boundaries.test.mjs; `npm run test:users-profile --workspace=@sentido/web` incluye la vista de acceso. HTTP se ejecutó con Next temporal en loopback y se cerró después. [Alcance y bloqueos PAC](../servicios/PAC_FASE_3_4.md).

Este registro contiene resultados agregados, sin copiar artefactos privados ni identificadores. Distingue la evidencia histórica de fases de las verificaciones locales de reorganización.

## Resultados de las fases

| Conjunto | Resultado | Alcance / naturaleza de evidencia |
| --- | --- | --- |
| Fase 3.2E PostgreSQL real | 13 aprobadas, 0 fallidas | Identidad restringida, TLS/preflight, RLS propio/ajeno, denegaciones, auditoría revertida |
| Limpieza 3.2E | Confirmada; cero registros persistidos para el INSERT de prueba | ROLLBACK/liberación/cierre exigidos y lectura posterior acotada al request_id |
| Fase 3.3 locales | 271 aprobadas, 0 fallidas | 49 Auth + 28 perfil web + 124 Usuarios + 70 contratos |
| Fase 3.3 comprobaciones reales | 10 correctas, 0 fallidas | Cuenta sintética autorizada, endpoint 200, nombre SSR, ausencia de tokens en HTML, no-store y logout |
| Fase 3.3 HTTP | 3 correctas, 0 fallidas | Login accesible, rechazo anónimo y de cookie arbitraria |

Fuentes: [procedimiento sintético y resultado final](USERS_POSTGRES_SYNTHETIC_TESTS.md), [activación y preflight](../base-de-datos/USERS_POSTGRES_ACTIVATION.md), resultados de Fase 3.3 registrados en la continuidad del proyecto y código de pruebas. Los artefactos privados no se adjuntan a docs/. Las comprobaciones reales históricas no se repiten durante una organización documental.

El INSERT de la batería 3.2E se revirtió. Las consultas reales al endpoint durante 3.3 generan auditoría normal confirmada por diseño; no se borró esa auditoría. No confundir ambos comportamientos.

## Comandos locales repetidos en esta reorganización

Ejecutar desde la raíz; no requieren conectarse a tablas reales:

```sh
npm run test:auth --workspace=@sentido/web
npm run test:users-profile --workspace=@sentido/web
npm run test --workspace=@sentido/users
npm run test --workspace=@sentido/contracts
npm run typecheck
npm run lint
npm run build
```

Resultado de pruebas locales de la revisión del 15/11/2026: **271 aprobadas, 0 fallidas, 0 omitidas**. Typecheck/lint/build y controles documentales se registran al finalizar la revisión. El aviso ESM de Node al importar TypeScript directamente en web no equivale a una prueba fallida; no se modifica lógica para silenciarlo.

**Cierre de la reorganización:** `npm run typecheck`, `npm run lint` y `npm run build` finalizaron correctamente. Se revisaron 14 documentos Markdown y 125 enlaces locales, sin destinos rotos; los 41 apartados oficiales y ocho capítulos están presentes. Los hashes de 92 archivos de código, contratos, configuración y migración permanecieron iguales al inventario previo a la edición documental. Se comprobaron ausencia de claves/JWT y rutas personales en los Markdown, conservación de README/AGENTS en raíz y de la exclusión Git de docs/. No se ejecutaron pruebas reales ni se modificó Supabase.

## Archivos de prueba y alcance

| Archivo o conjunto | Qué verifica |
| --- | --- |
| [tests Auth web](../../apps/web/tests/auth-flows.test.mjs) y auth-errors/supabase-env/supabase-connectivity | Identidad, login/logout, errores y configuración con dobles controlados |
| [perfil web](../../apps/web/tests/users-profile.test.mjs) | Bearer solo servidor, sesión verificada, respuesta mínima/propia, fallos HTTP/red/JSON, caché y logout |
| [Usuarios](../../services/users/tests) | Casos de uso, transporte, identidad, configuración TLS, transacciones y fallos |
| [autorización](../../packages/contracts/tests/authorization.test.mjs) | Cuatro roles, propiedad, estado y denegaciones en evaluador aislado |
| [integración PostgreSQL](../../services/users/tests/postgres.integration.test.mjs) | 13 casos reales opt-in; no forman parte de las 271 locales |
| [limpieza del runner](../../services/users/tests/helpers/postgres-session.mjs) | ROLLBACK confirmado y errores explícitos de liberación/cierre |
| [HTTP AUT](../../apps/web/tests/auth-routes.test.mjs) | Exige Next local; no se ejecuta sin iniciar el servidor |

No se vuelven a ejecutar las 13 pruebas ni el login real sin autorización/configuración privadas. El opt-in es USERS_PG_INTEGRATION_TESTS=approved-isolated; omitir casos por falta de opt-in no prueba integración.

## Límites y evidencia faltante

- Los conteos son casos/comprobaciones, no cobertura porcentual ni número de usuarios.
- No hay medición de latencia P95, carga de 50 usuarios, disponibilidad mensual o recuperación demostrada.
- No hay evaluación de usabilidad con cinco participantes para el proceso de citas.
- PENDIENTE: capturas sanitizadas y artefactos portables de las comprobaciones reales; diagramas renderizados y evidencia completa de los otros dominios.
- La comprobación de esta reorganización es local: enlaces/rutas, estructura oficial, integridad del código/migración y pruebas. No certifica configuración remota actual ni seguridad exhaustiva de la instancia.
