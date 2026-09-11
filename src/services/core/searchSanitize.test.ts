import { describe, it, expect } from 'vitest';
import { sanitizeSearchTerm } from './searchSanitize';

describe('sanitizeSearchTerm', () => {
  it('deja pasar texto normal (incluyendo acentos y ñ) sin cambios', () => {
    expect(sanitizeSearchTerm('Toldo Capota')).toBe('Toldo Capota');
    expect(sanitizeSearchTerm('Ñandú Núñez')).toBe('Ñandú Núñez');
  });

  it('recorta espacios en los extremos', () => {
    expect(sanitizeSearchTerm('  hola  ')).toBe('hola');
  });

  it('elimina los comodines de SQL LIKE (% y _)', () => {
    expect(sanitizeSearchTerm('100%')).toBe('100');
    expect(sanitizeSearchTerm('a_b_c')).toBe('abc');
    expect(sanitizeSearchTerm('%')).toBe('');
    expect(sanitizeSearchTerm('_')).toBe('');
  });

  it('elimina los metacaracteres del DSL de filtros .or() de PostgREST (coma y paréntesis)', () => {
    // Sin esto, un término como "x,is_admin.eq.true" podría cerrar la
    // condición ilike prevista e inyectar una condición adicional sobre
    // cualquier otra columna de la tabla.
    expect(sanitizeSearchTerm('x,is_admin.eq.true')).toBe('xisadmin.eq.true');
    expect(sanitizeSearchTerm('and(a,b)')).toBe('andab');
  });

  it('un intento de inyección de filtro completo queda reducido a texto inerte', () => {
    const attempt = 'a%,active.eq.false,or(id.gt.0';
    const result = sanitizeSearchTerm(attempt);
    expect(result).not.toContain(',');
    expect(result).not.toContain('(');
    expect(result).not.toContain(')');
    expect(result).not.toContain('%');
    expect(result).not.toContain('_');
  });

  it('devuelve una cadena vacía si la entrada es solo espacios o caracteres neutralizados', () => {
    expect(sanitizeSearchTerm('   ')).toBe('');
    expect(sanitizeSearchTerm('%_,()')).toBe('');
  });
});
