import React, { useState, useEffect } from 'react';
import { DieType, SingleDieResult } from '../../types/dice';

interface DiceShapeProps {
  dieType: DieType;
  die: SingleDieResult;
  isRolling: boolean;
}

export const DiceShape: React.FC<DiceShapeProps> = ({ dieType, die, isRolling }) => {
  const [displayValue, setDisplayValue] = useState<number | string>(die.value);

  useEffect(() => {
    if (!isRolling) {
      setDisplayValue(die.value);
      return;
    }

    const interval = setInterval(() => {
      const max = die.sides === 100 ? 100 : die.sides;
      setDisplayValue(Math.floor(Math.random() * max) + 1);
    }, 60);

    return () => clearInterval(interval);
  }, [isRolling, die.value, die.sides]);

  const isNat20 = !isRolling && !die.dropped && die.isNat20;
  const isNat1 = !isRolling && !die.dropped && die.isNat1;

  let borderColor = 'border-slate-500/80';
  let bgColor = 'bg-slate-900/90';
  let textColor = 'text-slate-100';
  let glowStyle = '';

  if (isNat20) {
    borderColor = 'border-amber-400';
    bgColor = 'bg-amber-950/90';
    textColor = 'text-amber-300 font-extrabold';
    glowStyle = 'shadow-[0_0_15px_rgba(245,158,11,0.7)] ring-2 ring-amber-400 animate-pulse';
  } else if (isNat1) {
    borderColor = 'border-rose-500';
    bgColor = 'bg-rose-950/90';
    textColor = 'text-rose-300 font-extrabold';
    glowStyle = 'shadow-[0_0_15px_rgba(244,63,94,0.7)] ring-2 ring-rose-500';
  } else if (die.dropped) {
    borderColor = 'border-slate-700';
    bgColor = 'bg-slate-950/60';
    textColor = 'text-slate-500 line-through';
  }

  // Animación de giro y rebote mientras rueda
  const rollClass = isRolling ? 'animate-bounce' : 'transition-transform duration-300';

  if (dieType === 'd4') {
    return (
      <div
        className={`relative w-12 h-12 flex items-center justify-center text-xs font-bold ${textColor} ${rollClass} ${glowStyle} ${
          die.dropped ? 'opacity-40' : ''
        }`}
        title={`d4: ${die.value}${die.dropped ? ' (descartado)' : ''}`}
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full drop-shadow">
          <polygon
            points="50,10 90,85 10,85"
            fill={isNat20 ? '#78350f' : isNat1 ? '#4c0519' : '#0f172a'}
            stroke={isNat20 ? '#fbbf24' : isNat1 ? '#f43f5e' : '#64748b'}
            strokeWidth="6"
            strokeLinejoin="round"
          />
        </svg>
        <span className="relative z-10 pt-2 font-mono text-sm">{displayValue}</span>
      </div>
    );
  }

  if (dieType === 'd6') {
    return (
      <div
        className={`w-11 h-11 rounded-lg border-2 flex items-center justify-center font-bold text-sm font-mono shadow-md ${bgColor} ${borderColor} ${textColor} ${rollClass} ${glowStyle} ${
          die.dropped ? 'opacity-40' : ''
        }`}
        title={`d6: ${die.value}${die.dropped ? ' (descartado)' : ''}`}
      >
        {displayValue}
      </div>
    );
  }

  if (dieType === 'd8' || dieType === 'd10') {
    return (
      <div
        className={`relative w-12 h-12 flex items-center justify-center text-xs font-bold ${textColor} ${rollClass} ${glowStyle} ${
          die.dropped ? 'opacity-40' : ''
        }`}
        title={`${dieType}: ${die.value}${die.dropped ? ' (descartado)' : ''}`}
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full drop-shadow">
          <polygon
            points="50,8 92,50 50,92 8,50"
            fill={isNat20 ? '#78350f' : isNat1 ? '#4c0519' : '#0f172a'}
            stroke={isNat20 ? '#fbbf24' : isNat1 ? '#f43f5e' : '#64748b'}
            strokeWidth="5"
            strokeLinejoin="round"
          />
        </svg>
        <span className="relative z-10 font-mono text-sm">{displayValue}</span>
      </div>
    );
  }

  if (dieType === 'd12') {
    return (
      <div
        className={`relative w-12 h-12 flex items-center justify-center text-xs font-bold ${textColor} ${rollClass} ${glowStyle} ${
          die.dropped ? 'opacity-40' : ''
        }`}
        title={`d12: ${die.value}${die.dropped ? ' (descartado)' : ''}`}
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full drop-shadow">
          <polygon
            points="50,10 90,38 75,85 25,85 10,38"
            fill={isNat20 ? '#78350f' : isNat1 ? '#4c0519' : '#0f172a'}
            stroke={isNat20 ? '#fbbf24' : isNat1 ? '#f43f5e' : '#64748b'}
            strokeWidth="5"
            strokeLinejoin="round"
          />
        </svg>
        <span className="relative z-10 pt-1 font-mono text-sm">{displayValue}</span>
      </div>
    );
  }

  if (dieType === 'd100') {
    return (
      <div
        className={`w-12 h-12 rounded-xl border-2 flex flex-col items-center justify-center font-bold font-mono shadow-md ${bgColor} ${borderColor} ${textColor} ${rollClass} ${glowStyle} ${
          die.dropped ? 'opacity-40' : ''
        }`}
        title={`d100: ${die.value}${die.dropped ? ' (descartado)' : ''}`}
      >
        <span className="text-xs">{displayValue}%</span>
      </div>
    );
  }

  // Por defecto: d20 (Hexágono / Icosaedro)
  return (
    <div
      className={`relative w-13 h-13 flex items-center justify-center text-xs font-bold ${textColor} ${rollClass} ${glowStyle} ${
        die.dropped ? 'opacity-40' : ''
      }`}
      title={`d20: ${die.value}${die.dropped ? ' (descartado)' : ''}`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full drop-shadow">
        <polygon
          points="50,6 90,28 90,72 50,94 10,72 10,28"
          fill={isNat20 ? '#78350f' : isNat1 ? '#4c0519' : '#0f172a'}
          stroke={isNat20 ? '#fbbf24' : isNat1 ? '#f43f5e' : '#64748b'}
          strokeWidth="5"
          strokeLinejoin="round"
        />
        {/* Líneas interiores de icosaedro */}
        <line x1="50" y1="6" x2="50" y2="94" stroke={isNat20 ? '#f59e0b' : '#334155'} strokeWidth="2" opacity="0.4" />
        <line x1="10" y1="28" x2="90" y2="72" stroke={isNat20 ? '#f59e0b' : '#334155'} strokeWidth="2" opacity="0.4" />
        <line x1="10" y1="72" x2="90" y2="28" stroke={isNat20 ? '#f59e0b' : '#334155'} strokeWidth="2" opacity="0.4" />
      </svg>
      <span className="relative z-10 font-mono text-base font-extrabold">{displayValue}</span>
    </div>
  );
};
