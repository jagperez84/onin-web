# ONIN — Reglas globales de UI y formularios

Estas reglas son transversales a toda la aplicación y deben aplicarse a módulos nuevos y a correcciones de módulos existentes.

## 1. Campos que referencian entidades

Cuando un campo representa una entidad del sistema, no debe depender de escritura manual libre. Debe disponer de una **ayuda de búsqueda/selección (lookup)** y devolver la entidad seleccionada.

Ejemplos: Cliente, Artículo, Usuario, Comercial, Proveedor, Dirección, etc.

El componente/flujo debe reutilizar la ayuda existente cuando sea aplicable, evitando implementar buscadores ad-hoc diferentes por pantalla.

## 2. Direcciones

Las direcciones deben estar vinculadas al mecanismo de búsqueda de direcciones de ONIN/API, igual que en Clientes. Cuando sea necesario, el usuario puede seleccionar un resultado y ONIN rellena los campos de dirección relacionados.

## 3. Etiquetas

Usar etiquetas cortas y naturales para la aplicación. Para código postal la etiqueta estándar es **CP**, no «Código postal».

## 4. Longitud visual de campos

Los campos deben tener un tamaño visual razonable según su longitud real o el significado del dato. Los campos largos deben ocupar el ancho necesario; los campos cortos no deben ocupar innecesariamente toda la pantalla.

## 5. Observaciones y textos largos

Las cajas de observaciones y otros textos libres largos deben ocupar **todo el ancho disponible** del contenedor/formulario, salvo que exista una razón funcional clara para lo contrario.

## 6. Errores de formulario

Los errores producidos al guardar, validar o cargar datos deben mostrarse mediante el **MessageLog compartido** de ONIN, no mediante mensajes inline específicos de cada módulo.

Cuando aparece un error, el foco debe pasar automáticamente al MessageLog para que el usuario lo vea de inmediato y para mantener un comportamiento consistente entre módulos.

No debe mantenerse un segundo mensaje de error duplicado en el formulario salvo que tenga una finalidad distinta y explícita.

## 7. Base funcional

Clientes y Artículos sirven como referencias de comportamiento para los siguientes módulos. Los módulos nuevos deben reutilizar estos patrones y evitar regresiones o variantes innecesarias.
