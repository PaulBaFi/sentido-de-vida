# Documentación de Sentido de Vida

Punto de entrada documental. Fecha de consolidación: 15/11/2026. La lógica del sistema, los contratos y la migración SQL no se modifican por esta reorganización.

**Documento para entregar a ChatGPT:** [INFORMACION_MAESTRA_LRPD.md](LRPD/INFORMACION_MAESTRA_LRPD.md). Respeta los ocho capítulos y 41 subapartados del `PDF oficial` (fuente local no publicada; excluida de GitHub). Adjuntar también los capítulos originales cuando se prepare el Word. No se genera Word en esta etapa.

```text
docs/
├── README.md
├── arquitectura/
│   └── docs/arquitectura/SUPABASE_INTEGRATION.md
├── seguridad/
│   ├── docs/seguridad/AUT.md
│   └── docs/seguridad/AUTHORIZATION_PROPOSAL.md
├── base-de-datos/
│   ├── docs/base-de-datos/USERS_POSTGRES_DESIGN.md
│   └── docs/base-de-datos/USERS_POSTGRES_ACTIVATION.md
├── servicios/
│   └── docs/servicios/USERS_SERVICE.md
├── fases/
│   └── ESTADO_FASES.md
├── evidencias/
│   ├── docs/evidencias/USERS_POSTGRES_SYNTHETIC_TESTS.md
│   └── VALIDACIONES.md
└── LRPD/
    └── INFORMACION_MAESTRA_LRPD.md
```

Los DOCX y el TXT académicos existentes permanecen en esta carpeta; no fueron sobrescritos. El PDF obligatorio conserva su ubicación en la raíz.

## Lectura por finalidad

- Estado vigente y alcance: [fases](fases/ESTADO_FASES.md).
- Fuentes, arquitectura y preparación histórica Supabase: [integración](arquitectura/SUPABASE_INTEGRATION.md).
- Login/logout/SSR: [AUT](seguridad/AUT.md); roles y matriz: [autorización](seguridad/AUTHORIZATION_PROPOSAL.md).
- Contrato y estructura del servicio: [Usuarios](servicios/USERS_SERVICE.md).
- PAC progresivo y bloqueos de permisos: [Fase 3.4](servicios/PAC_FASE_3_4.md); [propuesta SQL no ejecutable](base-de-datos/propuestas/PAC_SELF_ACCESS_DRAFT.sql).
- Alternativas PostgreSQL: [diseño histórico](base-de-datos/USERS_POSTGRES_DESIGN.md); operación/evolución: [activación](base-de-datos/USERS_POSTGRES_ACTIVATION.md).
- Ensayos sintéticos: [procedimiento](evidencias/USERS_POSTGRES_SYNTHETIC_TESTS.md); [resultados y comandos](evidencias/VALIDACIONES.md).
- Información académica consolidada y pendientes: [maestro LRPD](LRPD/INFORMACION_MAESTRA_LRPD.md).

## Fuentes académicas conservadas

- `Capítulo I` (fuente local no publicada; excluida de GitHub).
- `Capítulo II` (fuente local no publicada; excluida de GitHub).
- `Capítulo III` (fuente local no publicada; excluida de GitHub).
- `Plan Maestro original` (fuente local no publicada; excluida de GitHub).
- `Documentación de base de datos` (fuente local no publicada; excluida de GitHub).
- `Modelo de clases PlantUML` (fuente local no publicada; excluida de GitHub).

## Convenciones de evidencia

El maestro diferencia IMPLEMENTADO, VERIFICADO, DOCUMENTADO, PROPUESTO y PENDIENTE. Los documentos movidos conservan su historial: expresiones como «sin driver», «no conectado» o «migración no ejecutada» describen etapas anteriores y no deben prevalecer sobre el estado vigente documentado. Las metas RNF no son métricas observadas.

Rutas de código en texto o comandos: relativas a la raíz del repositorio. Enlaces Markdown: relativos al archivo que los contiene. No adjuntar configuración privada, contraseñas, JWT, UUID sintéticos o archivos de credenciales como evidencias.

**Política Git conservada:** docs/ sigue ignorado por .gitignore. La entrega es local/manual; esta reorganización no fuerza seguimiento Git, commits ni push.

Nota de publicación: los documentos académicos originales citados (DOCX, PDF y modelo TXT) son fuentes locales no publicadas. Sus referencias se conservan para trazabilidad; deben solicitarse al responsable del proyecto y no forman parte de este repositorio.
