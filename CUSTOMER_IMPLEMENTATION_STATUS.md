# ONIN — Clientes vertical slice

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

## Decisiones
- El alta Party + Customer + Party Role se hace mediante una función PostgreSQL para mantener atomicidad.
- La eliminación física del cliente no se expone; se utiliza `active` para desactivación.
- Las observaciones no se persisten todavía porque el modelo `party` actual no tiene una columna de notas.

## Pendiente
- API propia separada de Supabase para reglas de negocio finales.
- RLS específico de producción.
- Dirección geográfica asistida.
- Relación con comerciales, formas de pago y descuentos.
- Auditoría detallada.
