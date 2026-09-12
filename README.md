# ONIN Web

ONIN es la migración web del ERP de escritorio "Toldos" (Java Swing + Hibernate) para un negocio de fabricación e instalación de toldos y lona. Stack: React + TypeScript (Vite) + Supabase/Postgres.

## Alcance actual

La aplicación ya cubre el ciclo comercial y de producción completo, no solo el alta de clientes:

- **Ventas**: clientes (ficha, direcciones, contactos, descuentos por familia/artículo/OTD, documentos y cobros pendientes), catálogo de artículos (familias, características, dimensiones, líneas de comportamiento), presupuestos con configurador OTD.
- **Pedidos**: conversión desde presupuesto aceptado, ciclo de fabricación (corte de perfil, confección de lona, consumo de componentes), montajes/instalaciones, generación de factura y albarán desde el pedido fabricado.
- **Almacén**: almacenes, existencias (con dimensiones y características), movimientos, transferencias y reservas de stock.
- **Facturación**: facturas (con rectificativas), plazos de cobro con seguimiento de vencidos, albaranes de entrega.
- **Producción**: hojas de trabajo de corte y el motor OTD (selecciones, variables, componentes/BOM) para artículos configurables.
- **Gestión**: mediciones (con asignación y avisos), montajes/instalaciones, mapa.
- **Configuración**: usuarios (roles, empresas asignadas, permisos por módulo), tipos de medida, formas y condiciones de pago.
- Multiempresa con Row Level Security en Supabase, borrado lógico como estándar (ver `LOGICAL_DELETE_STANDARD.md`) y un Centro de Ayuda in-app (`/ayuda`).

**Compras**, **CRM** e **Informes** existen en la navegación pero aún son áreas preparadas sin implementar.

## Documentación

- `docs/DEVELOPMENT_RULES.md` / `docs/ONIN-GLOBAL-UI-RULES.md`: reglas de UX transversales (lookups, direcciones, `MessageLog`, etc.).
- `ONIN_DEVELOPMENT_RULES.md`: reglas de trabajo para no introducir regresiones frente a `oninClasico`.
- `LOGICAL_DELETE_STANDARD.md`: estándar de borrado lógico (`active`/`deleted_at`/`deleted_by`).
- `CLOUDFLARE_DEPLOY.md`: configuración de despliegue.
- Centro de Ayuda in-app (`/ayuda`): guías funcionales por módulo para el usuario final.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

For Cloudflare Pages:

```bash
npm run build:cloudflare
```

Output: `dist/`

## Environment

Copy `.env.example` to `.env` for local development and configure:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ONIN_API_URL`

Never commit `.env` or a Supabase `service_role` key.

## Database migrations

Las migraciones viven en `supabase/migrations/` y se aplican manualmente desde el editor SQL de Supabase (no hay CI de despliegue de base de datos). Se escriben de forma idempotente (`create or replace`, `add column if not exists`, etc.) para poder reaplicarse sin error.
