import type { ReactNode } from 'react';
import { Users, Package, FileText, Warehouse, Ruler, Hammer, ReceiptText, ShoppingCart, Factory, Settings, BarChart3 } from 'lucide-react';

export type NavItem = { label:string; to:string; icon?:ReactNode };
export type NavSection = { label:string; items:NavItem[] };

export const navSections: NavSection[] = [
  { label:'Ventas', items:[
    {label:'Clientes',to:'/ventas/clientes',icon:<Users size={16}/>},
    {label:'Artículos',to:'/ventas/articulos',icon:<Package size={16}/>},
    {label:'Presupuestos',to:'/ventas/presupuestos',icon:<FileText size={16}/>},
  ]},
  { label:'Compras', items:[
    {label:'Proveedores',to:'/compras/proveedores',icon:<ShoppingCart size={16}/>},
    {label:'Pedidos de compra',to:'/compras/pedidos',icon:<FileText size={16}/>},
    {label:'Albaranes de compra',to:'/compras/albaranes',icon:<FileText size={16}/>},
  ]},
  { label:'Almacén', items:[
    {label:'Almacenes',to:'/almacen/almacenes',icon:<Warehouse size={16}/>},
    {label:'Existencias',to:'/almacen/existencias',icon:<Package size={16}/>},
    {label:'Movimientos',to:'/almacen/movimientos',icon:<ReceiptText size={16}/>},
  ]},
  { label:'Gestión', items:[
    {label:'Mediciones',to:'/gestion/mediciones',icon:<Ruler size={16}/>},
    {label:'Montajes',to:'/gestion/montajes',icon:<Hammer size={16}/>},
    {label:'CRM',to:'/gestion/crm',icon:<Users size={16}/>},
  ]},
  { label:'Facturación', items:[
    {label:'Albaranes',to:'/facturacion/albaranes',icon:<ReceiptText size={16}/>},
    {label:'Facturas',to:'/facturacion/facturas',icon:<FileText size={16}/>},
    {label:'Cobros',to:'/facturacion/cobros',icon:<ReceiptText size={16}/>},
  ]},
  { label:'Producción', items:[
    {label:'Hojas de trabajo',to:'/produccion/hojas',icon:<Factory size={16}/>},
    {label:'OTD',to:'/produccion/otd',icon:<Settings size={16}/>},
  ]},
  { label:'Informes', items:[{label:'Informes',to:'/informes',icon:<BarChart3 size={16}/>} ]},
  { label:'Configuración', items:[{label:'Configuración',to:'/configuracion',icon:<Settings size={16}/>} ]},
];
