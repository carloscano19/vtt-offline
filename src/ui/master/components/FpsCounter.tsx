import React, { useEffect, useState } from 'react';

/**
 * Contador de FPS en tiempo real para la ventana del máster.
 * Oculto por defecto, se activa y desactiva con la tecla 'F'.
 */
export const FpsCounter: React.FC = () => {
  const [fps, setFps] = useState(60);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      frameCount++;
      const elapsed = now - lastTime;
      if (elapsed >= 500) {
        setFps(Math.round((frameCount * 1000) / elapsed));
        frameCount = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  const colorStyle =
    fps >= 55
      ? 'text-emerald-400 bg-slate-900/90 border-emerald-500/50'
      : fps >= 30
      ? 'text-amber-400 bg-slate-900/90 border-amber-500/50'
      : 'text-rose-400 bg-slate-900/90 border-rose-500/50';

  return (
    <div
      className={`fixed bottom-2 right-2 z-50 pointer-events-none select-none font-mono text-xs px-2.5 py-1 rounded-md border shadow-xl backdrop-blur-sm flex items-center gap-1.5 transition-colors ${colorStyle}`}
      title="Rendimiento en tiempo real (Tecla F para ocultar)"
    >
      <span className="w-2 h-2 rounded-full animate-pulse bg-current" />
      <span className="font-bold">{fps}</span>
      <span className="text-[10px] opacity-70">FPS</span>
    </div>
  );
};
