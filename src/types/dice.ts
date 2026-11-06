export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export interface SingleDieResult {
  sides: number;
  value: number;
  dropped?: boolean;
  isNat20?: boolean;
  isNat1?: boolean;
}

export interface DiceRollResult {
  id: string;
  rollerName: string;
  isSecret?: boolean;
  formula: string;
  dieType: DieType;
  dice: SingleDieResult[];
  modifier: number;
  total: number;
  advantage?: 'none' | 'advantage' | 'disadvantage';
  timestamp: number;
}

export interface DiceRollRequest {
  requestId: string;
  rollerName: string;
  dieType: DieType;
  count: number;
  modifier: number;
  advantage: 'none' | 'advantage' | 'disadvantage';
  isSecret?: boolean;
}
