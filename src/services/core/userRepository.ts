import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from './coreRepository';
import { sanitizeSearchTerm } from './searchSanitize';

export type UserRole='ADMIN'|'OFFICE'|'WORKSHOP'|'CONFECTION'|'INSTALLER';
export type UserAccount={id:number;auth_user_id:string;company_id:number|null;username:string;display_name:string;email:string;role_code:UserRole;can_measure:boolean;active:boolean;created_at:string;updated_at:string};

function client(){if(!supabase)throw new CoreRepositoryError('Supabase no está configurado.');return supabase;}
export async function listUsers(search='',status:'active'|'inactive'|'all'='active'):Promise<UserAccount[]>{const c=client();let q=c.from('user_account').select('*').order('display_name');if(status==='active')q=q.eq('active',true);else if(status==='inactive')q=q.eq('active',false);const term=sanitizeSearchTerm(search);if(term)q=q.or(`username.ilike.%${term}%,display_name.ilike.%${term}%,email.ilike.%${term}%`);const {data,error}=await q;if(error)throw new CoreRepositoryError(error.message);return (data??[]) as UserAccount[];}
export async function getUserById(id:number):Promise<UserAccount>{const c=client();const {data,error}=await c.from('user_account').select('*').eq('id',id).maybeSingle();if(error)throw new CoreRepositoryError(error.message);if(!data)throw new CoreRepositoryError('Usuario no encontrado.');return data as UserAccount;}
export async function updateUserAccount(id:number,changes:Partial<Pick<UserAccount,'display_name'|'email'|'role_code'|'can_measure'|'active'>>):Promise<void>{const c=client();if(changes.active===false){const {data:{user}}=await c.auth.getUser();if(user){const target=await getUserById(id);if(target.auth_user_id===user.id)throw new CoreRepositoryError('No puedes desactivar el usuario con el que has iniciado sesión.');}}const {error}=await c.from('user_account').update({...changes,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw new CoreRepositoryError(error.message);}
export async function listMeasurementUsers(companyId:number|null):Promise<Pick<UserAccount,'auth_user_id'|'username'|'display_name'|'role_code'|'can_measure'>[]>{const c=client();const {data,error}=await c.rpc('list_measurement_users',{p_company_id:companyId});if(error)throw new CoreRepositoryError(error.message);return (data??[]) as Pick<UserAccount,'auth_user_id'|'username'|'display_name'|'role_code'|'can_measure'>[];}
export async function createUser(input:{username:string;display_name:string;email:string;password:string;role_code:UserRole;can_measure:boolean;company_id:number|null}):Promise<string>{const c=client();const {data,error}=await c.functions.invoke('admin-user-management-v2',{body:{action:'create',...input}});if(error)throw new CoreRepositoryError(error.message);if(!data?.id)throw new CoreRepositoryError(data?.error||'No se pudo crear el usuario.');return String(data.id);}

export type MyAccountSummary={id:number;role_code:UserRole;permittedRoutes:string[]}|null;
export async function getMyAccountSummary():Promise<MyAccountSummary>{
  const c=client();
  const {data:{user}}=await c.auth.getUser();
  if(!user)return null;
  const {data,error}=await c.from('user_account').select('id, role_code, user_module_permission(route_key)').eq('auth_user_id',user.id).maybeSingle();
  if(error)throw new CoreRepositoryError(error.message);
  if(!data)return null;
  const perms=(data as any).user_module_permission as {route_key:string}[]|null;
  return {id:data.id,role_code:data.role_code,permittedRoutes:(perms??[]).map(p=>p.route_key)};
}

export async function listUserCompanyIds(userAccountId:number):Promise<number[]>{
  const c=client();
  const {data,error}=await c.from('user_company').select('company_id').eq('user_account_id',userAccountId);
  if(error)throw new CoreRepositoryError(error.message);
  return (data??[]).map(r=>r.company_id as number);
}

export async function setUserCompanies(userAccountId:number,companyIds:number[]):Promise<void>{
  const c=client();
  const current=await listUserCompanyIds(userAccountId);
  const toAdd=companyIds.filter(id=>!current.includes(id));
  const toRemove=current.filter(id=>!companyIds.includes(id));
  if(toAdd.length){const {error}=await c.from('user_company').insert(toAdd.map(company_id=>({user_account_id:userAccountId,company_id})));if(error)throw new CoreRepositoryError(error.message);}
  if(toRemove.length){const {error}=await c.from('user_company').delete().eq('user_account_id',userAccountId).in('company_id',toRemove);if(error)throw new CoreRepositoryError(error.message);}
}

export async function listUserPermissions(userAccountId:number):Promise<string[]>{
  const c=client();
  const {data,error}=await c.from('user_module_permission').select('route_key').eq('user_account_id',userAccountId);
  if(error)throw new CoreRepositoryError(error.message);
  return (data??[]).map(r=>r.route_key as string);
}

export async function setUserPermissions(userAccountId:number,routeKeys:string[]):Promise<void>{
  const c=client();
  const current=await listUserPermissions(userAccountId);
  const toAdd=routeKeys.filter(k=>!current.includes(k));
  const toRemove=current.filter(k=>!routeKeys.includes(k));
  if(toAdd.length){const {error}=await c.from('user_module_permission').insert(toAdd.map(route_key=>({user_account_id:userAccountId,route_key})));if(error)throw new CoreRepositoryError(error.message);}
  if(toRemove.length){const {error}=await c.from('user_module_permission').delete().eq('user_account_id',userAccountId).in('route_key',toRemove);if(error)throw new CoreRepositoryError(error.message);}
}

export async function regenerateCredentials(userAccountId:number):Promise<string>{
  const c=client();
  const {data,error}=await c.functions.invoke('admin-user-management-v2',{body:{action:'regenerate_credentials',id:userAccountId}});
  if(error)throw new CoreRepositoryError(error.message);
  if(!data?.password)throw new CoreRepositoryError(data?.error||'No se pudieron regenerar las credenciales.');
  return String(data.password);
}
