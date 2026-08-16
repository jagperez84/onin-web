import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActiveCompanies } from '../../services/core/coreRepository';
import { createProduct, type ProductForm } from '../../services/catalog/productRepository';

const draftDefaults:ProductForm={
  code:'',technical_description:'',commercial_description:'',family_id:null,product_type_id:null,base_unit_id:null,
  sales_price:null,purchase_price:null,stock_enabled:false,allow_negative_stock:false,active:false,notes:'',cod_arb:null,
  price_increment:0,upc:0,ptc:0,stock_minimum:0,discarded_size:null,minimum_remainder:null,smooth_cut:false,monochrome:false,
  usage_status:'DRAFT',iva_percent:null,default_supplier_party_id:null,include_measurements_in_stock:false,include_stock_by_color:false,
  scaled:false,scaled_by_characteristic:false,deleted_at:null,deleted_by:null,
};

export function ProductDraftCreate(){
  const navigate=useNavigate();
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    async function createDraft(){
      try{
        const companies=await getActiveCompanies();
        const companyId=companies[0]?.id;
        if(!companyId){setError('No hay una empresa activa disponible.');return;}
        const draftCode=`__DRAFT__${crypto.randomUUID()}`;
        const id=await createProduct(companyId,{...draftDefaults,code:draftCode});
        if(!cancelled)navigate(`/ventas/articulos/${id}?draft=1`,{replace:true});
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'No se pudo iniciar el alta del artículo.');}
    }
    createDraft();
    return ()=>{cancelled=true;};
  },[navigate]);
  return <div className="loading-block">{error||'Preparando nuevo artículo…'}</div>;
}
