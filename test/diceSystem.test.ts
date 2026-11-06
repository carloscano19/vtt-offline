import { describe, it, expect, beforeEach } from 'vitest';
import { diceManager, generateRandomInteger } from '../src/modules/dice/diceManager';
import { DiceRollRequest, DieType } from '../src/types/dice';
import { convertRollToNotation } from '../src/modules/dice/dice3dManager';


describe('Bloque 2: Dice System with Master Authority', () => {
  it('generates random integers strictly within [min, max] using crypto.getRandomValues', () => {
    for (let i = 0; i < 200; i++) {
      const val = generateRandomInteger(1, 20);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(20);
      expect(Number.isInteger(val)).toBe(true);
    }

    for (let i = 0; i < 100; i++) {
      const val = generateRandomInteger(1, 100);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  it('rolls all standard polyhedral dice types (d4, d6, d8, d10, d12, d20) with correct ranges', () => {
    const diceList: { type: DieType; sides: number }[] = [
      { type: 'd4', sides: 4 },
      { type: 'd6', sides: 6 },
      { type: 'd8', sides: 8 },
      { type: 'd10', sides: 10 },
      { type: 'd12', sides: 12 },
      { type: 'd20', sides: 20 }
    ];

    for (const item of diceList) {
      const req: DiceRollRequest = {
        requestId: `test_${item.type}`,
        rollerName: 'Tester',
        dieType: item.type,
        count: 3,
        modifier: 2,
        advantage: 'none'
      };

      const result = diceManager.generateRoll(req);
      expect(result.dice.length).toBe(3);
      for (const d of result.dice) {
        expect(d.sides).toBe(item.sides);
        expect(d.value).toBeGreaterThanOrEqual(1);
        expect(d.value).toBeLessThanOrEqual(item.sides);
        expect(d.dropped).toBeUndefined();
      }
      const sum = result.dice.reduce((acc, d) => acc + d.value, 0);
      expect(result.total).toBe(sum + 2);
      expect(result.formula).toContain('Tester: 3' + item.type + '+2');
    }
  });

  it('rolls d100 as a percentile pair (tens 00-90 and units 0-9) where 00 + 0 = 100', () => {
    let found100 = false;
    for (let i = 0; i < 300; i++) {
      const result = diceManager.generateRoll({
        requestId: `test_d100_${i}`,
        rollerName: 'Tester',
        dieType: 'd100',
        count: 1,
        modifier: 0,
        advantage: 'none'
      });

      expect(result.dice.length).toBe(2);
      const [tensDie, unitsDie] = result.dice;

      expect(tensDie.dieType).toBe('d100');
      expect(tensDie.isTensPercentile).toBe(true);
      expect(unitsDie.dieType).toBe('d10');

      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeLessThanOrEqual(100);

      if (tensDie.displayValue === '00' && unitsDie.displayValue === '0') {
        expect(result.total).toBe(100);
        found100 = true;
      } else {
        const tensNum = parseInt(tensDie.displayValue as string, 10);
        const unitsNum = parseInt(unitsDie.displayValue as string, 10);
        expect(result.total).toBe(tensNum + unitsNum);
      }
    }
  });

  it('handles advantage correctly by rolling 2 dice and dropping the lower value', () => {
    const req: DiceRollRequest = {
      requestId: 'test_adv',
      rollerName: 'Aragorn',
      dieType: 'd20',
      count: 1,
      modifier: 5,
      advantage: 'advantage'
    };

    for (let i = 0; i < 50; i++) {
      const result = diceManager.generateRoll(req);
      expect(result.dice.length).toBe(2);

      const [d1, d2] = result.dice;
      const higherVal = Math.max(d1.value, d2.value);
      const lowerVal = Math.min(d1.value, d2.value);

      const kept = result.dice.find((d) => !d.dropped);
      const dropped = result.dice.find((d) => d.dropped);

      expect(kept).toBeDefined();
      expect(dropped).toBeDefined();
      expect(kept!.value).toBe(higherVal);
      expect(dropped!.value).toBe(lowerVal);
      expect(result.total).toBe(higherVal + 5);
      expect(result.formula).toContain('(Ventaja)');
    }
  });

  it('handles disadvantage correctly by rolling 2 dice and dropping the higher value', () => {
    const req: DiceRollRequest = {
      requestId: 'test_disadv',
      rollerName: 'Gimli',
      dieType: 'd20',
      count: 1,
      modifier: -2,
      advantage: 'disadvantage'
    };

    for (let i = 0; i < 50; i++) {
      const result = diceManager.generateRoll(req);
      expect(result.dice.length).toBe(2);

      const [d1, d2] = result.dice;
      const higherVal = Math.max(d1.value, d2.value);
      const lowerVal = Math.min(d1.value, d2.value);

      const kept = result.dice.find((d) => !d.dropped);
      const dropped = result.dice.find((d) => d.dropped);

      expect(kept).toBeDefined();
      expect(dropped).toBeDefined();
      expect(kept!.value).toBe(lowerVal);
      expect(dropped!.value).toBe(higherVal);
      expect(result.total).toBe(lowerVal - 2);
      expect(result.formula).toContain('(Desventaja)');
    }
  });

  it('detects Natural 20 and Natural 1 accurately on d20 rolls', () => {
    let foundNat20 = false;
    let foundNat1 = false;

    for (let i = 0; i < 500 && (!foundNat20 || !foundNat1); i++) {
      const result = diceManager.generateRoll({
        requestId: `crit_${i}`,
        rollerName: 'Zeyr',
        dieType: 'd20',
        count: 1,
        modifier: 0,
        advantage: 'none'
      });

      const die = result.dice[0];
      if (die.value === 20) {
        expect(die.isNat20).toBe(true);
        expect(die.isNat1).toBe(false);
        foundNat20 = true;
      } else if (die.value === 1) {
        expect(die.isNat1).toBe(true);
        expect(die.isNat20).toBe(false);
        foundNat1 = true;
      } else {
        expect(die.isNat20).toBe(false);
        expect(die.isNat1).toBe(false);
      }
    }

    expect(foundNat20).toBe(true);
    expect(foundNat1).toBe(true);
  });

  it('caps history to 50 rolls and preserves chronological order (latest first)', () => {
    for (let i = 0; i < 60; i++) {
      diceManager.executeMasterRoll({
        rollerName: `Roller_${i}`,
        dieType: 'd6',
        count: 1,
        modifier: 0,
        advantage: 'none'
      });
    }

    const history = diceManager.getHistory();
    expect(history.length).toBe(50);
    expect(history[0].rollerName).toBe('Roller_59');
    expect(history[49].rollerName).toBe('Roller_10');
  });

  it('soporta tiradas mixtas con múltiples tipos de dados (ej. 2d6 + 1d8 + 3) y desactiva ventaja', () => {
    const req: DiceRollRequest = {
      requestId: 'test_mixed',
      rollerName: 'Gandalf',
      dicePool: [
        { dieType: 'd6', count: 2 },
        { dieType: 'd8', count: 1 }
      ],
      modifier: 3,
      advantage: 'advantage' // Debe ser ignorado porque no es exactamente 1d20
    };

    const result = diceManager.generateRoll(req);
    expect(result.dice.length).toBe(3);

    const d6Dice = result.dice.filter((d) => d.dieType === 'd6');
    const d8Dice = result.dice.filter((d) => d.dieType === 'd8');

    expect(d6Dice.length).toBe(2);
    expect(d8Dice.length).toBe(1);

    expect(d6Dice[0].sides).toBe(6);
    expect(d6Dice[1].sides).toBe(6);
    expect(d8Dice[0].sides).toBe(8);

    expect(result.advantage).toBe('none');
    expect(result.formula).toContain('Gandalf: 2d6 + 1d8+3');

    const sum = result.dice.reduce((acc, d) => acc + d.value, 0);
    expect(result.total).toBe(sum + 3);
  });

  it('genera la notación forzada adecuada para dados 3D con d20, ventaja, percentil d100 y mixtos', () => {
    // 1d20 simple
    const n1 = convertRollToNotation({
      id: '1',
      rollerName: 'A',
      formula: '',
      dice: [{ dieType: 'd20', sides: 20, value: 17 }],
      modifier: 0,
      total: 17,
      timestamp: 0
    });
    expect(n1).toBe('1d20@17');

    // 2d20 con ventaja
    const n2 = convertRollToNotation({
      id: '2',
      rollerName: 'A',
      formula: '',
      dice: [
        { dieType: 'd20', sides: 20, value: 18 },
        { dieType: 'd20', sides: 20, value: 5, dropped: true }
      ],
      modifier: 0,
      total: 18,
      timestamp: 0
    });
    expect(n2).toBe('2d20@18,5');

    // d100 con decenas 70 y unidades 4 -> 74
    const n3 = convertRollToNotation({
      id: '3',
      rollerName: 'A',
      formula: '',
      dice: [
        { dieType: 'd100', sides: 10, value: 70, displayValue: '70', isTensPercentile: true },
        { dieType: 'd10', sides: 10, value: 4, displayValue: '4' }
      ],
      modifier: 0,
      total: 74,
      timestamp: 0
    });
    expect(n3).toBe('1d100+1d10@70,4');

    // d100 con 00 + 0 = 100
    const n4 = convertRollToNotation({
      id: '4',
      rollerName: 'A',
      formula: '',
      dice: [
        { dieType: 'd100', sides: 10, value: 100, displayValue: '00', isTensPercentile: true },
        { dieType: 'd10', sides: 10, value: 0, displayValue: '0' }
      ],
      modifier: 0,
      total: 100,
      timestamp: 0
    });
    expect(n4).toBe('1d100+1d10@100,10');

    // Mixto: 2d6 + 1d8
    const n5 = convertRollToNotation({
      id: '5',
      rollerName: 'A',
      formula: '',
      dice: [
        { dieType: 'd6', sides: 6, value: 5 },
        { dieType: 'd6', sides: 6, value: 3 },
        { dieType: 'd8', sides: 8, value: 8 }
      ],
      modifier: 0,
      total: 16,
      timestamp: 0
    });
    expect(n5).toBe('2d6+1d8@5,3,8');
  });
});


