import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type MeasurementStatus='PLANNED'|'ASSIGNED'|'IN_PROGRESS'|'COMPLETED'|'QUOTED'|'CLOSED'|'CANCELLED';
export type AssignedMode='UNASSIGNED'|'SELF'|'USER';
export type MeasurementListRow={id:number;code:string;reference:string|null;customer_id:number|null;customer_name_snapshot:string|null;site_city:string|null;site_street:string|null;site_latitude:number|null;site_longitude:number|null;zone_id:number|null;measurement_date:string|null;measurement_time:string|null;assigned_mode:AssignedMode;assigned_user_id:string|null;status:MeasurementStatus};
export type AssignedMeasurementRow=Pick<MeasurementListRow,'id'|'code'|'customer_name_snapshot'|'site_city'|'measurement_date'|'measurement_time'>;
export type Measurement={id:number;company_id:number;number:number;year:number;code:string;reference:string|null;customer_id:number|null;customer_name_snapshot:string|null;customer_tax_id_snapshot:string|null;customer_phone_snapshot:string|null;customer_mobile_snapshot:string|null;customer_email_snapshot:string|null;site_street:string|null;site_postal_code:string|null;site_city:string|null;site_region:string|null;site_country_code:string;site_latitude:number|null;site_longitude:number|null;zone_id:number|null;contact_method:string|null;commercial_name:string|null;assigned_user_id:string|null;assigned_mode:AssignedMode;status:MeasurementStatus;contact_date:string;measurement_date:string|null;measurement_time:string|null;reference_note:string|null;observations:string|null;deleted_at:string|null;created_at:string;created_by:string|null;updated_at:string;updated_by:string|null};
export type MeasurementActivity={id:number;measurement_id:number;event_type:string;message:string;created_at:string;created_by:string|null};
export type MeasurementChanges={reference?:string|null;customer_id?:number|null;customer_name_snapshot?:string|null;customer_tax_id_snapshot?:string|null;customer_phone_snapshot?:string|null;customer_mobile_snapshot?:string|null;customer_email_snapshot?:string|null;site_street?:string|null;site_postal_code?:string|null;site_city?:string|null;site_region?:string|null;site_country_code?:string;site_latitude?:number|null;site_longitude?:number|null;zone_id?:number|null;contact_method?:string|null;commercial_name?:string|null;assigned_user_id?:string|null;assigned_mode?:AssignedMode;status?:MeasurementStatus;contact_date?:string;measurement_date?:string|null;measurement_time?:string|null;reference_note?:string|null;observations?:string|null};
export type MeasurementPhoto={path:string;signedUrl:string;createdAt:string;size:number|null};
export type LinkedQuotationSummary={id:number;code:string;status:string;issue_date:string;total_amount:number;valid_until:string|null};
function client(){if(!supabase) throw new CoreRepositoryError('Supabase no está configurado.');return supabase;}
export async function listMeasurements(search='',status:'active'|'planned'|'assigned'|'in_progress'|'completed'|'quoted'|'closed'|'cancelled'|'all'='active'):Promise<MeasurementListRow[]>{const c=client();let q=c.from('measurement').select('id,code,reference,customer_id,customer_name_snapshot,site_city,site_street,site_latitude,site_longitude,zone_id,measurement_date,measurement_time,assigned_mode,assigned_user_id,status').is('deleted_at',null).order('measurement_date',{ascending:true,nullsFirst:false}).order('id',{ascending:false});if(status==='active')q=q.in('status',['PLANNED','ASSIGNED','IN_PROGRESS','COMPLETED']);else if(status!=='all')q=q.eq('status',status.toUpperCase());const term=search.trim().replace(/[%_]/g,'');if(term)q=q.or(`code.ilike.%${term}%,reference.ilike.%${term}%,customer_name_snapshot.ilike.%${term}%,site_city.ilike.%${term}%`);const {data,error}=await q;if(error)throw new CoreRepositoryError(error.message);return(data??[])as MeasurementListRow[];}
export async function listAssignedMeasurements(authUserId:string):Promise<AssignedMeasurementRow[]>{const c=client();const {data,error}=await c.from('measurement').select('id,code,customer_name_snapshot,site_city,measurement_date,measurement_time').is('deleted_at',null).eq('assigned_user_id',authUserId).eq('assigned_mode','USER').eq('status','ASSIGNED').order('measurement_date',{ascending:true,nullsFirst:false}).order('measurement_time',{ascending:true,nullsFirst:false}).order('id',{ascending:false});if(error)throw new CoreRepositoryError(error.message);return(data??[])as AssignedMeasurementRow[];}
export async function getMeasurement(id:number):Promise<{measurement:Measurement;activities:MeasurementActivity[]}>{const c=client();const[{data,error},{data:activities,error:ae}]=await Promise.all([c.from('measurement').select('*').eq('id',id).single(),c.from('measurement_activity').select('*').eq('measurement_id',id).order('created_at',{ascending:false})]);if(error)throw new CoreRepositoryError(error.message);if(ae)throw new CoreRepositoryError(ae.message);return{measurement:data as Measurement,activities:(activities??[])as MeasurementActivity[]};}
export async function createMeasurement(companyId:number|null,input:Omit<Measurement,'id'|'company_id'|'number'|'year'|'code'|'created_at'|'created_by'|'updated_at'|'updated_by'|'deleted_at'>):Promise<number>{const c=client();const{data,error}=await c.rpc('create_measurement',{p_company_id:companyId,p_reference:input.reference,p_customer_id:input.customer_id,p_customer_name:input.customer_name_snapshot,p_customer_tax_id:input.customer_tax_id_snapshot,p_customer_phone:input.customer_phone_snapshot,p_customer_mobile:input.customer_mobile_snapshot,p_customer_email:input.customer_email_snapshot,p_site_street:input.site_street,p_site_postal_code:input.site_postal_code,p_site_city:input.site_city,p_site_region:input.site_region,p_site_country_code:input.site_country_code,p_contact_method:input.contact_method,p_commercial_name:input.commercial_name,p_assigned_user_id:input.assigned_user_id,p_assigned_mode:input.assigned_mode,p_status:input.status,p_contact_date:input.contact_date,p_measurement_date:input.measurement_date,p_measurement_time:input.measurement_time,p_observations:input.observations});if(error)throw new CoreRepositoryError(error.message);return Number(data);}
export async function updateMeasurement(id:number,changes:MeasurementChanges,message?:string,eventType='UPDATED'):Promise<void>{const c=client();const{data:user}=await c.auth.getUser();const safeChanges=eventType==='UPDATED'&&Object.prototype.hasOwnProperty.call(changes,'status')?(({status:_status,...rest})=>rest)(changes):changes;const{error}=await c.from('measurement').update({...safeChanges,updated_by:user.user?.id??null,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw new CoreRepositoryError(error.message);if(message)await addMeasurementActivity(id,eventType,message);}
export async function addMeasurementActivity(measurementId:number,eventType:string,message:string):Promise<void>{const c=client();const{data:user}=await c.auth.getUser();const{error}=await c.from('measurement_activity').insert({measurement_id:measurementId,event_type:eventType,message,created_by:user.user?.id??null});if(error)throw new CoreRepositoryError(error.message);}
export async function markMeasurementCancelled(id:number):Promise<void>{
  const linked = await getMeasurementLinkedQuotation(id);
  if (linked) {
    throw new CoreRepositoryError('Una medición con presupuesto asociado no puede ser cancelada.');
  }
  const { measurement } = await getMeasurement(id);
  if (measurement?.status === 'QUOTED') {
    throw new CoreRepositoryError('Una medición con presupuesto asociado no puede ser cancelada.');
  }
  await updateMeasurement(id,{status:'CANCELLED'},'Medición cancelada','CANCELLED');
}

export async function listMeasurementPhotos(measurementId:number):Promise<MeasurementPhoto[]>{
  const c=client();
  // The attachment table is the source of truth. Do not depend on Storage
  // folder-list permissions, which can make existing photos disappear after
  // the measurement status changes.
  const{data:rows,error}=await c.from('measurement_photo').select('storage_path,created_at').eq('measurement_id',measurementId).order('created_at',{ascending:false});
  if(error)throw new CoreRepositoryError(error.message);
  const paths=(rows??[]).map(row=>String(row.storage_path)).filter(Boolean);
  if(!paths.length)return[];
  const{data:signed,error:signError}=await c.storage.from('measurement-photos').createSignedUrls(paths,3600);
  if(signError)throw new CoreRepositoryError(signError.message);
  const signedByPath=new Map((signed??[]).map(item=>[item.path,item.signedUrl]));
  return(rows??[]).map(row=>{const path=String(row.storage_path);return{path,signedUrl:signedByPath.get(path)??'',createdAt:row.created_at??new Date().toISOString(),size:null};}).filter(item=>!!item.signedUrl);
}
export async function uploadMeasurementPhoto(measurementId:number,file:File):Promise<string>{const c=client();const{data:user}=await c.auth.getUser();if(!user.user)throw new CoreRepositoryError('La sesión de usuario no está disponible.');const path=`measurements/${measurementId}/${crypto.randomUUID()}.jpg`;const{error}=await c.storage.from('measurement-photos').upload(path,file,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});if(error)throw new CoreRepositoryError(error.message);const{error:dbError}=await c.from('measurement_photo').insert({measurement_id:measurementId,storage_path:path,created_by:user.user.id});if(dbError){await c.storage.from('measurement-photos').remove([path]);throw new CoreRepositoryError(dbError.message);}return path;}
export async function removeMeasurementPhoto(measurementId:number,path:string):Promise<void>{const c=client();const{error:storageError}=await c.storage.from('measurement-photos').remove([path]);if(storageError)throw new CoreRepositoryError(storageError.message);const{error}=await c.from('measurement_photo').delete().eq('measurement_id',measurementId).eq('storage_path',path);if(error)throw new CoreRepositoryError(error.message);}

export async function getMeasurementLinkedQuotation(measurementId:number):Promise<LinkedQuotationSummary|null>{
  const c=client();
  const {data,error}=await c
    .from('quotation')
    .select('id,code,status,issue_date,total_amount,valid_until')
    .eq('measurement_id',measurementId)
    .neq('status','CANCELLED')
    .order('id',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(error)throw new CoreRepositoryError(error.message);
  return data as LinkedQuotationSummary|null;
}

export async function generateQuotationFromMeasurement(measurementId:number):Promise<number>{
  const c=client();
  const existing=await getMeasurementLinkedQuotation(measurementId);
  if(existing) return existing.id;

  const{measurement}=await getMeasurement(measurementId);
  if(!measurement) throw new CoreRepositoryError('Medición no encontrada.');

  await updateMeasurement(measurementId,{status:'QUOTED'},'Presupuesto generado desde la medición','QUOTATION_CREATED');

  const linked=await getMeasurementLinkedQuotation(measurementId);
  if(linked) return linked.id;

  // Client-side fallback if database trigger did not create the row
  const{data:user}=await c.auth.getUser();
  const currentYear=new Date().getFullYear();
  const{data:maxNumData}=await c.from('quotation').select('number').eq('company_id',measurement.company_id).eq('year',currentYear).order('number',{ascending:false}).limit(1).maybeSingle();
  const nextNumber=(maxNumData?.number??0)+1;
  const quotationCode=`${currentYear}/${nextNumber}`;

  const{data:createdQuotation,error:insertError}=await c.from('quotation').insert({
    company_id:measurement.company_id,
    year:currentYear,
    number:nextNumber,
    code:quotationCode,
    customer_id:measurement.customer_id,
    measurement_id:measurement.id,
    issue_date:new Date().toISOString().slice(0,10),
    status:'DRAFT',
    reference:measurement.reference?.trim()||measurement.code,
    notes:measurement.observations||null,
    net_amount:0,
    discount_amount:0,
    tax_amount:0,
    total_amount:0,
    tax_percent:0,
    installation_address_label:'Dirección de instalación',
    installation_address_street:measurement.site_street,
    installation_address_postal_code:measurement.site_postal_code,
    installation_address_city:measurement.site_city,
    installation_address_region:measurement.site_region,
    contact_name:measurement.customer_name_snapshot,
    contact_email:measurement.customer_email_snapshot,
    contact_phone:measurement.customer_phone_snapshot||measurement.customer_mobile_snapshot,
    created_by:user.user?.id??null,
    updated_by:user.user?.id??null,
  }).select('id').single();

  if(insertError) throw new CoreRepositoryError(insertError.message);
  return Number(createdQuotation.id);
}

