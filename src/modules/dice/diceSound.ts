let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Reproduce un sonido sintético de dados rodando y chocando
 * usando la Web Audio API (sin dependencias ni archivos externos).
 */
export function playDiceRollSound(muted = false): void {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const clickCount = 5 + Math.floor(Math.random() * 3);

    for (let i = 0; i < clickCount; i++) {
      const delay = i * 0.12 + Math.random() * 0.06;
      const t = now + delay;

      // Generar pequeño buffer de ruido para el impacto
      const bufferSize = Math.floor(ctx.sampleRate * 0.04);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let j = 0; j < bufferSize; j++) {
        output[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufferSize * 0.3));
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      // Filtro resonante para simular el material plástico/resina del dado
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200 + Math.random() * 1400, t);
      filter.Q.setValueAtTime(4.0, t);

      // Ganancia con caída rápida
      const gain = ctx.createGain();
      const vol = 0.25 * (1 - i / (clickCount * 1.5));
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      noiseSource.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noiseSource.start(t);
      noiseSource.stop(t + 0.05);
    }
  } catch (err) {
    // Si el navegador bloquea audio sin interacción previa, ignorar silenciosamente
  }
}
