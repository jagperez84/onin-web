import { useMemo, useState } from "react";
import { BookOpen, ChevronRight, CircleHelp, FileText, Factory, Package, Ruler, Search, Settings, ShoppingCart, Users, X } from "lucide-react";
import "./help.css";

type HelpArticle = {
  id: string;
  title: string;
  summary: string;
  section: string;
  icon: typeof BookOpen;
  steps: string[];
};

const articles: HelpArticle[] = [
  { id: "inicio", title: "Primeros pasos en ONIN", summary: "Conoce la navegación, los accesos directos y la estructura general de la aplicación.", section: "Primeros pasos", icon: BookOpen, steps: ["Utiliza el menú lateral para acceder a cada área de ONIN.", "Desde Inicio encontrarás accesos rápidos a las áreas que utilizas con más frecuencia.", "El buscador superior está preparado como punto de acceso rápido a la información de la aplicación."] },
  { id: "clientes", title: "Gestionar clientes", summary: "Consulta, crea y actualiza la información comercial de tus clientes.", section: "Ventas", icon: Users, steps: ["Entra en Ventas > Clientes.", "Utiliza la búsqueda para localizar un cliente y abre su ficha.", "Para crear uno nuevo, selecciona Nuevo y completa los datos solicitados."] },
  { id: "articulos", title: "Artículos y características", summary: "Gestiona el catálogo, las características y la información de los artículos.", section: "Ventas", icon: Package, steps: ["Entra en Ventas > Artículos para consultar el catálogo.", "Abre un artículo para revisar su información y configuración.", "Las características permiten trabajar con variantes como colores y otros atributos definidos para el artículo."] },
  { id: "presupuestos", title: "Crear un presupuesto", summary: "Prepara presupuestos con líneas de artículos, cantidades, medidas, descuentos e importes.", section: "Ventas", icon: FileText, steps: ["Entra en Ventas > Presupuestos y selecciona Nuevo.", "Añade las líneas de artículos e indica cantidades y medidas cuando corresponda.", "Revisa descuentos, IVA e importe total antes de guardar el presupuesto."] },
  { id: "almacen", title: "Consultar existencias y movimientos", summary: "Controla el stock, los movimientos, las transferencias y las reservas.", section: "Almacén", icon: Package, steps: ["Entra en Almacén > Existencias para consultar el stock disponible.", "Utiliza Movimientos para revisar entradas y salidas.", "Las Transferencias permiten gestionar movimientos entre almacenes y Reservas consultar material reservado."] },
  { id: "mediciones", title: "Trabajar con mediciones", summary: "Registra y consulta las mediciones asociadas a trabajos y clientes.", section: "Gestión", icon: Ruler, steps: ["Entra en Gestión > Mediciones.", "Crea una medición nueva o abre una existente para consultar sus datos.", "Las mediciones pueden quedar asignadas para su revisión desde los accesos de Inicio."] },
  { id: "produccion", title: "Producción y OTD", summary: "Consulta hojas de trabajo y gestiona las reglas de producción OTD.", section: "Producción", icon: Factory, steps: ["En Producción > Hojas de trabajo puedes consultar y abrir las hojas disponibles.", "En Producción > OTD se gestionan las configuraciones y pruebas de las reglas OTD.", "Antes de modificar una regla OTD, revisa su configuración y utiliza la opción de prueba cuando esté disponible."] },
  { id: "facturacion", title: "Facturación y cobros", summary: "Consulta albaranes, facturas y cobros desde el área de Facturación.", section: "Facturación", icon: FileText, steps: ["Entra en Facturación > Albaranes para consultar los documentos de entrega.", "Utiliza Facturas para consultar el detalle de las facturas.", "En Cobros puedes revisar la información relacionada con los cobros registrados."] },
  { id: "configuracion", title: "Configuración y usuarios", summary: "Administra usuarios, tipos de medida y condiciones de pago.", section: "Configuración", icon: Settings, steps: ["En Configuración > Usuarios puedes consultar y gestionar los usuarios de ONIN.", "Tipos de medida permite mantener las unidades y configuraciones de medida utilizadas por la aplicación.", "Formas de pago y Condiciones de pago centralizan la configuración comercial correspondiente."] },
  { id: "compras", title: "Compras", summary: "Accede a proveedores y documentos de compra desde el menú de Compras.", section: "Compras", icon: ShoppingCart, steps: ["Utiliza Compras > Proveedores para acceder a la gestión de proveedores.", "Pedidos de compra y Albaranes de compra están disponibles desde el mismo bloque de navegación.", "Si una funcionalidad todavía no está disponible en tu versión, consulta con el administrador de ONIN."] },
];

const sectionOrder = ["Primeros pasos", "Ventas", "Compras", "Almacén", "Gestión", "Facturación", "Producción", "Configuración"];

export function HelpCenter() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => normalized ? articles.filter(a => `${a.title} ${a.summary} ${a.section} ${a.steps.join(" ")}`.toLocaleLowerCase().includes(normalized)) : articles, [normalized]);
  const groups = sectionOrder.map(section => ({ section, items: filtered.filter(a => a.section === section) })).filter(g => g.items.length);
  const article = selected ? articles.find(a => a.id === selected) ?? null : null;

  return <div className="help-page">
    <div className="help-hero">
      <div className="help-hero-copy">
        <span className="help-eyebrow"><CircleHelp size={15}/> CENTRO DE AYUDA</span>
        <h1>¿En qué podemos ayudarte?</h1>
        <p>Guías rápidas para aprender a utilizar ONIN y resolver las tareas más habituales.</p>
        <label className="help-search"><Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar una guía, módulo o tarea..." aria-label="Buscar en la ayuda" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda"><X size={17}/></button>}</label>
      </div>
    </div>

    {article ? <article className="help-article">
      <button className="help-back" type="button" onClick={() => setSelected(null)}>← Volver a todas las guías</button>
      <div className="help-article-icon"><article.icon size={24}/></div>
      <span className="help-article-section">{article.section}</span>
      <h2>{article.title}</h2>
      <p className="help-article-summary">{article.summary}</p>
      <div className="help-steps">{article.steps.map((step, i) => <div className="help-step" key={step}><span>{i + 1}</span><p>{step}</p></div>)}</div>
    </article> : <>
      <div className="help-welcome"><div><strong>Encuentra tu guía</strong><span>{filtered.length} {filtered.length === 1 ? "guía disponible" : "guías disponibles"}</span></div><BookOpen size={23}/></div>
      {groups.length ? <div className="help-groups">{groups.map(group => <section className="help-group" key={group.section}><div className="help-group-head"><h2>{group.section}</h2><span>{group.items.length}</span></div><div className="help-cards">{group.items.map(a => { const Icon = a.icon; return <button className="help-card" key={a.id} type="button" onClick={() => setSelected(a.id)}><span className="help-card-icon"><Icon size={19}/></span><span className="help-card-copy"><strong>{a.title}</strong><small>{a.summary}</small></span><ChevronRight size={18} className="help-card-arrow"/></button>; })}</div></section>)}</div> : <div className="help-empty"><CircleHelp size={32}/><h2>No encontramos esa guía</h2><p>Prueba con otro término, por ejemplo «presupuesto», «stock», «OTD» o «cliente».</p></div>}
    </>}

    <div className="help-footer"><CircleHelp size={18}/><span>¿No encuentras lo que buscas? Contacta con el administrador de ONIN para solicitar una nueva guía.</span></div>
  </div>;
}
