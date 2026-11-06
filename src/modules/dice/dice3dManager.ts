import { DiceRollResult } from '../../types/dice';

export function isWebGLSupported(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

/**
 * Convierte un DiceRollResult en la notación de tiro forzado para @3d-dice/dice-box-threejs
 * Ejemplo: 2d6+1d8@4,2,7 o 1d100+1d10@70,4 o 2d20@18,5
 */
export function convertRollToNotation(roll: DiceRollResult): string {
  if (!roll.dice || roll.dice.length === 0) {
    return '1d20@20';
  }

  // Agrupar tipos de dados manteniendo el orden en que aparecen en roll.dice
  const sets: { type: string; count: number }[] = [];
  const forcedValues: (number | string)[] = [];

  for (const die of roll.dice) {
    let dieTypeStr = die.dieType || roll.dieType || 'd20';
    let forcedVal: number | string = die.value;

    if (die.isTensPercentile || dieTypeStr === 'd100') {
      dieTypeStr = 'd100';
      // Para d100 tens, 00 se representa como 100 en la librería
      forcedVal = (die.displayValue === '00' || die.value === 0 || die.value === 100) ? 100 : die.value;
    } else if (dieTypeStr === 'd10') {
      dieTypeStr = 'd10';
      // Para d10 units, 0 se representa como 10 en la librería
      forcedVal = (die.displayValue === '0' || die.value === 0) ? 10 : die.value;
    }

    forcedValues.push(forcedVal);

    // Si el último grupo es del mismo tipo, incrementamos el contador
    const lastSet = sets[sets.length - 1];
    if (lastSet && lastSet.type === dieTypeStr) {
      lastSet.count++;
    } else {
      sets.push({ type: dieTypeStr, count: 1 });
    }
  }

  const setStr = sets.map((s) => `${s.count}${s.type}`).join('+');
  return `${setStr}@${forcedValues.join(',')}`;
}

class Dice3DManager {
  private boxInstance: any = null;
  private initializingPromise: Promise<any> | null = null;
  private isAvailable: boolean = true;
  private containerElement: HTMLElement | null = null;
  private clearTimer: any = null;

  public async getBox(containerSelector = '#dice-3d-box'): Promise<any> {
    if (!isWebGLSupported()) {
      this.isAvailable = false;
      return null;
    }

    if (this.boxInstance) {
      return this.boxInstance;
    }

    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.initializingPromise = (async () => {
      try {
        const el = document.querySelector(containerSelector) as HTMLElement;
        if (!el) {
          return null;
        }
        this.containerElement = el;

        // Carga diferida con import() dinámico solo la primera vez que se tira
        const { default: DiceBox } = await import('@3d-dice/dice-box-threejs');

        const box = new DiceBox(containerSelector, {
          assetPath: '/dice-box/',
          sounds: false, // Usamos el generador de audio sintético / Web Audio ya integrado
          shadows: true,
          gravity_multiplier: 400,
          baseScale: 100,
          theme_surface: 'green-felt',
          theme_material: 'plastic',
          theme_colorset: 'white'
        });

        await box.initialize();
        this.boxInstance = box;
        return box;
      } catch (err) {
        console.warn('[Dice3DManager] Error al inicializar 3D dice-box, degradando a 2D:', err);
        this.isAvailable = false;
        return null;
      } finally {
        this.initializingPromise = null;
      }
    })();

    return this.initializingPromise;
  }

  /**
   * Lanza los dados en 3D con animación física y aterrizaje en los valores del máster
   */
  public async roll(roll: DiceRollResult, containerSelector = '#dice-3d-box'): Promise<void> {
    const box = await this.getBox(containerSelector);
    if (!box) {
      // Fallback inmediato si no hay 3D disponible
      return;
    }

    // Cancelar cualquier temporizador previo de limpieza
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }

    if (this.containerElement) {
      this.containerElement.style.opacity = '1';
      this.containerElement.style.transition = 'opacity 0.2s ease-in';
    }

    const notation = convertRollToNotation(roll);

    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      // Temporizador de seguridad por si la física tarda más de 2.2s en estabilizarse
      const safetyTimer = setTimeout(done, 2200);

      try {
        box.roll(notation).then(() => {
          clearTimeout(safetyTimer);
          done();
        }).catch((err: any) => {
          console.warn('[Dice3DManager] Error en simulación 3D:', err);
          clearTimeout(safetyTimer);
          done();
        });
      } catch (err) {
        console.warn('[Dice3DManager] Fallo al iniciar tiro 3D:', err);
        clearTimeout(safetyTimer);
        done();
      }
    }).finally(() => {
      // Los dados se desvanecen a los ~4 s desde el lanzamiento
      this.clearTimer = setTimeout(() => {
        if (this.containerElement) {
          this.containerElement.style.transition = 'opacity 0.6s ease-out';
          this.containerElement.style.opacity = '0';
        }
        setTimeout(() => {
          try {
            box.clearDice();
          } catch {}
        }, 600);
      }, 3500);
    });
  }
}

export const dice3dManager = new Dice3DManager();
