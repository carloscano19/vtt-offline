import { Point2D } from '../../types/entity';
import { ExploredMultiPolygon } from '../../types/game';
import { simplifyMulti, visionToMulti, ringArea } from './fogMemory';
import { safeClip, sanitizeMultiPolygon } from './safeClip';

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
  return sanitizeMultiPolygon(multi, 1.0);
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
  rememberExplored = false,
  lights: any[] = []
): FogRegions {
  const cleanExplored = snapMulti(explored || []);
  const cleanRevealed = snapMulti(revealed || []);

  // Extraer polígonos claros, totales y línea de visión ilimitada
  const brightPolysList: Point2D[][] = [];
  const totalPolysList: Point2D[][] = [];
  const losPolysList: Point2D[][] = [];

  for (const item of visibilitiesOrPolys) {
    if (Array.isArray(item)) {
      if (item.length >= 3) {
        brightPolysList.push(item);
        totalPolysList.push(item);
        losPolysList.push(item);
      }
    } else if (item && typeof item === 'object') {
      const bPoly = item.brightPolygon || item.polygon;
      const tPoly = item.totalPolygon || item.polygon;
      const lPoly = item.losPolygon || item.totalPolygon || item.polygon;
      if (bPoly && bPoly.length >= 3) brightPolysList.push(bPoly);
      if (tPoly && tPoly.length >= 3) totalPolysList.push(tPoly);
      if (lPoly && lPoly.length >= 3) losPolysList.push(lPoly);
    }
  }

  const brightRings = visionToMulti(brightPolysList);
  const totalRings = visionToMulti(totalPolysList);

  let tokenVisionBright: ExploredMultiPolygon = [];
  if (brightRings.length > 0) {
    tokenVisionBright = simplifyMulti(safeClip.union(brightRings));
  }

  let tokenVisionTotal: ExploredMultiPolygon = [];
  if (totalRings.length > 0) {
    tokenVisionTotal = simplifyMulti(safeClip.union(totalRings));
  }

  // Integración de luces dinámicas con línea de visión ilimitada de tokens (estilo D&D)
  if (lights.length > 0 && losPolysList.length > 0) {
    const lightBrightPolys = lights.map((l) => l.brightPolygon).filter((p) => p && p.length >= 3);
    const lightTotalPolys = lights.map((l) => l.totalPolygon).filter((p) => p && p.length >= 3);

    if (lightTotalPolys.length > 0) {
      const lightsTotalMulti = safeClip.union(visionToMulti(lightTotalPolys));
      const playerLoSMulti = safeClip.union(visionToMulti(losPolysList));

      // Zonas iluminadas que están en línea de visión directa de algún token jugador
      const litSeenTotal = safeClip.intersection(lightsTotalMulti, playerLoSMulti);

      if (litSeenTotal && litSeenTotal.length > 0) {
        if (tokenVisionTotal.length > 0) {
          tokenVisionTotal = simplifyMulti(safeClip.union(tokenVisionTotal, litSeenTotal));
        } else {
          tokenVisionTotal = simplifyMulti(litSeenTotal);
        }

        if (lightBrightPolys.length > 0) {
          const lightsBrightMulti = safeClip.union(visionToMulti(lightBrightPolys));
          const litSeenBright = safeClip.intersection(lightsBrightMulti, playerLoSMulti);
          if (litSeenBright && litSeenBright.length > 0) {
            if (tokenVisionBright.length > 0) {
              tokenVisionBright = simplifyMulti(safeClip.union(tokenVisionBright, litSeenBright));
            } else {
              tokenVisionBright = simplifyMulti(litSeenBright);
            }
          }
        }
      }
    }
  }

  // 1. visibleBright para el MAPA = tokenVisionBright U cleanRevealed
  let visibleBright: ExploredMultiPolygon = [];
  if (tokenVisionBright.length > 0 && cleanRevealed.length > 0) {
    visibleBright = simplifyMulti(safeClip.union(tokenVisionBright, cleanRevealed));
  } else if (tokenVisionBright.length > 0) {
    visibleBright = tokenVisionBright;
  } else if (cleanRevealed.length > 0) {
    visibleBright = cleanRevealed;
  }

  // 2. visibleDim para el MAPA = difference(tokenVisionTotal, visibleBright)
  let visibleDim: ExploredMultiPolygon = [];
  if (tokenVisionTotal.length > 0) {
    if (visibleBright.length === 0) {
      visibleDim = tokenVisionTotal;
    } else {
      visibleDim = simplifyMulti(safeClip.difference(tokenVisionTotal, visibleBright));
    }
  }

  // 3. Mapa visible total = union(visibleBright, visibleDim)
  let mapVisibleTotal: ExploredMultiPolygon = [];
  if (visibleBright.length > 0 && visibleDim.length > 0) {
    mapVisibleTotal = simplifyMulti(safeClip.union(visibleBright, visibleDim));
  } else if (visibleBright.length > 0) {
    mapVisibleTotal = visibleBright;
  } else if (visibleDim.length > 0) {
    mapVisibleTotal = visibleDim;
  }

  // 4. exploradoNoVisible = si rememberExplored, difference(cleanExplored, mapVisibleTotal)
  let exploradoNoVisible: ExploredMultiPolygon = [];
  if (rememberExplored && cleanExplored.length > 0) {
    if (mapVisibleTotal.length === 0) {
      exploradoNoVisible = cleanExplored;
    } else {
      exploradoNoVisible = simplifyMulti(safeClip.difference(cleanExplored, mapVisibleTotal));
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
  if (memoryToInclude.length > 0 && mapVisibleTotal.length > 0) {
    knownTotal = safeClip.union(memoryToInclude, mapVisibleTotal);
  } else if (memoryToInclude.length > 0) {
    knownTotal = memoryToInclude;
  } else if (mapVisibleTotal.length > 0) {
    knownTotal = mapVisibleTotal;
  }

  let noExplorado: ExploredMultiPolygon = [];
  if (knownTotal.length === 0) {
    noExplorado = boundsPoly;
  } else {
    noExplorado = simplifyMulti(safeClip.difference(boundsPoly, knownTotal));
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
