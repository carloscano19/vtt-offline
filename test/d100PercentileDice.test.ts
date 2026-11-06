import { describe, it, expect } from 'vitest';
import { diceManager } from '../src/modules/dice/diceManager';
import { convertRollToNotation } from '../src/modules/dice/dice3dManager';
import { DiceRollResult } from '../src/types/dice';

describe('Corrección 2: d100 como dado único de decenas y combinaciones percentiles', () => {
  it('d100 solo: un único dado con caras 00, 10... 90 y resultado de ese valor (00 es 0)', () => {
    const rolledValues = new Set<number>();

    for (let i = 0; i < 200; i++) {
      const roll = diceManager.generateRoll({
        requestId: `solo_${i}`,
        rollerName: 'Máster',
        dieType: 'd100',
        count: 1,
        modifier: 0,
        advantage: 'none'
      });

      // Debe ser un único dado
      expect(roll.dice.length).toBe(1);
      const die = roll.dice[0];
      expect(die.dieType).toBe('d100');
      expect([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]).toContain(die.value);
      rolledValues.add(die.value);

      if (die.value === 0) {
        expect(die.displayValue).toBe('00');
        expect(roll.total).toBe(0);
        expect(roll.formula).toContain('00 = 0');
      } else {
        expect(die.displayValue).toBe(`${die.value}`);
        expect(roll.total).toBe(die.value);
        expect(roll.formula).toContain(`${die.value} = ${die.value}`);
      }

      // 3D notation para d100 solo
      const notation = convertRollToNotation(roll);
      if (die.value === 0) {
        expect(notation).toBe('1d100@100');
      } else {
        expect(notation).toBe(`1d100@${die.value}`);
      }
    }

    // Debe haber salido al menos el 0 (00) y valores mayores que 0
    expect(rolledValues.has(0)).toBe(true);
    expect(rolledValues.size).toBeGreaterThan(5);
  });

  it('percentil 77: d100 + d10 con decenas 70 y unidades 7 -> Decenas 70 · Unidades 7 = 77', () => {
    // Simulamos directamente un roll result forzado para validar el formato de tarjeta y desglose
    const mockRoll: DiceRollResult = {
      id: 'test_p77',
      rollerName: 'Máster',
      formula: 'Máster: 1d100 + 1d10 → Decenas 70 · Unidades 7 = 77',
      dieType: 'd100',
      dice: [
        { dieType: 'd100', sides: 100, value: 70, displayValue: '70', isTensPercentile: true },
        { dieType: 'd10', sides: 10, value: 7, displayValue: '7', isUnitsPercentile: true }
      ],
      modifier: 0,
      total: 77,
      timestamp: Date.now()
    };

    expect(mockRoll.dice.length).toBe(2);
    expect(mockRoll.dice[0].isTensPercentile).toBe(true);
    expect(mockRoll.dice[1].isUnitsPercentile).toBe(true);
    expect(mockRoll.total).toBe(77);
    expect(mockRoll.formula).toContain('Decenas 70 · Unidades 7 = 77');

    const notation = convertRollToNotation(mockRoll);
    expect(notation).toBe('1d100+1d10@70,7');

    // Comprobar también que el generador puede generar tiradas de d100 + d10 y formatearlas idénticamente
    for (let i = 0; i < 150; i++) {
      const roll = diceManager.generateRoll({
        requestId: `p_${i}`,
        rollerName: 'Máster',
        dicePool: [
          { dieType: 'd100', count: 1 },
          { dieType: 'd10', count: 1 }
        ],
        modifier: 0,
        advantage: 'none'
      });

      expect(roll.dice.length).toBe(2);
      const [tens, units] = roll.dice;
      expect(tens.isTensPercentile).toBe(true);
      expect(units.isUnitsPercentile).toBe(true);
      expect(roll.formula).toContain(`Decenas ${tens.displayValue} · Unidades ${units.displayValue}`);

      const tensVal = tens.displayValue === '00' ? 0 : (tens.displayValue as number);
      const unitsVal = parseInt(units.displayValue as string, 10);
      if (tensVal === 0 && unitsVal === 0) {
        expect(roll.total).toBe(100);
      } else {
        expect(roll.total).toBe(Number(tensVal) + unitsVal);
      }
    }
  });

  it('percentil 00 + 0 = 100: d100 con 00 y d10 con 10 (unidades 0) produce 100', () => {
    // Comprobar que cuando coinciden 00 y 0, el total es 100
    let found00and0 = false;

    // Hacemos suficientes tiradas aleatorias para encontrar un 00 + 0 (probabilidad 1/100)
    for (let i = 0; i < 500; i++) {
      const roll = diceManager.generateRoll({
        requestId: `p_100_${i}`,
        rollerName: 'Máster',
        dicePool: [
          { dieType: 'd100', count: 1 },
          { dieType: 'd10', count: 1 }
        ],
        modifier: 0,
        advantage: 'none'
      });

      const [tens, units] = roll.dice;
      if (tens.displayValue === '00' && units.displayValue === '0') {
        found00and0 = true;
        expect(roll.total).toBe(100);
        expect(roll.formula).toContain('Decenas 00 · Unidades 0 = 100');
        expect(tens.value).toBe(100);
        expect(units.value).toBe(0);

        // 3D notation: d100 forced to 100 (00), d10 forced to 10 (0)
        const notation = convertRollToNotation(roll);
        expect(notation).toBe('1d100+1d10@100,10');
        break;
      }
    }

    expect(found00and0).toBe(true);
  });

  it('d100 + 2d10: solo el primer d10 hace de unidades del percentil; el segundo d10 suma normal (1 a 10)', () => {
    for (let i = 0; i < 100; i++) {
      const roll = diceManager.generateRoll({
        requestId: `multi_${i}`,
        rollerName: 'Jugador',
        dicePool: [
          { dieType: 'd100', count: 1 },
          { dieType: 'd10', count: 2 }
        ],
        modifier: 0,
        advantage: 'none'
      });

      // Debe haber exactamente 3 dados (1 d100 y 2 d10)
      expect(roll.dice.length).toBe(3);

      const [tensDie, unitsDie, extraD10] = roll.dice;

      // Primer dado: decenas del percentil
      expect(tensDie.dieType).toBe('d100');
      expect(tensDie.isTensPercentile).toBe(true);

      // Segundo dado: unidades del percentil
      expect(unitsDie.dieType).toBe('d10');
      expect(unitsDie.isUnitsPercentile).toBe(true);
      expect(unitsDie.value).toBeGreaterThanOrEqual(0);
      expect(unitsDie.value).toBeLessThanOrEqual(9);

      // Tercer dado: d10 normal (1 a 10)
      expect(extraD10.dieType).toBe('d10');
      expect(extraD10.isUnitsPercentile).toBeFalsy();
      expect(extraD10.value).toBeGreaterThanOrEqual(1);
      expect(extraD10.value).toBeLessThanOrEqual(10);

      // Desglose de fórmula: "Decenas XX · Unidades X + Y = Total"
      expect(roll.formula).toContain(`Decenas ${tensDie.displayValue} · Unidades ${unitsDie.displayValue} + ${extraD10.displayValue}`);

      // Comprobar la suma matemática
      const tensVal = tensDie.displayValue === '00' ? 0 : (tensDie.displayValue as number);
      const unitsVal = parseInt(unitsDie.displayValue as string, 10);
      const percentileSubtotal = (tensVal === 0 && unitsVal === 0) ? 100 : Number(tensVal) + unitsVal;

      expect(roll.total).toBe(percentileSubtotal + extraD10.value);

      // 3D notation tiene los 3 dados forzados
      const notation = convertRollToNotation(roll);
      expect(notation).toMatch(/^1d100\+2d10@\d+,\d+,\d+$/);
    }
  });

  it('permite selección de d10 antes de d100 en el pool y los ordena correctamente como percentil', () => {
    const roll = diceManager.generateRoll({
      requestId: 'reverse_order',
      rollerName: 'Máster',
      dicePool: [
        { dieType: 'd10', count: 1 },
        { dieType: 'd100', count: 1 }
      ],
      modifier: 0,
      advantage: 'none'
    });

    expect(roll.dice.length).toBe(2);
    expect(roll.dice[0].dieType).toBe('d100');
    expect(roll.dice[0].isTensPercentile).toBe(true);
    expect(roll.dice[1].dieType).toBe('d10');
    expect(roll.dice[1].isUnitsPercentile).toBe(true);
    expect(roll.formula).toContain('Decenas');
    expect(roll.formula).toContain('Unidades');
  });
});
