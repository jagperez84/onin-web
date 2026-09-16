// Proxy de búsqueda de direcciones (Nominatim/OpenStreetMap) usado por el buscador de
// direcciones de Clientes, Mediciones y el Mapa (ver src/services/address/openStreetMap.ts).
// Existe como función propia porque Nominatim exige una cabecera User-Agent identificando
// la aplicación (su política de uso prohíbe llamarlo directamente desde el navegador con el
// User-Agent genérico del cliente) y para exigir un usuario autenticado.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "onin-web/1.0 (ERP de toldos; soporte@onin.app)";

const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return out({ error: "Método no permitido." }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return out({ error: "No autenticado." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) return out({ error: "El servidor no tiene configurado Supabase." }, 500);

    const sb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data, error } = await sb.auth.getUser();
    if (error || !data?.user) return out({ error: "No autenticado." }, 401);

    const body = await req.json().catch(() => null);
    const q = typeof body?.q === "string" ? body.q.trim() : "";
    if (q.length < 3) return out([]);

    const params = new URLSearchParams({
      format: "json",
      addressdetails: "1",
      limit: "8",
      "accept-language": "es",
      q,
    });

    const response = await fetch(`${NOMINATIM_ENDPOINT}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) {
      return out({ error: `Nominatim respondió con error (HTTP ${response.status}).` }, 502);
    }

    const results = await response.json().catch(() => null);
    if (!Array.isArray(results)) return out({ error: "Nominatim no devolvió una respuesta válida." }, 502);

    return out(results.map((r: any) => ({
      display_name: r.display_name,
      lat: r.lat,
      lon: r.lon,
      address: r.address,
    })));
  } catch (e) {
    console.error(e);
    return out({ error: e instanceof Error ? e.message : "Error inesperado." }, 500);
  }
});
