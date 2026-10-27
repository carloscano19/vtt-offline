export interface ParsedColor {
  rgb: number;   // 0x000000 – 0xFFFFFF (compatible con Pixi)
  alpha: number; // 0.0 – 1.0
}

/**
 * Convierte un número RGB (0x000000 - 0xFFFFFF) a formato hexadecimal "#rrggbb"
 */
export function colorToHex(rgb: number): string {
  const safe = Math.max(0, Math.min(0xffffff, Math.floor(rgb || 0)));
  return `#${safe.toString(16).padStart(6, '0')}`;
}

/**
 * Convierte un número RGB a componentes { r, g, b } en rango 0-255
 */
export function rgbComponents(rgb: number): { r: number; g: number; b: number } {
  const safe = Math.max(0, Math.min(0xffffff, Math.floor(rgb || 0)));
  return {
    r: (safe >> 16) & 0xff,
    g: (safe >> 8) & 0xff,
    b: safe & 0xff
  };
}

/**
 * Helper único y tolerante a fallos para parsear cualquier formato de color:
 * - "#rgb", "rgb" (3 dígitos) -> alpha = 1.0
 * - "#rrggbb", "rrggbb" (6 dígitos) -> alpha = 1.0
 * - "#aarrggbb", "aarrggbb" (8 dígitos ARGB, formato de Dungeondraft donde los 2 primeros dígitos son el alfa)
 * - number: 0x000000–0xFFFFFF (RGB directo) o > 0xFFFFFF (entero de 32 bits ARGB)
 *
 * Ante cualquier valor nulo, indefinido o sintaxis no válida, devuelve un color por defecto y nunca lanza excepción.
 */
export function parseColor(input: unknown, defaultColor = 0xffffff): ParsedColor {
  const fallback: ParsedColor = {
    rgb: Math.max(0, Math.min(0xffffff, Math.floor(defaultColor))),
    alpha: 1.0
  };

  if (input === null || input === undefined) {
    return fallback;
  }

  // 1. Números (incluye formatos directos de Pixi y valores ARGB enteros de 32 bits)
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return fallback;
    const uint = input >>> 0;
    if (uint <= 0xffffff) {
      return { rgb: uint, alpha: 1.0 };
    }
    // 32-bit ARGB: 0xAARRGGBB (ej. 4293709195 = 0xffeccd8b)
    const a = (uint >>> 24) & 0xff;
    const rgb = uint & 0xffffff;
    return { rgb, alpha: a / 255 };
  }

  if (typeof input !== 'string') {
    return fallback;
  }

  const str = input.trim();
  if (!str) return fallback;

  // Quitar prefijo '#' si existe
  const hex = str.startsWith('#') ? str.slice(1) : str;

  // Verificar que solo contiene caracteres hexadecimales
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    return fallback;
  }

  // 2. 3 dígitos: "rgb" -> "rrggbb"
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return { rgb: (r << 16) | (g << 8) | b, alpha: 1.0 };
  }

  // 3. 4 dígitos: "argb" -> "aarrggbb"
  if (hex.length === 4) {
    const a = parseInt(hex[0] + hex[0], 16);
    const r = parseInt(hex[1] + hex[1], 16);
    const g = parseInt(hex[2] + hex[2], 16);
    const b = parseInt(hex[3] + hex[3], 16);
    return { rgb: (r << 16) | (g << 8) | b, alpha: a / 255 };
  }

  // 4. 6 dígitos: "rrggbb"
  if (hex.length === 6) {
    const rgb = parseInt(hex, 16);
    if (Number.isNaN(rgb)) return fallback;
    return { rgb, alpha: 1.0 };
  }

  // 5. 8 dígitos: "aarrggbb" (ARGB - Formato nativo de Dungeondraft)
  if (hex.length === 8) {
    const aHex = hex.slice(0, 2);
    const rgbHex = hex.slice(2);
    const a = parseInt(aHex, 16);
    const rgb = parseInt(rgbHex, 16);
    if (Number.isNaN(a) || Number.isNaN(rgb)) return fallback;
    return { rgb, alpha: a / 255 };
  }

  // Cualquier otra longitud: parsear uint32 de forma segura
  const num = parseInt(hex, 16);
  if (Number.isNaN(num)) return fallback;
  const uint = num >>> 0;
  if (uint > 0xffffff) {
    const a = (uint >>> 24) & 0xff;
    const rgb = uint & 0xffffff;
    return { rgb, alpha: a > 0 ? a / 255 : 1.0 };
  }
  return { rgb: uint, alpha: 1.0 };
}
