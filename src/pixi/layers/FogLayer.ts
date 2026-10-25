import { Container, Graphics } from 'pixi.js';
import { Entity, Point2D } from '../../types/entity';
import { TokenVisibility } from '../../modules/vision/visibilityPolygon';

export class FogLayer extends Container {
  private unexploredGfx: Graphics;
  private exploredGfx: Graphics;
  private isMaster: boolean;

  // Memoria de exploración de polígonos vistos por el máster / sincronizados
  private exploredPolygons: Point2D[][] = [];

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;

    this.exploredGfx = new Graphics();
    this.unexploredGfx = new Graphics();

    this.addChild(this.exploredGfx);
    this.addChild(this.unexploredGfx);
  }

  public resetExploration() {
    this.exploredPolygons = [];
    this.exploredGfx.clear();
    this.unexploredGfx.clear();
  }

  public addManualArea(rect: { x: number; y: number; width: number; height: number }, reveal: boolean) {
    if (reveal) {
      // Añadir rectángulo a la memoria de exploración
      this.exploredPolygons.push([
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.width, y: rect.y },
        { x: rect.x + rect.width, y: rect.y + rect.height },
        { x: rect.x, y: rect.y + rect.height }
      ]);
    } else {
      // Ocultar zona: reiniciar memoria y volver a acumular (o recortar)
      // Simplificado: si oculta una zona, se filtra memoria que caiga completamente dentro
      this.exploredPolygons = this.exploredPolygons.filter((poly) => {
        const cx = poly.reduce((acc, p) => acc + p.x, 0) / poly.length;
        const cy = poly.reduce((acc, p) => acc + p.y, 0) / poly.length;
        const inside = cx >= rect.x && cx <= rect.x + rect.width && cy >= rect.y && cy <= rect.y + rect.height;
        return !inside;
      });
    }
  }

  /**
   * Actualiza el renderizado de la niebla de guerra.
   * @param fogEnabled si la niebla está activa
   * @param isPlayerPreview si el máster ha activado la previsualización de jugadores
   * @param visibilities polígonos de visión de tokens de jugador activos
   * @param bounds caja envolvente del mundo/mapas para pintar niebla
   */
  public update(
    fogEnabled: boolean,
    isPlayerPreview: boolean,
    visibilities: TokenVisibility[],
    bounds: { x: number; y: number; width: number; height: number }
  ) {
    this.exploredGfx.clear();
    this.unexploredGfx.clear();

    const shouldRenderFog = (!this.isMaster && fogEnabled) || (this.isMaster && isPlayerPreview && fogEnabled);

    if (!shouldRenderFog) {
      this.visible = false;
      return;
    }

    this.visible = true;

    // 1. Acumular visión actual en la memoria de exploración
    for (const v of visibilities) {
      if (v.polygon.length > 2) {
        this.exploredPolygons.push(v.polygon);
      }
    }

    // Limitar tamaño de memoria para evitar saturar memoria en sesiones largas
    if (this.exploredPolygons.length > 150) {
      this.exploredPolygons = this.exploredPolygons.slice(-100);
    }

    // 2. Capa oscura general para zonas exploradas (mapa oscurecido / desaturado con negro semi-transparente 70%)
    this.exploredGfx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.exploredGfx.fill({ color: 0x020617, alpha: 0.65 });

    // Perforar / iluminar zonas visibles ahora mismo (alpha 0)
    // En Pixi v8, Graphics soporta path cutting o dibujar polígonos de visión como máscaras
    for (const v of visibilities) {
      if (v.polygon.length < 3) continue;
      // Iluminar la zona visible actualmente
      this.exploredGfx.poly(v.polygon);
      this.exploredGfx.cut();
    }

    // 3. Capa negra opaca para zonas NUNCA exploradas (100% negro)
    this.unexploredGfx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.unexploredGfx.fill({ color: 0x020617, alpha: 1.0 });

    // Perforar todas las zonas exploradas (memoria)
    for (const poly of this.exploredPolygons) {
      if (poly.length >= 3) {
        this.unexploredGfx.poly(poly);
        this.unexploredGfx.cut();
      }
    }
  }
}
