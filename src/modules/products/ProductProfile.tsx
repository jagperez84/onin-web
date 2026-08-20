import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ProductV2 } from './ProductV2';
import { ProductFamilyCharacteristicsPanel } from './ProductFamilyCharacteristicsPanel';
import { ProductCharacteristicsPanel } from './ProductCharacteristicsPanel';
import { ProductCommercialPanel } from './ProductCommercialPanel';
import { ProductInheritedMeasurement } from './ProductInheritedMeasurement';
import { MessageLog } from '../../components/ui/MessageLog';
import { ProfileSaveBar } from '../../components/ui/ProfileSaveBar';

export function ProductProfile(){
  const { id }=useParams<{id:string}>();
  const isNew=!id || id==='nuevo';
  const shellRef=useRef<HTMLDivElement|null>(null);
  const [editing,setEditing]=useState(false);
  const [scaled,setScaled]=useState(false);
  const [refreshKey,setRefreshKey]=useState(0);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const lastObservedError=useRef('');
  const reportError=useCallback((value:string)=>{setMessage('');setError(value);},[]);
  useEffect(()=>{const shell=shellRef.current;if(!shell)return;const captureError=()=>{const nodes=Array.from(shell.querySelectorAll<HTMLElement>('.inline-error')).filter(node=>!node.closest('.onin-message-log'));const node=nodes[0];const text=node?.textContent?.trim()||'';if(text&&text!==lastObservedError.current){lastObservedError.current=text;reportError(text);}if(!text)lastObservedError.current='';};const observer=new MutationObserver(captureError);observer.observe(shell,{subtree:true,childList:true,characterData:true});captureError();return()=>observer.disconnect();},[reportError]);
  function saveProfile(){const form=document.getElementById('product-profile-form') as HTMLFormElement|null;form?.requestSubmit();}
  return <div ref={shellRef} className="product-profile-shell">
    {!isNew&&<nav className="product-profile-section-nav" aria-label="Navegación rápida del artículo">
      <a href="#producto-datos-generales" data-section-label="Datos generales" data-section-target="producto-datos-generales">Datos generales</a>
      <a href="#producto-comercial" data-section-label="Comercial" data-section-target="producto-comercial">Comercial</a>
      <a href="#producto-stock" data-section-label="Stock" data-section-target="producto-stock">Stock</a>
      <a href="#producto-caracteristicas" data-section-label="Características" data-section-target="producto-caracteristicas">Características</a>
      <a href="#producto-variantes" data-section-label="Variantes" data-section-target="producto-variantes">Variantes</a>
      <a href="#producto-precios" data-section-label="Proveedores y precios" data-section-target="producto-precios">Proveedores y precios</a>
    </nav>}
    <MessageLog error={error} success={message}/>
    <div className="product-profile-content">
      <ProductV2 onEditModeChange={setEditing} onScaledChange={setScaled}/>
      {!isNew&&<>
        <div className="product-profile-section-wrap"><ProductInheritedMeasurement/></div>
        <div className="product-profile-section-wrap"><ProductFamilyCharacteristicsPanel productId={Number(id)} readOnly={!editing} onError={reportError}/></div>
        <div className="product-profile-section-wrap"><ProductCharacteristicsPanel productId={Number(id)} readOnly={!editing} scaled={scaled} onSaved={()=>setRefreshKey(v=>v+1)} onError={reportError}/></div>
        <div id="producto-precios" className="product-profile-section-wrap product-profile-anchor"><ProductCommercialPanel productId={Number(id)} editable={editing} scaled={scaled} refreshKey={refreshKey} onError={reportError}/></div>
      </>}
    </div>
    {editing&&<ProfileSaveBar onSave={saveProfile}/>} 
  </div>;
}