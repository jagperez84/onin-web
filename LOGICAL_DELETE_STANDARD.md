# ONIN — Estándar de marcado para borrado

## Regla general

Los datos maestros y entidades de negocio no se eliminan físicamente desde la aplicación.

Se utiliza borrado lógico mediante:

- `active`: disponibilidad funcional.
- `deleted_at`: marca de borrado lógico.
- `deleted_by`: usuario que realizó el marcado cuando esté disponible.

En relaciones de negocio que no son maestros, `active=false` puede seguir utilizándose para impedir la relación mientras `deleted_at` conserva la marca de borrado lógico.

## Estados funcionales

- **Activo**: `active = true` y `deleted_at IS NULL`.
- **Inactivo**: `active = false` y `deleted_at IS NULL`.
- **Marcado para borrado**: `deleted_at IS NOT NULL` y `active = false`.

## Comportamiento

- Los registros marcados para borrado no aparecen en listados activos.
- No se pueden utilizar en nuevos documentos.
- Se mantienen para preservar históricos, relaciones y trazabilidad.
- Deben poder recuperarse mediante una acción administrativa de restauración.
- Al restaurar se limpia `deleted_at`/`deleted_by` y se recupera `active = true` cuando la entidad dispone de `active`.

## UI

No utilizar el verbo `Eliminar` para maestros. Utilizar:

- `Marcar para borrado`
- `Borrar relación` para relaciones embebidas en una entidad
- `Recuperar`
- `Inactivo` para una desactivación funcional sin borrado lógico.

La confirmación debe explicar que el registro no se elimina físicamente.

## Arquitectura

Los repositorios de maestros deben exponer `markForDeletion`/`restore` y evitar operaciones de `DELETE` físico.

Las relaciones de producto, como proveedor-artículo y escalado-artículo, siguen el mismo principio para preservar la trazabilidad.

El patrón se aplicará progresivamente al resto de módulos.
