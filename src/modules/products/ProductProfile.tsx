import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ProductV2 } from './ProductV2';
import { ProductCharacteristicsPanel } from './ProductCharacteristicsPanel';
import { ProductCommercialPanel } from './ProductCommercialPanel';

function detectEditing(): boolean {
  return !!document.querySelector('.product-save-actions');
}

export function ProductProfile(){
  const { id }=useParams<{id:string}>();
  const onError=useCallback((message:string)=>{window.dispatchEvent(new CustomEvent('onin-product-error',{detail:message}));},[]);
  const [editing,setEditing]=useState(false);

  useEffect(()=>{
    const update=()=>setEditing(detectEditing());
    update();
    const observer=new MutationObserver(update);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize',update);
    return()=>{observer.disconnect();window.removeEventListener('resize',update);};
  },[]);

  if(!id || id==='nuevo') return <ProductV2/>;
  return <div className="product-profile-shell">
    <nav className="product-profile-section-nav" aria-label="Navegación rápida del artículo">
      <a href="#producto-datos-generales" data-section-label="Datos generales" data-section-target="producto-datos-generales">Datos generales</a>
      <a href="#producto-comercial" data-section-label="Comercial" data-section-target="producto-comercial">Comercial</a>
      <a href="#producto-stock" data-section-label="Stock" data-section-target="producto-stock">Stock</a>
      <a href="#producto-caracteristicas" data-section-label="Características" data-section-target="producto-caracteristicas">Características</a>
      <a href="#producto-precios" data-section-label="Proveedores y precios" data-section-target="producto-precios">Proveedores y precios</a>
    </nav>
    <div className="product-profile-content">
      <ProductV2/>
      <div className="product-profile-section-wrap"><ProductCharacteristicsPanel productId={Number(id)} readOnly={!editing} onError={onError}/></div>
      <div className="product-profile-section-wrap"><ProductCommercialPanel productId={Number(id)} editable={editing} onError={onError}/></div>
    </div>
  </div>;
}
