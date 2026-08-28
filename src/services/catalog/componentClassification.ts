/** Determina si un componente del OTD/despiece es una tela, lona o superficie de confección (2D). */
export function isFabricOrLonaComponent(c: any): boolean {
  if (!c) return false;
  const nameStr = `${c.product_code || ''} ${c.product_name || ''} ${c.description || ''} ${c.code || ''}`.toLowerCase();
  return (
    /tela|lona|tejido|canvas|screen|acrilic|acrílic|pvc|confecci[oó]n|enrollable|cortina/i.test(nameStr) ||
    /m2|m²|sqm/i.test(String(c.unit_symbol || c.unit_code || '')) ||
    String(c.component_type || '').toUpperCase() === 'FABRIC' ||
    String(c.component_type || '').toUpperCase() === 'LONA' ||
    String(c.component_type || '').toUpperCase() === 'TELA'
  );
}

/** Determina con precisión si un componente del OTD es un perfil cortable lineal (1D) y no una tela/lona (2D). */
export function isProfileComponent(c: any): boolean {
  if (!c) return false;
  const nameStr = `${c.product_code || ''} ${c.product_name || ''} ${c.description || ''} ${c.code || ''}`.toLowerCase();

  // 1. Excluir explícitamente telas, lonas y superficies de confección (2D)
  if (isFabricOrLonaComponent(c)) return false;

  // 2. Comprobar dimensiones
  const dims = c.dimension_list || c.dimensions || [];
  const dimEntries: Array<{ code?: string; name?: string; value?: number }> = Array.isArray(dims)
    ? dims
    : (typeof dims === 'object' && dims !== null
        ? Object.entries(dims).map(([code, value]) => ({ code, value: Number(value) }))
        : []);

  const validDims = dimEntries.filter((d: any) => Number(d.value) > 0);

  // Si tiene múltiples dimensiones de superficie (ej. ANCHO y SALIDA o ANCHO y ALTO), es una tela/lona 2D
  const has2DDimensions =
    validDims.some((d: any) => /salida|alto|height/i.test(String(d.name || d.code))) &&
    validDims.some((d: any) => /ancho|linea|línea|width/i.test(String(d.name || d.code)));

  if (validDims.length > 1 && has2DDimensions) {
    return false;
  }

  // 3. Palabras clave y características de perfil
  const isProfileType =
    String(c.component_type || '').toUpperCase() === 'PROFILE' ||
    String(c.component_type || '').toUpperCase() === 'PERFIL';

  const isProfileName =
    /perfil|profile|tubo|gu[ií]a|eje|travesa[ñn]o|terminal|z[oó]calo|lama|carril|barra|junquillo|test-per/i.test(nameStr);

  const hasLinearLength = validDims.some((d: any) =>
    /long|largo|length|dim|medida|corte/i.test(String(d.name || d.code)) && Number(d.value) > 0
  );

  return isProfileType || isProfileName || (hasLinearLength && validDims.length <= 1);
}
