# ONIN — Clientes vertical slice

> Este documento cubre el vertical slice original de Clientes. Desde entonces la ficha de cliente ha crecido con secciones propias (ver más abajo); para el resto de la aplicación consulta `README.md` y el Centro de Ayuda (`/ayuda`).

## Implementado
- Listado de clientes conectado a Supabase.
- Búsqueda por nombre, nombre comercial, CIF/NIF y código.
- Alta de cliente con ID generado automáticamente.
- Validación de CIF/NIF, email y teléfono en frontend.
- Prevención de duplicados de CIF/NIF en la función PostgreSQL.
- Detalle de cliente.
- Modificación de datos generales.
- Gestión CRUD de direcciones.
- Gestión CRUD de contactos.
- Terminología `Listado de Clientes` y `Volver al listado`.
- Responsive básico para listado y formularios.
- Descuentos comerciales por familia, por artículo y por OTD (genérico + específico, con prioridad entre niveles).
- Documentos del cliente: presupuestos, pedidos, albaranes y facturas en una vista filtrable, con estadísticas de impacto (aceptación de presupuestos, importe de pedidos, ticket medio, total facturado).
- Cobros pendientes del cliente, con los vencidos resaltados.

## Decisiones
- El alta Party + Customer + Party Role se hace mediante una función PostgreSQL para mantener atomicidad.
- La eliminación física del cliente no se expone; se utiliza `active` para desactivación.
- Las observaciones no se persisten todavía porque el modelo `party` actual no tiene una columna de notas.

## Pendiente
- API propia separada de Supabase para reglas de negocio finales.
- RLS específico de producción.
- Dirección geográfica asistida.
- Relación con comerciales.
- Auditoría detallada.
