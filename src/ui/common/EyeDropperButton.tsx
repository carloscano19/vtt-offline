import React from 'react';
import { Pipette } from 'lucide-react';

interface EyeDropperButtonProps {
  onColorSelect: (hex: string) => void;
  title?: string;
  className?: string;
  iconClassName?: string;
}

export const EyeDropperButton: React.FC<EyeDropperButtonProps> = ({
  onColorSelect,
  title = 'Cuentagotas: tomar color de la pantalla',
  className = 'p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors shrink-0',
  iconClassName = 'w-3.5 h-3.5'
}) => {
  // Ocultar si el navegador no soporta EyeDropper
  if (typeof window === 'undefined' || !('EyeDropper' in window)) {
    return null;
  }

  const handlePick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const eyeDropper = new (window as any).EyeDropper();
      const result = await eyeDropper.open();
      if (result && result.sRGBHex) {
        onColorSelect(result.sRGBHex);
      }
    } catch {
      // Cancelado por el usuario con Escape
    }
  };

  return (
    <button
      type="button"
      onClick={handlePick}
      className={className}
      title={title}
    >
      <Pipette className={iconClassName} />
    </button>
  );
};
