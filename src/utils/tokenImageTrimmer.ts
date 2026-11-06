/**
 * Utilidades para el recorte automático de márgenes transparentes en tokens.
 * Detecta píxeles no transparentes (alfa > 10), recorta y centra la imagen en un lienzo
 * cuadrado con un 4 % de margen, exportando en PNG con transparencia completa.
 */

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface SquareCropResult {
  bbox: BoundingBox;
  contentSize: number;
  margin: number;
  squareSize: number;
  destX: number;
  destY: number;
  /** Desplazamiento del centro del dibujo respecto al centro de la imagen original */
  offsetX: number;
  offsetY: number;
}

/**
 * Recorre un array de bytes para determinar si un archivo GIF es animado.
 * Cuenta los descriptores de imagen (separador 0x2C) respetando la estructura de bloques de GIF.
 * Si contiene más de un descriptor de imagen, es animado.
 * En caso de duda o archivo corrupto/truncado, devuelve true (no recortar).
 */
export function isAnimatedGifBuffer(buffer: ArrayBuffer | Uint8Array): boolean {
  try {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < 13) return false;

    // Encabezado: "GIF87a" o "GIF89a"
    const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    if (sig !== 'GIF87a' && sig !== 'GIF89a') {
      return false;
    }

    // Logical Screen Descriptor: bytes 6 a 12. Byte 10 contiene flags de la paleta global (GCT)
    const packed = bytes[10];
    const hasGCT = (packed & 0x80) !== 0;
    const gctSize = hasGCT ? 3 * (1 << ((packed & 0x07) + 1)) : 0;

    let pos = 13 + gctSize;
    let imageBlockCount = 0;

    while (pos < bytes.length) {
      const blockType = bytes[pos];

      // Fin del archivo GIF (Trailer)
      if (blockType === 0x3b) {
        break;
      }

      // Bloque de extensión (0x21)
      if (blockType === 0x21) {
        pos++; // Salta 0x21
        if (pos >= bytes.length) break;
        pos++; // Salta etiqueta de extensión (p. ej. 0xF9 Graphic Control, 0xFF Application)

        // Salta sub-bloques de datos
        while (pos < bytes.length) {
          const subLen = bytes[pos];
          pos++;
          if (subLen === 0) break; // Terminador de bloque (0x00)
          pos += subLen;
        }
        continue;
      }

      // Descriptor de Imagen (0x2C)
      if (blockType === 0x2c) {
        imageBlockCount++;
        if (imageBlockCount > 1) {
          return true; // Más de 1 bloque de imagen -> GIF animado
        }

        // Cabecera del descriptor de imagen: 10 bytes (0x2C + 8 coordenadas + 1 packed)
        if (pos + 10 > bytes.length) break;
        const imgPacked = bytes[pos + 9];
        const hasLCT = (imgPacked & 0x80) !== 0;
        const lctSize = hasLCT ? 3 * (1 << ((imgPacked & 0x07) + 1)) : 0;

        pos += 10 + lctSize; // Salta descriptor y paleta de color local
        if (pos >= bytes.length) break;

        pos++; // Salta byte de tamaño mínimo de código LZW

        // Salta sub-bloques de píxeles comprimidos
        while (pos < bytes.length) {
          const subLen = bytes[pos];
          pos++;
          if (subLen === 0) break;
          pos += subLen;
        }
        continue;
      }

      // Bloque no reconocido: ante la duda, no recortar
      return true;
    }

    return imageBlockCount > 1;
  } catch {
    // Ante cualquier duda o error, no recortar
    return true;
  }
}

/**
 * Determina de forma asíncrona si un Blob de GIF es animado leyendo sus bytes.
 */
export async function isAnimatedGif(blob: Blob): Promise<boolean> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    return isAnimatedGifBuffer(arrayBuffer);
  } catch {
    return true;
  }
}

/**
 * Comprueba si un asset es apto para recorte de márgenes.
 * Vídeos y GIFs animados NUNCA se recortan.
 */
export async function shouldTrimAsset(
  blob: Blob,
  mimeType?: string,
  fileName?: string
): Promise<boolean> {
  const mime = (mimeType || blob.type || '').toLowerCase();
  const name = (fileName || '').toLowerCase();

  // Vídeos nunca se recortan
  if (mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.webm')) {
    return false;
  }

  // Audio nunca se recorta
  if (mime.startsWith('audio/') || name.endsWith('.mp3') || name.endsWith('.ogg') || name.endsWith('.wav')) {
    return false;
  }

  // Archivos de mapas UVTT nunca se recortan
  if (name.endsWith('.uvtt') || name.endsWith('.dd2vtt') || name.endsWith('.df2vtt')) {
    return false;
  }

  // GIFs: comprobar si es animado. Si es animado o dudoso, no recortar.
  if (mime.includes('gif') || name.endsWith('.gif')) {
    const animated = await isAnimatedGif(blob);
    if (animated) {
      return false;
    }
    return true; // GIF estático
  }

  // PNG, WebP o JPEG
  if (
    mime.startsWith('image/') ||
    name.endsWith('.png') ||
    name.endsWith('.webp') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg')
  ) {
    return true;
  }

  return false;
}

/**
 * Escanea un buffer RGBA para encontrar el rectángulo que contiene
 * todos los píxeles con alpha > alphaThreshold (por defecto 10).
 */
export function findOpaqueBoundingBox(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  alphaThreshold = 10
): BoundingBox | null {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return null;
  }

  // 1. Encontrar minY
  let minY = -1;
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[rowOffset + x * 4 + 3] > alphaThreshold) {
        minY = y;
        break;
      }
    }
    if (minY !== -1) break;
  }

  if (minY === -1) {
    // Todos los píxeles son transparentes
    return null;
  }

  // 2. Encontrar maxY
  let maxY = minY;
  for (let y = height - 1; y >= minY; y--) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[rowOffset + x * 4 + 3] > alphaThreshold) {
        maxY = y;
        break;
      }
    }
    if (maxY !== minY) break;
  }

  // 3. Encontrar minX y maxX restringidos al rango [minY, maxY]
  let minX = width;
  let maxX = -1;

  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < minX; x++) {
      if (data[rowOffset + x * 4 + 3] > alphaThreshold) {
        minX = x;
        break;
      }
    }
    for (let x = width - 1; x > maxX; x--) {
      if (data[rowOffset + x * 4 + 3] > alphaThreshold) {
        maxX = x;
        break;
      }
    }
  }

  if (maxX < minX) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

/**
 * A partir del bounding box del dibujo, calcula el recorte cuadrado centrado
 * con un 4 % de margen sobre el lado mayor del dibujo.
 */
export function calculateSquareCrop(
  bbox: BoundingBox,
  origWidth: number,
  origHeight: number,
  marginPercent = 0.04
): SquareCropResult {
  const contentSize = Math.max(bbox.width, bbox.height);
  const margin = Math.max(1, Math.round(contentSize * marginPercent));
  const squareSize = contentSize + margin * 2;

  // Centrado en el lado corto
  const padX = (contentSize - bbox.width) / 2;
  const padY = (contentSize - bbox.height) / 2;

  const destX = margin + Math.floor(padX);
  const destY = margin + Math.floor(padY);

  // Centro del dibujo en coordenadas de la imagen original
  const drawingCenterX = bbox.minX + bbox.width / 2;
  const drawingCenterY = bbox.minY + bbox.height / 2;

  // Centro de la imagen original
  const origCenterX = origWidth / 2;
  const origCenterY = origHeight / 2;

  const offsetX = drawingCenterX - origCenterX;
  const offsetY = drawingCenterY - origCenterY;

  return {
    bbox,
    contentSize,
    margin,
    squareSize,
    destX,
    destY,
    offsetX,
    offsetY
  };
}

/**
 * Calcula el desplazamiento que debe aplicarse a la posición (x, y) de una entidad en el tablero
 * para que el dibujo recortado permanezca exactamente en la misma posición visible,
 * teniendo en cuenta la rotación y el volteo (escala negativa) de la entidad.
 */
export function calculateEntityPositionShift(
  offsetX: number,
  offsetY: number,
  scaleX: number,
  scaleY: number,
  rotation: number
): { shiftX: number; shiftY: number } {
  const localDx = offsetX * scaleX;
  const localDy = offsetY * scaleY;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    shiftX: localDx * cos - localDy * sin,
    shiftY: localDx * sin + localDy * cos
  };
}

/**
 * Recorta una imagen en memoria mediante canvas HTML5 y la exporta en formato PNG
 * con transparencia completa, centrada y en formato cuadrado con un 4 % de margen.
 */
export async function trimTokenImage(
  blob: Blob
): Promise<{
  blob: Blob;
  width: number;
  height: number;
  cropResult: SquareCropResult;
} | null> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    if (typeof img.decode === 'function') {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });
    }

    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    if (origW <= 0 || origH <= 0) return null;

    // Canvas auxiliar para leer los datos de píxeles
    const readCanvas = document.createElement('canvas');
    readCanvas.width = origW;
    readCanvas.height = origH;
    const readCtx = readCanvas.getContext('2d');
    if (!readCtx) return null;

    readCtx.drawImage(img, 0, 0);
    const imgData = readCtx.getImageData(0, 0, origW, origH);
    const bbox = findOpaqueBoundingBox(imgData.data, origW, origH, 10);
    if (!bbox) {
      // Todo transparente
      return null;
    }

    const cropResult = calculateSquareCrop(bbox, origW, origH, 0.04);

    // Canvas de salida: cuadrado, fondo transparente
    const outCanvas = document.createElement('canvas');
    outCanvas.width = cropResult.squareSize;
    outCanvas.height = cropResult.squareSize;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return null;

    outCtx.clearRect(0, 0, cropResult.squareSize, cropResult.squareSize);

    // Dibujar el contenido recortado exactamente en el destino centrado
    outCtx.drawImage(
      img,
      cropResult.bbox.minX,
      cropResult.bbox.minY,
      cropResult.bbox.width,
      cropResult.bbox.height,
      cropResult.destX,
      cropResult.destY,
      cropResult.bbox.width,
      cropResult.bbox.height
    );

    // Exportar SIEMPRE en PNG para garantizar máxima fidelidad y transparencia completa
    const outBlob = await new Promise<Blob | null>((resolve) => {
      outCanvas.toBlob((b) => resolve(b), 'image/png');
    });

    if (!outBlob) return null;

    return {
      blob: outBlob,
      width: cropResult.squareSize,
      height: cropResult.squareSize,
      cropResult
    };
  } catch (err) {
    console.error('[trimTokenImage] Error recortando imagen:', err);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
