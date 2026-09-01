// Asistente IA para el editor de OTD. Solo atiende peticiones relacionadas con OTD.
// Proveedor: Google Gemini API. Requiere el secreto GEMINI_API_KEY en Supabase.
// Exige un usuario autenticado y no escribe nada en la base de datos.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const MODEL = "gemini-2.5-flash-lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const FUNCTIONS = ["CEIL(x)", "FLOOR(x)", "ROUND(x)", "ROUND(x, decimales)", "MAX(a,b,...)", "MIN(a,b,...)", "ABS(x)", "SQRT(x)", "TRUNC(x)", "TO_M(mm)", "TO_MM(m)", "TO_CM(mm)", "TO_DM(mm)", "TO_M2(mm2) o TO_M2(mm_ancho, mm_alto)", "TO_CM2(...)", "TO_MM2(...)", "TO_KG(g)", "TO_G(kg)"];
const SCOPE_TERMS = ["otd", "orden tecnica", "orden técnica", "despiece", "articulo", "artículo", "producto", "componente", "componentes", "material", "materiales", "pieza", "piezas", "medida", "medidas", "dimension", "dimensión", "dimensiones", "ancho", "alto", "salida", "color", "lona", "toldo", "perfil", "motor", "brazo", "accionamiento", "confeccion", "confección", "formula", "fórmula", "variable", "variables", "entrada", "entradas"];
const isOtdRequest = (p: string) => SCOPE_TERMS.some((t) => p.toLocaleLowerCase("es-ES").includes(t));
const SYSTEM = `Eres un asistente técnico especializado EXCLUSIVAMENTE en definir OTD (Órdenes Técnicas de Despiece) para un ERP de fabricación de toldos y lonas a medida. Solo debes responder a peticiones relacionadas con la estructura de un OTD: entradas de oficina, variables, fórmulas, componentes, materiales, dimensiones y reglas de despiece. Si la petición no está relacionada con esta finalidad, no intentes responderla ni generes una propuesta: devuelve selections=[], variables=[], components=[] y en notes indica brevemente que el asistente solo admite peticiones relacionadas con OTD. Un OTD tiene selections (entradas de oficina), variables (valores numéricos calculados) y components (piezas/materiales). Las fórmulas solo admiten + - * / % y paréntesis. Los identificadores son códigos MAYUSCULAS_CON_GUION_BAJO o funciones ${FUNCTIONS.join(", ")}. Solo puedes referenciar códigos existentes o definidos en tu respuesta. Los códigos deben ser únicos entre selections y variables. selection_type: OPTION, NUMBER, TEXT o BOOLEAN. is_dimension=true solo para medidas físicas. unit_code debe ser uno de los códigos dados o null. component_type: BASIC o IMPROVEMENT. No inventes product_id ni characteristic_id. Devuelve únicamente JSON con selections[{code,name,selection_type,required,is_dimension,unit_code,options[{code,label}]}], variables[{code,name,expression,data_type}], components[{code,description,quantity_expression,component_type,unit_code,dimension_expressions}], notes. Si una lista no aplica, array vacío.`;
const SCHEMA = { type: "OBJECT", properties: { selections: { type: "ARRAY", items: { type: "OBJECT", properties: { code: { type: "STRING" }, name: { type: "STRING" }, selection_type: { type: "STRING", enum: ["OPTION", "NUMBER", "TEXT", "BOOLEAN"] }, required: { type: "BOOLEAN" }, is_dimension: { type: "BOOLEAN" }, unit_code: { type: ["STRING", "NULL"] }, options: { type: "ARRAY", items: { type: "OBJECT", properties: { code: { type: "STRING" }, label: { type: "STRING" } }, required: ["code", "label"] } } }, required: ["code", "name", "selection_type", "required", "is_dimension", "unit_code", "options"] } }, variables: { type: "ARRAY", items: { type: "OBJECT", properties: { code: { type: "STRING" }, name: { type: "STRING" }, expression: { type: "STRING" }, data_type: { type: "STRING", enum: ["NUMBER"] } }, required: ["code", "name", "expression", "data_type"] } }, components: { type: "ARRAY", items: { type: "OBJECT", properties: { code: { type: "STRING" }, description: { type: "STRING" }, quantity_expression: { type: "STRING" }, component_type: { type: "STRING", enum: ["BASIC", "IMPROVEMENT"] }, unit_code: { type: ["STRING", "NULL"] }, dimension_expressions: { type: "OBJECT", additionalProperties: { type: "STRING" } } }, required: ["code", "description", "quantity_expression", "component_type", "unit_code", "dimension_expressions"] } }, notes: { type: "STRING" } }, required: ["selections", "variables", "components", "notes"] };
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return out({ error: "Método no permitido." }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return out({ error: "No autenticado." }, 401);
    const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) return out({ error: "El servidor no tiene configurado Supabase." }, 500);
    const sb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data, error } = await sb.auth.getUser();
    if (error || !data?.user) return out({ error: "No autenticado." }, 401);

    const body = await req.json().catch(() => null);
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return out({ error: "Falta el prompt." }, 400);
    if (!isOtdRequest(prompt)) return out({ error: "Este asistente está especializado en OTD. Describe una necesidad relacionada con entradas, variables, fórmulas, dimensiones o componentes del OTD." }, 400);

    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return out({ error: "El servidor no tiene configurada GEMINI_API_KEY." }, 500);

    const units = Array.isArray(body?.unitCodes) ? body.unitCodes : [];
    const sels = Array.isArray(body?.existingSelections) ? body.existingSelections : [];
    const vars = Array.isArray(body?.existingVariables) ? body.existingVariables : [];
    const context = `Unidades disponibles: ${units.length ? units.join(", ") : "ninguna"}.\nEntradas existentes: ${sels.length ? sels.map((x: any) => x.code).filter(Boolean).join(", ") : "ninguna"}.\nVariables existentes: ${vars.length ? vars.map((x: any) => x.code).filter(Boolean).join(", ") : "ninguna"}.\n\nPetición del usuario:\n${prompt}`;

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: context }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = result?.error?.message || result?.error?.status || `HTTP ${response.status}`;
      console.error(`Gemini API error ${response.status}: ${detail}`);
      return out({ error: `Gemini: ${detail}` }, 502);
    }
    const text = result?.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === "string")?.text;
    if (!text) return out({ error: "Gemini no ha devuelto una respuesta válida." }, 502);
    try { return out(JSON.parse(text)); }
    catch { return out({ error: "Gemini no ha devuelto un JSON válido. Prueba a reformular el prompt." }, 502); }
  } catch (e) {
    return out({ error: e instanceof Error ? e.message : "Error inesperado." }, 500);
  }
});
