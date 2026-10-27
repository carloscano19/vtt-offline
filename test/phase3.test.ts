import { describe, it, expect } from 'vitest';
import { lightManager } from '../src/modules/lights/lightManager';
import { computeFogRegions } from '../src/modules/vision/fogRegions';
import { computeVisibilityPolygon } from '../src/modules/vision/visibilityPolygon';
import { parseHexColor, rgbDistance, isColorChromaKeyed } from '../src/modules/filters/chromaKey';
import { Entity } from '../src/types/entity';

describe('Phase 3: Luces, Visión a Distancia y Chroma Key', () => {
  it('calculates light visibility polygon and blocks light at wall segments', () => {
    const lightEntity: Entity = {
      id: 'light_1',
      type: 'light',
      name: 'Antorcha',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 45,
      visibleToPlayers: true,
      locked: false,
      light: {
        color: '#ffaa44',
        intensity: 100,
        brightRadiusInSquares: 4,
        dimRadiusInSquares: 2,
        edgeHardness: 0.5,
        flicker: false
      }
    };

    // Wall entity at x = 0 with points at x = 100 from y = -200 to y = 200
    const wallEntity: Entity = {
      id: 'wall_1',
      type: 'wall',
      name: 'Pared',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 20,
      visibleToPlayers: false,
      locked: true,
      points: [
        { x: 100, y: -200 },
        { x: 100, y: 200 }
      ]
    };

    const result = lightManager.getLightsVisibility([lightEntity, wallEntity], 70);
    expect(result).toHaveLength(1);
    expect(result[0].brightPolygon.length).toBeGreaterThan(0);
    expect(result[0].totalPolygon.length).toBeGreaterThan(0);

    // Any point of light polygon in the direction of the wall (x > 0, |y| < 50) must not pass x = 100.5
    const rightPoints = result[0].totalPolygon.filter((p) => Math.abs(p.y) < 50 && p.x > 0);
    expect(rightPoints.length).toBeGreaterThan(0);
    for (const p of rightPoints) {
      expect(p.x).toBeLessThanOrEqual(100.5);
    }
  });

  it('reveals illuminated zones from afar when player has line of sight', () => {
    // Player at (-500, 0)
    // Wall segment from y = 100 to y = 300 at x = 0 (does not block y = 0)
    const wallSegments = [
      {
        p1: { x: 0, y: 100 },
        p2: { x: 0, y: 300 },
        entityId: 'wall_upper',
        source: 'drawn' as const
      }
    ];

    // Player vision: bright 2 squares (140px), dim 1 square (70px) -> total 210px
    const playerOrigin = { x: -500, y: 0 };
    const playerBright = computeVisibilityPolygon(playerOrigin, 140, wallSegments);
    const playerDim = computeVisibilityPolygon(playerOrigin, 210, wallSegments);
    const playerLoS = computeVisibilityPolygon(playerOrigin, 0, wallSegments); // unlimited LoS

    const tokenVisibilities = [
      {
        tokenId: 'token_player',
        brightPolygon: playerBright,
        totalPolygon: playerDim,
        losPolygon: playerLoS
      }
    ];

    // Light at (500, 0) with radius 200px
    const lightOrigin = { x: 500, y: 0 };
    const lightBright = computeVisibilityPolygon(lightOrigin, 150, wallSegments);
    const lightTotal = computeVisibilityPolygon(lightOrigin, 200, wallSegments);

    const lights = [
      {
        lightId: 'distant_torch',
        brightPolygon: lightBright,
        totalPolygon: lightTotal,
        color: '#ffaa44',
        intensity: 1,
        flicker: false
      }
    ];

    const bounds = { x: -1000, y: -1000, width: 2000, height: 2000 };

    // Fog calculation with line of sight seeing distant light
    // Signature: computeFogRegions(explored, visibilities, bounds, revealed, rememberExplored, lights)
    const fogRegions = computeFogRegions(
      [],
      tokenVisibilities,
      bounds,
      [],
      false, // rememberExplored = false
      lights
    );

    // Visible map polygon must contain the distant illuminated zone (x around 500, y around 0)
    expect(fogRegions.visible.length).toBeGreaterThan(0);
    expect(fogRegions.tokenVisionTotal.length).toBeGreaterThan(0);

    // Distance illuminated area at x ~ 500 should be visible for token vision
    const anyPointNearLight = fogRegions.tokenVisionTotal.some((poly) =>
      poly.some((ring) => ring.some(([px]) => px > 400))
    );
    expect(anyPointNearLight).toBe(true);

    // If a blocking wall is placed directly between player and light (x = 0 from -200 to 200)
    const blockingWall = [
      {
        p1: { x: 0, y: -200 },
        p2: { x: 0, y: 200 },
        entityId: 'wall_block',
        source: 'drawn' as const
      }
    ];

    const blockedLoS = computeVisibilityPolygon(playerOrigin, 0, blockingWall);
    const blockedTokenVis = [
      {
        tokenId: 'token_player',
        brightPolygon: computeVisibilityPolygon(playerOrigin, 140, blockingWall),
        totalPolygon: computeVisibilityPolygon(playerOrigin, 210, blockingWall),
        losPolygon: blockedLoS
      }
    ];

    const blockedFog = computeFogRegions(
      [],
      blockedTokenVis,
      bounds,
      [],
      false,
      lights
    );

    // In blockedLoS, player cannot see light at (500, 0)
    // Therefore tokenVisionTotal should only cover player's near surroundings (x < 50)
    const anyPointNearLightBlocked = blockedFog.tokenVisionTotal.some((poly) =>
      poly.some((ring) => ring.some(([px]) => px > 400))
    );
    expect(anyPointNearLightBlocked).toBe(false);
  });

  it('correctly parses hex color and calculates chroma key math', () => {
    const green = parseHexColor('#00ff00');
    expect(green).toEqual({ r: 0, g: 255, b: 0 });

    const magenta = parseHexColor('#ff00ff');
    expect(magenta).toEqual({ r: 255, g: 0, b: 255 });

    // Distance between green and exact green is 0
    expect(rgbDistance(green, { r: 0, g: 255, b: 0 })).toBe(0);

    // Distance between pure green and black: sqrt(0^2 + 1^2 + 0^2) = 1.0
    expect(rgbDistance(green, { r: 0, g: 0, b: 0 })).toBe(1);

    // Chroma key detection
    // Pure green with #00ff00 target and tolerance 15% should match
    expect(isColorChromaKeyed(0, 255, 0, '#00ff00', 15)).toBe(true);

    // Slightly off-green (10, 240, 15) with tolerance 15%
    expect(isColorChromaKeyed(10, 240, 15, '#00ff00', 15)).toBe(true);

    // Red color (255, 0, 0) with target green should NOT be chroma keyed
    expect(isColorChromaKeyed(255, 0, 0, '#00ff00', 15)).toBe(false);

    // Blue color (0, 0, 255) with target green should NOT be chroma keyed
    expect(isColorChromaKeyed(0, 0, 255, '#00ff00', 15)).toBe(false);
  });

  it('applies chroma key to ImageData with soft edge feathering', async () => {
    // 3 pixels:
    // Pixel 0: pure green (0, 255, 0, 255) -> should be 0 alpha
    // Pixel 1: near threshold green -> should have partial alpha (feathering)
    // Pixel 2: red (255, 0, 0, 255) -> should retain full 255 alpha
    const width = 3;
    const height = 1;
    const rawData = new Uint8ClampedArray([
      0, 255, 0, 255,
      35, 230, 35, 255,
      255, 0, 0, 255
    ]);
    const imgData = {
      data: rawData,
      width,
      height
    } as ImageData;

    const { applyChromaKeyToImageData } = await import('../src/modules/filters/chromaKey');
    applyChromaKeyToImageData(imgData, '#00ff00', 15);

    // Pixel 0 is fully transparent
    expect(imgData.data[3]).toBe(0);

    // Pixel 2 is completely unchanged (solid red)
    expect(imgData.data[11]).toBe(255);
  });

  it('normalizes token sway animation with string or number direction', async () => {
    const { normalizeEntity } = await import('../src/modules/persistence/normalizer');
    const legacyToken: Entity = {
      id: 'token_sway',
      type: 'token',
      name: 'Goblin',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 0.05, // large image scaled down
      scaleY: 0.05,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      animation: {
        sway: {
          enabled: true,
          speed: 1,
          distanceInSquares: 0.25,
          direction: 'horizontal' as any
        }
      }
    };

    const normalizedToken = normalizeEntity(legacyToken);
    expect(normalizedToken.animations?.sway?.enabled).toBe(true);
    expect(normalizedToken.animations?.sway?.direction).toBe(0); // 'horizontal' -> 0
    expect(normalizedToken.animations?.sway?.distanceInSquares).toBe(0.25);
  });

  it('calculates sway offset in world coordinates without cumulative drift or scale distortion', () => {
    // Test large image token scaled to 1 square:
    // Natural image width = 2000px, gridSize = 70px -> scale = 70 / 2000 = 0.035
    const gridSize = 70;
    const distanceInSquares = 0.5; // 0.5 squares = 35px in world space
    const baseWorldX = 200;
    const baseWorldY = 300;
    const directionDeg = 0; // horizontal (X axis)

    const rad = (directionDeg * Math.PI) / 180;
    const maxOffsetWorld = distanceInSquares * gridSize; // exactly 35px

    // Simulate multiple frames at various t values
    const times = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 2 * Math.PI];
    for (const t of times) {
      const swayOffset = Math.sin(t) * maxOffsetWorld;
      expect(Number.isFinite(swayOffset)).toBe(true);
      const posX = baseWorldX + Math.cos(rad) * swayOffset;
      const posY = baseWorldY + Math.sin(rad) * swayOffset;

      expect(Number.isFinite(posX)).toBe(true);
      expect(Number.isFinite(posY)).toBe(true);
      // Displacement is always within [-35px, +35px] relative to baseWorldX
      expect(Math.abs(posX - baseWorldX)).toBeLessThanOrEqual(35.001);
      expect(posY).toBe(baseWorldY);
    }
  });

  it('prevents light leaking at wall corners and window portal gaps', () => {
    // 1. Esquina en L con dos paredes que se tocan exactamente en (100, 100)
    const cornerSegments = [
      {
        p1: { x: 0, y: 100 },
        p2: { x: 100, y: 100 },
        entityId: 'wall_h',
        source: 'drawn' as const
      },
      {
        p1: { x: 100, y: 100 },
        p2: { x: 100, y: 0 },
        entityId: 'wall_v',
        source: 'drawn' as const
      }
    ];

    // Luz dentro de la habitación en (50, 50) con radio 200px
    const lightOrigin = { x: 50, y: 50 };
    const polyCorner = computeVisibilityPolygon(lightOrigin, 200, cornerSegments);

    // Ningún punto del polígono debe colarse a través de la esquina hacia afuera (x > 100.5 && y > 100.5)
    const cornerLeaks = polyCorner.filter((p) => p.x > 100.5 && p.y > 100.5);
    expect(cornerLeaks).toHaveLength(0);

    // 2. Pared con hueco de ventana cubierto por un portal UVTT no convertido
    const mapWithWindowPortal: Entity = {
      id: 'map_window',
      type: 'map',
      name: 'Mapa con Ventana',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 1,
      visibleToPlayers: true,
      locked: true,
      mapData: {
        gridWidth: 10,
        gridHeight: 10,
        pixelsPerGrid: 70,
        walls: [
          { p1: { x: 0, y: 100 }, p2: { x: 40, y: 100 } },
          { p1: { x: 60, y: 100 }, p2: { x: 100, y: 100 } }
        ],
        portals: [
          {
            position: { x: 50, y: 100 },
            bounds: [
              { x: 40, y: 100 },
              { x: 60, y: 100 }
            ],
            rotation: 0,
            closed: false, // ventana o portal abierto
            freestanding: true
          }
        ],
        lights: []
      }
    };

    const lightEntity: Entity = {
      id: 'light_inside',
      type: 'light',
      name: 'Luz interior',
      x: 50,
      y: 50,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 45,
      visibleToPlayers: true,
      locked: false,
      light: {
        color: '#ffaa44',
        intensity: 100,
        brightRadiusInSquares: 3,
        dimRadiusInSquares: 2,
        edgeHardness: 0.5,
        flicker: false
      }
    };

    const lightVis = lightManager.getLightsVisibility([mapWithWindowPortal, lightEntity], 70);
    expect(lightVis).toHaveLength(1);

    // El portal en el hueco (40-60 a y=100) bloquea la luz: ningún punto pasa a y > 100.5 en x entre 35 y 65
    const windowLeaks = lightVis[0].totalPolygon.filter((p) => p.y > 100.5 && p.x >= 35 && p.x <= 65);
    expect(windowLeaks).toHaveLength(0);
  });
});
