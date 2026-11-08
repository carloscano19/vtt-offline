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
 * Reproduce el sonido sintetizado de la trampa de pinchos:
 * 1. Crujido de piedra / temblor de la losa (0.0s - 0.18s).
 * 2. 'Clac' seco metálico y resonancia al golpear arriba los pinchos (0.2s - 0.4s).
 * Totalmente offline mediante Web Audio API.
 */
export function playSpikeTrapSound(muted = false): void {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // --- 1. CRUJIDO / TEMBLOR DE PIEDRA ---
    // Ruido filtrado paso bajo con modulación rápida (fricción de piedra)
    const rumbleDuration = 0.22;
    const rumbleSamples = Math.floor(ctx.sampleRate * rumbleDuration);
    const rumbleBuffer = ctx.createBuffer(1, rumbleSamples, ctx.sampleRate);
    const rData = rumbleBuffer.getChannelData(0);

    for (let i = 0; i < rumbleSamples; i++) {
      const progress = i / rumbleSamples;
      // Amplitud que crece rápido y cae suavemente
      const envelope = Math.sin(progress * Math.PI) * (1 + 0.3 * Math.sin(progress * 40));
      rData[i] = (Math.random() * 2 - 1) * envelope;
    }

    const rumbleSource = ctx.createBufferSource();
    rumbleSource.buffer = rumbleBuffer;

    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(180, now);
    rumbleFilter.frequency.linearRampToValueAtTime(320, now + 0.15);

    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.35, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + rumbleDuration);

    rumbleSource.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(ctx.destination);
    rumbleSource.start(now);

    // Oscilador grave sub-bass para la vibración física de la losa
    const subOsc = ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(65, now);
    subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.2);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.3, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.2);

    // --- 2. 'CLAC' SECO METÁLICO (salida e impacto de pinchos en tope) ---
    const clacTime = now + 0.2;

    // Transitorio percusivo de alta frecuencia (impacto de acero)
    const clickSamples = Math.floor(ctx.sampleRate * 0.08);
    const clickBuffer = ctx.createBuffer(1, clickSamples, ctx.sampleRate);
    const cData = clickBuffer.getChannelData(0);
    for (let i = 0; i < clickSamples; i++) {
      const decay = Math.exp(-i / (clickSamples * 0.15));
      cData[i] = (Math.random() * 2 - 1) * decay;
    }

    const clickSource = ctx.createBufferSource();
    clickSource.buffer = clickBuffer;

    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.setValueAtTime(2400, clacTime);
    clickFilter.Q.setValueAtTime(5.0, clacTime);

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.5, clacTime);
    clickGain.gain.exponentialRampToValueAtTime(0.001, clacTime + 0.08);

    clickSource.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickSource.start(clacTime);

    // Resonancia metálica armónica
    const metalTones = [820, 1450, 2150];
    metalTones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, clacTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.9, clacTime + 0.25);

      const gain = ctx.createGain();
      const initialVol = 0.18 / (idx + 1);
      gain.gain.setValueAtTime(initialVol, clacTime);
      gain.gain.exponentialRampToValueAtTime(0.001, clacTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(clacTime);
      osc.stop(clacTime + 0.25);
    });
  } catch (err) {
    console.warn('Error sintetizando sonido de trampa:', err);
  }
}
