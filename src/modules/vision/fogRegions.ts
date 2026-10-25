import polygonClipping from 'polygon-clipping';
import { Point2D } from '../../types/entity';
import { ExploredMultiPolygon } from '../../types/game';
import { simplifyMulti, visionToMulti, ringArea } from './fogMemory';

export interface FogRegions {
  visibleBright: ExploredMultiPolygon; // Zona clara del mapa (visión clara + zonas reveladas a mano)
  visibleDim: ExploredMultiPolygon;    // Zona tenue del mapa (50% negro)
  exploradoNoVisible: ExploredMultiPolygon; // Memoria de exploración (65% negro, solo si rememberExplored = true)
  noExplorado: ExploredMultiPolygon;   // Inexplorado (100% negro opaco)
  tokenVisionTotal: ExploredMultiPolygon; // Visión real de tokens (usada para visibilidad de enemigos/objetos)
  visible: ExploredMultiPolygon;       // Alias de mapa visible total (bright + dim) para compatibilidad
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
 * Calcula las regiones geométricas disjuntas de la niebla de guerra:
 * - visibleBright: visión clara de tokens + zonas reveladas manualmente.
 * - visibleDim: visión tenue de tokens (menos zona clara).
 * - exploradoNoVisible: si rememberExplored está activo, difference(explored, visibleTotal).
 * - noExplorado: difference(bounds, union(explored, visibleTotal)).
 * - tokenVisionTotal: solo visión real (clara + tenue), para mostrar tokens/objetos.
 */
export function computeFogRegions(
  explored: ExploredMultiPolygon,
  visibilitiesOrPolys: any[],
  bounds: { x: number; y: number; width: number; height: number },
  revealed: ExploredMultiPolygon = [],
  rememberExplored = false
): FogRegions {
  const cleanExplored = snapMulti(explored || []);
  const cleanRevealed = snapMulti(revealed || []);

  // Extraer polígonos claros y totales
  const brightPolysList: Point2D[][] = [];
  const totalPolysList: Point2D[][] = [];

  for (const item of visibilitiesOrPolys) {
    if (Array.isArray(item)) {
      if (item.length >= 3) {
        brightPolysList.push(item);
        totalPolysList.push(item);
      }
    } else if (item && typeof item === 'object') {
      const bPoly = item.brightPolygon || item.polygon;
      const tPoly = item.totalPolygon || item.polygon;
      if (bPoly && bPoly.length >= 3) brightPolysList.push(bPoly);
      if (tPoly && tPoly.length >= 3) totalPolysList.push(tPoly);
    }
  }

  const brightRings = visionToMulti(brightPolysList);
  const totalRings = visionToMulti(totalPolysList);

  let tokenVisionBright: ExploredMultiPolygon = [];
  if (brightRings.length > 0) {
    try {
      const united = polygonClipping.union(brightRings);
      tokenVisionBright = simplifyMulti(snapMulti(united as ExploredMultiPolygon));
    } catch (e) {
      console.warn('[computeFogRegions] union(brightRings) error:', e);
    }
  }

  let tokenVisionTotal: ExploredMultiPolygon = [];
  if (totalRings.length > 0) {
    try {
      const united = polygonClipping.union(totalRings);
      tokenVisionTotal = simplifyMulti(snapMulti(united as ExploredMultiPolygon));
    } catch (e) {
      console.warn('[computeFogRegions] union(totalRings) error:', e);
    }
  }

  // 1. visibleBright para el MAPA = tokenVisionBright U cleanRevealed
  let visibleBright: ExploredMultiPolygon = [];
  try {
    if (tokenVisionBright.length > 0 && cleanRevealed.length > 0) {
      visibleBright = simplifyMulti(
        snapMulti(polygonClipping.union(tokenVisionBright, cleanRevealed) as ExploredMultiPolygon)
      );
    } else if (tokenVisionBright.length > 0) {
      visibleBright = tokenVisionBright;
    } else if (cleanRevealed.length > 0) {
      visibleBright = cleanRevealed;
    }
  } catch (e) {
    console.warn('[computeFogRegions] union(tokenVisionBright, cleanRevealed) error:', e);
    visibleBright = tokenVisionBright.length > 0 ? tokenVisionBright : cleanRevealed;
  }

  // 2. visibleDim para el MAPA = difference(tokenVisionTotal, visibleBright)
  let visibleDim: ExploredMultiPolygon = [];
  if (tokenVisionTotal.length > 0) {
    if (visibleBright.length === 0) {
      visibleDim = tokenVisionTotal;
    } else {
      try {
        const diffDim = polygonClipping.difference(tokenVisionTotal, visibleBright);
        visibleDim = simplifyMulti(snapMulti(diffDim as ExploredMultiPolygon));
      } catch (e) {
        console.warn('[computeFogRegions] difference(tokenVisionTotal, visibleBright) error:', e);
      }
    }
  }

  // 3. Mapa visible total = union(visibleBright, visibleDim)
  let mapVisibleTotal: ExploredMultiPolygon = [];
  try {
    if (visibleBright.length > 0 && visibleDim.length > 0) {
      mapVisibleTotal = simplifyMulti(
        snapMulti(polygonClipping.union(visibleBright, visibleDim) as ExploredMultiPolygon)
      );
    } else if (visibleBright.length > 0) {
      mapVisibleTotal = visibleBright;
    } else if (visibleDim.length > 0) {
      mapVisibleTotal = visibleDim;
    }
  } catch (e) {
    mapVisibleTotal = visibleBright.length > 0 ? visibleBright : visibleDim;
  }

  // 4. exploradoNoVisible = si rememberExplored, difference(cleanExplored, mapVisibleTotal)
  let exploradoNoVisible: ExploredMultiPolygon = [];
  if (rememberExplored && cleanExplored.length > 0) {
    if (mapVisibleTotal.length === 0) {
      exploradoNoVisible = cleanExplored;
    } else {
      try {
        const diff = polygonClipping.difference(cleanExplored, mapVisibleTotal);
        exploradoNoVisible = simplifyMulti(snapMulti(diff as ExploredMultiPolygon));
      } catch (err) {
        console.warn('[computeFogRegions] difference(cleanExplored, mapVisibleTotal) error:', err);
      }
    }
  }

  // 5. noExplorado = difference(rectángulo de bounds, union(conocido, mapVisibleTotal))
  const boundsRing: [number, number][] = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x + bounds.width, bounds.y + bounds.height],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x, bounds.y]
  ];
  const boundsPoly: ExploredMultiPolygon = [[boundsRing]];

  let knownTotal: ExploredMultiPolygon = [];
  const memoryToInclude = rememberExplored ? cleanExplored : [];
  try {
    if (memoryToInclude.length > 0 && mapVisibleTotal.length > 0) {
      knownTotal = polygonClipping.union(memoryToInclude, mapVisibleTotal) as ExploredMultiPolygon;
    } else if (memoryToInclude.length > 0) {
      knownTotal = memoryToInclude;
    } else if (mapVisibleTotal.length > 0) {
      knownTotal = mapVisibleTotal;
    }
  } catch (err) {
    console.warn('[computeFogRegions] union(memory, mapVisibleTotal) error:', err);
    knownTotal = mapVisibleTotal.length > 0 ? mapVisibleTotal : memoryToInclude;
  }

  let noExplorado: ExploredMultiPolygon = [];
  if (knownTotal.length === 0) {
    noExplorado = boundsPoly;
  } else {
    try {
      const diffBounds = polygonClipping.difference(boundsPoly, knownTotal);
      noExplorado = simplifyMulti(snapMulti(diffBounds as ExploredMultiPolygon));
    } catch (err) {
      console.warn('[computeFogRegions] difference(boundsPoly, knownTotal) error:', err);
    }
  }

  return {
    visibleBright,
    visibleDim,
    exploradoNoVisible,
    noExplorado,
    tokenVisionTotal,
    visible: mapVisibleTotal
  };
}
