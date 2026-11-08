export type EntityType = 'map' | 'token' | 'object' | 'door' | 'light' | 'wall' | 'effect';

export type TokenSide = 'jugador' | 'enemigo' | 'neutral';

export const DEFAULT_STATUS_TYPES = [
  'Cegado',
  'Hechizado',
  'Ensordecido',
  'Asustado',
  'Agarrado',
  'Incapacitado',
  'Invisible',
  'Paralizado',
  'Petrificado',
  'Envenenado',
  'Derribado',
  'Restringido',
  'Aturdido',
  'Inconsciente',
  'Agotamiento',
  'Congelado',
  'Quemado',
  'Sangrando',
  'Bendecido',
  'Acelerado'
] as const;

export type DefaultStatusType = (typeof DEFAULT_STATUS_TYPES)[number];

export const DEFAULT_STATUS_DESCRIPTIONS: Record<string, string> = {
  Cegado: 'Falla tiradas de ataque basadas en vista; ataques contra él tienen ventaja.',
  Hechizado: 'No puede atacar a quien lo hechizó; quien lo hechizó tiene ventaja en interacción social.',
  Ensordecido: 'Falla pruebas que requieran oído.',
  Asustado: 'Desventaja en pruebas y ataques si la fuente del miedo está a la vista; no puede acercarse.',
  Agarrado: 'Velocidad reducida a 0.',
  Incapacitado: 'No puede realizar acciones ni reacciones.',
  Invisible: 'Imposible de ver sin magia; ventaja en sus ataques y desventaja en ataques recibidos.',
  Paralizado: 'Incapacitado, no puede moverse ni hablar; falla salvaciones de Fuerza y Destreza; ataques a 5 pies son críticos automáticos.',
  Petrificado: 'Transformado en sustancia sólida; incapacitado, resistente a todo daño, inmune a veneno.',
  Envenenado: 'Desventaja en tiradas de ataque y pruebas de característica.',
  Derribado: 'Solo puede arrastrarse; desventaja en ataques propios; ataques a 5 pies tienen ventaja.',
  Restringido: 'Velocidad 0; desventaja en Destreza; ataques contra él tienen ventaja.',
  Aturdido: 'Incapacitado, no puede moverse, habla entrecortado; falla salvaciones de Fuerza y Destreza; ataques contra él tienen ventaja.',
  Inconsciente: 'Incapacitado, cae al suelo; suelta lo que sostiene; falla Fuerza y Destreza; ataques a 5 pies son críticos.',
  Agotamiento: 'Penalizaciones acumulativas a pruebas, velocidad y salvaciones.',
  Congelado: 'Velocidad reducida y vulnerable a impactos físicos.',
  Quemado: 'Sufre daño continuo por fuego al inicio de su turno.',
  Sangrando: 'Pierde puntos de golpe gradualmente cada asalto.',
  Bendecido: 'Bonificador a tiradas de ataque y salvaciones.',
  Acelerado: 'Velocidad duplicada, bonificador a CA y acción adicional.'
};

export interface TokenStatus {
  id: string;
  type: string; // DefaultStatusType o personalizado
  turnsRemaining: number | null; // null = indefinido
  visibleToPlayers: boolean;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface MapWall {
  p1: Point2D;
  p2: Point2D;
  closed?: boolean;
}

export type DoorType = 'normal' | 'revolving' | 'sliding';
export type SlidingMaterial = 'wood' | 'stone' | 'bars';

export interface DoorState {
  isOpen: boolean;
  isLocked: boolean;
  length?: number; // Largo total de la puerta en píxeles (fuente única de largo)
  isHingeInverted?: boolean; // true si la bisagra está en el extremo opuesto
  p1: Point2D; // Bisagra o inicio del segmento de la puerta
  p2: Point2D; // Fin del segmento de la puerta
  openAngle?: number; // Ángulo de apertura en radianes (default Math.PI / 2)
  type?: DoorType; // 'normal' (default), 'revolving', 'sliding'
  slidingMaterial?: SlidingMaterial; // 'wood' (default), 'stone', 'bars'
}

/**
 * Recalcula los extremos p1 (bisagra) y p2 (libre) a partir de posición, largo y rotación.
 */
export function recalculateDoorEndpoints(
  x: number,
  y: number,
  rotation: number,
  length: number,
  isHingeInverted: boolean = false
): { p1: Point2D; p2: Point2D } {
  const halfL = length / 2;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  if (isHingeInverted) {
    return {
      p1: { x: x + halfL * cosR, y: y + halfL * sinR },
      p2: { x: x - halfL * cosR, y: y - halfL * sinR }
    };
  }
  return {
    p1: { x: x - halfL * cosR, y: y - halfL * sinR },
    p2: { x: x + halfL * cosR, y: y + halfL * sinR }
  };
}

/**
 * Rota la puerta alrededor de su bisagra (p1) manteniendo p1 fija en el espacio local.
 * Devuelve el nuevo centro (x, y), rotación y los nuevos endpoints p1 (idéntico) y p2.
 */
export function rotateDoorAroundHinge(
  p1: Point2D,
  newRotation: number,
  length: number,
  isHingeInverted: boolean = false
): { x: number; y: number; rotation: number; p1: Point2D; p2: Point2D } {
  const halfL = length / 2;
  const cosR = Math.cos(newRotation);
  const sinR = Math.sin(newRotation);

  const x = isHingeInverted ? p1.x - halfL * cosR : p1.x + halfL * cosR;
  const y = isHingeInverted ? p1.y - halfL * sinR : p1.y + halfL * sinR;

  const endpoints = recalculateDoorEndpoints(x, y, newRotation, length, isHingeInverted);
  return {
    x,
    y,
    rotation: newRotation,
    p1: { ...p1 },
    p2: endpoints.p2
  };
}

export interface MapPortal {
  position: Point2D;
  bounds: [Point2D, Point2D];
  rotation: number;
  closed: boolean;
  freestanding?: boolean;
  locked?: boolean;
}

export interface MapLight {
  position: Point2D;
  range: number;
  color: string;
  intensity: number;
  shadows?: boolean;
  shape?: 'circle' | 'cone';
  coneAngle?: number;
  directionOffset?: number;
  rotation?: number;
}

export interface MapData {
  pixelsPerGrid: number;
  gridWidth: number;
  gridHeight: number;
  walls: MapWall[];
  portals: MapPortal[];
  lights: MapLight[];
}

export interface EntityFilters {
  hue: number;        // Grados 0-360
  saturation: number; // 0 a 2 (1 = normal)
  brightness: number; // 0 a 2 (1 = normal)
}

export type AnimationPivot = 'center' | 'top' | 'bottom' | 'left' | 'right';
export type SwayMode = 'translate' | 'pendulum';

export interface EntityAnimations {
  pivot?: AnimationPivot; // 'center' por defecto
  rotation?: {
    enabled: boolean;
    speed: number; // vueltas por segundo (v/s)
    direction?: 'cw' | 'ccw';
    isVps?: boolean;
  };
  shake?: {
    enabled: boolean;
    intensity: number;
    speed: number;
  };
  sway?: {
    enabled: boolean;
    mode?: SwayMode; // 'translate' (por defecto) o 'pendulum'
    distanceInSquares: number; // Distancia en casillas (para modo translate)
    angle?: number; // Ángulo de oscilación en grados (10° a 90°, default 30° para modo pendulum)
    speed: number;
    direction: number | string; // Dirección en grados (0 = horizontal, 90 = vertical)
  };
  bounce?: {
    enabled: boolean;
    speed: number;
    amplitude: number;
  };
}

/**
 * Calcula la posición del centro (x, y) y la rotación total de una entidad para que rote
 * alrededor de un punto de giro específico (center, top, bottom, left, right).
 */
export function computePivotTransform(
  baseX: number,
  baseY: number,
  baseRot: number,
  extraRot: number,
  width: number,
  height: number,
  pivot: AnimationPivot = 'center'
): { x: number; y: number; rotation: number } {
  let localPx = 0;
  let localPy = 0;
  const halfW = width / 2;
  const halfH = height / 2;
  switch (pivot) {
    case 'top':
      localPy = -halfH;
      break;
    case 'bottom':
      localPy = halfH;
      break;
    case 'left':
      localPx = -halfW;
      break;
    case 'right':
      localPx = halfW;
      break;
    case 'center':
    default:
      break;
  }

  const cosBase = Math.cos(baseRot);
  const sinBase = Math.sin(baseRot);
  const Px = baseX + (cosBase * localPx - sinBase * localPy);
  const Py = baseY + (sinBase * localPx + cosBase * localPy);

  const totalRot = baseRot + extraRot;
  const cosTotal = Math.cos(totalRot);
  const sinTotal = Math.sin(totalRot);

  const x = Px - (cosTotal * localPx - sinTotal * localPy);
  const y = Py - (sinTotal * localPx + cosTotal * localPy);

  return { x, y, rotation: totalRot };
}

export interface LightConfig {
  enabled?: boolean; // Activa/desactiva la emisión de luz (especialmente para tokens)
  color: string; // Hex e.g. '#ffaa44'
  intensity: number; // 0 a 100 (%)
  brightRadiusInSquares: number; // Radio de luz clara en casillas (default 4)
  dimRadiusInSquares: number; // Radio de luz tenue en casillas adicionales (default 2)
  edgeHardness: number; // 0.0 (suave) a 1.0 (nítido) (default 0.5)
  flicker: boolean; // Parpadeo estilo antorcha
  shape?: 'circle' | 'cone'; // Forma de la luz (default 'circle')
  coneAngle?: number; // Apertura en grados (10 a 180, default 60)
  directionOffset?: number; // Desfase de dirección en grados (0 a 360, default 0)
}

export interface EntityChromaKey {
  enabled: boolean;
  color: string;
  tolerance: number; // 0 a 100 (%)
  active?: boolean;  // Alias retrocompatible
}

export interface TokenVision {
  active: boolean;
  brightRangeInSquares: number; // Alcance claro en casillas (default 4; 0 = ilimitado)
  dimRangeInSquares: number;    // Alcance tenue en casillas adicionales (default 2)
  rangeInSquares?: number;      // Deprecado, para compatibilidad con versiones anteriores
  hardness?: number;
  shape?: 'circle' | 'cone';    // Forma de la visión (default 'circle')
  coneAngle?: number;           // Apertura en grados (10 a 180, default 60)
  directionOffset?: number;     // Desfase de dirección en grados (0 a 360, default 0)
  illuminates?: boolean;        // "Ilumina su entorno", activada por defecto (true)
}

export interface TokenHp {
  current: number;
  max: number;
  visibleToPlayers: boolean;
}

export type EffectPresetId =
  | 'torch'
  | 'campfire'
  | 'brazier'
  | 'lantern'
  | 'candle'
  | 'fire_small'
  | 'fire_large'
  | 'fire_magic'
  | 'smoke_light'
  | 'smoke_dense'
  | 'fog_low'
  | 'magic_seal'
  | 'portal'
  | 'lightning'
  | 'ice_zone'
  | 'blade_pendulum'
  | 'saw_blade'
  | 'spike_trap'
  | 'cross_revolving_door'
  | 'custom';

export interface EffectConfig {
  preset: EffectPresetId;
  category?: 'lights' | 'fire' | 'smoke' | 'arcane' | 'traps';
  color: string;           // Hex principal (ej: '#ff7700')
  secondaryColor?: string; // Hex secundario opcional
  intensity: number;       // 0 a 100 (%)
  speed: number;           // 0.1 a 3.0 (1.0 = normal)
  emitsLight: boolean;     // Emite luz dinámica con el sistema de iluminación existente
  baseLightRadius: number; // Radio de luz base en casillas (se escala con la entidad)

  // Configuración de trampas
  trapLength?: number;     // Longitud en casillas (péndulo / carril de sierra, default 2 o 3)
  trapAngle?: number;      // Ángulo de oscilación para péndulo (10° a 90°, default 45°)
  hasRail?: boolean;       // Si la sierra giratoria tiene carril lineal
  hasBlood?: boolean;      // Mancha de sangre en trampa de pinchos
  spikesOut?: boolean;     // Estado de pinchos
  soundEnabled?: boolean;  // Sonido de trampa activado (default true)
  trapTriggerTime?: number;// Marca temporal de activación sincronizada
  trapMaterial?: 'wood' | 'stone'; // Para cruz giratoria (madera o piedra)
  trapGridSize?: number;   // Tamaño en casillas para trampa (default 3x3 para cruz)
  launchDistance?: number; // Casillas de expulsión fuera del cruce (default 2)
}

export type ShowAnimationType = 'fade' | 'pop' | 'flash' | 'fall';

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  assetId?: string; // Referencia a la biblioteca Dexie (opcional para paredes dibujadas)

  // Transformaciones espaciales en el mundo (píxeles globales)
  x: number;
  y: number;
  rotation: number; // en radianes
  scaleX: number;
  scaleY: number;
  zIndex: number;

  // Control de visibilidad, bloqueo y opacidad
  visibleToPlayers: boolean;
  showAnimation?: ShowAnimationType; // 'fade' (default), 'pop', 'flash', 'fall'
  playOnceOnShow?: boolean;          // Para vídeos: reproducir una vez al mostrar y auto-ocultar
  locked: boolean;
  opacity?: number; // 0.0 a 1.0 (1.0 = 100% opaco por defecto)
  snapToGrid?: boolean; // Ajuste individual a la cuadrícula (true para personajes, false para objetos/luces/efectos)
  hideName?: boolean;   // Ocultar nombre del token en el tablero

  // Datos específicos de mapa (coordenadas relativas locales)
  mapData?: MapData;

  // Datos específicos de pared dibujada ('wall')
  points?: Point2D[];
  closed?: boolean;
  mapId?: string; // ID del mapa al que está anclada (si se dibujó sobre él)

  // Datos específicos de puerta dibujada ('door')
  door?: DoorState;

  // Fase 2: Visión
  vision?: TokenVision;

  // Fase 3: Filtros, animaciones, chroma y luces
  filters?: EntityFilters;
  animations?: EntityAnimations;
  chromaKey?: EntityChromaKey;
  light?: LightConfig;

  // Efectos procedurales animados (Fase Efectos)
  effect?: EffectConfig;

  // Fase 4: Tokens y combate
  side?: TokenSide;
  showRing?: boolean; // Control opcional del anillo de bando
  showRingCustom?: boolean; // Si el usuario ha ajustado manualmente el anillo
  highlightInDarkness?: boolean; // Si la entidad se dibuja por encima de la oscuridad ambiental
  statuses?: TokenStatus[];
  hp?: TokenHp;

  // Control de jugador remoto y movimiento limitado
  controlledBy?: string;
  movementBudget?: number;
  movementState?: {
    remaining: number;
    path: Point2D[];
    turnEnded?: boolean;
  };
}

/**
 * Determina si una entidad debe ajustarse a la cuadrícula por defecto:
 * - Tokens con bando ('jugador', 'enemigo', 'neutral'): true
 * - Objetos (type 'object' o tokens sin bando), efectos y luces: false
 */
export function getDefaultSnapToGrid(entity: { type?: string; side?: string; snapToGrid?: boolean }): boolean {
  if (typeof entity.snapToGrid === 'boolean') {
    return entity.snapToGrid;
  }
  if (entity.type === 'token' && (entity.side === 'jugador' || entity.side === 'enemigo' || entity.side === 'neutral')) {
    return true;
  }
  return false;
}
