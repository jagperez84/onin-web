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

### 2. Captura estructurada que alimenta el configurador

**Problema confirmado:** hoy la medición solo guarda cliente, dirección, contacto y `observations` en texto libre — cero campos de medida real. `generateQuotationFromMeasurement` crea un presupuesto en blanco, solo copiando dirección/contacto; nada de lo medido en la visita llega al presupuesto. Quien prepara el presupuesto vuelve a preguntar o re-mide de cero.

**Lo reutilizable:** el sistema de "Tipos de medida" (`measurement_type` + `measurement_type_dimension`, en Configuración) ya define por familia de producto qué dimensiones hacen falta (ancho/alto/caída…) con su unidad — es el mismo motor que alimenta el configurador OTD al crear un presupuesto. Hoy es invisible durante la visita; solo se usa después, en oficina.

**Alcance:**
1. Captura de medidas reales en la visita usando ese mismo motor de tipos de medida — varios huecos por visita, no una medida única.
2. Selección manual del producto/familia que encaja, in situ (brazo invisible, punto recto, pérgola…) — sin motor de recomendación automática en v1, sería sobreingeniería.
3. Checklist estructurado de condiciones de instalación (tipo de superficie de fijación, material del soporte, obstáculos, altura, accesibilidad, orientación/viento) — no texto libre, para que sirva también a planificación e instalación después.
4. `generateQuotationFromMeasurement` crea la línea OTD ya prellenada con medidas y producto capturados, en vez de un presupuesto vacío — elimina la doble captura y los errores de transcripción entre "lo medido" y "lo presupuestado".
5. Cada foto enlazada al hueco/línea concreto medido, no solo a la visita general.

**Tamaño real:** proyecto de varias semanas por frente, no un parche. Requiere diseño explícito antes de empezar (esquema local y de datos, contrato de la cola de sincronización, qué llamadas necesitan idempotencia, cómo se modela "hueco" dentro de una medición).

**Estado:** priorizado, no iniciado. Retomar cuando el ciclo comercial/producción esté estable y validado con la empresa fundadora.
