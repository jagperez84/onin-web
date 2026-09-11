/**
 * Neutraliza los caracteres con significado especial antes de interpolar un
 * término de búsqueda de usuario en un filtro `ilike` de Supabase/PostgREST:
 *
 * - `%` y `_`: comodines de SQL LIKE. Sin esto, buscar "%" devuelve todas las
 *   filas y "_" actúa como comodín de un carácter.
 * - `,` `(` `)`: metacaracteres del propio lenguaje de filtros de PostgREST
 *   que usa `.or()` (`columna.operador.valor` separados por comas, con
 *   agrupación entre paréntesis). Sin esto, un término de búsqueda con una
 *   coma puede cerrar la condición prevista e inyectar condiciones
 *   adicionales sobre cualquier columna de la tabla.
 *
 * RLS sigue siendo la barrera real de aislamiento por empresa -esto no es
 * lo que evita que un usuario vea datos de otra empresa-, pero un término de
 * búsqueda de texto libre nunca debería poder cambiar la forma de la
 * consulta ni el conjunto de columnas filtradas.
 */
export function sanitizeSearchTerm(value: string): string {
  return value.trim().replace(/[%_,()]/g, '');
}
