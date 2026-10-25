import polygonClipping from 'polygon-clipping';
import { Point2D } from '../../types/entity';
import { ExploredMultiPolygon } from '../../types/game';

type Ring = [number, number][];

const SIMPLIFY_TOLERANCE = 1.5; // px del mundo
const MIN_RING_AREA = 4; // px^2

export function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a) / 2;
}

function perpDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.sqrt(l2);
}

function douglasPeucker(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts;
  let maxD = 0;
  let idx = 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], a, b);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tol) return [a, b];
  const left = douglasPeucker(pts.slice(0, idx + 1), tol);
  const right = douglasPeucker(pts.slice(idx), tol);
  return left.slice(0, -1).concat(right);
}

/** Simplifica un anillo cerrado (primer punto == último) quitando vértices casi colineales. */
function simplifyRing(ring: Ring, tol = SIMPLIFY_TOLERANCE): Ring | null {
  if (ring.length < 4) return null;
  const open = ring.slice(0, -1);
  // Dividir el anillo en dos mitades para aplicar Douglas-Peucker sobre cadenas abiertas
  const mid = Math.floor(open.length / 2);
  const first = douglasPeucker(open.slice(0, mid + 1), tol);
  const second = douglasPeucker(open.slice(mid).concat([open[0]]), tol);
  const merged = first.slice(0, -1).concat(second.slice(0, -1));
  if (merged.length < 3) return null;
  const closed: Ring = [...merged, merged[0]];
  if (ringArea(closed) < MIN_RING_AREA) return null;
  return closed;
}

export function simplifyMulti(multi: ExploredMultiPolygon): ExploredMultiPolygon {
  const out: ExploredMultiPolygon = [];
  for (const poly of multi) {
    const outer = simplifyRing(poly[0] as Ring);
    if (!outer) continue; // anillo exterior degenerado: descartar polígono
    const rings: Ring[] = [outer];
    for (let i = 1; i < poly.length; i++) {
      const hole = simplifyRing(poly[i] as Ring);
      if (hole) rings.push(hole);
    }
    out.push(rings);
  }
  return out;
}

export function toRing(points: Point2D[]): Ring {
  // Redondear a números enteros (resolución de 1px) para evitar micro-astillas flotantes (0.01px)
  // que provocan errores de anillos abiertos en las operaciones booleanas de polygon-clipping.
  const ring: Ring = points.map((p) => [Math.round(p.x), Math.round(p.y)]);
  const dedup: Ring = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    if (ring[i][0] !== dedup[dedup.length - 1][0] || ring[i][1] !== dedup[dedup.length - 1][1]) {
      dedup.push(ring[i]);
    }
  }
  if (dedup.length >= 3 && (dedup[0][0] !== dedup[dedup.length - 1][0] || dedup[0][1] !== dedup[dedup.length - 1][1])) {
    dedup.push([dedup[0][0], dedup[0][1]]);
  }
  return dedup;
}

/** Convierte polígonos de visión (listas de puntos) en un multipolígono simplificado. */
export function visionToMulti(polygons: Point2D[][]): ExploredMultiPolygon {
  const multi: ExploredMultiPolygon = [];
  for (const poly of polygons) {
    if (poly.length < 3) continue;
    const s = simplifyRing(toRing(poly));
    if (s) multi.push([s]);
  }
  return multi;
}

/** Une la visión actual con lo explorado y simplifica. */
export function unionExplored(explored: ExploredMultiPolygon, visionPolygons: Point2D[][]): ExploredMultiPolygon {
  const vision = visionToMulti(visionPolygons);
  if (vision.length === 0) return explored;
  const result = explored.length === 0
    ? polygonClipping.union(vision[0], ...vision.slice(1))
    : polygonClipping.union(explored, ...vision);
  return simplifyMulti(result as ExploredMultiPolygon);
}

function rectToMulti(r: { x: number; y: number; width: number; height: number }): ExploredMultiPolygon {
  return [[[
    [r.x, r.y],
    [r.x + r.width, r.y],
    [r.x + r.width, r.y + r.height],
    [r.x, r.y + r.height],
    [r.x, r.y]
  ]]];
}

export function revealRect(explored: ExploredMultiPolygon, rect: { x: number; y: number; width: number; height: number }): ExploredMultiPolygon {
  const r = rectToMulti(rect);
  const result = explored.length === 0 ? r : polygonClipping.union(explored, r);
  return simplifyMulti(result as ExploredMultiPolygon);
}

export function hideRect(explored: ExploredMultiPolygon, rect: { x: number; y: number; width: number; height: number }): ExploredMultiPolygon {
  if (explored.length === 0) return explored;
  const result = polygonClipping.difference(explored, rectToMulti(rect));
  return simplifyMulti(result as ExploredMultiPolygon);
}

export function countVertices(multi: ExploredMultiPolygon): number {
  let n = 0;
  for (const poly of multi) for (const ring of poly) n += ring.length;
  return n;
}

export function isPointInMulti(pt: Point2D, multi: ExploredMultiPolygon): boolean {
  const inRing = (ring: [number, number][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  for (const poly of multi) {
    if (!inRing(poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (inRing(poly[h])) inHole = true;
    if (!inHole) return true;
  }
  return false;
}

/** Firma barata para detectar cambios sin depender de la identidad del objeto (llega clonado por el canal). */
export function exploredSignature(multi: ExploredMultiPolygon): string {
  let verts = 0;
  let sum = 0;
  for (const poly of multi) {
    for (const ring of poly) {
      verts += ring.length;
      for (const p of ring) sum += p[0] * 1.3 + p[1] * 0.7;
    }
  }
  return `${multi.length}:${verts}:${Math.round(sum)}`;
}
