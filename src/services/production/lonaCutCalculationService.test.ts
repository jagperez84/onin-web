import { describe, expect, it } from 'vitest';
import { calculateLonaCut } from './lonaCutCalculationService';

const base = { line: 290, selectedWidth: 200, hem: 3, overlap: 2.7 };

describe('calculateLonaCut', () => {
  describe('validation', () => {
    it('rejects a zero selected width', () => {
      expect(() => calculateLonaCut({ ...base, selectedWidth: 0, type: 'Asimétrico' })).toThrow();
    });

    it('rejects negative line dimensions', () => {
      expect(() => calculateLonaCut({ ...base, line: -1, type: 'Asimétrico' })).toThrow();
    });
  });

  describe('Asimétrico', () => {
    it('creates the expected number of panels and a right remainder', () => {
      const result = calculateLonaCut({ ...base, type: 'Asimétrico' });
      expect(result.status).toBe('CALCULATED');
      expect(result.fullPanels).toBe(1);
      expect(result.hasRemainder).toBe(true);
      expect(result.pieces.filter((piece) => piece.kind === 'PANEL')).toHaveLength(1);
      expect(result.pieces.filter((piece) => piece.kind === 'REMAINDER')).toHaveLength(1);
      expect(result.pieces.at(-1)?.side).toBe('RIGHT');
    });

    it('does not create a remainder when the line exactly fills one panel', () => {
      const result = calculateLonaCut({ ...base, line: 200, type: 'Asimétrico' });
      expect(result.hasRemainder).toBe(false);
      expect(result.leftRemainder).toBe(0);
    });
  });

  describe('Retal Maxi', () => {
    it('represents distributed left and right remnants', () => {
      const result = calculateLonaCut({ ...base, type: 'Retal Maxi' });
      expect(result.status).toBe('CALCULATED');
      expect(result.hasRemainder).toBe(true);
      const remnants = result.pieces.filter((piece) => piece.kind === 'REMAINDER');
      expect(remnants).toHaveLength(2);
      expect(remnants.map((piece) => piece.side)).toEqual(['LEFT', 'RIGHT']);
      expect(remnants.every((piece) => piece.length === 200)).toBe(true);
    });
  });

  describe('Retal Mini', () => {
    it('represents distributed left and right remnants', () => {
      const result = calculateLonaCut({ ...base, type: 'Retal Mini' });
      expect(result.status).toBe('CALCULATED');
      expect(result.hasRemainder).toBe(true);
      const remnants = result.pieces.filter((piece) => piece.kind === 'REMAINDER');
      expect(remnants).toHaveLength(2);
      expect(remnants.map((piece) => piece.side)).toEqual(['LEFT', 'RIGHT']);
    });
  });

  describe('Degradee', () => {
    it('uses one piece and does not enable automatic remainder selection', () => {
      const result = calculateLonaCut({ ...base, type: 'Degradee' });
      expect(result.status).toBe('CALCULATED');
      expect(result.fullPanels).toBe(1);
      expect(result.hasRemainder).toBe(false);
      expect(result.automaticRemainderSelectionAllowed).toBe(false);
      expect(result.pieces).toHaveLength(1);
      expect(result.pieces[0].kind).toBe('PANEL');
    });
  });

  describe('Screen', () => {
    it('stays explicitly pending because the legacy calculation is not defined', () => {
      const result = calculateLonaCut({ ...base, type: 'Screen' });
      expect(result.status).toBe('PENDING');
      expect(result.pieces).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('handles a line larger than one selected width', () => {
      const result = calculateLonaCut({ ...base, line: 450, type: 'Asimétrico' });
      expect(result.fullPanels).toBeGreaterThanOrEqual(1);
      expect(result.pieces.length).toBeGreaterThan(0);
    });

    it('keeps remainders non-negative', () => {
      for (const type of ['Asimétrico', 'Retal Maxi', 'Retal Mini'] as const) {
        const result = calculateLonaCut({ ...base, type, line: 1 });
        expect(result.leftRemainder).toBeGreaterThanOrEqual(0);
        expect(result.pieces.every((piece) => piece.width >= 0 && piece.length >= 0)).toBe(true);
      }
    });
  });
});
