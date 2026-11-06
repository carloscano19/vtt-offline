import { describe, it, expect, beforeEach } from 'vitest';
import { diceManager, generateRandomInteger } from '../src/modules/dice/diceManager';
import { DiceRollRequest, DieType } from '../src/types/dice';

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

  it('rolls all standard dice types (d4, d6, d8, d10, d12, d20, d100) with correct ranges', () => {
    const diceList: { type: DieType; sides: number }[] = [
      { type: 'd4', sides: 4 },
      { type: 'd6', sides: 6 },
      { type: 'd8', sides: 8 },
      { type: 'd10', sides: 10 },
      { type: 'd12', sides: 12 },
      { type: 'd20', sides: 20 },
      { type: 'd100', sides: 100 }
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
});

