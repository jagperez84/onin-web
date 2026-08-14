import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ProductV2 } from './ProductV2';
import { ProductCharacteristicsPanel } from './ProductCharacteristicsPanel';
import { ProductCommercialPanel } from './ProductCommercialPanel';

export function ProductProfile(){
  const { id }=useParams<{id:string}>();
  const onError=useCallback((message:string)=>{window.dispatchEvent(new CustomEvent('onin-product-error',{detail:message}));},[]);
  if(!id || id==='nuevo') return <ProductV2/>;
  return <>
    <ProductV2/>
    <div className="product-profile-section-wrap"><ProductCharacteristicsPanel productId={Number(id)} readOnly={false} onError={onError}/></div>
    <div className="product-profile-section-wrap"><ProductCommercialPanel productId={Number(id)} onError={onError}/></div>
  </>;
}
