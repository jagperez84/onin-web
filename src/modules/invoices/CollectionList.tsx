import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Wallet, CheckCircle2, Undo2, X } from 'lucide-react';
import { listCollections, type CollectionRow } from '../../services/sales/collectionService';
import { markInstallmentCollected, markInstallmentPending, type InstallmentStatus } from '../../services/sales/invoiceService';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import { confirmDialog } from '../../components/ui/ConfirmDialog';
import '../orders/sales-order.css';

const money=(n:number)=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR'});
const date=(v:string)=>new Date(`${v}T00:00:00`).toLocaleDateString('es-ES');

function urgency(row:CollectionRow):'overdue'|'soon'|null{
 if(row.status!=='PENDING')return null;
 const today=new Date();today.setHours(0,0,0,0);
 const due=new Date(`${row.dueDate}T00:00:00`);
 const diffDays=Math.floor((due.getTime()-today.getTime())/86400000);
 if(diffDays<0)return 'overdue';
 if(diffDays<=3)return 'soon';
 return null;
}

function CollectModal({row,onClose,onDone}:{row:CollectionRow;onClose:()=>void;onDone:()=>void}){
 const [amount,setAmount]=useState(String(row.amount));
 const [collectedDate,setCollectedDate]=useState(new Date().toISOString().slice(0,10));
 const [notes,setNotes]=useState('');
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');

 async function submit(){
  const value=Number(amount);
  if(!value){setError('Indica el importe cobrado.');return;}
  setSaving(true);setError('');
  try{await markInstallmentCollected(row.id,{collected_amount:value,collected_date:collectedDate,collected_notes:notes||null});onDone();}
  catch(e){setError(e instanceof CoreRepositoryError?e.message:'No se pudo registrar el cobro.');}
  finally{setSaving(false);}
 }

 return <div className="modal-backdrop" onClick={onClose}>
  <div className="modal-card sm" onClick={e=>e.stopPropagation()}>
   <div className="modal-header">
    <div className="modal-title-wrap">
     <span className="modal-icon-badge success"><CheckCircle2 size={18}/></span>
     <div><h3>Marcar plazo como cobrado</h3><p>{row.invoiceCode} · {row.customerName||'—'} · plazo {row.sequence}</p></div>
    </div>
    <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar"><X size={18}/></button>
   </div>
   <div className="modal-body">
    {error&&<div className="inline-error">{error}</div>}
    <div className="form-group">
     <label>Importe cobrado</label>
     <input type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/>
    </div>
    <div className="form-group">
     <label>Fecha de cobro</label>
     <input type="date" value={collectedDate} onChange={e=>setCollectedDate(e.target.value)}/>
    </div>
    <div className="form-group">
     <label>Notas <span className="label-hint">(opcional)</span></label>
     <textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Transferencia, efectivo, cobro parcial…"/>
    </div>
   </div>
   <div className="modal-actions-footer">
    <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
    <button type="button" className="primary-button" disabled={saving} onClick={submit}>{saving?'Guardando…':'Marcar cobrado'}</button>
   </div>
  </div>
 </div>;
}

export function CollectionList(){
 const [rows,setRows]=useState<CollectionRow[]>([]);
 const [search,setSearch]=useState('');
 const [status,setStatus]=useState<InstallmentStatus|'ALL'>('PENDING');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [collectRow,setCollectRow]=useState<CollectionRow|null>(null);

 async function load(){
  try{setLoading(true);setError('');setRows(await listCollections({status,search}));}
  catch(e){setError(e instanceof CoreRepositoryError?e.message:'No se pudieron cargar los cobros.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{const t=setTimeout(()=>void load(),200);return()=>clearTimeout(t);},[search,status]);

 async function undo(row:CollectionRow){
  const ok=await confirmDialog({title:'Deshacer cobro',message:`Se marcará de nuevo como pendiente el plazo ${row.sequence} de ${row.invoiceCode}.`,danger:true,confirmLabel:'Deshacer'});
  if(!ok)return;
  try{await markInstallmentPending(row.id);await load();}
  catch(e){setError(e instanceof CoreRepositoryError?e.message:'No se pudo deshacer el cobro.');}
 }

 const pendingTotal=useMemo(()=>rows.filter(r=>r.status==='PENDING').reduce((sum,r)=>sum+r.amount,0),[rows]);
 const overdueCount=useMemo(()=>rows.filter(r=>urgency(r)==='overdue').length,[rows]);

 return <div className="module-page sales-order-page">
  <div className="sales-order-head">
   <div>
    <div className="eyebrow">FACTURACIÓN / COBROS</div>
    <div className="sales-order-title-row"><h1>Cobros</h1><span className="sales-order-review-badge"><Wallet size={14}/> Seguimiento de plazos de pago</span></div>
    <p>Gestión interna de lo que queda por cobrar — no sustituye a la factura ni a su calendario legal.</p>
   </div>
  </div>
  <div className="sales-order-toolbar">
   <div className="search-box sales-order-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por factura o cliente…"/></div>
   <select value={status} onChange={e=>setStatus(e.target.value as InstallmentStatus|'ALL')}>
    <option value="PENDING">Pendientes</option>
    <option value="COLLECTED">Cobrados</option>
    <option value="ALL">Todos</option>
   </select>
   <span className="sales-order-count">{rows.length} plazo{rows.length===1?'':'s'}{status!=='COLLECTED'&&<> · {money(pendingTotal)} pendiente{overdueCount>0&&<span className="installation-overdue"> · {overdueCount} vencido{overdueCount===1?'':'s'}</span>}</>}</span>
  </div>
  {error&&<div className="inline-error">{error}</div>}
  <div className="sales-order-table-card">
   <div className="sales-order-table-wrap"><table>
    <thead><tr><th>Vencimiento</th><th>Factura</th><th>Cliente</th><th>Plazo</th><th className="numeric">Importe</th><th>Estado</th><th></th></tr></thead>
    <tbody>
     {loading?<tr><td colSpan={7} className="sales-order-empty">Cargando cobros…</td></tr>:rows.length===0?<tr><td colSpan={7} className="sales-order-empty">No hay plazos que mostrar.</td></tr>:rows.map(r=>{
      const u=urgency(r);
      return <tr key={r.id} className={u?`sales-order-row-${u}`:''}>
       <td className={u?`sales-order-delivery-date ${u}`:'sales-order-delivery-date'}>{date(r.dueDate)}</td>
       <td><Link className="sales-order-code" to={`/facturacion/facturas/${r.invoiceId}`}>{r.invoiceCode}</Link></td>
       <td><strong>{r.customerName||'—'}</strong></td>
       <td>{r.sequence} ({r.percentage}%)</td>
       <td className="numeric sales-order-list-total">{money(r.amount)}</td>
       <td>
        <span className={`status-pill ${r.status==='COLLECTED'?'success':''}`}>{r.status==='COLLECTED'?'Cobrado':'Pendiente'}</span>
        {r.status==='COLLECTED'&&r.collectedDate&&<div style={{fontSize:'11px',marginTop:'3px',color:'var(--muted)'}}>{date(r.collectedDate)}{r.collectedAmount!=null?` · ${money(r.collectedAmount)}`:''}</div>}
       </td>
       <td className="sales-order-list-action">
        {r.status==='PENDING'
         ?<button type="button" className="icon-link" title="Marcar cobrado" onClick={()=>setCollectRow(r)}><CheckCircle2 size={16}/></button>
         :<button type="button" className="icon-link" title="Deshacer cobro" onClick={()=>undo(r)}><Undo2 size={16}/></button>}
       </td>
      </tr>;
     })}
    </tbody>
   </table></div>
  </div>
  {collectRow&&<CollectModal row={collectRow} onClose={()=>setCollectRow(null)} onDone={()=>{setCollectRow(null);void load();}}/>}
 </div>;
}
