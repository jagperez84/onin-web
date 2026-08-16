import { useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Menu, Search, Home, LogOut } from 'lucide-react';
import { navSections } from './routes';
import { PagePlaceholder } from '../components/ui/PagePlaceholder';
import { CoreStatus } from './CoreStatus';
import { SectionNavBehavior } from '../components/ui/SectionNavBehavior';
import { CustomerList } from '../modules/customers/CustomerList';
import { CustomerDetail } from '../modules/customers/CustomerDetail';
import { CustomerCreate } from '../modules/customers/CustomerCreate';
import { ProductCatalogV1 } from '../modules/catalog/ProductCatalogV1';
import { ProductV2 } from '../modules/products/ProductV2';
import { ProductDraftCreate } from '../modules/products/ProductDraftCreate';
import { ProductCharacteristics } from '../modules/products/ProductCharacteristics';
import { ProductProfile } from '../modules/products/ProductProfile';
import { WarehouseList, WarehouseDetail } from '../modules/warehouse/WarehouseList';
import { StockList } from '../modules/warehouse/StockList';
import { StockMovements } from '../modules/warehouse/StockMovements';
import { StockTransfers } from '../modules/warehouse/StockTransfers';
import { StockReservations } from '../modules/warehouse/StockReservations';
import { Measurements } from '../modules/measurements/Measurements';
import { MeasurementCreate } from '../modules/measurements/MeasurementCreate';
import { LoginPage } from '../components/ui/LoginPage';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { useAuth } from '../auth/AuthContext';

function Shell(){
  const location=useLocation();
  const { user, signOut }=useAuth();
  const [mobileOpen,setMobileOpen]=useState(false);
  const current=useMemo(()=>navSections.flatMap(s=>s.items).find(i=>location.pathname===i.to),[location.pathname]);
  const title=current?.label
    ?? (location.pathname.startsWith('/ventas/articulos')?'Artículos'
      :location.pathname.startsWith('/gestion/mediciones')?'Mediciones'
      :location.pathname.startsWith('/almacen/')?'Almacén':'Inicio');
  async function logout(){await signOut();}

  return <div className="app-shell">
    <SectionNavBehavior />
    <aside className={`sidebar ${mobileOpen?'is-open':''}`} aria-label="Navegación principal">
      <div className="brand">ONIN</div>
      <NavLink to="/" className="home-link" onClick={()=>setMobileOpen(false)}><Home size={16}/>Inicio</NavLink>
      <div className="nav-scroll">
        {navSections.map(section=><div key={section.label} className="nav-section">
          <div className="nav-section-title">{section.label}</div>
          {section.items.map(item=><NavLink key={item.to} to={item.to} className={({isActive})=>`nav-link ${isActive?'active':''}`} onClick={()=>setMobileOpen(false)}>{item.icon}<span>{item.label}</span></NavLink>)}
        </div>)}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-user" title={user?.email??''}>{user?.email??'Usuario autenticado'}</div>
        <button className="logout" onClick={logout}><LogOut size={16}/>Cerrar sesión</button>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <button className="mobile-menu" onClick={()=>setMobileOpen(v=>!v)} aria-label="Abrir menú"><Menu size={20}/></button>
        <div className="crumb"><NavLink to="/">Inicio</NavLink><span>/</span><strong>{title}</strong></div>
        <div className="topbar-spacer"/>
        <div className="global-search"><Search size={16}/><input placeholder="Buscar..." aria-label="Buscar en ONIN"/></div>
        <button className="avatar" title={user?.email??'Usuario'}>{(user?.email?.[0]??'U').toUpperCase()}</button>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<HomeView/>}/>
          <Route path="/ventas/clientes" element={<CustomerList/>}/>
          <Route path="/ventas/clientes/nuevo" element={<CustomerCreate/>}/>
          <Route path="/ventas/clientes/:id" element={<CustomerDetail/>}/>
          <Route path="/ventas/articulos" element={<ProductV2/>}/>
          <Route path="/ventas/articulos/nuevo" element={<ProductDraftCreate/>}/>
          <Route path="/ventas/articulos/catalogos" element={<ProductCatalogV1/>}/>
          <Route path="/ventas/articulos/:id/caracteristicas" element={<ProductCharacteristics/>}/>
          <Route path="/ventas/articulos/:id" element={<ProductProfile/>}/>
          <Route path="/gestion/mediciones" element={<Measurements/>}/>
          <Route path="/gestion/mediciones/nuevo" element={<MeasurementCreate/>}/>
          <Route path="/gestion/mediciones/:id" element={<Measurements/>}/>
          <Route path="/almacen/almacenes" element={<WarehouseList/>}/>
          <Route path="/almacen/almacenes/nuevo" element={<WarehouseDetail/>}/>
          <Route path="/almacen/almacenes/:id" element={<WarehouseDetail/>}/>
          <Route path="/almacen/existencias" element={<StockList/>}/>
          <Route path="/almacen/movimientos" element={<StockMovements/>}/>
          <Route path="/almacen/movimientos/nuevo" element={<StockMovements/>}/>
          <Route path="/almacen/transferencias" element={<StockTransfers/>}/>
          <Route path="/almacen/reservas" element={<StockReservations/>}/>
          {navSections.flatMap(s=>s.items).filter(item=>!['/ventas/clientes','/ventas/articulos','/gestion/mediciones','/almacen/almacenes','/almacen/existencias','/almacen/movimientos','/almacen/transferencias','/almacen/reservas'].includes(item.to)).map(item=><Route key={item.to} path={item.to} element={<PagePlaceholder title={item.label}/>}/>)}
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </main>
    </div>
    {mobileOpen&&<button className="scrim" onClick={()=>setMobileOpen(false)} aria-label="Cerrar menú"/>}
  </div>;
}

function HomeView(){
  return <div className="home-page">
    <div className="page-head"><div><div className="eyebrow">INICIO</div><h1>Resumen de gestión</h1><p>Acceso rápido a las áreas principales de ONIN.</p></div></div>
    <div className="metric-grid">
      {[['Clientes','Gestión de clientes','/ventas/clientes'],['Artículos','Catálogo de productos','/ventas/articulos'],['Presupuestos','Gestor de presupuestos','/ventas/presupuestos'],['Mediciones','Gestión de mediciones','/gestion/mediciones']].map(([t,d,to])=><NavLink key={t} to={to} className="metric-card"><span className="metric-title">{t}</span><span className="metric-desc">{d}</span><span className="metric-arrow">→</span></NavLink>)}
    </div>
    <CoreStatus/>
    <div className="panel"><div className="panel-head"><div><h2>Arquitectura base</h2><p>Fundación técnica con autenticación preparada.</p></div><span className="status-pill">FASE 2</span></div><div className="architecture"><span>React + TypeScript</span><span>Router</span><span>Supabase Auth</span><span>Repository layer</span><span>Design System</span></div></div>
  </div>;
}

export default function App(){return <Routes><Route path="/login" element={<LoginPage/>}/><Route path="/*" element={<ProtectedRoute><Shell/></ProtectedRoute>}/></Routes>;}
