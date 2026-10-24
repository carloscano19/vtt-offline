import { Entity, Point2D } from './entity';

export interface GridConfig {
  size: number; // Pixeles por casilla (ancho y alto de celda cuadrada)
  color: string; // Color hex (ej: #ffffff)
  opacity: number; // 0.0 a 1.0
  visible: boolean;
  snapToGrid: boolean;
}

export type RulerMode = 'straight' | 'radial';
export type DiagonalRule = '5e' | 'alternate'; // 5e: todas 1; alternate: 1-2-1-2

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
  combat: CombatState;
  music: MusicState;
  createdAt: number;
  updatedAt: number;
}

export type AssetType = 'image' | 'gif' | 'video' | 'map';

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
}
