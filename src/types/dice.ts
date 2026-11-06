export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export interface DiePoolItem {
  dieType: DieType;
  count: number;
}

export interface SingleDieResult {
  dieType?: DieType;
  sides: number;
  value: number;
  displayValue?: string | number;
  isTensPercentile?: boolean;
  isUnitsPercentile?: boolean;
  dropped?: boolean;
  isNat20?: boolean;
  isNat1?: boolean;
}

export interface DiceRollResult {
  id: string;
  rollerName: string;
  isSecret?: boolean;
  formula: string;
  dieType?: DieType;
  dicePool?: DiePoolItem[];
  dice: SingleDieResult[];
  modifier: number;
  total: number;
  advantage?: 'none' | 'advantage' | 'disadvantage';
  timestamp: number;
}

export interface DiceRollRequest {
  requestId: string;
  rollerName: string;
  dieType?: DieType;
  count?: number;
  dicePool?: DiePoolItem[];
  modifier: number;
  advantage: 'none' | 'advantage' | 'disadvantage';
  isSecret?: boolean;
}

