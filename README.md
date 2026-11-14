# Sentido de Vida

Sistema Web para Mejorar el Control de Citas Psicológicas en el Centro Psicológico Particular Sentido de Vida – Ica, 2026.

## Estado

Monorepositorio inicial: página estática y paquetes de servicio sin APIs, autenticación ni acceso a datos. La base de datos Supabase existente no se recrea ni modifica.

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

Cada dominio será propietario lógico de sus datos. El frontend consumirá APIs backend, sin consultas directas a tablas internas de Supabase. PostgreSQL y Auth se integrarán en una etapa posterior.

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

La migración no ejecuta npm install ni genera todavía package-lock.json. El comando npm ci requiere ese archivo. Se conservan las dependencias y sus rangos declarados; la primera instalación resolverá las versiones compatibles y creará el nuevo lockfile.

Para instalaciones reproducibles usar `npm ci`. Versionar package-lock.json junto con los manifiestos cuando se genere con la primera instalación aprobada.

## Colaboración

Consultar AGENTS.md. Conservar docs/ y su política de exclusión. No ejecutar commits, push, despliegues ni migraciones sin aprobación explícita.
