import polygonClipping from 'polygon-clipping';
import { Point2D } from '../../types/entity';
import { ExploredMultiPolygon } from '../../types/game';
import { simplifyMulti, visionToMulti, ringArea } from './fogMemory';

export interface FogRegions {
  visible: ExploredMultiPolygon;
  exploradoNoVisible: ExploredMultiPolygon;
  noExplorado: ExploredMultiPolygon;
}

/**
 * Calcula el área geométrica total de un multipolígono considerando huecos interiores.
 */
export function multiPolygonArea(multi: ExploredMultiPolygon): number {
  let total = 0;
  for (const poly of multi) {
    if (!poly[0] || poly[0].length < 3) continue;
    let polyArea = ringArea(poly[0] as [number, number][]);
    for (let i = 1; i < poly.length; i++) {
      polyArea -= ringArea(poly[i] as [number, number][]);
    }
    total += Math.max(0, polyArea);
  }
  return total;
}

export function snapMulti(multi: ExploredMultiPolygon): ExploredMultiPolygon {
  return multi.map((poly) =>
    poly.map((ring) => {
      const snapped = ring.map((pt) => [Math.round(pt[0]), Math.round(pt[1])]);
      const dedup: [number, number][] = [snapped[0] as [number, number]];
      for (let i = 1; i < snapped.length; i++) {
        if (snapped[i][0] !== dedup[dedup.length - 1][0] || snapped[i][1] !== dedup[dedup.length - 1][1]) {
          dedup.push(snapped[i] as [number, number]);
        }
      }
      if (dedup.length >= 3 && (dedup[0][0] !== dedup[dedup.length - 1][0] || dedup[0][1] !== dedup[dedup.length - 1][1])) {
        dedup.push([dedup[0][0], dedup[0][1]]);
      }
      return dedup;
    })
  );
}

/**
 * Calcula las 3 regiones geométricas disjuntas de la niebla de guerra:
 * - visible: unión de los polígonos de visión actuales.
 * - exploradoNoVisible: diferencia(explored, visible).
 * - noExplorado: diferencia(rectángulo de bounds, unión(explored, visible)).
 */
export function computeFogRegions(
  explored: ExploredMultiPolygon,
  visionPolygons: Point2D[][],
  bounds: { x: number; y: number; width: number; height: number }
): FogRegions {
  // Asegurar coordenadas enteras alineadas para máxima estabilidad numérica
  const cleanExplored = snapMulti(explored);

  // 1. visible = unión de los polígonos de visión actuales (polygon-clipping)
  const visibleRings = visionToMulti(visionPolygons);
  let visible: ExploredMultiPolygon = [];
  if (visibleRings.length > 0) {
    const united = polygonClipping.union(visibleRings);
    visible = simplifyMulti(snapMulti(united as ExploredMultiPolygon));
  }

  // 2. exploradoNoVisible = difference(explored, visible)
  let exploradoNoVisible: ExploredMultiPolygon = [];
  if (cleanExplored.length > 0) {
    if (visible.length === 0) {
      exploradoNoVisible = cleanExplored;
    } else {
      try {
        const diff = polygonClipping.difference(cleanExplored, visible);
        exploradoNoVisible = simplifyMulti(diff as ExploredMultiPolygon);
      } catch (err) {
        console.warn('[computeFogRegions] difference(cleanExplored, visible) error:', err);
      }
    }
  }

  // 3. noExplorado = difference(rectángulo de bounds, union(explored, visible))
  const boundsRing: [number, number][] = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x + bounds.width, bounds.y + bounds.height],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x, bounds.y]
  ];
  const boundsPoly: ExploredMultiPolygon = [[boundsRing]];

  let knownTotal: ExploredMultiPolygon = [];
  try {
    if (cleanExplored.length > 0 && visible.length > 0) {
      knownTotal = polygonClipping.union(cleanExplored, visible) as ExploredMultiPolygon;
    } else if (cleanExplored.length > 0) {
      knownTotal = cleanExplored;
    } else if (visible.length > 0) {
      knownTotal = visible;
    }
  } catch (err) {
    console.warn('[computeFogRegions] union(cleanExplored, visible) error:', err);
    knownTotal = cleanExplored.length > 0 ? cleanExplored : visible;
  }

  let noExplorado: ExploredMultiPolygon = [];
  if (knownTotal.length === 0) {
    noExplorado = boundsPoly;
  } else {
    try {
      const diffBounds = polygonClipping.difference(boundsPoly, knownTotal);
      noExplorado = simplifyMulti(diffBounds as ExploredMultiPolygon);
    } catch (err) {
      console.warn('[computeFogRegions] difference(boundsPoly, knownTotal) error:', err);
    }
  }

  return {
    visible,
    exploradoNoVisible,
    noExplorado
  };
}
