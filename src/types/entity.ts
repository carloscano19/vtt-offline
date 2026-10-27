export type EntityType = 'map' | 'token' | 'object' | 'door' | 'light' | 'wall' | 'effect';

export type TokenSide = 'jugador' | 'enemigo' | 'neutral';

export const DEFAULT_STATUS_TYPES = [
  'congelado',
  'aturdido',
  'envenenado',
  'cegado',
  'asustado',
  'paralizado',
  'derribado',
  'agarrado',
  'hechizado',
  'invisible',
  'ensordecido',
  'petrificado',
  'apresado',
  'inconsciente',
  'quemado',
  'sangrando',
  'bendecido',
  'acelerado'
] as const;

export type DefaultStatusType = (typeof DEFAULT_STATUS_TYPES)[number];

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

export interface DoorState {
  isOpen: boolean;
  isLocked: boolean;
  length?: number; // Largo total de la puerta en píxeles (fuente única de largo)
  isHingeInverted?: boolean; // true si la bisagra está en el extremo opuesto
  p1: Point2D; // Bisagra o inicio del segmento de la puerta
  p2: Point2D; // Fin del segmento de la puerta
  openAngle?: number; // Ángulo de apertura en radianes (default Math.PI / 2)
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

export interface EntityAnimations {
  rotation?: {
    enabled: boolean;
    speed: number;
    direction?: 'cw' | 'ccw';
  };
  shake?: {
    enabled: boolean;
    intensity: number;
    speed: number;
  };
  sway?: {
    enabled: boolean;
    distanceInSquares: number; // Distancia en casillas
    speed: number;
    direction: number; // Dirección en grados (0 = horizontal, 90 = vertical)
  };
  bounce?: {
    enabled: boolean;
    speed: number;
    amplitude: number;
  };
}

export interface LightConfig {
  color: string; // Hex e.g. '#ffaa44'
  intensity: number; // 0 a 100 (%)
  brightRadiusInSquares: number; // Radio de luz clara en casillas (default 4)
  dimRadiusInSquares: number; // Radio de luz tenue en casillas adicionales (default 2)
  edgeHardness: number; // 0.0 (suave) a 1.0 (nítido) (default 0.5)
  flicker: boolean; // Parpadeo estilo antorcha
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
  | 'custom';

export interface EffectConfig {
  preset: EffectPresetId;
  category?: 'lights' | 'fire' | 'smoke' | 'arcane';
  color: string;           // Hex principal (ej: '#ff7700')
  secondaryColor?: string; // Hex secundario opcional
  intensity: number;       // 0 a 100 (%)
  speed: number;           // 0.1 a 3.0 (1.0 = normal)
  emitsLight: boolean;     // Emite luz dinámica con el sistema de iluminación existente
  baseLightRadius: number; // Radio de luz base en casillas (se escala con la entidad)
}

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
  locked: boolean;
  opacity?: number; // 0.0 a 1.0 (1.0 = 100% opaco por defecto)

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
  statuses?: TokenStatus[];
  hp?: TokenHp;
}
