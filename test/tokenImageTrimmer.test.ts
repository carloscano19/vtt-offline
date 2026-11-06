import { describe, it, expect } from 'vitest';
import {
  findOpaqueBoundingBox,
  calculateSquareCrop,
  calculateEntityPositionShift,
  isAnimatedGifBuffer
} from '../src/utils/tokenImageTrimmer';

describe('tokenImageTrimmer', () => {
  describe('findOpaqueBoundingBox', () => {
    it('devuelve null si todos los píxeles son transparentes (alpha <= 10)', () => {
      const width = 10;
      const height = 10;
      const data = new Uint8ClampedArray(width * height * 4); // todo en 0
      // Algunos píxeles con alfa <= 10
      data[3] = 5;
      data[7] = 10;

      const bbox = findOpaqueBoundingBox(data, width, height, 10);
      expect(bbox).toBeNull();
    });

    it('devuelve null si las dimensiones son inválidas o buffer insuficiente', () => {
      expect(findOpaqueBoundingBox(new Uint8ClampedArray(0), 0, 0)).toBeNull();
      expect(findOpaqueBoundingBox(new Uint8ClampedArray(10), 10, 10)).toBeNull();
    });

    it('calcula correctamente el bounding box con alfa > 10', () => {
      const width = 20;
      const height = 20;
      const data = new Uint8ClampedArray(width * height * 4);

      // Colocar píxeles no transparentes (alfa = 255) en:
      // (x=5, y=4)
      const idx1 = (4 * width + 5) * 4;
      data[idx1 + 3] = 255;

      // (x=14, y=12)
      const idx2 = (12 * width + 14) * 4;
      data[idx2 + 3] = 50;

      // (x=8, y=15)
      const idx3 = (15 * width + 8) * 4;
      data[idx3 + 3] = 200;

      const bbox = findOpaqueBoundingBox(data, width, height, 10);
      expect(bbox).not.toBeNull();
      expect(bbox!.minX).toBe(5);
      expect(bbox!.maxX).toBe(14);
      expect(bbox!.minY).toBe(4);
      expect(bbox!.maxY).toBe(15);
      expect(bbox!.width).toBe(10); // 14 - 5 + 1
      expect(bbox!.height).toBe(12); // 15 - 4 + 1
    });
  });

  describe('calculateSquareCrop', () => {
    it('calcula un recorte cuadrado con margen del 4 % para un dibujo cuadrado', () => {
      const bbox = { minX: 100, minY: 100, maxX: 199, maxY: 199, width: 100, height: 100 };
      const origW = 400;
      const origH = 400;

      const res = calculateSquareCrop(bbox, origW, origH, 0.04);
      expect(res.contentSize).toBe(100);
      // 4% de 100 = 4px
      expect(res.margin).toBe(4);
      // squareSize = 100 + 4 * 2 = 108
      expect(res.squareSize).toBe(108);
      expect(res.destX).toBe(4);
      expect(res.destY).toBe(4);

      // Centro del dibujo: 100 + 50 = 150
      // Centro original: 200
      // Offset: 150 - 200 = -50
      expect(res.offsetX).toBe(-50);
      expect(res.offsetY).toBe(-50);
    });

    it('centra el dibujo en el lado corto cuando es rectangular (más ancho que alto)', () => {
      const bbox = { minX: 50, minY: 100, maxX: 249, maxY: 199, width: 200, height: 100 };
      const origW = 500;
      const origH = 500;

      const res = calculateSquareCrop(bbox, origW, origH, 0.04);
      expect(res.contentSize).toBe(200);
      // 4% de 200 = 8px
      expect(res.margin).toBe(8);
      // squareSize = 200 + 8 * 2 = 216
      expect(res.squareSize).toBe(216);

      // destX: margen (8) + (200 - 200)/2 = 8
      expect(res.destX).toBe(8);
      // destY: margen (8) + (200 - 100)/2 = 8 + 50 = 58
      expect(res.destY).toBe(58);
    });

    it('centra el dibujo en el lado corto cuando es vertical (más alto que ancho)', () => {
      const bbox = { minX: 100, minY: 50, maxX: 199, maxY: 349, width: 100, height: 300 };
      const origW = 600;
      const origH = 600;

      const res = calculateSquareCrop(bbox, origW, origH, 0.04);
      expect(res.contentSize).toBe(300);
      // 4% de 300 = 12px
      expect(res.margin).toBe(12);
      // squareSize = 300 + 12 * 2 = 324
      expect(res.squareSize).toBe(324);

      // destX: margen (12) + (300 - 100)/2 = 12 + 100 = 112
      expect(res.destX).toBe(112);
      // destY: margen (12) + (300 - 300)/2 = 12
      expect(res.destY).toBe(12);
    });
  });

  describe('calculateEntityPositionShift', () => {
    it('mantiene la posición correcta sin rotación ni volteo', () => {
      const shift = calculateEntityPositionShift(20, -10, 1, 1, 0);
      expect(shift.shiftX).toBeCloseTo(20);
      expect(shift.shiftY).toBeCloseTo(-10);
    });

    it('tiene en cuenta el volteo horizontal (escala negativa en X)', () => {
      // Si el dibujo estaba 20px a la derecha en la textura original, con escalaX = -1
      // en pantalla aparecía a la izquierda (-20px)
      const shift = calculateEntityPositionShift(20, -10, -1, 1, 0);
      expect(shift.shiftX).toBeCloseTo(-20);
      expect(shift.shiftY).toBeCloseTo(-10);
    });

    it('tiene en cuenta la rotación de 90 grados', () => {
      // 90 grados en radianes: (x, y) -> (-y, x)
      const angle = Math.PI / 2;
      const shift = calculateEntityPositionShift(20, 0, 1, 1, angle);
      expect(shift.shiftX).toBeCloseTo(0);
      expect(shift.shiftY).toBeCloseTo(20);
    });

    it('combina rotación y volteo horizontal simultáneos', () => {
      const angle = Math.PI; // 180 grados: (x, y) -> (-x, -y)
      // Con escalaX = -1: localDx = -20
      // Rotado 180°: -(-20) = 20
      const shift = calculateEntityPositionShift(20, 10, -1, 1, angle);
      expect(shift.shiftX).toBeCloseTo(20);
      expect(shift.shiftY).toBeCloseTo(-10);
    });

    it('tiene en cuenta el volteo vertical (escala negativa en Y)', () => {
      const shift = calculateEntityPositionShift(15, 25, 1, -1, 0);
      expect(shift.shiftX).toBeCloseTo(15);
      expect(shift.shiftY).toBeCloseTo(-25);
    });

    it('escala proporcionalmente el desplazamiento según la escala del token', () => {
      const shift = calculateEntityPositionShift(40, -60, 0.25, 0.25, 0);
      expect(shift.shiftX).toBeCloseTo(10);
      expect(shift.shiftY).toBeCloseTo(-15);
    });
  });

  describe('shouldTrimAsset', () => {
    it('rechaza vídeos MP4 y WebM', async () => {
      const { shouldTrimAsset } = await import('../src/utils/tokenImageTrimmer');
      const blob = new Blob(['fake video'], { type: 'video/mp4' });
      expect(await shouldTrimAsset(blob, 'video/mp4', 'creature.mp4')).toBe(false);
      expect(await shouldTrimAsset(blob, 'video/webm', 'creature.webm')).toBe(false);
    });

    it('rechaza archivos de audio', async () => {
      const { shouldTrimAsset } = await import('../src/utils/tokenImageTrimmer');
      const blob = new Blob(['fake audio'], { type: 'audio/mpeg' });
      expect(await shouldTrimAsset(blob, 'audio/mpeg', 'song.mp3')).toBe(false);
    });

    it('rechaza mapas UVTT', async () => {
      const { shouldTrimAsset } = await import('../src/utils/tokenImageTrimmer');
      const blob = new Blob(['{}'], { type: 'application/json' });
      expect(await shouldTrimAsset(blob, 'application/json', 'dungeon.uvtt')).toBe(false);
      expect(await shouldTrimAsset(blob, 'application/json', 'dungeon.dd2vtt')).toBe(false);
    });

    it('acepta imágenes PNG, WebP y JPEG', async () => {
      const { shouldTrimAsset } = await import('../src/utils/tokenImageTrimmer');
      const blobPng = new Blob(['fake png'], { type: 'image/png' });
      expect(await shouldTrimAsset(blobPng, 'image/png', 'goblin.png')).toBe(true);

      const blobWebp = new Blob(['fake webp'], { type: 'image/webp' });
      expect(await shouldTrimAsset(blobWebp, 'image/webp', 'dragon.webp')).toBe(true);

      const blobJpg = new Blob(['fake jpg'], { type: 'image/jpeg' });
      expect(await shouldTrimAsset(blobJpg, 'image/jpeg', 'orc.jpg')).toBe(true);
    });
  });

  describe('isAnimatedGifBuffer', () => {
    // Función auxiliar para construir un GIF sintético válido mínimo
    function createMockGif(imageCount: number): Uint8Array {
      const parts: number[] = [
        // Header "GIF89a"
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
        // LSD: 1x1 px, sin GCT
        0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00
      ];

      for (let i = 0; i < imageCount; i++) {
        // Graphic Control Extension (0x21 0xF9)
        parts.push(0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00);
        // Image Descriptor (0x2C): left(0), top(0), w(1), h(1), packed(0)
        parts.push(0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00);
        // LZW min code size
        parts.push(0x02);
        // Sub-block data (1 byte de datos: 0x44)
        parts.push(0x01, 0x44);
        // Sub-block terminator
        parts.push(0x00);
      }

      // Trailer (0x3B)
      parts.push(0x3b);

      return new Uint8Array(parts);
    }

    it('devuelve false para un GIF estático (exactamente 1 imagen)', () => {
      const staticGif = createMockGif(1);
      expect(isAnimatedGifBuffer(staticGif)).toBe(false);
    });

    it('devuelve true para un GIF animado (2 o más imágenes)', () => {
      const animatedGif = createMockGif(2);
      expect(isAnimatedGifBuffer(animatedGif)).toBe(true);
    });

    it('devuelve false si no tiene cabecera GIF válida', () => {
      const notGif = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
      expect(isAnimatedGifBuffer(notGif)).toBe(false);
    });
  });
});
