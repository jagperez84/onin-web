import { useCallback, useState } from 'react';
import { Save } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { ProductV2 } from './ProductV2';
import { ProductCharacteristicsPanel } from './ProductCharacteristicsPanel';
import { ProductCommercialPanel } from './ProductCommercialPanel';

export function ProductProfile(){
  const { id }=useParams<{id:string}>();
  const isNew=!id || id==='nuevo';
  const onError=useCallback((message:string)=>{window.dispatchEvent(new CustomEvent('onin-product-error',{detail:message}));},[]);
  const [editing,setEditing]=useState(false);
  const [scaled,setScaled]=useState(false);
  const [refreshKey,setRefreshKey]=useState(0);

  function saveProfile(){
    const form=document.getElementById('product-profile-form') as HTMLFormElement|null;
    form?.requestSubmit();
  }

  return <div className="product-profile-shell">
    {!isNew&&<nav className="product-profile-section-nav" aria-label="Navegación rápida del artículo">
      <a href="#producto-datos-generales" data-section-label="Datos generales" data-section-target="producto-datos-generales">Datos generales</a>
      <a href="#producto-comercial" data-section-label="Comercial" data-section-target="producto-comercial">Comercial</a>
      <a href="#producto-stock" data-section-label="Stock" data-section-target="producto-stock">Stock</a>
      <a href="#producto-caracteristicas" data-section-label="Características" data-section-target="producto-caracteristicas">Características</a>
      <a href="#producto-precios" data-section-label="Proveedores y precios" data-section-target="producto-precios">Proveedores y precios</a>
    </nav>}

    <div className="product-profile-content">
      <ProductV2 onEditModeChange={setEditing} onScaledChange={setScaled}/>
      {!isNew&&<>
        <div className="product-profile-section-wrap">
          <ProductCharacteristicsPanel productId={Number(id)} readOnly={!editing} scaled={scaled} onSaved={()=>setRefreshKey(v=>v+1)} onError={onError}/>
        </div>
        <div id="producto-precios" className="product-profile-section-wrap product-profile-anchor">
          <ProductCommercialPanel productId={Number(id)} editable={editing} scaled={scaled} refreshKey={refreshKey} onError={onError}/>
        </div>
      </>}
    </div>

    {editing&&<div className="product-profile-save-actions">
      <button type="button" className="primary-button" onClick={saveProfile}>
        <Save size={16}/>
        Guardar
      </button>
    </div>}
  </div>;
}
