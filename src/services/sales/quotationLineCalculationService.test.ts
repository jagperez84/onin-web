import { describe, it, expect } from 'vitest';
import { computeAttributeIncrements } from './quotationLineCalculationService';
import type { MasterProductConfiguration } from '../catalog/productConfigurationService';
import type { QuotationLineCharacteristicDraft } from './quotationCreationRepository';

type AttrDef = MasterProductConfiguration['attributes'][number];

function baseAttr(overrides: Partial<AttrDef> = {}): AttrDef {
  return {
    assignment_id: 1,
    attribute_id: 1,
    code: 'METAL',
    name: 'Metal',
    data_type: 'OPTION',
    required: false,
    sort_order: 0,
    scaled: false,
    pvp: null,
    scaleRows: [],
    values: [],
    ...overrides,
  };
}

function draft(overrides: Partial<QuotationLineCharacteristicDraft> = {}): QuotationLineCharacteristicDraft {
  return {
    attribute_id: 1,
    attribute_value_id: null,
    value_text: null,
    value_number: null,
    value_boolean: null,
    ...overrides,
  };
}

describe('computeAttributeIncrements', () => {
  it('una característica obligatoria con PVP plano siempre suma su precio, aunque no se haya seleccionado nada', () => {
    const increments = computeAttributeIncrements(
      [baseAttr({ required: true, pvp: 25 })],
      [],
      {},
    );
    expect(increments).toHaveLength(1);
    expect(increments[0].amount).toBe(25);
    expect(increments[0].type).toBe('attribute');
  });

  it('una característica opcional con PVP plano no suma nada si el usuario no ha elegido ningún valor para ella', () => {
    const increments = computeAttributeIncrements(
      [baseAttr({ required: false, pvp: 25 })],
      [],
      {},
    );
    expect(increments).toHaveLength(0);
  });

  it('una característica opcional sí suma su precio en cuanto el usuario elige un valor para ella', () => {
    const increments = computeAttributeIncrements(
      [baseAttr({ required: false, pvp: 25 })],
      [draft({ attribute_value_id: 7 })],
      {},
    );
    expect(increments).toHaveLength(1);
    expect(increments[0].amount).toBe(25);
  });

  it('ignora el PVP plano cuando es 0 o nulo', () => {
    const increments = computeAttributeIncrements(
      [baseAttr({ required: true, pvp: 0 }), baseAttr({ assignment_id: 2, attribute_id: 2, pvp: null, required: true })],
      [],
      {},
    );
    expect(increments).toHaveLength(0);
  });

  it('una característica escalada aplica el escalón cuyas dimensiones cubren la línea, no el primero de la lista', () => {
    const increments = computeAttributeIncrements(
      [
        baseAttr({
          required: true,
          scaled: true,
          scaleRows: [
            { dimension_1: 1000, dimension_2: null, price: 10 },
            { dimension_1: 2000, dimension_2: null, price: 20 },
            { dimension_1: 3000, dimension_2: null, price: 30 },
          ],
        }),
      ],
      [],
      { ancho: 1500 },
    );
    expect(increments).toHaveLength(1);
    expect(increments[0].amount).toBe(20);
  });

  it('una característica escalada sin ningún escalón que cubra la dimensión pedida no suma nada (no bloquea el precio de la línea)', () => {
    const increments = computeAttributeIncrements(
      [baseAttr({ required: true, scaled: true, scaleRows: [{ dimension_1: 1000, dimension_2: null, price: 10 }] })],
      [],
      { ancho: 5000 },
    );
    expect(increments).toHaveLength(0);
  });
});
