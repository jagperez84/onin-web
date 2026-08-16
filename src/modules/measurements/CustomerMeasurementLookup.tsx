import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { getCustomerSummaries } from '../../services/core/customerRepository';

type CustomerOption={id:number;party:{legal_name:string;trade_name:string|null;tax_id:string|null;code:string|null;phone:string|null;email:string|null}};

export function CustomerMeasurementLookup({value,onChange,selectedLabel}:{value:number|null;onChange:(customer:CustomerOption)=>void;selectedLabel:string}){
  const [open,setOpen]=useState(false); const [query,setQuery]=useState('');
  const [rows,setRows]=useState<CustomerOption[]>([]); const [loading,setLoading]=useState(false); const [error,setError]=useState('');
  useEffect(()=>{
    if(!open){setRows([]);return;}
    const timer=setTimeout(async()=>{
      setLoading(true);setError('');
      try{setRows((await getCustomerSummaries(query,'active')) as CustomerOption[]);}
      catch(e){setError(e instanceof Error?e.message:'No se pudieron cargar los clientes.');setRows([]);}
      finally{setLoading(false);}
    },180);
    return()=>clearTimeout(timer);
  },[open,query]);
  function select(customer:CustomerOption){onChange(customer);setOpen(false);setQuery('');}
  return <>
    <div className="entity-lookup-field">
      <button type="button" className="entity-lookup-trigger" onClick={()=>setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <span className={value===null?'entity-lookup-placeholder':''}>{value===null?'Seleccionar cliente…':selectedLabel}</span><Search size={16}/>
      </button>
      {value!==null&&<button type="button" className="entity-lookup-clear" title="Quitar selección" onClick={()=>onChange({id:0,party:{legal_name:'',trade_name:null,tax_id:null,code:null,phone:null,email:null}} as CustomerOption)}><X size={14}/></button>}
    </div>
    {open&&<div className="entity-lookup-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <div className="entity-lookup-dialog" role="dialog" aria-modal="true" aria-label="Buscar cliente">
        <div className="entity-lookup-head"><div><h3>Buscar cliente</h3><p>Busca y selecciona un cliente existente.</p></div><button type="button" className="icon-action" title="Cerrar" onClick={()=>setOpen(false)}><X size={17}/></button></div>
        <label className="entity-lookup-search"><Search size={16}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nombre, CIF/NIF o código…"/></label>
        {error&&<div className="inline-error">{error}</div>}
        <div className="entity-lookup-results">{loading?<div className="empty-state">Buscando…</div>:rows.length===0?<div className="empty-state">No se han encontrado clientes.</div>:rows.map(customer=><button key={customer.id} type="button" className={`entity-lookup-result${customer.id===value?' selected':''}`} onClick={()=>select(customer)}><span>{customer.party.trade_name||customer.party.legal_name}</span><span className="secondary">{customer.party.tax_id||customer.party.code||''}</span></button>)}</div>
        <div className="actions"><button type="button" className="secondary-button" onClick={()=>setOpen(false)}>Cancelar</button></div>
      </div>
    </div>}
  </>;
}
