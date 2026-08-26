import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

function client(){if(!supabase)throw new CoreRepositoryError('Supabase no está configurado.');return supabase;}

export async function executeLonaConfectionWorkSheet(workSheetId:number):Promise<void>{
  if(!Number.isInteger(workSheetId)||workSheetId<=0)throw new CoreRepositoryError('Hoja de confección no válida.');
  const {error}=await client().rpc('execute_lona_confection_work_sheet',{p_work_sheet_id:workSheetId});
  if(error)throw new CoreRepositoryError(error.message);
}
