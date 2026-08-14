import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, PackagePlus, RefreshCw } from 'lucide-react';
import { getActiveCompanies } from '../../services/core/coreRepository';
import { listWarehouses, type Warehouse } from '../../services/warehouse/warehouseRepository';
import { listStockBalances, type StockBalance } from '../../services/warehouse/stockRepository';
import './stock.css';

export function StockList(){
  const [companyId,setCompanyId]=useState<number|null>(null);
  const [warehouses,setWarehouses]=useState<Warehouse[]>([]);
  const [warehouseId,setWarehouseId]=useState<number|undefined>();
  const [search,setSearch]=useState('');
  const [rows,setRows]=useState<StockBalance[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{getActiveCompanies().then(c=>setCompanyId(c[0]?.id??null)).catch(e=>setError(e instanceof Error?e.message:'No se pudo cargar la empresa.'));},[]);
  useEffect(()=>{if(companyId===null)return;Promise.all([listWarehouses(companyId,'','active'),listStockBalances(companyId,warehouseId,search)]).then(([w,s])=>{setWarehouses(w);setRows(s)}).catch(e=>setError(e instanceof Error?e.message:'No se pudieron cargar las existencias.')).finally(()=>setLoading(false));},[companyId,warehouseId]);
  async function load(){if(companyId===null)return;setLoading(true);setError('');try{setRows(await listStockBalances(companyId,warehouseId,search))}catch(e){setError(e instanceof Error?e.message:'No se pudieron cargar las existencias.')}finally{setLoading(false)}}
  const totals=useMemo(()=>rows.reduce((a,r)=>({quantity:a.quantity+Number(r.quantity||0),reserved:a.reserved+Number(r.reserved_quantity||0)}),{quantity:0,reserved:0}),[rows]);

  return <div className="stock-page">
    <div className="page-head"><div><div className="eyebrow">ALMACÉN / EXISTENCIAS</div><h1>Existencias</h1><p>Stock físico, reservado y disponible por almacén y característica.</p></div><div className="stock-page-actions"><button className="stock-button" onClick={()=>void load()}><RefreshCw size={15}/>Actualizar</button><a className="stock-button primary" href="/almacen/movimientos/nuevo"><PackagePlus size={15}/>Nuevo movimiento</a><a className="stock-button" href="/almacen/transferencias"><ArrowRightLeft size={15}/>Transferencias</a></div></div>
    <div className="stock-toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void load()}} placeholder="Buscar artículo o característica..."/><select value={warehouseId??''} onChange={e=>setWarehouseId(e.target.value?Number(e.target.value):undefined)}><option value="">Todos los almacenes</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select><button className="stock-button primary" onClick={()=>void load()}>Buscar</button></div>
    {error&&<div className="inline-error">{error}</div>}
    <div className="stock-summary"><div><strong>{rows.length}</strong><span>líneas de stock</span></div><div><strong>{totals.quantity}</strong><span>unidades físicas</span></div><div><strong>{totals.reserved}</strong><span>reservadas</span></div><div><strong>{totals.quantity-totals.reserved}</strong><span>disponibles</span></div></div>
    <div className="stock-panel"><div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Almacén</th><th>Artículo</th><th>Característica</th><th className="numeric">Físico</th><th className="numeric">Reservado</th><th className="numeric">Disponible</th><th className="numeric">Mínimo</th></tr></thead><tbody>{loading?<tr><td colSpan={7}>Cargando…</td></tr>:rows.length===0?<tr><td colSpan={7} className="empty">No hay existencias registradas.</td></tr>:rows.map(r=>{const available=Number(r.quantity)-Number(r.reserved_quantity);return <tr key={r.id}><td>{r.warehouse?.code}<span className="secondary-line">{r.warehouse?.name}</span></td><td><strong>{r.product?.code}</strong><span className="secondary-line">{r.product?.commercial_description||'Sin descripción'}</span></td><td>{r.characteristic?.code||'—'}{r.characteristic?.description&&<span className="secondary-line">{r.characteristic.description}</span>}</td><td className="numeric">{r.quantity}</td><td className="numeric">{r.reserved_quantity}</td><td className={`numeric ${available<0?'negative':available===(r.product?.stock_minimum??0)?'warning':''}`}>{available}</td><td className="numeric">{r.product?.stock_minimum??0}</td></tr>})}</tbody></table></div></div>
  </div>;
}
