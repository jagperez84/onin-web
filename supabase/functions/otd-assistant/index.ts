// Asistente IA para el editor de OTD. Solo atiende peticiones relacionadas con OTD.
// Proveedor: Google Gemini Interactions API. Requiere GEMINI_API_KEY en Supabase.
// Exige un usuario autenticado y no escribe nada en la base de datos.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "gemini-3.5-flash-lite";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const FUNCTIONS = [
  "CEIL(x)", "FLOOR(x)", "ROUND(x)", "ROUND(x, decimales)", "MAX(a,b,...)", "MIN(a,b,...)",
  "ABS(x)", "SQRT(x)", "TRUNC(x)", "TO_M(mm)", "TO_MM(m)", "TO_CM(mm)", "TO_DM(mm)",
  "TO_M2(mm2) o TO_M2(mm_ancho, mm_alto)", "TO_CM2(...)", "TO_MM2(...)", "TO_KG(g)", "TO_G(kg)",
];
const SCOPE_TERMS = [
  "otd", "orden tecnica", "orden técnica", "despiece", "articulo", "artículo", "producto",
  "componente", "componentes", "material", "materiales", "pieza", "piezas", "medida", "medidas",
  "dimension", "dimensión", "dimensiones", "ancho", "alto", "salida", "color", "lona", "toldo",
  "perfil", "motor", "brazo", "accionamiento", "confeccion", "confección", "formula", "fórmula",
  "variable", "variables", "entrada", "entradas",
];
const isOtdRequest = (p: string) => {
  const normalized = p.toLocaleLowerCase("es-ES");
  return SCOPE_TERMS.some((term) => normalized.includes(term));
};

const SYSTEM = `Eres un asistente técnico especializado EXCLUSIVAMENTE en definir OTD (Órdenes Técnicas de Despiece) para un ERP de fabricación de toldos y lonas a medida.
Solo debes responder a peticiones relacionadas con la estructura de un OTD: entradas de oficina, variables, fórmulas, componentes, materiales, dimensiones y reglas de despiece.
Si la petición no está relacionada con esta finalidad, no intentes responderla ni generes una propuesta: devuelve selections=[], variables=[], components=[] y en notes indica brevemente que el asistente solo admite peticiones relacionadas con OTD.
Un OTD tiene selections (entradas de oficina), variables (valores numéricos calculados) y components (piezas/materiales).
Las fórmulas solo admiten + - * / % y paréntesis.
Los identificadores son códigos MAYUSCULAS_CON_GUION_BAJO o funciones ${FUNCTIONS.join(", ")}.
Solo puedes referenciar códigos existentes o definidos en tu respuesta. Los códigos deben ser únicos entre selections y variables.
selection_type: OPTION, NUMBER, TEXT o BOOLEAN. is_dimension=true solo para medidas físicas.
unit_code debe ser uno de los códigos dados o una cadena vacía si no aplica.
component_type: BASIC o IMPROVEMENT.
No inventes product_id ni characteristic_id.
Devuelve únicamente JSON con selections[{code,name,selection_type,required,is_dimension,unit_code,options[{code,label}]}], variables[{code,name,expression,data_type}], components[{code,description,quantity_expression,component_type,unit_code,dimension_expressions:[{name,expression}]}], notes.
Si una lista no aplica, array vacío.`;

// Interactions API uses standard JSON Schema in response_format. We deliberately
// represent component dimensions as an array because it is portable and then
// normalize it to the Record<string,string> expected by the OTD editor.
const SCHEMA = {
  type: "object",
  properties: {
    selections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          name: { type: "string" },
          selection_type: { type: "string", enum: ["OPTION", "NUMBER", "TEXT", "BOOLEAN"] },
          required: { type: "boolean" },
          is_dimension: { type: "boolean" },
          unit_code: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: { code: { type: "string" }, label: { type: "string" } },
              required: ["code", "label"],
            },
          },
        },
        required: ["code", "name", "selection_type", "required", "is_dimension", "unit_code", "options"],
      },
    },
    variables: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          name: { type: "string" },
          expression: { type: "string" },
          data_type: { type: "string", enum: ["NUMBER"] },
        },
        required: ["code", "name", "expression", "data_type"],
      },
    },
    components: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          description: { type: "string" },
          quantity_expression: { type: "string" },
          component_type: { type: "string", enum: ["BASIC", "IMPROVEMENT"] },
          unit_code: { type: "string" },
          dimension_expressions: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, expression: { type: "string" } },
              required: ["name", "expression"],
            },
          },
        },
        required: ["code", "description", "quantity_expression", "component_type", "unit_code", "dimension_expressions"],
      },
    },
    notes: { type: "string" },
  },
  required: ["selections", "variables", "components", "notes"],
};

const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
});

function normalizeProposal(value: any) {
  const proposal = value && typeof value === "object" ? value : {};
  const components = Array.isArray(proposal.components) ? proposal.components.map((component: any) => {
    const dimensions = Array.isArray(component?.dimension_expressions) ? component.dimension_expressions : [];
    const dimensionExpressions: Record<string, string> = {};
    for (const item of dimensions) {
      if (item && typeof item.name === "string" && typeof item.expression === "string" && item.name.trim()) {
        dimensionExpressions[item.name.trim()] = item.expression;
      }
    }
    return { ...component, unit_code: typeof component?.unit_code === "string" ? component.unit_code : "", dimension_expressions: dimensionExpressions };
  }) : [];
  const selections = Array.isArray(proposal.selections) ? proposal.selections.map((selection: any) => ({
    ...selection,
    unit_code: typeof selection?.unit_code === "string" ? selection.unit_code : "",
    options: Array.isArray(selection?.options) ? selection.options : [],
  })) : [];
  return {
    selections,
    variables: Array.isArray(proposal.variables) ? proposal.variables : [],
    components,
    notes: typeof proposal.notes === "string" ? proposal.notes : "",
  };
}

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
        model: MODEL,
        system_instruction: SYSTEM,
        input: context,
        generation_config: { max_output_tokens: 4096 },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: SCHEMA,
        },
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = result?.error?.message || result?.error?.status || `HTTP ${response.status}`;
      console.error(`Gemini Interactions API error ${response.status}: ${detail}`);
      return out({ error: `Gemini: ${detail}` }, 502);
    }

    if (result?.status && result.status !== "completed") {
      return out({ error: `Gemini no completó la interacción (${result.status}).` }, 502);
    }

    const text = typeof result?.output_text === "string"
      ? result.output_text
      : result?.steps?.slice?.().reverse?.().find((step: any) => step?.type === "model_output")?.content?.find?.((item: any) => typeof item?.text === "string")?.text;

    if (!text) return out({ error: "Gemini no ha devuelto una respuesta válida." }, 502);
    try {
      return out(normalizeProposal(JSON.parse(text)));
    } catch {
      return out({ error: "Gemini no ha devuelto un JSON válido. Prueba a reformular el prompt." }, 502);
    }
  } catch (e) {
    console.error(e);
    return out({ error: e instanceof Error ? e.message : "Error inesperado." }, 500);
  }
});
