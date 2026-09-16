# ONIN — Prioridades pendientes

Documento de prioridades de producto acordadas, para no perderlas entre conversaciones. No es un backlog exhaustivo — solo lo que ya se ha decidido que hay que abordar y en qué orden de importancia relativa.

## Mediciones — resiliencia a conexión intermitente (alta prioridad)

**Problema confirmado:** hoy, si se corta la conexión a mitad de una medición (formulario o fotos), el trabajo se pierde y el técnico no puede seguir trabajando hasta recuperar señal. Confirmado tanto en el código (`src/services/measurements/measurementRepository.ts`: `createMeasurement`, `updateMeasurement`, `uploadMeasurementPhoto` son llamadas directas a Supabase sin cola local, sin reintento) como por el propio negocio.

**Por qué importa:** Mediciones es el único módulo que se usa sistemáticamente fuera de una oficina con wifi (en casa del cliente, en la calle). Es el punto donde la mala cobertura es la norma, no la excepción — y es el flujo con más impacto de cara a un pitch a inversores ("funciona aunque no haya cobertura") y más difícil de replicar rápido para competidores atados a escritorio (GestFuturo, InGnio, etc.).

**Alcance propuesto** (acotado a Mediciones — crear/detalle/fotos, no a toda la app):
1. Guardado local inmediato (IndexedDB) al escribir/fotografiar, con feedback visual de "guardado en el dispositivo".
2. Cola de sincronización con reintento al recuperar conexión.
3. Clave de idempotencia (UUID generado en cliente) para `create_measurement` — reintentar la RPC no debe crear mediciones duplicadas.
4. Subida de fotos diferida, desacoplada de "la foto está en el móvil" vs. "ya subió a Storage".
5. Indicador visible de "N mediciones/fotos pendientes de sincronizar".

**Tamaño real:** proyecto de varias semanas, no un parche. Requiere diseño explícito antes de empezar (esquema local, contrato de la cola, qué llamadas necesitan idempotencia).

**Estado:** priorizado, no iniciado. Retomar cuando el ciclo comercial/producción esté estable y validado con la empresa fundadora.
