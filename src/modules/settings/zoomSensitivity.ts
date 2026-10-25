const KEY = 'vtt_zoom_sensitivity';
export const ZOOM_SENS_MIN = 0.25;
export const ZOOM_SENS_MAX = 2;

export function getZoomSensitivity(): number {
  try {
    const v = parseFloat(localStorage.getItem(KEY) ?? '');
    if (Number.isFinite(v)) return Math.min(ZOOM_SENS_MAX, Math.max(ZOOM_SENS_MIN, v));
  } catch {
    // localStorage no disponible
  }
  return 1;
}

export function setZoomSensitivity(v: number) {
  try {
    localStorage.setItem(KEY, String(Math.min(ZOOM_SENS_MAX, Math.max(ZOOM_SENS_MIN, v))));
  } catch {
    // ignorar
  }
}
