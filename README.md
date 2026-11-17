# Sentido de Vida

## Estado vigente y documentación

Fase 3.4 parcial: validadores y contratos PAC preparados, con [perfil de acceso propio](docs/servicios/PAC_FASE_3_4.md) disponible; fichas y contactos siguen bloqueados hasta aprobar los permisos SQL propuestos. No hay formularios de escritura ni consultas DNI habilitados.

Fase 3.3 implementada y verificada localmente: login/logout Supabase Auth, dashboard protegido y nombre del perfil obtenido desde el servidor Next.js mediante la API Usuarios. PostgreSQL restringido/TLS/preflight validados; las otras cuatro APIs de dominio siguen pendientes. No hay funcionalidades administrativas, de citas, pacientes o pagos en el dashboard.

- [Índice documental](docs/README.md).
- [Información maestra LRPD](docs/LRPD/INFORMACION_MAESTRA_LRPD.md), conforme al PDF oficial de la raíz.
- [Fases y alcance](docs/fases/ESTADO_FASES.md).
- [Pruebas y evidencia](docs/evidencias/VALIDACIONES.md): 13/13 PostgreSQL; Fase 3.3 con 271 locales, 10 comprobaciones reales y 3 HTTP correctas.

Configuración de aplicación: Supabase pública solo para Auth; `USERS_API_URL` es una variable exclusiva del servidor, localmente `http://127.0.0.1:4001`. Secretos PostgreSQL permanecen fuera del repositorio. `npm run dev` inicia web; Usuarios requiere activación local controlada con configuración privada y preflight, descrita en [activación](docs/base-de-datos/USERS_POSTGRES_ACTIVATION.md). No copiar credenciales de backend al frontend.

README.md y AGENTS.md se conservan en la raíz. docs/ permanece ignorado por Git según la política original: el maestro se entrega localmente, sin commits ni push. Hay siete workspaces más el paquete raíz.

---

> Las notas que siguen se conservan como historial de preparación. Pueden describir limitaciones ya superadas; para el estado actual usar los enlaces anteriores. La migración de Usuarios ya aplicada no debe repetirse.


Sistema Web para Mejorar el Control de Citas Psicológicas en el Centro Psicológico Particular Sentido de Vida – Ica, 2026.

## Estado

Fase 2: portada estática y preparación de Supabase Auth con clientes separados de navegador y servidor. Sin pantallas de sesión, APIs de negocio ni acceso a tablas internas. La base de datos Supabase existente no se recrea ni modifica.

## Requisitos

- Node.js 24 (ver .node-version).
- npm 11; versión de referencia fijada en packageManager (11.6.2).
- No se necesitan credenciales ni conexión a Supabase para compilar esta etapa.

## Estructura

```text
apps/web/                 Next.js, App Router, Tailwind, shadcn/ui y Lucide
services/users/           Usuarios
services/catalog/         Catálogo
services/appointments/    Citas
services/payments/        Pagos
services/notifications/   Notificaciones
packages/contracts/       Futuros contratos públicos compartidos
database/migrations/      Reservado; sin migraciones SQL
docs/                     Documentación académica existente (ignorada por Git)
tsconfig.base.json        Opciones TypeScript compartidas
.env.example              Nombres de variables, sin secretos
```

Cada servicio es un paquete independiente con su propio package.json y tsconfig.json. No dispone todavía de servidor ni comandos de ejecución. No se ha elegido un framework backend.

Cada dominio será propietario lógico de sus datos. El frontend consumirá APIs backend, sin consultas directas a tablas internas de Supabase. La preparación de Auth se describe en [SUPABASE_INTEGRATION.md](docs/arquitectura/SUPABASE_INTEGRATION.md); el acceso PostgreSQL queda pendiente de validar credenciales y permisos.

## Desarrollo local

Desde la raíz, después de revisar y aprobar la configuración:

```sh
npm install
npm run dev
```

Abrir http://localhost:3000. La página inicial funciona sin variables de entorno.

La plantilla .env.example documenta las variables futuras. Cuando se implementen las integraciones, colocar las variables públicas necesarias en apps/web/.env.local y las privadas en el entorno de cada servicio. Next.js no carga automáticamente el .env de la raíz del monorepositorio. No copiar credenciales de backend al frontend ni usar claves privilegiadas con prefijo NEXT_PUBLIC_.

## Comandos

| Comando | Uso |
| --- | --- |
| npm run dev | Servidor de desarrollo web |
| npm run build | Compilar paquetes que declaren build (actualmente web) |
| npm run start | Ejecutar web después de compilar |
| npm run typecheck | Comprobar TypeScript en los siete paquetes |
| npm run lint | Ejecutar ESLint en todos los paquetes |
| npm run check | TypeScript y lint |
| npm run typecheck --workspace=@sentido/users | Comprobar un servicio individual |

La configuración de shadcn/ui está en apps/web/components.json y la utilidad cn en src/lib/utils.ts. src/components/ui queda reservado para futuros componentes. No se agregan pantallas ni componentes de negocio.

El repositorio utiliza npm workspaces y package-lock.json. Los paquetes Supabase se fijan a versiones exactas.

Para instalaciones reproducibles usar `npm ci`. Conservar package-lock.json junto con los manifiestos.

## Colaboración

Consultar AGENTS.md. Conservar docs/ y su política de exclusión. No ejecutar commits, push, despliegues ni migraciones sin aprobación explícita.

## Preparación de Supabase Auth

Consultar [SUPABASE_INTEGRATION.md](docs/arquitectura/SUPABASE_INTEGRATION.md) para el alcance, las variables y la propuesta de aislamiento de los cinco esquemas internos. La portada compila sin credenciales. Para habilitar las utilidades Auth, configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en apps/web/.env.local. El proxy renueva sesiones cuando hay configuración; todavía no protege rutas.

Comprobar la validación de variables sin red con `npm run test:auth-config --workspace=@sentido/web`. No hay conexión backend ni credenciales privilegiadas configuradas.

## Módulo AUT

Ya están disponibles /login y /dashboard protegido, con inicio y cierre de sesión mediante Supabase Auth. Consultar [AUT.md](docs/seguridad/AUT.md) para arquitectura, pruebas y límites pendientes. No hay registro público ni acceso a datos internos.

## Usuarios — Fase 3.1

El microservicio Usuarios incluye transporte HTTP y consulta del perfil propio preparada, con dependencias deshabilitadas y sin conexión a datos reales. Consultar [USERS_SERVICE.md](docs/servicios/USERS_SERVICE.md). No está conectado al dashboard.
