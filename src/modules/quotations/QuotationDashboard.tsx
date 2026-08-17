import { useEffect, useState } from 'react';
import { FileText, CircleCheck, Clock3, ReceiptText } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { getQuotationDashboardMetrics, type QuotationDashboardMetrics } from '../../services/sales/quotationDashboardRepository';
import './quotation.css';

const money=(n:number)=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0});

export function QuotationDashboard(){
  const [metrics,setMetrics]=useState<QuotationDashboardMetrics|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;void getQuotationDashboardMetrics().then(data=>{if(active)setMetrics(data);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'No se pudieron cargar los indicadores de presupuestos.');});return()=>{active=false;};},[]);
  if(error)return <div className="inline-error quotation-dashboard-error">{error}</div>;
  const acceptance=metrics&&metrics.total?Math.round((metrics.accepted/metrics.total)*100):0;
  return <section className="quotation-dashboard" aria-label="Indicadores de presupuestos">
    <div className="quotation-dashboard-head"><div><div className="eyebrow">PRESUPUESTOS</div><h2>Actividad comercial</h2><p>Una lectura rápida del estado de tu cartera de presupuestos.</p></div></div>
    <div className="quotation-kpi-grid">
      <div className="quotation-kpi"><div className="quotation-kpi-icon"><ReceiptText size={18}/></div><div><span>Sin factura asociada</span><strong>{metrics?.withoutInvoice??'—'}</strong><small>Actualmente no existe vínculo con facturas en el modelo.</small></div></div>
      <NavLink to="/ventas/presupuestos" className="quotation-kpi quotation-kpi-link" aria-label="Ver listado de presupuestos">
        <div className="quotation-kpi-icon"><FileText size={18}/></div><div><span>Presupuestado · últimos 12 meses</span><strong>{metrics?money(metrics.lastYearAmount):'—'}</strong><small>Importe total de los presupuestos emitidos en el último año.</small></div>
      </NavLink>
      <div className="quotation-kpi"><div className="quotation-kpi-icon"><CircleCheck size={18}/></div><div><span>Aceptados</span><strong>{metrics?.accepted??'—'}</strong><small>{metrics?`${acceptance}% del total de presupuestos`: '—'}</small></div></div>
      <div className="quotation-kpi"><div className="quotation-kpi-icon"><Clock3 size={18}/></div><div><span>Pendientes de respuesta</span><strong>{metrics?.pending??'—'}</strong><small>Borradores y presupuestos enviados.</small></div></div>
    </div>
  </section>;
}
