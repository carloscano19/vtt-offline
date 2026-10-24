import { Point2D } from './entity';

export interface UVTTPortal {
  position: Point2D;
  bounds: [Point2D, Point2D];
  rotation: number;
  closed: boolean;
  freestanding?: boolean;
}

export interface UVTTLight {
  position: Point2D;
  range: number;
  color: string;
  intensity: number;
  shadows?: boolean;
}

export interface UVTTResolution {
  map_origin: Point2D;
  map_size: Point2D;
  pixels_per_grid: number;
}

export interface UVTTData {
  format: number;
  resolution: UVTTResolution;
  image: string; // Base64
  line_of_sight?: Point2D[][];
  objects_line_of_sight?: Point2D[][];
  portals?: UVTTPortal[];
  lights?: UVTTLight[];
}
