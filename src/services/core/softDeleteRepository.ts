import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from './coreRepository';

export type DeletionState = 'active' | 'inactive' | 'deleted';

function client(){
  if(!supabase) throw new CoreRepositoryError('Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

export async function markForDeletion(table:string,id:number):Promise<void>{
  const {error}=await client().from(table).update({active:false,deleted_at:new Date().toISOString()}).eq('id',id).is('deleted_at',null);
  if(error) throw new CoreRepositoryError(error.message);
}

export async function restoreFromDeletion(table:string,id:number):Promise<void>{
  const {error}=await client().from(table).update({active:true,deleted_at:null,deleted_by:null}).eq('id',id).not('deleted_at','is',null);
  if(error) throw new CoreRepositoryError(error.message);
}

export function deletionState(row:{active:boolean;deleted_at?:string|null}):DeletionState{
  if(row.deleted_at) return 'deleted';
  return row.active ? 'active' : 'inactive';
}
