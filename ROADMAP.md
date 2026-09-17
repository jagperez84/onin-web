# ONIN — Prioridades pendientes

Documento de prioridades de producto acordadas, para no perderlas entre conversaciones. No es un backlog exhaustivo — solo lo que ya se ha decidido que hay que abordar y en qué orden de importancia relativa.

## Visión: herramienta móvil de captura de campo (alta prioridad)

> Una herramienta móvil de captura de medidas, fotos y condiciones de instalación que convierta automáticamente el trabajo de campo en datos utilizables por el configurador y el resto del proceso de ONIN.

Es la evolución del módulo **Mediciones**, no un módulo nuevo. Dos frentes de trabajo complementarios, ambos sobre el mismo flujo:

### 1. Resiliencia a conexión intermitente

**Problema confirmado:** hoy, si se corta la conexión a mitad de una medición (formulario o fotos), el trabajo se pierde y el técnico no puede seguir trabajando hasta recuperar señal. Confirmado en el código (`src/services/measurements/measurementRepository.ts`: `createMeasurement`, `updateMeasurement`, `uploadMeasurementPhoto` son llamadas directas a Supabase, sin cola local ni reintento) y por el propio negocio.

**Por qué importa:** Mediciones es el único módulo que se usa sistemáticamente fuera de una oficina con wifi. Es el punto donde la mala cobertura es la norma, no la excepción — y es difícil de replicar rápido para competidores atados a escritorio (GestFuturo, InGnio, etc.).

**Alcance** (acotado a Mediciones — crear/detalle/fotos):
1. Guardado local inmediato (IndexedDB) al escribir/fotografiar, con feedback visual de "guardado en el dispositivo".
2. Cola de sincronización con reintento al recuperar conexión.
3. Clave de idempotencia (UUID generado en cliente) para `create_measurement` — reintentar la RPC no debe crear mediciones duplicadas.
4. Subida de fotos diferida, desacoplada de "la foto está en el móvil" vs. "ya subió a Storage".
5. Indicador visible de "N mediciones/fotos pendientes de sincronizar".

### 2. Captura estructurada que alimenta el configurador — implementado

**Problema que resolvía:** la medición solo guardaba cliente, dirección, contacto y `observations` en texto libre — cero campos de medida real. `generateQuotationFromMeasurement` creaba un presupuesto en blanco; nada de lo medido en la visita llegaba al presupuesto.

**Modelo real (corregido dos veces):** el "producto sugerido" de un hueco es un **OTD** (no una familia de artículo) — el configurador que de verdad se usa para toldos/pérgolas es `OtdLineConfiguratorModal`, con sus propias selecciones (`otd_selection`), no el configurador genérico de familia/tipo de medida. Cada OTD tiene una **Clasificación** (`otd.template_type`: Toldo / Pérgola / Cortina·Estor / Genérico — campo reintroducido en el editor de OTD, antes solo de lectura) que acota la lista al elegir en campo. Segunda corrección: un hueco puede albergar **más de un producto** (p. ej. dos toldos independientes en el mismo balcón) — por eso el OTD y las medidas viven en `measurement_opening_product` (uno o varios por hueco), no directamente en `measurement_opening`, que queda como el punto físico (condiciones de instalación y fotos, compartidas por todos sus productos).

**Construido:**
1. `measurement_opening` (punto físico) + `measurement_opening_product` (cada OTD dentro de ese punto, uno o varios) + `measurement_opening_dimension`: medidas reales por producto, tomadas de las selecciones del OTD elegido con `is_dimension = true` (`listOtdDimensionSelections`).
2. Selección manual del OTD sugerido, in situ, filtrable por Clasificación, por producto — sin motor de recomendación automática, sería sobreingeniería.
3. Catálogo configurable de condiciones de instalación (`installation_condition_type`/`option`) — nace vacío, sin pantalla de alta todavía (pendiente).
4. Puente real a presupuesto: desde `QuotationEdit`, "Huecos pendientes" lista cada producto sin convertir todavía y abre `OtdLineConfiguratorModal` con su OTD preseleccionado y sus medidas ya como `initialValues` — no un presupuesto en blanco ni una línea simulada.
5. Fotos enlazadas al hueco concreto (`measurement_photo.opening_id`), no solo a la visita general.
6. Bypass de admin: un administrador puede editar huecos/fotos de cualquier medición En curso, esté o no asignada a él.

**Pendiente dentro de este frente:**
- Pantalla para dar de alta condiciones de instalación (hoy solo vía SQL).
- Migración aplicada en Supabase (`20260921340000_measurement_openings.sql`, ya con el modelo multi-producto) y verificación en navegador real.

**Estado:** implementado en código, sin aplicar/probar contra Supabase todavía.
