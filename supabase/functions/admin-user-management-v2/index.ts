// Gestión de usuarios con privilegios de administrador (requiere Service Role Key).
// Acciones soportadas:
//  - create: crea el usuario en auth + su fila user_account + su membresía de empresa
//    (y, si no es ADMIN, le concede acceso a todos los módulos actuales por defecto).
//  - regenerate_credentials: genera una contraseña temporal nueva para un usuario existente
//    y la devuelve una única vez para que el administrador se la entregue al usuario.
// Quien llama debe estar autenticado y ser ADMIN activo de la empresa actual.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_ROUTES = [
  "/ventas/clientes", "/ventas/articulos", "/ventas/presupuestos", "/ventas/pedidos",
  "/compras/proveedores", "/compras/pedidos", "/compras/albaranes",
  "/almacen/almacenes", "/almacen/existencias", "/almacen/movimientos", "/almacen/transferencias", "/almacen/reservas",
  "/gestion/mediciones", "/gestion/montajes", "/gestion/mapa", "/gestion/crm",
  "/facturacion/albaranes", "/facturacion/facturas", "/facturacion/cobros",
  "/produccion/hojas", "/produccion/otd",
  "/informes",
  "/configuracion/tipos-medida", "/configuracion/formas-pago", "/configuracion/condiciones-pago", "/configuracion",
];

const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
});

function randomPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let pass = pick(upper) + pick(lower) + pick(digits) + pick(symbols);
  for (let i = 0; i < bytes.length; i++) pass += all[bytes[i] % all.length];
  return pass.split("").sort(() => Math.random() - 0.5).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return out({ error: "Método no permitido." }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return out({ error: "No autenticado." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !serviceRole) return out({ error: "El servidor no tiene configurado Supabase." }, 500);

    // Cliente "como el usuario que llama" (respeta RLS) — solo para identificarlo.
    const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData?.user) return out({ error: "No autenticado." }, 401);

    // Cliente con Service Role — todas las escrituras privilegiadas pasan por aquí.
    const admin = createClient(url, serviceRole);

    const { data: callerAccount, error: callerError } = await admin
      .from("user_account")
      .select("id, role_code, active, company_id")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (callerError) return out({ error: callerError.message }, 500);
    if (!callerAccount || callerAccount.role_code !== "ADMIN" || !callerAccount.active) {
      return out({ error: "Solo un administrador puede gestionar usuarios." }, 403);
    }
    const companyId = callerAccount.company_id as number | null;
    if (!companyId) return out({ error: "El administrador no tiene una empresa activa." }, 400);

    const body = await req.json().catch(() => null);
    const action = body?.action;

    if (action === "create") {
      const username = String(body?.username || "").trim();
      const displayName = String(body?.display_name || "").trim();
      const email = String(body?.email || "").trim();
      const password = String(body?.password || "");
      const roleCode = String(body?.role_code || "OFFICE");
      const canMeasure = Boolean(body?.can_measure);
      const targetCompanyId = Number(body?.company_id) || companyId;

      if (!username || !displayName || !email || password.length < 8) {
        return out({ error: "Faltan datos obligatorios o la contraseña es demasiado corta." }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (createError || !created?.user) {
        return out({ error: createError?.message || "No se pudo crear el usuario de acceso." }, 400);
      }

      const { data: accountRow, error: insertError } = await admin
        .from("user_account")
        .insert({
          auth_user_id: created.user.id,
          company_id: targetCompanyId,
          username, display_name: displayName, email,
          role_code: roleCode, can_measure: canMeasure, active: true,
        })
        .select("id")
        .single();
      if (insertError || !accountRow) {
        await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
        return out({ error: insertError?.message || "No se pudo crear la ficha de usuario." }, 400);
      }

      await admin.from("user_company").insert({ user_account_id: accountRow.id, company_id: targetCompanyId })
        .then(() => {}).catch(() => {});

      if (roleCode !== "ADMIN") {
        await admin
          .from("user_module_permission")
          .insert(DEFAULT_ROUTES.map((route) => ({ user_account_id: accountRow.id, route_key: route })))
          .then(() => {}).catch(() => {});
      }

      return out({ id: accountRow.id });
    }

    if (action === "regenerate_credentials") {
      const targetId = Number(body?.id);
      if (!targetId) return out({ error: "Falta el identificador del usuario." }, 400);

      const { data: target, error: targetError } = await admin
        .from("user_account")
        .select("id, auth_user_id")
        .eq("id", targetId)
        .maybeSingle();
      if (targetError) return out({ error: targetError.message }, 500);
      if (!target) return out({ error: "Usuario no encontrado." }, 404);

      const { data: membership } = await admin
        .from("user_company")
        .select("user_account_id")
        .eq("user_account_id", targetId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!membership) return out({ error: "Ese usuario no pertenece a tu empresa." }, 403);

      const newPassword = randomPassword();
      const { error: updateError } = await admin.auth.admin.updateUserById(target.auth_user_id, {
        password: newPassword,
      });
      if (updateError) return out({ error: updateError.message }, 400);

      return out({ password: newPassword });
    }

    return out({ error: "Acción no reconocida." }, 400);
  } catch (e) {
    console.error(e);
    return out({ error: e instanceof Error ? e.message : "Error inesperado." }, 500);
  }
});
