import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

type MeasurementRef={code:string;name:string};

export function ProductInheritedMeasurement(){
  const {id}=useParams<{id:string}>();
  const [value,setValue]=useState<MeasurementRef|null>(null);
  const [family,setFamily]=useState('Sin familia');
  useEffect(()=>{
    if(!id||id==='nuevo'||!supabase)return;
    const db=supabase;
    let cancelled=false;
    async function load(){
      const {data}=await db.from('product').select('family_id').eq('id',Number(id)).maybeSingle();
      if(!data?.family_id){if(!cancelled){setValue(null);setFamily('Sin familia');}return;}
      const {data:familyData}=await db.from('product_family').select('code,name,measurement_type_id').eq('id',data.family_id).maybeSingle();
      if(cancelled)return;
      setFamily(familyData?`${familyData.code} · ${familyData.name}`:'—');
      if(familyData?.measurement_type_id==null){setValue(null);return;}
      const {data:type}=await db.from('measurement_type').select('code,name').eq('id',familyData.measurement_type_id).maybeSingle();
      if(!cancelled)setValue(type?{code:String(type.code),name:String(type.name)}:null);
    }
    void load();
    return()=>{cancelled=true;};
  },[id]);
  if(!id||id==='nuevo')return null;
  return <section className="panel product-inherited-measurement"><div className="panel-head"><div><h2>Configuración heredada</h2><p>El tipo de medida se obtiene de la familia y no se edita en el artículo.</p></div></div><div className="form-grid"><label>Familia<input value={family} readOnly/></label><label>Tipo de medida<input value={value?`${value.code} · ${value.name}`:'—'} readOnly/></label></div></section>;
}
