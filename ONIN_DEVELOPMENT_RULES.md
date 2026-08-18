# ONIN — reglas de trabajo para desarrollo

Este documento define las reglas mínimas para modificar Onin sin introducir regresiones.

## 1. Principio principal

Onin es una aplicación existente, no un proyecto nuevo. Antes de modificar código hay que inspeccionar el estado real de `main` y respetar la arquitectura, componentes y patrones ya existentes.

Nunca reconstruir una pantalla o componente de memoria cuando el repositorio contiene su implementación actual o una versión histórica fiable.

## 2. Cambios mínimos

Cada petición debe producir el cambio mínimo necesario para cumplirla.

- Si la petición es CSS/layout, no modificar lógica React, repositorios, exports, observaciones ni guardado.
- Si la petición es lógica, no rediseñar la UI salvo que se pida explícitamente.
- No sustituir componentes existentes por implementaciones nuevas equivalentes sin necesidad.
- No cambiar nombres, rutas o contratos de componentes existentes para resolver un problema local.

## 3. Presupuestos — invariantes

En `QuotationCreate` deben conservarse, salvo petición explícita:

- creación/guardado del presupuesto;
- barra de guardado existente;
- sección y textarea de Observaciones;
- selección/búsqueda de cliente y artículo;
- direcciones heredadas del cliente y editables;
- confirmación antes de cambiar de cliente;
- recalculo de direcciones y descuentos al cambiar de cliente;
- descuento por artículo y fallback por familia;
- toast informando de descuentos aplicados;
- recuperación de características y dimensiones del artículo cuando corresponda;
- cálculo de base imponible, descuentos, impuestos y total a partir de las líneas;
- comportamiento de artículos OTD y cualquier lógica OTD existente, sin introducir nueva formulación salvo petición explícita.

## 4. UI de presupuestos

La pantalla debe seguir el patrón visual ya establecido en Clientes y Artículos. Las indicaciones de diseño del usuario son reglas de disposición, no nombres literales de clases.

Prioridades actuales de la cabecera:

1. alineación consistente;
2. estructura visual similar a Clientes/Artículos;
3. espaciado coherente;
4. solo después, ajuste fino de anchuras según el contenido esperado.

Para las líneas:

- dejar aire suficiente entre controles;
- Artículo debe disponer de búsqueda/lookup;
- Descripción necesita espacio predominante;
- Cantidad, Precio y Descuento deben ser compactos pero utilizables;
- Total debe quedar claramente alineado;
- no introducir alturas vacías artificiales.

## 5. Grid y spacing

Mantener el sistema CSS existente. No introducir frameworks de utilidades ni sustituir CSS tradicional por Tailwind u otro sistema.

Los nombres de clases indicados por el usuario en una especificación son orientativos: hay que adaptar la solución a las clases reales del HTML/React existente.

## 6. Antes de editar

Siempre:

1. leer el archivo actual;
2. identificar los componentes y funciones que ya existen;
3. comprobar rutas/imports reales antes de añadir imports;
4. si el cambio afecta a una parte que ha sido modificada recientemente, inspeccionar el commit/historial relevante;
5. limitar el diff al alcance solicitado.

## 7. Después de editar

Antes de declarar una tarea terminada:

1. revisar el diff;
2. comprobar que no se han eliminado accidentalmente componentes o bloques no relacionados;
3. comprobar especialmente Observaciones, guardado, exports e imports en `QuotationCreate`;
4. comprobar sintaxis y tipos;
5. si no se puede ejecutar el build localmente, no afirmar que el build está verificado: indicar claramente que queda pendiente de Cloudflare.

## 8. Commits

El usuario ha indicado que los cambios deben commitirse directamente. Por tanto, cuando una petición esté terminada y revisada, hacer commit directamente en `main`, con un mensaje específico y sin mezclar cambios ajenos.

## 9. Regla de regresión

Una mejora visual nunca justifica perder funcionalidad existente. Si para realizar una modificación parece necesario tocar una zona funcional no relacionada, detenerse y revisar primero el historial real del archivo.
