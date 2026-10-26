import * as polyclip from 'polyclip-ts';
import { ExploredMultiPolygon } from '../../types/game';

type Point = [number, number];
type Ring = Point[];
type Polygon = Ring[];

/**
 * Calcula el área con signo de un anillo.
 */
export function ringSignedArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

export function ringArea(ring: Ring): number {
  return Math.abs(ringSignedArea(ring));
}

/**
 * Comprueba si tres puntos son colineales dentro de una tolerancia angular/distancia.
 */
function isCollinear(p1: Point, p2: Point, p3: Point, eps = 1e-4): boolean {
  const dx1 = p2[0] - p1[0];
  const dy1 = p2[1] - p1[1];
  const dx2 = p3[0] - p2[0];
  const dy2 = p3[1] - p2[1];
  const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
  return cross <= eps;
}

/**
 * Cuantiza y limpia un anillo de coordenadas:
 * 1. Redondea a la resolución especificada (step, e.g. 1.0 para enteros o 0.5 o 2.0).
 * 2. Elimina vértices consecutivos duplicados.
 * 3. Elimina vértices consecutivos colineales redundantes.
 * 4. Cierra el anillo si no lo está.
 * 5. Descarta anillos con menos de 3 puntos o área casi nula (< minArea).
 */
export function sanitizeRing(ring: Ring, step = 1.0, minArea = 1.0): Ring | null {
  if (!ring || ring.length < 3) return null;

  // 1. Cuantizar
  const roundCoord = (val: number): number => {
    if (!Number.isFinite(val)) return 0;
    return Math.round(val / step) * step;
  };

  const quantized: Point[] = [];
  for (const pt of ring) {
    if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
    const x = roundCoord(pt[0]);
    const y = roundCoord(pt[1]);
    const last = quantized[quantized.length - 1];
    if (!last || last[0] !== x || last[1] !== y) {
      quantized.push([x, y]);
    }
  }

  if (quantized.length < 3) return null;

  // Asegurar cierre antes de procesar colineales
  const first = quantized[0];
  const last = quantized[quantized.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    quantized.push([first[0], first[1]]);
  }

  // 2. Eliminar vértices colineales consecutivos en la cadena abierta
  const open = quantized.slice(0, -1);
  if (open.length < 3) return null;

  const filtered: Point[] = [];
  for (let i = 0; i < open.length; i++) {
    const prev = open[(i - 1 + open.length) % open.length];
    const curr = open[i];
    const next = open[(i + 1) % open.length];
    if (!isCollinear(prev, curr, next)) {
      filtered.push(curr);
    }
  }

  if (filtered.length < 3) return null;

  // Cerrar el anillo
  filtered.push([filtered[0][0], filtered[0][1]]);

  // 3. Verificar área mínima
  if (ringArea(filtered) < minArea) {
    return null;
  }

  return filtered;
}

/**
 * Detecta y normaliza si la entrada es un Anillo, Polígono o MultiPolígono.
 */
function normalizeToMultiPolygons(input: any): any[] {
  if (!Array.isArray(input) || input.length === 0) return [];
  // Si el primer elemento es un punto [number, number]: es un Anillo -> envolver en [ [ring] ]
  if (Array.isArray(input[0]) && typeof input[0][0] === 'number') {
    return [[[input]]];
  }
  // Si el primer elemento del primer elemento es un punto: es un Polígono -> envolver en [polygon]
  if (Array.isArray(input[0]) && Array.isArray(input[0][0]) && typeof input[0][0][0] === 'number') {
    return [input];
  }
  // Si es un MultiPolígono (o lista de polígonos)
  return input;
}

/**
 * Limpia y normaliza un multipolígono.
 */
export function sanitizeMultiPolygon(
  multi: any,
  step = 1.0,
  minArea = 1.0
): ExploredMultiPolygon {
  const normalized = normalizeToMultiPolygons(multi);
  if (!Array.isArray(normalized) || normalized.length === 0) return [];

  const out: ExploredMultiPolygon = [];

  for (const poly of normalized) {
    if (!Array.isArray(poly) || poly.length === 0) continue;

    // poly[0] es el anillo exterior
    const outer = sanitizeRing(poly[0], step, minArea);
    if (!outer) continue;

    // Asegurar orientación antihoraria para exterior si fuera necesario, o mantener estándar
    const cleanPoly: Polygon = [outer];

    for (let i = 1; i < poly.length; i++) {
      const hole = sanitizeRing(poly[i], step, minArea);
      if (hole) {
        cleanPoly.push(hole);
      }
    }

    out.push(cleanPoly);
  }

  return out;
}

/**
 * Validador exhaustivo para multipolígonos.
 * Devuelve true si el multipolígono es completamente válido y seguro.
 */
export function isValidMultiPolygon(multi: any): boolean {
  if (!Array.isArray(multi)) return false;
  for (const poly of multi) {
    if (!Array.isArray(poly) || poly.length === 0) return false;
    for (const ring of poly) {
      if (!Array.isArray(ring) || ring.length < 4) return false;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) return false;
      for (const pt of ring) {
        if (!Array.isArray(pt) || pt.length < 2 || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Ejecuta una operación booleana (union, difference, intersection) protegida con:
 * 1. Pre-sanitización a resolución estándar (1.0 px).
 * 2. Invocación de polyclip-ts con try/catch.
 * 3. En caso de error, reintento con cuantización más agresiva (step = 2.0 px y minArea mayor).
 * 4. Si vuelve a fallar, fallback seguro sin lanzar excepción.
 */
export const safeClip = {
  union(subject: any, ...clips: any[]): ExploredMultiPolygon {
    return safeClipOperation('union', subject, clips);
  },

  difference(subject: any, ...clips: any[]): ExploredMultiPolygon {
    return safeClipOperation('difference', subject, clips);
  },

  intersection(subject: any, ...clips: any[]): ExploredMultiPolygon {
    return safeClipOperation('intersection', subject, clips);
  },

  sanitize(multi: any, step = 1.0): ExploredMultiPolygon {
    return sanitizeMultiPolygon(multi, step);
  },

  validate(multi: any): boolean {
    return isValidMultiPolygon(multi);
  }
};

function safeClipOperation(
  op: 'union' | 'difference' | 'intersection',
  rawSubject: any,
  rawClips: any[]
): ExploredMultiPolygon {
  // Limpiar subject
  const cleanSubject = sanitizeMultiPolygon(rawSubject, 1.0);

  // Aplanar clips y limpiarlos individualmente
  const flatClips: ExploredMultiPolygon[] = [];
  for (const c of rawClips || []) {
    const sanitized = sanitizeMultiPolygon(c, 1.0);
    if (sanitized.length > 0) {
      flatClips.push(sanitized);
    }
  }

  if (cleanSubject.length === 0 && op !== 'union') {
    return [];
  }
  if (cleanSubject.length === 0 && op === 'union') {
    if (flatClips.length === 0) return [];
    if (flatClips.length === 1) return flatClips[0];
    return safeClipOperation('union', flatClips[0], flatClips.slice(1));
  }
  if (flatClips.length === 0) {
    if (op === 'intersection') return [];
    return cleanSubject;
  }

  // Intento 1: Ejecutar con polyclip-ts a precisión normal
  try {
    const res = (polyclip as any)[op](cleanSubject, ...flatClips);
    return sanitizeMultiPolygon(res, 1.0);
  } catch (err1) {
    console.warn(`[safeClip.${op}] Primer intento falló con precisión estándar. Reintentando con step 2px:`, err1);
  }

  // Intento 2: Cuantizar a 2.0 px y reintentar
  try {
    const roughSubject = sanitizeMultiPolygon(cleanSubject, 2.0, 4.0);
    const roughClips = flatClips.map((c) => sanitizeMultiPolygon(c, 2.0, 4.0)).filter((c) => c.length > 0);

    if (roughSubject.length === 0 && op !== 'union') return [];
    if (roughClips.length === 0) return op === 'intersection' ? [] : roughSubject;

    const res = (polyclip as any)[op](roughSubject, ...roughClips);
    return sanitizeMultiPolygon(res, 1.0);
  } catch (err2) {
    console.error(`[safeClip.${op}] Reintento a 2px falló. Aplicando fallback seguro:`, err2);
  }

  // Fallback seguro:
  // - Para 'union': concatenar todos los polígonos como aproximación sin unir
  // - Para 'difference': devolver el subject original sin recortar
  // - Para 'intersection': devolver el subject o conjunto vacío
  switch (op) {
    case 'union':
      return [...cleanSubject, ...flatClips.flat()];
    case 'difference':
      return cleanSubject;
    case 'intersection':
      return [];
    default:
      return cleanSubject;
  }
}
