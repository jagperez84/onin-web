import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const roles = new Set(['ADMIN', 'OFFICE', 'WORKSHOP', 'CONFECTION', 'INSTALLER']);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: cors });
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'No autorizado.' }, 401);

    const token = auth.replace(/^Bearer\s+/i, '');
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !caller) return json({ error: 'Sesión no válida.' }, 401);

    // service_role bypasses RLS, so the tenant boundary MUST be enforced here.
    const { data: callerAccount, error: callerError } = await adminClient
      .from('user_account')
      .select('id,role_code,active,company_id')
      .eq('auth_user_id', caller.id)
      .maybeSingle();
    if (callerError) throw callerError;
    if (!callerAccount?.active || callerAccount.role_code !== 'ADMIN' || callerAccount.company_id == null) {
      return json({ error: 'Solo un administrador de la empresa activa puede gestionar usuarios.' }, 403);
    }

    const companyId = Number(callerAccount.company_id);
    const { data: membership, error: membershipError } = await adminClient
      .from('user_company')
      .select('id')
      .eq('user_account_id', callerAccount.id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return json({ error: 'El administrador no pertenece al realm activo.' }, 403);

    const payload = await req.json();
    if ((payload.action ?? 'create') !== 'create') return json({ error: 'Operación no soportada.' }, 400);

    if (payload.company_id != null && Number(payload.company_id) !== companyId) {
      return json({ error: 'No puedes crear usuarios en una empresa distinta del realm activo.' }, 403);
    }

    const { username, display_name, email, password, role_code, can_measure = false } = payload;
    if (!username || !display_name || !email || !password || !roles.has(role_code)) {
      return json({ error: 'Faltan datos obligatorios del usuario.' }, 400);
    }
    if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name },
      app_metadata: { role: role_code },
    });
    if (createError || !created.user) throw createError ?? new Error('No se pudo crear el usuario.');

    const { data: account, error: accountError } = await adminClient
      .from('user_account')
      .insert({
        auth_user_id: created.user.id,
        company_id: companyId,
        username,
        display_name,
        email,
        role_code,
        can_measure,
        active: true,
      })
      .select('id')
      .single();

    if (accountError || !account) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      throw accountError ?? new Error('No se pudo crear la cuenta de usuario.');
    }

    const { error: companyError } = await adminClient
      .from('user_company')
      .insert({ user_account_id: account.id, company_id: companyId });
    if (companyError) {
      await adminClient.from('user_account').delete().eq('id', account.id);
      await adminClient.auth.admin.deleteUser(created.user.id);
      throw companyError;
    }

    return json({ id: created.user.id });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, 500);
  }
});
