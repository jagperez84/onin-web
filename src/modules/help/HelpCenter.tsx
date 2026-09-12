import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Box,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Factory,
  FileText,
  Info,
  Layers,
  Map,
  Package,
  Percent,
  ReceiptText,
  Ruler,
  Search,
  Settings,
  ShoppingCart,
  Tag,
  Truck,
  Users,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import "./help.css";

type HelpArticle = {
  id: string;
  title: string;
  summary: string;
  section: string;
  icon: typeof BookOpen;
  route?: string;
  status?: "Disponible" | "En desarrollo";
  keywords: string[];
  steps: string[];
  tips?: string[];
  warnings?: string[];
};

const articles: HelpArticle[] = [
  {
    id: "inicio",
    title: "Primeros pasos en ONIN",
    summary: "Aprende a moverte por la aplicación, localizar funciones y entender la estructura general de ONIN.",
    section: "Primeros pasos",
    icon: BookOpen,
    keywords: ["inicio", "navegación", "menú", "buscar", "usuario", "sesión"],
    steps: [
      "Utiliza el menú lateral para acceder a Ventas, Compras, Almacén, Gestión, Facturación, Producción, Informes y Configuración.",
      "Desde Inicio puedes acceder rápidamente a áreas habituales y consultar avisos relacionados con mediciones asignadas.",
      "La barra superior mantiene el buscador general, el selector de tema, el acceso al Centro de Ayuda y el usuario autenticado.",
      "El botón de ayuda abre esta documentación sin abandonar la sesión de ONIN.",
    ],
    tips: [
      "Si no sabes dónde realizar una tarea, busca por el nombre de la operación y no solo por el nombre del módulo.",
      "Las rutas y nombres de esta ayuda siguen la navegación actual de ONIN Web.",
    ],
  },
  {
    id: "buscar-ayuda",
    title: "Cómo buscar en el Centro de Ayuda",
    summary: "Encuentra una guía utilizando módulos, tareas, conceptos y términos habituales del negocio.",
    section: "Primeros pasos",
    icon: Search,
    route: "/ayuda",
    keywords: ["buscar", "ayuda", "documentación", "guía", "problema"],
    steps: [
      "Escribe en el buscador una palabra como cliente, presupuesto, stock, medición, artículo u OTD.",
      "La búsqueda revisa título, resumen, módulo, pasos y palabras clave de cada guía.",
      "Abre una guía para consultar su procedimiento, recomendaciones y advertencias cuando existan.",
      "Si no aparece una respuesta, prueba con un término funcional más general o consulta al administrador.",
    ],
    tips: ["La documentación debe ampliarse a medida que se incorporen nuevas funciones o se detecten dudas recurrentes."],
  },
  {
    id: "clientes-listado",
    title: "Clientes: listado y búsqueda",
    summary: "Localiza clientes por los principales identificadores comerciales y abre su ficha.",
    section: "Ventas",
    icon: Users,
    route: "/ventas/clientes",
    keywords: ["clientes", "cliente", "CIF", "NIF", "código", "nombre", "búsqueda"],
    status: "Disponible",
    steps: [
      "Entra en Ventas > Clientes.",
      "Busca por nombre, nombre comercial, CIF/NIF o código de cliente.",
      "Selecciona el cliente para consultar su ficha y sus datos generales.",
      "Utiliza el listado como punto de entrada para crear un cliente nuevo o abrir uno existente.",
    ],
    tips: ["Antes de crear un cliente, comprueba CIF/NIF y nombre para evitar duplicados."],
  },
  {
    id: "clientes-ficha",
    title: "Clientes: alta, edición, direcciones y contactos",
    summary: "Gestiona la ficha del cliente y sus datos relacionados.",
    section: "Ventas",
    icon: Users,
    route: "/ventas/clientes",
    keywords: ["alta", "editar", "dirección", "contacto", "email", "teléfono", "duplicado"],
    status: "Disponible",
    steps: [
      "Selecciona Nuevo desde el listado de clientes y completa los datos solicitados.",
      "ONIN valida en frontend datos como CIF/NIF, email y teléfono antes de guardar.",
      "La creación del cliente se realiza de forma atómica para mantener relacionados sus datos principales.",
      "Desde la ficha puedes gestionar las direcciones y contactos mediante sus operaciones de alta, modificación y eliminación.",
      "Para desactivar un cliente se utiliza su estado activo; la eliminación física no se expone como operación normal.",
    ],
    tips: ["Desde la misma ficha, los apartados «Descuentos» y «Documentos» reúnen las condiciones comerciales y el histórico de ese cliente; consulta sus guías específicas."],
  },
  {
    id: "clientes-descuentos",
    title: "Clientes: descuentos comerciales",
    summary: "Configura los descuentos de un cliente por familia, por artículo y por OTD, y entiende qué prevalece sobre qué.",
    section: "Ventas",
    icon: Percent,
    route: "/ventas/clientes",
    keywords: ["descuento", "familia", "artículo", "OTD", "prioridad", "genérico", "específico", "comercial"],
    status: "Disponible",
    steps: [
      "Abre la ficha del cliente y ve al apartado Descuentos.",
      "Descuento por familia: se aplica a todos los artículos de esa familia para ese cliente.",
      "Descuento por artículo: se aplica a un artículo concreto y prevalece sobre el descuento de familia para ese mismo artículo.",
      "Descuento por OTD: puedes definir uno genérico (se aplica a todos los OTD del cliente) y descuentos específicos para un OTD concreto, que prevalecen sobre el genérico.",
      "Los descuentos no se suman entre sí: para cada línea gana siempre el nivel más específico que exista.",
    ],
    tips: [
      "Orden de prioridad en una línea generada desde un OTD: descuento específico de ese OTD > descuento del artículo al que esté vinculado el OTD (si lo tiene) > descuento de su familia > descuento genérico de OTD.",
      "Si un presupuesto no aplica el descuento que esperabas, revisa primero si existe un nivel más específico definido para ese cliente.",
    ],
  },
  {
    id: "clientes-documentos",
    title: "Clientes: documentos y cobros pendientes",
    summary: "Consulta en un único lugar los presupuestos, pedidos, albaranes y facturas de un cliente, sus estadísticas y lo que tiene pendiente de cobro.",
    section: "Ventas",
    icon: Wallet,
    route: "/ventas/clientes",
    keywords: ["documentos", "histórico", "estadísticas", "cobros", "pendiente", "vencido", "facturación", "impacto"],
    status: "Disponible",
    steps: [
      "Abre la ficha del cliente y ve al apartado Documentos.",
      "Las tarjetas superiores resumen el impacto del cliente: presupuestos y % de aceptación, pedidos e importe total, ticket medio, total facturado, pendiente de cobro y última actividad.",
      "La tabla reúne presupuestos, pedidos, albaranes y facturas del cliente; puedes filtrar por tipo de documento y abrir cualquiera desde su enlace.",
      "El apartado Cobros pendientes lista los plazos de factura de ese cliente que aún no se han cobrado, con la fecha de vencimiento.",
      "Los plazos vencidos se resaltan en rojo para que se vean primero.",
    ],
    warnings: ["Los albaranes que aparezcan en este listado necesitan la migración de base de datos de albaranes aplicada; si no ves ninguno y esperabas verlos, comprueba primero que el pedido correspondiente esté fabricado."],
  },
  {
    id: "articulos-catalogo",
    title: "Artículos: catálogo y ficha",
    summary: "Consulta el catálogo y la información principal de los artículos que intervienen en ventas y procesos posteriores.",
    section: "Ventas",
    icon: Package,
    route: "/ventas/articulos",
    keywords: ["artículo", "catalogo", "producto", "familia", "ficha", "característica"],
    status: "Disponible",
    steps: [
      "Entra en Ventas > Artículos para consultar el catálogo.",
      "Utiliza la búsqueda del listado para localizar el artículo que necesitas.",
      "Abre la ficha para revisar su información y las configuraciones relacionadas.",
      "Cuando un artículo tiene características o dimensiones definidas, estas condicionan cómo puede utilizarse posteriormente en presupuestos y procesos de fabricación.",
    ],
    tips: ["Los conceptos artículo, familia, características, escalado y despiece están relacionados y no deben tratarse como catálogos aislados."],
  },
  {
    id: "articulos-caracteristicas",
    title: "Artículos: características y dimensiones",
    summary: "Entiende cómo las características y las dimensiones intervienen en la configuración de un artículo.",
    section: "Ventas",
    icon: Tag,
    route: "/ventas/articulos",
    keywords: ["característica", "color", "acabado", "dimensión", "ancho", "salida", "configurable"],
    steps: [
      "Abre un artículo desde Ventas > Artículos y accede a sus características cuando estén disponibles.",
      "Las características representan atributos seleccionables del artículo, como color o acabado, según su definición.",
      "Las dimensiones representan valores necesarios para calcular o describir determinadas líneas, pudiendo existir varias dimensiones según el tipo de medida.",
      "En líneas configurables, la definición del artículo puede bloquear qué dimensiones o características son editables y limitar la entrada del usuario a los valores necesarios para el cálculo.",
    ],
    tips: ["Antes de modificar una definición configurable, comprueba qué valores son obligatorios y cuáles están definidos por el artículo."],
  },
  {
    id: "articulos-lineas-comportamiento",
    title: "Artículos: líneas de comportamiento y parámetros de corte",
    summary: "Define qué funciones necesita cada familia de artículos (toldos, pérgolas, piscinas…) y, si aplica, sus parámetros de corte.",
    section: "Ventas",
    icon: Layers,
    route: "/ventas/articulos/catalogos",
    keywords: ["comportamiento de línea", "familia", "corte", "rollo", "costura", "barra", "perfil", "OTD", "catálogo"],
    status: "Disponible",
    steps: [
      "Entra en Ventas > Artículos > Catálogos y selecciona la pestaña Comportamiento de línea, dentro de «Comportamientos de línea».",
      "Activa solo las funciones que esa familia necesita realmente: cantidad, precio, descuento, dimensiones, configuración, cálculo de corte, longitud, características o corte de lona.",
      "Si activas Cálculo de corte, puedes ajustar el ancho de rollo, los márgenes de dobladillo y vaina, y la longitud de barra estándar; si los dejas en blanco, se usan los valores por defecto de un toldo enrollable.",
      "La estimación de perfiles sin despiece puede dejarse en el valor estándar (perfil de carga + tubo de enrolle) o sustituirse por una lista propia — o vaciarse por completo para una línea que no sea un toldo enrollable.",
      "Asigna esta línea de comportamiento a la familia correspondiente en Ventas > Artículos > Catálogos > Familias.",
    ],
    warnings: [
      "El motor de corte solo modela piezas rectangulares. Para artículos con formas irregulares (recortes, esquinas no rectas) desactiva Cálculo de corte / Corte de lona y usa el despiece (componentes del OTD) para registrar solo la cantidad total de material.",
      "Cambiar los parámetros de corte de una línea afecta a todos los artículos de las familias que la usan; revisa el impacto antes de modificarlos en producción.",
    ],
  },
  {
    id: "presupuestos-alta",
    title: "Presupuestos: crear y estructurar un presupuesto",
    summary: "Crea un presupuesto y prepara sus líneas manteniendo cliente, direcciones, artículos y condiciones comerciales coherentes.",
    section: "Ventas",
    icon: FileText,
    route: "/ventas/presupuestos",
    keywords: ["presupuesto", "crear", "cliente", "línea", "dirección", "observaciones"],
    status: "Disponible",
    steps: [
      "Entra en Ventas > Presupuestos y selecciona Nuevo.",
      "Selecciona el cliente. Sus direcciones y condiciones relacionadas pueden alimentar la información del presupuesto.",
      "Añade las líneas de artículos y completa descripción, cantidad, medidas y demás valores que correspondan.",
      "Revisa las observaciones y los datos comerciales antes de guardar.",
      "Guarda el presupuesto mediante la barra de guardado existente y comprueba el resultado en el detalle.",
    ],
    warnings: ["Cambiar de cliente puede provocar el recálculo de direcciones y descuentos asociados; revisa las líneas después de un cambio de cliente."],
  },
  {
    id: "presupuestos-lineas",
    title: "Presupuestos: líneas, medidas, características y descuentos",
    summary: "Las líneas de presupuesto son el punto donde confluyen artículo, cantidad, dimensiones, características, precio y descuento.",
    section: "Ventas",
    icon: ClipboardList,
    route: "/ventas/presupuestos",
    keywords: ["línea", "cantidad", "precio", "descuento", "medida", "característica", "importe", "OTD"],
    steps: [
      "Selecciona el artículo mediante la búsqueda de artículos disponible en la línea.",
      "Introduce la cantidad y las dimensiones que requiera el artículo. El modelo histórico contempla hasta cinco dimensiones y una medida de resto.",
      "Si el artículo dispone de características, selecciona los valores permitidos y completa las obligatorias.",
      "El descuento puede proceder del artículo y existir un fallback por familia cuando la regla comercial correspondiente esté definida.",
      "Revisa precio, descuento e importe de cada línea y el resumen del presupuesto antes de guardar.",
    ],
    tips: [
      "En artículos configurables, las dimensiones y características pueden intervenir en el cálculo del precio unitario.",
      "La funcionalidad OTD debe conservar sus reglas específicas y no debe interpretarse como una línea estándar de artículo.",
    ],
  },
  {
    id: "presupuestos-calculo",
    title: "Presupuestos: cómo interpretar los importes",
    summary: "Consulta de forma segura cómo se compone el importe de las líneas y del presupuesto.",
    section: "Ventas",
    icon: ReceiptText,
    route: "/ventas/presupuestos",
    keywords: ["subtotal", "base", "IVA", "impuesto", "total", "importe", "precio"],
    steps: [
      "Comprueba el precio aplicado a cada línea antes del descuento.",
      "Comprueba el descuento de la línea y el importe resultante.",
      "Revisa el resumen del documento para validar base imponible, impuestos y total.",
      "Si el importe no coincide con lo esperado, revisa primero artículo, dimensiones, características, descuento y cantidad antes de modificar manualmente el precio.",
    ],
    warnings: ["La formulación exacta de precios OTD y otras reglas de cálculo específicas debe mantenerse alineada con la lógica de negocio existente; esta ayuda no sustituye esa lógica."],
  },
  {
    id: "pedidos",
    title: "Pedidos de venta",
    summary: "Consulta y crea pedidos a partir del flujo comercial de ONIN.",
    section: "Ventas",
    icon: FileText,
    route: "/ventas/pedidos",
    keywords: ["pedido", "ventas", "presupuesto", "convertir", "cliente", "fabricación", "montaje", "factura", "albarán", "instalado"],
    status: "Disponible",
    steps: [
      "Entra en Ventas > Pedidos para consultar los pedidos existentes.",
      "Un pedido nace siempre de un presupuesto Aceptado; conviértelo desde el propio presupuesto.",
      "El indicador de estado del pedido recorre: Pendiente de fabricación → Preparado/Fabricando/Confeccionado → Fabricado → (si lleva montaje) Montaje programado → Instalado.",
      "Desde el detalle del pedido puedes registrar cortes, confección y consumo de componentes por línea, y programar o completar su montaje.",
      "Una vez fabricado, aparecen las tarjetas Facturación y Albarán para generar esos documentos; si el pedido ya tiene un montaje completado, el albarán se ofrece como «Generar albarán del montaje» y queda vinculado a esa instalación.",
    ],
    tips: ["Consulta también las guías de Montajes y de Albaranes para el detalle de cada paso posterior a la fabricación."],
  },
  {
    id: "compras",
    title: "Compras y proveedores",
    summary: "Estructura y navegación del área de Compras.",
    section: "Compras",
    icon: ShoppingCart,
    keywords: ["compras", "proveedor", "pedido compra", "albarán compra"],
    status: "En desarrollo",
    steps: [
      "El área Compras contiene Proveedores, Pedidos de compra y Albaranes de compra.",
      "Accede a Proveedores para consultar la información disponible de proveedores.",
      "Utiliza Pedidos de compra y Albaranes de compra para los documentos correspondientes cuando la funcionalidad esté habilitada en tu versión.",
      "Si una opción aparece como no implementada, no intentes sustituirla por un proceso de otro módulo sin confirmar primero el procedimiento de negocio.",
    ],
    warnings: ["Parte de la navegación de Compras existe actualmente como área preparada pero no toda ella está implementada en ONIN Web."],
  },
  {
    id: "almacen-almacenes",
    title: "Almacén: almacenes y existencias",
    summary: "Consulta dónde se gestiona cada almacén y cómo interpretar las existencias.",
    section: "Almacén",
    icon: Warehouse,
    route: "/almacen/almacenes",
    keywords: ["almacén", "almacenes", "stock", "existencia", "material"],
    status: "Disponible",
    steps: [
      "Entra en Almacén > Almacenes para consultar y gestionar los almacenes disponibles.",
      "En Almacén > Existencias consulta el stock asociado al artículo, característica y almacén.",
      "Para artículos dimensionales, las cantidades y dimensiones pueden formar parte de la identificación de una existencia.",
      "Comprueba siempre el almacén y la característica antes de interpretar una cantidad de stock.",
    ],
    tips: ["Una existencia no es necesariamente solo una cantidad: el modelo heredado contempla dimensiones, unidades, restos y estado de uso."],
  },
  {
    id: "almacen-movimientos",
    title: "Almacén: movimientos",
    summary: "Consulta las entradas y salidas y entiende su relación con documentos y fabricación.",
    section: "Almacén",
    icon: Truck,
    route: "/almacen/movimientos",
    keywords: ["movimiento", "entrada", "salida", "precio", "valoración", "presupuesto", "corte"],
    status: "Disponible",
    steps: [
      "Entra en Almacén > Movimientos para consultar los movimientos registrados.",
      "Revisa tipo de movimiento, fecha, almacén, artículo, característica, cantidades y concepto.",
      "Cuando el movimiento procede de un proceso comercial o productivo, puede quedar relacionado con un presupuesto, una línea de presupuesto o una línea de corte.",
      "Comprueba las unidades y dimensiones cuando trabajes con artículos dimensionales.",
    ],
    tips: ["El modelo histórico distingue movimientos modificables y conserva información de valoración de precio; no edites un movimiento sin conocer su origen."],
  },
  {
    id: "almacen-transferencias",
    title: "Almacén: transferencias y reservas",
    summary: "Gestiona desplazamientos y reservas de material sin perder la trazabilidad del stock.",
    section: "Almacén",
    icon: ArrowRight,
    route: "/almacen/transferencias",
    keywords: ["transferencia", "reserva", "reservar", "stock", "resto"],
    status: "Disponible",
    steps: [
      "Utiliza Almacén > Transferencias para mover material entre almacenes según el flujo disponible.",
      "Utiliza Almacén > Reservas para consultar material reservado.",
      "En material dimensional, verifica las dimensiones y características asociadas antes de confirmar una operación.",
      "Después de una operación de stock, comprueba las existencias resultantes y los movimientos generados cuando corresponda.",
    ],
    warnings: ["Las reservas y su consumo dimensional forman parte de un modelo específico; no deben interpretarse como una simple resta de stock sin revisar el contexto del material."],
  },
  {
    id: "mediciones",
    title: "Mediciones: alta y seguimiento",
    summary: "Registra mediciones, consulta su detalle y trabaja con asignaciones para revisión.",
    section: "Gestión",
    icon: Ruler,
    route: "/gestion/mediciones",
    keywords: ["medición", "medidas", "cliente", "dirección", "asignar", "revisión"],
    status: "Disponible",
    steps: [
      "Entra en Gestión > Mediciones para consultar las mediciones existentes.",
      "Crea una nueva medición desde la opción correspondiente y completa los datos solicitados.",
      "Desde el detalle puedes consultar la información de la medición y los datos relacionados con cliente y ubicación.",
      "Las mediciones pueden asignarse a usuarios para su revisión y aparecen como pendientes en los accesos de Inicio cuando corresponde.",
    ],
    tips: ["Antes de continuar un trabajo basado en medidas, comprueba que las dimensiones y el cliente/ubicación sean los correctos."],
  },
  {
    id: "mediciones-asignacion",
    title: "Mediciones: asignaciones y avisos de Inicio",
    summary: "Entiende cómo ONIN destaca las mediciones recién asignadas al usuario.",
    section: "Gestión",
    icon: CheckCircle2,
    route: "/gestion/mediciones",
    keywords: ["asignada", "pendiente", "revisión", "notificación", "inicio"],
    status: "Disponible",
    steps: [
      "Cuando existen mediciones asignadas al usuario, Inicio muestra un aviso de mediciones nuevas pendientes de revisión.",
      "El aviso identifica la medición y, cuando está disponible, el cliente y la ciudad de la ubicación.",
      "Puedes abrir directamente una medición desde el aviso o ir al listado completo.",
      "Utiliza el detalle para revisar la información antes de continuar con el trabajo.",
    ],
  },
  {
    id: "montajes",
    title: "Montajes",
    summary: "Accede al área de Gestión destinada al seguimiento de montajes.",
    section: "Gestión",
    icon: Factory,
    route: "/gestion/montajes",
    keywords: ["montaje", "instalación", "trabajo", "gestión", "instalador", "programar", "completar", "hoja de montaje"],
    status: "Disponible",
    steps: [
      "Entra en Gestión > Montajes para ver las instalaciones programadas, completadas o canceladas; se muestran las programadas por defecto y se avisa de las que están vencidas.",
      "Un montaje se programa desde el propio pedido: fecha, hora de inicio, duración estimada, tipo de instalación y equipo de instaladores asignado.",
      "Descarga la hoja de montaje en PDF para entregársela al equipo instalador con la dirección, el equipo asignado y las líneas a instalar.",
      "Al finalizar la visita, completa el montaje indicando hora de fin y duración real. Esto marca el pedido como Instalado y habilita generar su albarán desde el propio pedido.",
      "Una programación aún no completada puede cancelarse; el pedido vuelve a su estado anterior.",
    ],
  },
  {
    id: "mapa",
    title: "Mapa",
    summary: "Consulta la información geográfica disponible desde Gestión > Mapa.",
    section: "Gestión",
    icon: Map,
    route: "/gestion/mapa",
    keywords: ["mapa", "ubicación", "dirección", "geografía", "cliente"],
    status: "Disponible",
    steps: [
      "Entra en Gestión > Mapa.",
      "Utiliza la vista geográfica para localizar los registros que dispongan de información de ubicación.",
      "Si una dirección no aparece correctamente, comprueba primero los datos de dirección del registro origen.",
    ],
  },
  {
    id: "gestion-crm",
    title: "CRM",
    summary: "Área reservada para la gestión comercial de oportunidades y seguimiento de clientes; aún no está implementada.",
    section: "Gestión",
    icon: Users,
    route: "/gestion/crm",
    keywords: ["CRM", "oportunidad", "seguimiento", "comercial", "en desarrollo"],
    status: "En desarrollo",
    steps: [
      "La entrada Gestión > CRM existe en la navegación pero todavía no tiene funcionalidad propia en ONIN Web.",
      "Para el seguimiento comercial actual, utiliza Presupuestos y la ficha de cliente (Documentos y Descuentos).",
    ],
    warnings: ["No existe todavía ningún dato ni proceso de negocio detrás de esta pantalla."],
  },
  {
    id: "produccion-hojas",
    title: "Producción: hojas de trabajo",
    summary: "Consulta y abre las hojas de trabajo utilizadas en producción.",
    section: "Producción",
    icon: Factory,
    route: "/produccion/hojas",
    keywords: ["producción", "hoja", "hoja de trabajo", "fabricación"],
    status: "Disponible",
    steps: [
      "Entra en Producción > Hojas de trabajo.",
      "Consulta el listado y abre una hoja para revisar su detalle.",
      "Utiliza la información de la hoja como referencia del trabajo productivo asociado.",
      "Cuando el trabajo dependa de corte, confección, despiece o stock dimensional, comprueba también el contexto del artículo y del presupuesto.",
    ],
  },
  {
    id: "otd",
    title: "OTD: configuración y prueba",
    summary: "Trabaja con las reglas OTD y utiliza la prueba antes de dar por válida una modificación.",
    section: "Producción",
    icon: Settings,
    route: "/produccion/otd",
    keywords: ["OTD", "regla", "configuración", "prueba", "producción", "artículo"],
    status: "Disponible",
    steps: [
      "Entra en Producción > OTD para consultar las reglas disponibles.",
      "Abre una regla para revisar su configuración antes de modificarla.",
      "Cuando esté disponible, utiliza la opción de probar para validar el comportamiento con datos controlados.",
      "Comprueba el resultado antes de utilizar la regla en un proceso real de presupuesto o producción.",
    ],
    warnings: ["OTD tiene dependencias con artículos, familias, características, medidas y lógica de presupuesto. Una modificación de una regla puede afectar a procesos posteriores."],
  },
  {
    id: "fabricacion-relaciones",
    title: "Fabricación: artículo, despiece, corte y almacén",
    summary: "Visión general del flujo que conecta las estructuras de fabricación con presupuestos y stock.",
    section: "Producción",
    icon: Box,
    keywords: ["fabricación", "despiece", "corte", "perfil", "lona", "stock", "presupuesto"],
    steps: [
      "Una línea de presupuesto puede estar relacionada con el artículo, una característica, sus medidas y procesos derivados.",
      "El modelo de fabricación contempla líneas de corte de perfil y líneas de corte de lona vinculadas a presupuesto y línea de presupuesto.",
      "El despiece puede actuar como estructura intermedia de fabricación y relacionarse con las líneas de corte.",
      "Los movimientos de almacén pueden quedar relacionados con líneas de corte y líneas de presupuesto, manteniendo trazabilidad del material.",
      "Para investigar una discrepancia de fabricación, sigue el origen desde presupuesto → línea → despiece/corte → movimiento/stock.",
    ],
    warnings: ["La ayuda describe las relaciones funcionales identificadas en el modelo heredado; no sustituye una instrucción específica de fabricación cuando la regla de negocio sea particular de un producto."],
  },
  {
    id: "informes",
    title: "Informes",
    summary: "Área reservada para cuadros de mando e informes de negocio; aún no está implementada.",
    section: "Informes",
    icon: ClipboardList,
    route: "/informes",
    keywords: ["informe", "cuadro de mando", "dashboard", "estadística", "en desarrollo"],
    status: "En desarrollo",
    steps: [
      "La sección Informes existe en la navegación pero todavía no tiene contenido propio en ONIN Web.",
      "El resumen de negocio (presupuestado, pedidos en curso, entregas próximas, montajes programados, stock bajo mínimo) ya está disponible en Inicio.",
      "Para el impacto de un cliente concreto, consulta su apartado Documentos en la ficha de cliente.",
    ],
  },
  {
    id: "facturacion-albaranes",
    title: "Facturación: albaranes",
    summary: "Consulta los documentos de entrega, generados desde el pedido fabricado y, si aplica, desde su montaje.",
    section: "Facturación",
    icon: ReceiptText,
    route: "/facturacion/albaranes",
    keywords: ["albarán", "entrega", "facturación", "documento", "pedido", "montaje", "enviado", "entregado"],
    status: "Disponible",
    steps: [
      "El albarán no se crea desde esta pantalla: se genera desde el pedido correspondiente (tarjeta Albarán), una vez fabricado.",
      "Si el pedido ya tiene un montaje completado, el albarán se genera con esa instalación vinculada y copia las líneas reales del pedido.",
      "Entra en Facturación > Albaranes para consultar los ya generados; búscalos por código de albarán, pedido, cliente o transportista, y filtra por estado.",
      "Abre un albarán para consultarlo, imprimirlo o descargarlo en PDF, y para avanzar su estado: Preparado → Enviado → Entregado.",
    ],
    tips: ["Un pedido solo puede tener un albarán activo; si ya existe, el pedido lo muestra directamente en vez de ofrecer generar uno nuevo."],
  },
  {
    id: "facturacion-facturas",
    title: "Facturación: facturas y cobros",
    summary: "Consulta facturas y revisa la información de cobros registrada.",
    section: "Facturación",
    icon: CreditCard,
    route: "/facturacion/facturas",
    keywords: ["factura", "cobro", "facturación", "importe", "cliente", "vencido", "plazo", "pendiente", "rectificativa"],
    status: "Disponible",
    steps: [
      "Entra en Facturación > Facturas para consultar las facturas disponibles; se generan desde un pedido fabricado.",
      "Abre una factura para revisar su detalle, líneas y plazos de cobro.",
      "En Facturación > Cobros consulta los plazos pendientes de cobro de todas las facturas; los vencidos se resaltan y se cuentan aparte.",
      "Marca un plazo como cobrado indicando importe, fecha y notas; puedes deshacerlo si te equivocas.",
      "Si un importe no coincide con el documento origen, revisa la trazabilidad comercial antes de corregir datos manualmente.",
    ],
    tips: ["El apartado Documentos de cada cliente también muestra sus cobros pendientes, sin tener que buscarlos en el listado general de Cobros."],
  },
  {
    id: "config-usuarios",
    title: "Configuración: usuarios",
    summary: "Gestiona los usuarios de ONIN y revisa quién puede acceder a la aplicación.",
    section: "Configuración",
    icon: Users,
    route: "/configuracion/usuarios",
    keywords: ["usuario", "usuarios", "acceso", "seguridad", "administrador", "rol", "permiso", "empresa", "oficina", "taller", "confección", "montador"],
    status: "Disponible",
    steps: [
      "Entra en Configuración > Usuarios (solo visible para administradores).",
      "Cada usuario tiene un rol: Administrador, Oficina, Taller, Confección o Montador.",
      "En Empresas asignadas defines a qué empresas puede acceder ese usuario y entre cuáles puede cambiar.",
      "Un Administrador ve siempre todos los módulos; para el resto de roles, en Permisos por módulo marcas exactamente qué secciones del menú puede ver ese usuario.",
      "Evita compartir credenciales entre personas: cada acción queda asociada al usuario autenticado.",
    ],
    warnings: ["La seguridad de datos por empresa debe respetarse en todos los módulos. No utilices la ayuda como autorización para acceder a datos de otra empresa."],
  },
  {
    id: "config-medidas",
    title: "Configuración: tipos de medida",
    summary: "Mantén las configuraciones de tipos de medida utilizadas por la aplicación.",
    section: "Configuración",
    icon: Ruler,
    route: "/configuracion/tipos-medida",
    keywords: ["tipo de medida", "unidad", "dimensiones", "medida", "configuración"],
    status: "Disponible",
    steps: [
      "Entra en Configuración > Tipos de medida.",
      "Consulta o modifica los tipos disponibles según las operaciones permitidas por la pantalla.",
      "Antes de cambiar un tipo de medida, comprueba qué artículos y familias pueden depender de él.",
      "Una configuración de medidas puede repercutir en presupuestos, existencias, reservas y procesos de fabricación.",
    ],
  },
  {
    id: "config-pagos",
    title: "Configuración: formas y condiciones de pago",
    summary: "Centraliza la configuración comercial utilizada para las condiciones de pago.",
    section: "Configuración",
    icon: CreditCard,
    route: "/configuracion/formas-pago",
    keywords: ["forma de pago", "condición de pago", "pago", "configuración"],
    status: "Disponible",
    steps: [
      "Entra en Configuración > Formas de pago para consultar o mantener las formas disponibles.",
      "Utiliza Configuración > Condiciones de pago para mantener las condiciones correspondientes.",
      "Antes de cambiar una condición utilizada por documentos existentes, revisa el impacto comercial de la modificación.",
    ],
  },
  {
    id: "seguridad-multempresa",
    title: "Seguridad y separación por empresa",
    summary: "Buenas prácticas para trabajar con datos cuando ONIN tiene más de una empresa.",
    section: "Configuración",
    icon: Info,
    keywords: ["empresa", "multempresa", "seguridad", "RLS", "datos", "acceso"],
    steps: [
      "Comprueba la empresa activa antes de consultar o modificar información cuando el módulo esté sujeto a separación por empresa.",
      "No asumas que todos los módulos tienen el mismo nivel de separación: la arquitectura debe definir explícitamente el alcance de cada dato.",
      "Las políticas de seguridad de base de datos deben impedir que un usuario consulte o modifique datos de otra empresa aunque intente acceder directamente a una ruta.",
      "Si detectas datos cruzados entre empresas, detén la operación y repórtalo como incidencia de seguridad.",
    ],
    warnings: ["La documentación funcional no sustituye las políticas RLS ni los controles de autorización del backend. Nunca debe utilizarse para saltarse permisos."],
  },
  {
    id: "errores-generales",
    title: "Qué hacer cuando algo no funciona",
    summary: "Procedimiento recomendado para diagnosticar incidencias sin provocar cambios innecesarios.",
    section: "Primeros pasos",
    icon: CircleHelp,
    keywords: ["error", "problema", "incidencia", "fallo", "no funciona", "diagnóstico"],
    steps: [
      "Anota el módulo, pantalla y operación exacta que estabas realizando.",
      "Comprueba si el problema se reproduce con los mismos datos y si afecta a otros usuarios.",
      "No repitas una operación de guardado muchas veces si no sabes si la primera se completó; primero comprueba el listado o detalle.",
      "Si el problema afecta a stock, presupuesto o fabricación, conserva el identificador del documento y de la línea para poder seguir la trazabilidad.",
      "Para incidencias de seguridad o datos cruzados entre empresas, no continúes probando sobre datos reales y avisa al administrador.",
    ],
    tips: ["Una buena incidencia debe incluir: empresa, usuario, módulo, documento, pasos para reproducir, resultado esperado y resultado obtenido."],
  },
];

const sectionOrder = ["Primeros pasos", "Ventas", "Compras", "Almacén", "Gestión", "Facturación", "Producción", "Informes", "Configuración"];

export function HelpCenter() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => {
    if (!normalized) return articles;
    return articles.filter((article) => {
      const haystack = [article.title, article.summary, article.section, article.route ?? "", ...article.keywords, ...article.steps, ...(article.tips ?? []), ...(article.warnings ?? [])].join(" ").toLocaleLowerCase();
      return haystack.includes(normalized);
    });
  }, [normalized]);
  const groups = sectionOrder.map((section) => ({ section, items: filtered.filter((article) => article.section === section) })).filter((group) => group.items.length);
  const article = selected ? articles.find((item) => item.id === selected) ?? null : null;

  return <div className="help-page">
    <div className="help-hero">
      <div className="help-hero-copy">
        <span className="help-eyebrow"><CircleHelp size={15}/> CENTRO DE AYUDA ONIN</span>
        <h1>Aprende a trabajar con ONIN</h1>
        <p>Guías funcionales basadas en la navegación y el modelo actual de ONIN Web, con recomendaciones para trabajar de forma segura.</p>
        <label className="help-search"><Search size={19}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca una tarea, módulo, artículo, presupuesto, stock, OTD…" aria-label="Buscar en la ayuda" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda"><X size={17}/></button>}</label>
      </div>
    </div>

    {article ? <article className="help-article">
      <button className="help-back" type="button" onClick={() => setSelected(null)}>← Volver al Centro de Ayuda</button>
      <div className="help-article-icon"><article.icon size={24}/></div>
      <div className="help-article-meta"><span className="help-article-section">{article.section}</span>{article.status && <span className={`help-status ${article.status === "Disponible" ? "is-ready" : "is-development"}`}>{article.status}</span>}</div>
      <h2>{article.title}</h2>
      <p className="help-article-summary">{article.summary}</p>
      {article.route && <div className="help-route"><ArrowRight size={15}/><span>Ruta en ONIN: <strong>{article.route}</strong></span></div>}
      <div className="help-article-block"><h3>Cómo hacerlo</h3><div className="help-steps">{article.steps.map((step, index) => <div className="help-step" key={step}><span>{index + 1}</span><p>{step}</p></div>)}</div></div>
      {article.tips?.length ? <div className="help-note help-note-tip"><Info size={17}/><div><strong>Recomendaciones</strong>{article.tips.map((tip) => <p key={tip}>{tip}</p>)}</div></div> : null}
      {article.warnings?.length ? <div className="help-note help-note-warning"><Info size={17}/><div><strong>Importante</strong>{article.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div> : null}
    </article> : <>
      <div className="help-welcome"><div><strong>Documentación de ONIN</strong><span>{filtered.length} {filtered.length === 1 ? "guía disponible" : "guías disponibles"} · busca por módulo o tarea</span></div><BookOpen size={23}/></div>
      {groups.length ? <div className="help-groups">{groups.map((group) => <section className="help-group" key={group.section}><div className="help-group-head"><h2>{group.section}</h2><span>{group.items.length}</span></div><div className="help-cards">{group.items.map((item) => { const Icon = item.icon; return <button className="help-card" key={item.id} type="button" onClick={() => setSelected(item.id)}><span className="help-card-icon"><Icon size={19}/></span><span className="help-card-copy"><strong>{item.title}</strong><small>{item.summary}</small>{item.status && <em className={item.status === "Disponible" ? "is-ready" : "is-development"}>{item.status}</em>}</span><ChevronRight size={18} className="help-card-arrow"/></button>; })}</div></section>)}</div> : <div className="help-empty"><CircleHelp size={32}/><h2>No encontramos esa guía</h2><p>Prueba con «cliente», «presupuesto», «stock», «medición», «OTD» o «seguridad».</p></div>}
    </>}

    <div className="help-footer"><CircleHelp size={18}/><span>¿No encuentras lo que buscas? Registra la incidencia con módulo, documento, pasos para reproducir y resultado esperado. La documentación debe crecer junto con ONIN.</span></div>
  </div>;
}
