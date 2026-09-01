// Asistente IA para el editor de OTD: a partir de un prompt en lenguaje
// natural, propone entradas para oficina, variables calculadas y
// componentes. No escribe nada en la base de datos — solo devuelve una
// propuesta en JSON que el editor (OtdEditor.tsx) valida y muestra para que
// el usuario decida qué aceptar.
//
// Requiere el secreto ANTHROPIC_API_KEY:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Desplegar con:
//   supabase functions deploy otd-assistant
//
// Exige un usuario autenticado de la app (mismo JWT que usa el resto de
// llamadas a Supabase) para que esto no quede abierto a cualquiera con la
// clave anónima pública — cada llamada gasta tokens reales de la API.

import Anthropic from "npm:@anthropic-ai/sdk@0.71.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Debe reflejar exactamente el grammar de src/services/otd/formulaEngine.ts
// — si esa lista cambia, esta debe actualizarse a la vez.
const FORMULA_FUNCTIONS = [
  "CEIL(x)", "FLOOR(x)", "ROUND(x)", "ROUND(x, decimales)", "MAX(a,b,...)", "MIN(a,b,...)",
  "ABS(x)", "SQRT(x)", "TRUNC(x)", "TO_M(mm)", "TO_MM(m)", "TO_CM(mm)", "TO_DM(mm)",
  "TO_M2(mm2) o TO_M2(mm_ancho, mm_alto)", "TO_CM2(...)", "TO_MM2(...)", "TO_KG(g)", "TO_G(kg)",
];

const SYSTEM_PROMPT = `Eres un asistente técnico que ayuda a definir OTD (Órdenes Técnicas de Despiece) para un ERP de fabricación de toldos y lonas a medida.

Un OTD tiene tres listas:
1. "selections" (entradas para oficina): parámetros que el comercial rellena al presupuestar (ancho, alto, color, tipo de accionamiento...).
2. "variables": valores numéricos intermedios calculados con una fórmula a partir de selections y/o otras variables (p. ej. superficie).
3. "components": piezas/materiales que consume el producto, con una fórmula de cantidad y, opcionalmente, fórmulas de dimensión por cada dimensión del artículo.

Reglas estrictas del lenguaje de fórmulas (aplican a "expression" de variables, "quantity_expression" y cada valor de "dimension_expressions" de componentes):
- Solo aritmética: + - * / % y paréntesis, nada de texto, condicionales ni bucles.
- Cada identificador es o bien un código de selection/variable (MAYUSCULAS_CON_GUION_BAJO) o una de estas funciones: ${FORMULA_FUNCTIONS.join(", ")}.
- Una fórmula solo puede referenciar códigos que tú mismo definas en esta respuesta o que ya existan (te los paso como contexto) — nunca un código que no exista.

Reglas de códigos y campos:
- code en MAYUSCULAS_CON_GUION_BAJO, sin espacios ni acentos, único entre selections y variables (comparten el mismo espacio de nombres al evaluarse).
- selection_type es "OPTION" (incluye options[]), "NUMBER", "TEXT" o "BOOLEAN". Marca is_dimension=true solo en las que sean medidas físicas de corte (ancho, alto, salida...).
- unit_code, si aplica, debe ser exactamente uno de los códigos de unidad disponibles que te paso como contexto; si ninguno encaja, omite el campo (null).
- component_type es "BASIC" (siempre incluido) o "IMPROVEMENT" (mejora opcional con incremento de precio).
- No inventes product_id ni characteristic_id — el usuario los asignará a mano después desde el catálogo real.

Responde ÚNICAMENTE con un objeto JSON válido (sin \`\`\`, sin texto antes o después de las llaves) con esta forma exacta:
{
  "selections": [{"code": string, "name": string, "selection_type": "OPTION"|"NUMBER"|"TEXT"|"BOOLEAN", "required": boolean, "is_dimension": boolean, "unit_code": string|null, "options": [{"code": string, "label": string}]}],
  "variables": [{"code": string, "name": string, "expression": string, "data_type": "NUMBER"}],
  "components": [{"code": string, "description": string, "quantity_expression": string, "component_type": "BASIC"|"IMPROVEMENT", "unit_code": string|null, "dimension_expressions": {"<codigo_dimension>": string}}],
  "notes": string
}
Si el prompt no da pie a alguna de las tres listas, devuélvela como array vacío. "options" solo aplica a selection_type "OPTION" (si no, array vacío). "dimension_expressions" solo si el componente necesita dimensiones propias (si no, objeto vacío). "notes" es un resumen breve en español de lo propuesto y de cualquier suposición que hayas hecho por falta de datos en el prompt.`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "No autenticado." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: "El servidor no tiene configurado Supabase." }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) {
      return jsonResponse({ error: "No autenticado." }, 401);
    }

    const body = await req.json().catch(() => null);
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return jsonResponse({ error: "Falta el prompt." }, 400);

    const unitCodes: string[] = Array.isArray(body?.unitCodes) ? body.unitCodes : [];
    const existingSelections: Array<{ code?: string }> = Array.isArray(body?.existingSelections) ? body.existingSelections : [];
    const existingVariables: Array<{ code?: string }> = Array.isArray(body?.existingVariables) ? body.existingVariables : [];

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "El servidor no tiene configurada ANTHROPIC_API_KEY." }, 500);
    }

    const client = new Anthropic({ apiKey });

    const contextLines = [
      `Unidades disponibles (unit_code): ${unitCodes.length ? unitCodes.join(", ") : "ninguna"}.`,
      `Entradas ya existentes en este OTD: ${existingSelections.length ? existingSelections.map((s) => s.code).filter(Boolean).join(", ") : "ninguna"}.`,
      `Variables ya existentes en este OTD: ${existingVariables.length ? existingVariables.map((v) => v.code).filter(Boolean).join(", ") : "ninguna"}.`,
    ].join("\n");

    // Haiku 4.5: el modelo más económico de la gama, elegido a propósito
    // para esta demo — la tarea (rellenar un JSON con una gramática de
    // fórmulas cerrada y validable) no necesita el razonamiento de Opus.
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `${contextLines}\n\nPetición del usuario:\n${prompt}` },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return jsonResponse({ error: "El asistente no ha devuelto una respuesta de texto." }, 502);
    }

    let proposal: unknown;
    try {
      const raw = textBlock.text.trim().replace(/^```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
      proposal = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: "El asistente no ha devuelto un JSON válido. Prueba a reformular el prompt." }, 502);
    }

    return jsonResponse(proposal);
  } catch (e) {
    const message =
      e instanceof Anthropic.APIError ? `Error de la API de Claude: ${e.message}` :
      e instanceof Error ? e.message :
      "Error inesperado.";
    return jsonResponse({ error: message }, 500);
  }
});
