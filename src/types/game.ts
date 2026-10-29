import { Entity, Point2D, MapData } from './entity';

export interface GridConfig {
  size: number; // Pixeles por casilla (ancho y alto de celda cuadrada)
  color: string; // Color hex (ej: #ffffff)
  opacity: number; // 0.0 a 1.0
  visible: boolean;
  snapToGrid: boolean;
  wallsBlockMovement?: boolean; // false por defecto (los tokens pueden atravesar paredes libremente)
}

export type RulerMode = 'straight' | 'radial';
export type DiagonalRule = '5e' | 'alternate' | 'real'; // 5e: todas 1; alternate: 1-2-1-2; real: distancia euclídea continua

export interface RulerState {
  active: boolean;
  mode: RulerMode;
  diagonalRule: DiagonalRule;
  startPos: Point2D | null;
  currentPos: Point2D | null;
  visibleToPlayers: boolean;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface CombatState {
  active: boolean;
  order: string[]; // Lista de ids de tokens en orden de iniciativa
  currentTurnIndex: number;
  round: number;
}

export interface MusicTrack {
  id: string;
  name: string;
  assetId: string;
}

export interface MusicState {
  playlist: MusicTrack[];
  currentTrackId: string | null;
  isPlaying: boolean;
  volume: number;
  loopTrack: boolean;
}

export type AmbientPreset = 'dawn' | 'noon' | 'dusk' | 'night' | 'custom';

export interface AmbientConfig {
  preset: AmbientPreset;
  color: string; // Hex color
  intensity: number; // 0.0 a 1.0 (1.0 = neutral/sin oscuridad)
}

export interface WeatherConfig {
  rain: { enabled: boolean; intensity: number; direction: number }; // 0-100, dirección en grados (90 = vertical abajo)
  snow: { enabled: boolean; intensity: number }; // 0-100
  wind: { enabled: boolean; intensity: number; direction: number }; // 0-100, dirección en grados (0 = hacia la derecha)
}

/** Multipolígono en coordenadas del mundo: lista de polígonos, cada uno con anillo exterior + huecos (formato polygon-clipping). */
export type ExploredMultiPolygon = [number, number][][][];

export interface FogConfig {
  enabled: boolean; // Niebla activa o desactivada para jugadores
  rememberExplored?: boolean; // Recordar zonas exploradas (default: false)
  explored: ExploredMultiPolygon; // Memoria de exploración acumulada de tokens
  revealed?: ExploredMultiPolygon; // Zonas reveladas manualmente con la herramienta
}

export interface PlayerViewport {
  width: number;
  height: number;
}

export interface GameState {
  id: string;
  name: string;
  turnCounter: number;
  grid: GridConfig;
  entities: Entity[];
  playerCamera: CameraState;
  masterCamera: CameraState;
  followMasterCamera: boolean;
  fog: FogConfig;
  playerViewport?: PlayerViewport;
  ambient: AmbientConfig;
  weather: WeatherConfig;
  combat: CombatState;
  music: MusicState;
  createdAt: number;
  updatedAt: number;
  appVersion?: string;
}

export type AssetType = 'image' | 'gif' | 'video' | 'map' | 'audio';

export interface AssetItem {
  id: string;
  name: string;
  type: AssetType;
  mimeType: string;
  blob: Blob;
  tags?: string[];
  createdAt: number;
  width?: number;
  height?: number;
  mapData?: MapData;
}
