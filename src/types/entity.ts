export type EntityType = 'map' | 'token' | 'object' | 'door' | 'light' | 'wall';

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
  p1: Point2D; // Bisagra o inicio del segmento de la puerta
  p2: Point2D; // Fin del segmento de la puerta
  openAngle?: number; // Ángulo de apertura en radianes (default Math.PI / 2)
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
  };
  shake?: {
    enabled: boolean;
    intensity: number;
    speed: number;
  };
  bounce?: {
    enabled: boolean;
    speed: number;
    amplitude: number;
  };
}

export interface EntityChromaKey {
  active: boolean;
  color: string;
  tolerance: number;
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

  // Control de visibilidad y bloqueo
  visibleToPlayers: boolean;
  locked: boolean;

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

  // Fase 3: Filtros, animaciones y chroma
  filters?: EntityFilters;
  animations?: EntityAnimations;
  chromaKey?: EntityChromaKey;

  // Fase 4: Tokens y combate
  side?: TokenSide;
  statuses?: TokenStatus[];
  hp?: TokenHp;
}
