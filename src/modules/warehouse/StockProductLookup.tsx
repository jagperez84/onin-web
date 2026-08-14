import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { listStockCharacteristics, searchStockProducts, type StockCharacteristic, type StockProduct } from '../../services/warehouse/stockRepository';

export function StockProductLookup({companyId,value,onChange}:{companyId:number;value:StockProduct|null;onChange:(product:StockProduct|null)=>void}){
  const [term,setTerm]=useState(value?.code??'');
  const [results,setResults]=useState<StockProduct[]>([]);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{setTerm(value?.code??'');},[value?.id]);
  async function search(){setLoading(true);setError('');try{setResults(await searchStockProducts(companyId,term));setOpen(true);}catch(e){setError(e instanceof Error?e.message:'No se pudieron buscar artículos.');}finally{setLoading(false);}}
  return <div className="stock-lookup">
    <label><span>Artículo *</span><div className="lookup-input"><Search size={15}/><input value={term} onChange={e=>{setTerm(e.target.value);if(!value)setOpen(true)}} onFocus={()=>{if(term)void search()}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void search()}}} placeholder="Código o descripción..."/><button type="button" title="Buscar" onClick={()=>void search()}><Search size={15}/></button>{value&&<button type="button" title="Limpiar" onClick={()=>{onChange(null);setTerm('');setResults([]);setOpen(false)}}><X size={15}/></button>}</div></label>
    {open&&!value&&<div className="lookup-results-stock">{loading&&<small>Buscando…</small>}{!loading&&results.length===0&&<small>No se encontraron artículos.</small>}{results.map(p=><button type="button" key={p.id} onClick={()=>{onChange(p);setTerm(p.code);setOpen(false)}}><strong>{p.code}</strong><span>{p.commercial_description||p.technical_description||'Sin descripción'}</span>{!p.stock_enabled&&<small>Stock no activado</small>}</button>)}</div>}
    {error&&<div className="inline-error">{error}</div>}
  </div>;
}

export function CharacteristicSelect({productId,value,onChange}:{productId:number;value:number|null;onChange:(id:number|null)=>void}){
  const [rows,setRows]=useState<StockCharacteristic[]>([]);
  useEffect(()=>{let active=true; listStockCharacteristics(productId).then(r=>{if(active)setRows(r)}).catch(()=>{if(active)setRows([])});return()=>{active=false}},[productId]);
  return <label><span>Característica / color</span><select value={value??''} onChange={e=>onChange(e.target.value?Number(e.target.value):null)}><option value="">Sin característica</option>{rows.map(c=><option key={c.id} value={c.id}>{c.code}{c.description?` · ${c.description}`:''}</option>)}</select></label>;
}
