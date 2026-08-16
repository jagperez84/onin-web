# ONIN — Reglas funcionales y de UX transversales

## Referencias a entidades
- Todo campo que represente una entidad existente debe utilizar una ayuda de búsqueda/selección (lookup/search help). No depender exclusivamente de entrada manual.
- El selector debe permitir buscar por los identificadores y descripciones relevantes de la entidad.
- Al seleccionar una entidad, se pueden cargar automáticamente sus datos relacionados cuando aplique.

## Direcciones
- Las direcciones deben utilizar la búsqueda de direcciones mediante la API de direcciones compartida de ONIN (OpenStreetMap en la implementación actual), igual que en Clientes.
- La dirección elegida debe poder completar automáticamente CP, localidad, provincia y país.

## Etiquetas
- Utilizar `CP` como etiqueta para Código Postal. No mostrar `Código Postal` como label en formularios de ONIN.

## Campos de texto largo
- Las observaciones y otros campos de texto largo deben ocupar todo el ancho disponible del formulario cuando su contenido se beneficia de ello.

## Mensajes y errores
- Los errores de carga, validación y guardado deben mostrarse mediante el componente compartido `MessageLog`.
- Cuando aparece un error, el foco debe desplazarse automáticamente al `MessageLog` para que el usuario reciba feedback inmediato.
- No duplicar el mismo error con banners inline adicionales dentro del formulario.
- Esta regla aplica a todos los módulos, no solo a Clientes, Artículos y Mediciones.

## Criterio de regresión
- Los módulos cerrados deben conservar estas reglas como comportamiento transversal.
- Las implementaciones nuevas deben reutilizar los componentes compartidos existentes antes de crear variantes específicas.
