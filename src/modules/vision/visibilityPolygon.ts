import { Point2D } from '../../types/entity';
import { WallSegment } from '../walls/wallManager';

export interface TokenVisibility {
  tokenId: string;
  center: Point2D;
  brightPolygon: Point2D[];
  totalPolygon: Point2D[];
  polygon: Point2D[]; // alias de totalPolygon para compatibilidad
  brightRangePx: number;
  totalRangePx: number;
  rangePx: number; // alias de totalRangePx para compatibilidad
  hardness: number; // 0 = difuminado, 1 = nítido
  losPolygon?: Point2D[]; // Línea de visión ilimitada (hasta paredes) para ver zonas iluminadas lejanas
}

function distToSegment(p: Point2D, v: Point2D, w: Point2D): number {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  a = a % twoPi;
  if (a < 0) a += twoPi;
  return a;
}

/**
 * Calcula la intersección de un rayo desde el origen `origin` en dirección `(dx, dy)`
 * con un segmento `[p1, p2]`.
 */
function getRayIntersection(
  origin: Point2D,
  dx: number,
  dy: number,
  p1: Point2D,
  p2: Point2D
): { point: Point2D; distance: number; angle: number } | null {
  const r_px = origin.x;
  const r_py = origin.y;
  const r_dx = dx;
  const r_dy = dy;

  const s_px = p1.x;
  const s_py = p1.y;
  const s_dx = p2.x - p1.x;
  const s_dy = p2.y - p1.y;

  const r_mag = Math.hypot(r_dx, r_dy);
  const s_mag = Math.hypot(s_dx, s_dy);
  if (r_mag === 0 || s_mag === 0) return null;

  // Si son paralelos
  const denom = r_dx * s_dy - r_dy * s_dx;
  if (Math.abs(denom) < 1e-9) return null;

  const dx_p = s_px - r_px;
  const dy_p = s_py - r_py;

  const t1 = (dx_p * s_dy - dy_p * s_dx) / denom;
  const t2 = (dx_p * r_dy - dy_p * r_dx) / denom;

  // Tolerancia EPS para evitar que rayos a vértices, uniones en esquina o segmentos tocantes se cuelen
  const EPS = 1e-5;
  if (t1 > 1e-4 && t2 >= -EPS && t2 <= 1 + EPS) {
    const clampedT2 = Math.max(0, Math.min(1, t2));
    return {
      point: {
        x: s_px + s_dx * clampedT2,
        y: s_py + s_dy * clampedT2
      },
      distance: t1,
      angle: normalizeAngle(Math.atan2(r_dy, r_dx))
    };
  }

  return null;
}

/**
 * Calcula el polígono de visibilidad 2D para una posición dada usando raycasting contra segmentos.
 * Si rangePx es > 0, se limita el radio máximo creando un límite circular aproximado.
 */
export function computeVisibilityPolygon(
  origin: Point2D,
  rangePx: number,
  segments: WallSegment[]
): Point2D[] {
  // Radio efectivo: si rangePx <= 0 (ilimitado), usar un radio amplio
  const maxRadius = rangePx > 0 ? rangePx : 5000;

  // 1. Filtrar segmentos que crucen o estén dentro del alcance usando distancia real al segmento
  const relevantSegments: { p1: Point2D; p2: Point2D }[] = [];
  const pad = 10;
  for (const seg of segments) {
    if (distToSegment(origin, seg.p1, seg.p2) <= maxRadius + pad) {
      relevantSegments.push({ p1: seg.p1, p2: seg.p2 });
    }
  }

  // 2. Generar caja delimitadora circular del alcance máximo
  const circleSteps = 48;
  const circlePoints: Point2D[] = [];
  for (let i = 0; i < circleSteps; i++) {
    const angle = (i / circleSteps) * Math.PI * 2;
    circlePoints.push({
      x: origin.x + Math.cos(angle) * maxRadius,
      y: origin.y + Math.sin(angle) * maxRadius
    });
  }
  for (let i = 0; i < circleSteps; i++) {
    relevantSegments.push({
      p1: circlePoints[i],
      p2: circlePoints[(i + 1) % circleSteps]
    });
  }

  // 3. Recopilar todos los ángulos de interés (extremos de segmentos +- delta)
  const angleSet = new Set<number>();
  const delta = 0.0001;

  for (const seg of relevantSegments) {
    for (const pt of [seg.p1, seg.p2]) {
      const baseAngle = Math.atan2(pt.y - origin.y, pt.x - origin.x);
      angleSet.add(normalizeAngle(baseAngle - delta));
      angleSet.add(normalizeAngle(baseAngle));
      angleSet.add(normalizeAngle(baseAngle + delta));
    }
  }

  // Añadir rayos regulares para el arco circular
  for (let i = 0; i < circleSteps; i++) {
    angleSet.add(normalizeAngle((i / circleSteps) * Math.PI * 2));
  }

  const angles = Array.from(angleSet).sort((a, b) => a - b);

  // 4. Lanzar cada rayo y encontrar la intersección más cercana
  const intersections: { x: number; y: number; angle: number }[] = [];

  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let closestT = maxRadius;
    let closestPt: Point2D = {
      x: origin.x + dx * maxRadius,
      y: origin.y + dy * maxRadius
    };

    for (const seg of relevantSegments) {
      const hit = getRayIntersection(origin, dx, dy, seg.p1, seg.p2);
      if (hit && hit.distance < closestT) {
        closestT = hit.distance;
        closestPt = hit.point;
      }
    }

    intersections.push({
      x: closestPt.x,
      y: closestPt.y,
      angle
    });
  }

  // 5. Filtrar puntos casi idénticos contiguos
  const polygon: Point2D[] = [];
  for (let i = 0; i < intersections.length; i++) {
    const curr = intersections[i];
    if (polygon.length === 0) {
      polygon.push({ x: curr.x, y: curr.y });
    } else {
      const prev = polygon[polygon.length - 1];
      if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > 0.5) {
        polygon.push({ x: curr.x, y: curr.y });
      }
    }
  }

  return polygon;
}
