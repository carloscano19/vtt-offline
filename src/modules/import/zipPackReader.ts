import { ZipReader, BlobReader, BlobWriter, Entry } from '@zip.js/zip.js';

export interface ZipPackItem {
  id: string;
  entry: Entry;
  filename: string;
  fullPath: string;
  folder: string;
  size: number;
  extension: 'webm' | 'mp4' | 'gif' | 'png';
  mimeType: string;
  category: 'lights' | 'fire' | 'smoke' | 'arcane';
  emitsLight: boolean;
  lightColor: string;
  lightRadius: number;
  flicker: boolean;
  origin: string;
}

export interface ZipPackResult {
  zipName: string;
  totalItems: number;
  folders: string[];
  items: ZipPackItem[];
  reader: ZipReader<Blob>;
}

const SUPPORTED_EXTENSIONS = new Set(['webm', 'mp4', 'gif', 'png']);

/**
 * Determina la categoría del catálogo y configuración de luz según palabras clave en la ruta o nombre
 */
export function deduceCategoryAndLight(path: string): {
  category: 'lights' | 'fire' | 'smoke' | 'arcane';
  emitsLight: boolean;
  lightColor: string;
  lightRadius: number;
  flicker: boolean;
} {
  const lower = path.toLowerCase();

  // Luces (antorchas, faroles, velas, etc.)
  if (
    /torch|candle|lantern|brazier|antorcha|vela|farol|brasero|\blight\b|\blamp\b/.test(
      lower
    )
  ) {
    return {
      category: 'lights',
      emitsLight: true,
      lightColor: '#ffaa33',
      lightRadius: 4,
      flicker: true
    };
  }

  // Fuego (llamas, hogueras, incendios, explosiones)
  if (/fire|flame|bonfire|campfire|burn|fuego|llama|hoguera|incendio|lava|magma|explosion/.test(lower)) {
    return {
      category: 'fire',
      emitsLight: true,
      lightColor: '#ff7700',
      lightRadius: 4,
      flicker: true
    };
  }

  // Humo / Niebla / Gas
  if (/smoke|fog|cloud|mist|steam|gas|dust|humo|niebla|nube|polvo|vapor/.test(lower)) {
    return {
      category: 'smoke',
      emitsLight: false,
      lightColor: '#94a3b8',
      lightRadius: 0,
      flicker: false
    };
  }

  // Arcano / Rayo / Hielo / Magia / Portales
  return {
    category: 'arcane',
    emitsLight: false,
    lightColor: '#38bdf8',
    lightRadius: 0,
    flicker: false
  };
}

/**
 * Lee el directorio central del ZIP sin descomprimir los contenidos.
 * Utiliza @zip.js/zip.js con BlobReader sobre el File para lectura perezosa.
 */
export async function readZipPack(file: File): Promise<ZipPackResult> {
  const reader = new ZipReader(new BlobReader(file));
  const entries = await reader.getEntries();

  const isJB2A = /jb2a/i.test(file.name);
  const origin = isJB2A ? 'JB2A' : file.name.replace(/\.zip$/i, '');

  const validEntries: Entry[] = [];
  for (const entry of entries) {
    if (entry.directory) continue;
    const name = entry.filename;
    // Ignorar archivos de metadatos o del sistema
    if (name.includes('__MACOSX') || name.startsWith('._') || name.includes('/._') || name.endsWith('.DS_Store')) {
      continue;
    }
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext && SUPPORTED_EXTENSIONS.has(ext)) {
      validEntries.push(entry);
    }
  }

  // Detectar si todas las entradas comparten un prefijo de carpeta común (ej. "JB2A_DnD5e-main/")
  let commonPrefix = '';
  if (validEntries.length > 0) {
    const firstParts = validEntries[0].filename.split('/');
    if (firstParts.length > 1) {
      const candidate = firstParts[0] + '/';
      const allShare = validEntries.every((e) => e.filename.startsWith(candidate));
      if (allShare) {
        commonPrefix = candidate;
      }
    }
  }

  const items: ZipPackItem[] = [];
  const folderSet = new Set<string>();

  for (let i = 0; i < validEntries.length; i++) {
    const entry = validEntries[i];
    const fullPath = entry.filename;
    const stripped = commonPrefix ? fullPath.slice(commonPrefix.length) : fullPath;
    const parts = stripped.split('/');
    const filename = parts.pop() || fullPath;
    const folder = parts.length > 0 ? parts.join('/') : 'Raíz';
    folderSet.add(folder);

    const ext = filename.split('.').pop()?.toLowerCase() as 'webm' | 'mp4' | 'gif' | 'png';
    const mimeType =
      ext === 'webm'
        ? 'video/webm'
        : ext === 'mp4'
        ? 'video/mp4'
        : ext === 'gif'
        ? 'image/gif'
        : 'image/png';

    const deduced = deduceCategoryAndLight(fullPath);

    items.push({
      id: `zip_item_${i}_${Math.random().toString(36).substring(2, 7)}`,
      entry,
      filename,
      fullPath,
      folder,
      size: entry.uncompressedSize || 0,
      extension: ext,
      mimeType,
      category: deduced.category,
      emitsLight: deduced.emitsLight,
      lightColor: deduced.lightColor,
      lightRadius: deduced.lightRadius,
      flicker: deduced.flicker,
      origin
    });
  }

  // Ordenar carpetas alfabéticamente
  const folders = Array.from(folderSet).sort((a, b) => a.localeCompare(b));

  return {
    zipName: file.name,
    totalItems: items.length,
    folders,
    items,
    reader
  };
}

/**
 * Extrae el Blob de una entrada concreta bajo demanda (streaming / lectura parcial)
 */
export async function extractEntryBlob(entry: Entry, mimeType: string): Promise<Blob> {
  if (entry.directory || !('getData' in entry) || typeof (entry as any).getData !== 'function') {
    throw new Error('La entrada del ZIP no permite extracción de datos.');
  }
  return await (entry as any).getData(new BlobWriter(mimeType));
}
