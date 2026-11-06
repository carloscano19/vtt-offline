import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Entity } from '../../types/entity';

export class MovementPathLayer extends Container {
  private isMaster: boolean;
  private pathGraphics: Graphics;
  private badgesContainer: Container;
  private badgePool: Map<string, { container: Container; bg: Graphics; text: Text }> = new Map();

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;

    // Capa de casillas y trazado verde
    this.pathGraphics = new Graphics();
    this.addChild(this.pathGraphics);

    // Contenedor para badges flotantes de presupuesto
    this.badgesContainer = new Container();
    this.addChild(this.badgesContainer);
  }

  public update(entities: Entity[], gridSize: number = 70, cameraZoom: number = 1.0) {
    this.pathGraphics.clear();
    const activeBadgeIds = new Set<string>();
    const zoom = Math.max(0.1, cameraZoom || 1.0);

    for (const ent of entities) {
      if (ent.type !== 'token') continue;

      // En la tele o jugador remoto, no mostrar info de tokens ocultos
      if (!this.isMaster && ent.visibleToPlayers === false) continue;

      const path = ent.movementState?.path;

      // 1. Dibujar casillas recorridas y camino verde si existen
      if (Array.isArray(path) && path.length > 0) {
        const half = gridSize / 2;
        const cornerRadius = Math.max(4, gridSize * 0.12);

        // Cuadrícula translúcida en cada paso del camino
        for (let i = 0; i < path.length; i++) {
          const pt = path[i];
          this.pathGraphics.roundRect(pt.x - half, pt.y - half, gridSize, gridSize, cornerRadius);
          this.pathGraphics.fill({ color: 0x22c55e, alpha: 0.32 });
          this.pathGraphics.stroke({ color: 0x4ade80, width: 2, alpha: 0.75 });
        }

        // Línea conectora central
        if (path.length > 1) {
          this.pathGraphics.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) {
            this.pathGraphics.lineTo(path[i].x, path[i].y);
          }
          this.pathGraphics.stroke({ color: 0x22c55e, width: 3.5, alpha: 0.85 });
        }
      }

      // 2. Contador flotante de casillas ("4 / 7")
      // Se muestra si el token está controlado por un jugador o tiene presupuesto de movimiento configurado
      const hasMovementTracking = Boolean(
        ent.controlledBy ||
        ent.movementBudget !== undefined ||
        (path && path.length > 0)
      );

      if (!hasMovementTracking) continue;

      const budget = typeof ent.movementBudget === 'number' ? ent.movementBudget : 7;
      const remaining = typeof ent.movementState?.remaining === 'number'
        ? ent.movementState.remaining
        : budget;

      activeBadgeIds.add(ent.id);

      let badgeItem = this.badgePool.get(ent.id);
      if (!badgeItem) {
        const container = new Container();
        const bg = new Graphics();
        const text = new Text({
          text: '',
          style: new TextStyle({
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: 13,
            fontWeight: 'bold',
            fill: '#ffffff',
            align: 'center'
          })
        });
        text.anchor.set(0.5);

        container.addChild(bg);
        container.addChild(text);
        this.badgesContainer.addChild(container);

        badgeItem = { container, bg, text };
        this.badgePool.set(ent.id, badgeItem);
      }

      badgeItem.container.visible = true;
      badgeItem.text.text = `${remaining} / ${budget}`;

      // Posicionamiento en la esquina superior derecha del token
      const halfSize = (gridSize * Math.abs(ent.scaleX || 1)) / 2;
      badgeItem.container.x = ent.x + halfSize + 14 / zoom;
      badgeItem.container.y = ent.y - halfSize;
      badgeItem.container.scale.set(1 / zoom);

      // Fondo píldora con color verde si quedan casillas, o rojo si está agotado
      badgeItem.bg.clear();
      const textWidth = badgeItem.text.width || 42;
      const padX = 8;
      const bgWidth = textWidth + padX * 2;
      const bgHeight = 22;
      const isZero = remaining === 0;

      badgeItem.bg.roundRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 11);
      badgeItem.bg.fill({
        color: isZero ? 0xef4444 : 0x15803d,
        alpha: 0.95
      });
      badgeItem.bg.stroke({
        color: isZero ? 0xfca5a5 : 0x4ade80,
        width: 1.5,
        alpha: 0.9
      });
    }

    // Ocultar badges de tokens eliminados o inactivos
    for (const [id, badgeItem] of this.badgePool.entries()) {
      if (!activeBadgeIds.has(id)) {
        badgeItem.container.visible = false;
      }
    }
  }

  public override destroy(options?: any) {
    this.badgePool.clear();
    super.destroy(options);
  }
}
