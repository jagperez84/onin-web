import { ReactNode } from "react";
import { Users, Package, FileText, Warehouse, Ruler, Hammer, ReceiptText, Factory, Settings, Settings2, ArrowRightLeft, CalendarClock, UserCog, SlidersHorizontal, Map, CreditCard, Handshake, HardHat, Layers, Palette, PaintBucket, Wrench, ClipboardCheck, BarChart3 } from "lucide-react";
export type NavItem = { label: string; to: string; icon?: ReactNode };
export type NavSection = { label: string; items: NavItem[] };
export const navSections: NavSection[] = [
 { label:"Ventas", items:[
  {label:"Clientes",to:"/ventas/clientes",icon:<Users size={16}/>},
  {label:"Presupuestos",to:"/ventas/presupuestos",icon:<FileText size={16}/>},
  {label:"Pedidos",to:"/ventas/pedidos",icon:<FileText size={16}/>},
 ]},
 { label:"Catálogo", items:[
  {label:"Artículos",to:"/ventas/articulos",icon:<Package size={16}/>},
  {label:"Familias",to:"/ventas/articulos/familias",icon:<Layers size={16}/>},
  {label:"Características",to:"/ventas/articulos/caracteristicas",icon:<Palette size={16}/>},
  {label:"Maestro de Colores",to:"/ventas/articulos/colores",icon:<PaintBucket size={16}/>},
  {label:"Configuración de artículos",to:"/ventas/articulos/configuracion",icon:<Settings2 size={16}/>},
  {label:"Tipos de medida",to:"/configuracion/tipos-medida",icon:<SlidersHorizontal size={16}/>},
 ]},
 {label:"Almacén",items:[{label:"Almacenes",to:"/almacen/almacenes",icon:<Warehouse size={16}/>},{label:"Existencias",to:"/almacen/existencias",icon:<Package size={16}/>},{label:"Movimientos",to:"/almacen/movimientos",icon:<ReceiptText size={16}/>},{label:"Transferencias",to:"/almacen/transferencias",icon:<ArrowRightLeft size={16}/>},{label:"Reservas",to:"/almacen/reservas",icon:<CalendarClock size={16}/>} ]},
 {label:"Gestión",items:[{label:"Mediciones",to:"/gestion/mediciones",icon:<Ruler size={16}/>},{label:"Montajes",to:"/gestion/montajes",icon:<Hammer size={16}/>},{label:"Cuadrillas",to:"/gestion/cuadrillas",icon:<HardHat size={16}/>},{label:"Mapa",to:"/gestion/mapa",icon:<Map size={16}/>} ]},
 {label:"Facturación",items:[{label:"Albaranes",to:"/facturacion/albaranes",icon:<ReceiptText size={16}/>},{label:"Facturas",to:"/facturacion/facturas",icon:<FileText size={16}/>},{label:"Cobros",to:"/facturacion/cobros",icon:<ReceiptText size={16}/>} ]},
 {label:"Producción",items:[{label:"Control de fabricación",to:"/produccion/fabricacion",icon:<ClipboardCheck size={16}/>},{label:"Hojas de trabajo",to:"/produccion/hojas",icon:<Factory size={16}/>},{label:"OTD",to:"/produccion/otd",icon:<Settings size={16}/>} ]},
 {label:"Informes",items:[{label:"Informes",to:"/informes",icon:<BarChart3 size={16}/>} ]},
 {label:"Configuración",items:[{label:"Usuarios",to:"/configuracion/usuarios",icon:<UserCog size={16}/>},{label:"Tipos de montaje",to:"/configuracion/tipos-montaje",icon:<Wrench size={16}/>},{label:"Formas de pago",to:"/configuracion/formas-pago",icon:<CreditCard size={16}/>},{label:"Condiciones de pago",to:"/configuracion/condiciones-pago",icon:<Handshake size={16}/>} ]},
];
