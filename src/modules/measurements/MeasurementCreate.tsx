import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, MapPin, Save, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getActiveCompanies, getCustomerById, getCustomerSummaries, getPartyById } from '../../services/core/coreRepository';
import { createMeasurement, type AssignedMode, type MeasurementStatus } from '../../services/measurements/measurementRepository';
import { useAuth } from '../../auth/AuthContext';
import { AddressLookup } from '../customers/AddressLookup';
import type { AddressForm } from '../customers/types';
import { MessageLog } from '../../components/ui/MessageLog';
import './measurements.css';

type CustomerOption={id:number;party:{legal_name:string;trade_name:string|null;tax_id:string|null;code:string|null;phone:string|null;email:string|null}};
const emptyAddress:AddressForm={address_type:'INSTALACION',street:'',postal_code:'',city:'',region:'',country_code:'ES'};

export function MeasurementCreate(){
  const navigate=useNavigate(); const {user}=useAuth();
  const [companyId,setCompanyId]=useState<number|null>(null); const [customers,setCustomers]=useState<CustomerOption[]>([]); const [customerSearch,setCustomerSearch]=useState('');
  const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const [form,setForm]=useState({reference:'',customer_id:0,customer_name:'',tax_id:'',phone:'',mobile:'',email:'',contact_method:'',commercial_name:'',assigned_mode:'UNASSIGNED' as AssignedMode,contact_date:new Date().toISOString().slice(0,10),measurement_date:'',measurement_time:'',observations:''});
  const [address,setAddress]=useState<AddressForm>(emptyAddress);
  useEffect(()=>{getActiveCompanies().then(cs=>setCompanyId(cs[0]?.id??null)).catch(e=>setError(e instanceof Error?e.message:'No se pudo obtener la empresa activa.'));},[]);
  useEffect(()=>{const q=customerSearch.trim();if(!q||form.customer_id){setCustomers([]);return}const t=setTimeout(()=>getCustomerSummaries(q).then(d=>setCustomers(d as CustomerOption[])).catch(()=>setCustomers([])),180);return()=>clearTimeout(t)},[customerSearch,form.customer_id]);
  function update(key:string,value:string|number){setForm(v=>({...v,[key]:value}))}
  async function selectCustomer(id:number){try{const c=await getCustomerById(id);const p=await getPartyById(c.party_id);setForm(v=>({...v,customer_id:id,customer_name:p.trade_name||p.legal_name,tax_id:p.tax_id||'',phone:p.phone||'',email:p.email||''}));setCustomerSearch(p.trade_name||p.legal_name);}catch(e){setError(e instanceof Error?e.message:'No se pudo cargar el cliente.')}}
  async function save(e:FormEvent){
    e.preventDefault();
    if(!companyId){setError('No hay una empresa activa configurada.');return}
    if(!form.customer_id){setError('Selecciona un cliente mediante la ayuda de búsqueda.');return}
    if(!form.contact_date){setError('La fecha de contacto es obligatoria.');return}
    if(form.assigned_mode==='USER'){setError('La asignación a un usuario concreto se habilitará con el maestro de usuarios de ONIN.');return}
    setSaving(true);setError('');
    try{
      const id=await createMeasurement(companyId,{reference:form.reference||null,customer_id:form.customer_id,customer_name_snapshot:form.customer_name,customer_tax_id_snapshot:form.tax_id||null,customer_phone_snapshot:form.phone||null,customer_mobile_snapshot:form.mobile||null,customer_email_snapshot:form.email||null,site_street:address.street||null,site_postal_code:address.postal_code||null,site_city:address.city||null,site_region:address.region||null,site_country_code:address.country_code||'ES',site_latitude:null,site_longitude:null,contact_method:form.contact_method||null,commercial_name:form.commercial_name||null,assigned_user_id:form.assigned_mode==='SELF'?user?.id??null:null,assigned_mode:form.assigned_mode,status:'PLANNED' as MeasurementStatus,contact_date:form.contact_date,measurement_date:form.measurement_date||null,measurement_time:form.measurement_time||null,reference_note:null,observations:form.observations||null});
      navigate(`/gestion/mediciones/${id}`)
    }catch(e){setError(e instanceof Error?e.message:'No se pudo crear la medición.')}finally{setSaving(false)}}
  return <div className="module-page measurement-detail-page">
    <div className="page-head"><div><div className="eyebrow">GESTIÓN / MEDICIONES / NUEVA</div><h1>Nueva medición</h1><p>Crea el expediente con número automático y conserva el contexto de la visita.</p></div></div>
    <MessageLog error={error}/>
    <form onSubmit={save} className="measurement-main">
      <section className="panel"><div className="panel-head"><div><h2>Identificación</h2><p>El número definitivo lo asigna el sistema al guardar.</p></div><Save size={19}/></div><div className="form-grid">
        <label>Referencia<input value={form.reference} onChange={e=>update('reference',e.target.value)} placeholder="Referencia de cliente, obra…" /></label>
        <label>Forma de contacto<select value={form.contact_method} onChange={e=>update('contact_method',e.target.value)}><option value="">Seleccionar…</option><option>Recomendado</option><option>Teléfono</option><option>Visita oficina</option><option>Email</option><option>Comerciales</option><option>Presupuesto on-line</option></select></label>
        <label className="wide">Buscar cliente *<input value={customerSearch} onChange={e=>{setCustomerSearch(e.target.value);if(form.customer_id)setForm(v=>({...v,customer_id:0,customer_name:'',tax_id:'',phone:'',email:''}))}} placeholder="Nombre, CIF/NIF o código…" autoComplete="off" />
          {customers.length>0&&<div className="measurement-customer-results" role="listbox" aria-label="Resultados de clientes">{customers.slice(0,6).map(c=><button key={c.id} type="button" onClick={()=>selectCustomer(c.id)}><strong>{c.party.trade_name||c.party.legal_name}</strong><span>{c.party.tax_id||c.party.code||''}</span></button>)}</div>}
        </label>
        <label>Cliente seleccionado<input readOnly value={form.customer_name} placeholder="Selecciona un cliente" /></label>
      </div></section>
      <section className="panel"><div className="panel-head"><div><h2>Cliente</h2><p>Se guarda una copia de los datos usados en el expediente.</p></div><User size={19}/></div><div className="form-grid"><label>Nombre<input readOnly value={form.customer_name}/></label><label>CIF/NIF<input readOnly value={form.tax_id}/></label><label>Teléfono<input readOnly value={form.phone}/></label><label>Móvil<input value={form.mobile} onChange={e=>update('mobile',e.target.value)}/></label><label>Email<input readOnly value={form.email}/></label></div></section>
      <section className="panel"><div className="panel-head"><div><h2>Ubicación de la medición</h2><p>La dirección se puede localizar mediante la API de direcciones, igual que en Clientes.</p></div><MapPin size={19}/></div><div className="form-grid">
        <AddressLookup value={address} onChange={setAddress}/>
        <label className="wide">Dirección<input value={address.street} onChange={e=>setAddress(v=>({...v,street:e.target.value}))}/></label>
        <label>CP<input value={address.postal_code} onChange={e=>setAddress(v=>({...v,postal_code:e.target.value}))}/></label>
        <label>Localidad<input value={address.city} onChange={e=>setAddress(v=>({...v,city:e.target.value}))}/></label>
        <label className="wide">Provincia<input value={address.region} onChange={e=>setAddress(v=>({...v,region:e.target.value}))}/></label>
      </div></section>
      <section className="panel"><div className="panel-head"><div><h2>Agenda y medidor</h2><p>La asignación puede hacerse ahora o más adelante.</p></div><CalendarDays size={19}/></div><div className="form-grid"><label>Fecha de contacto<input type="date" value={form.contact_date} onChange={e=>update('contact_date',e.target.value)}/></label><label>Fecha prevista<input type="date" value={form.measurement_date} onChange={e=>update('measurement_date',e.target.value)}/></label><label>Hora<input type="time" value={form.measurement_time} onChange={e=>update('measurement_time',e.target.value)}/></label><label>Medidor<select value={form.assigned_mode} onChange={e=>update('assigned_mode',e.target.value)}><option value="UNASSIGNED">Sin asignar</option><option value="SELF">Medidas propias</option><option value="USER">Usuario asignado</option></select></label><label>Comercial<input value={form.commercial_name} onChange={e=>update('commercial_name',e.target.value)} placeholder="Opcional"/></label></div></section>
      <section className="panel"><div className="panel-head"><div><h2>Observaciones</h2><p>Información inicial del expediente.</p></div></div><label className="wide measurement-observations"><textarea rows={7} value={form.observations} onChange={e=>update('observations',e.target.value)} placeholder="Acceso, detalles de la visita, incidencias…" /></label></section>
      <div className="measurement-save-bar"><button type="button" className="secondary-button" onClick={()=>navigate('/gestion/mediciones')}><ArrowLeft size={15}/> Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving?'Creando expediente…':'Crear medición'}</button></div>
    </form>
  </div>;
}
