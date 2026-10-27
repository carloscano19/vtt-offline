import { Container, Graphics } from 'pixi.js';
import { Entity } from '../../types/entity';
import { LightVisibility } from '../../modules/lights/lightManager';
import { parseColor } from '../../utils/color';

/**
 * Capa interactiva de Luces (Solo Máster).
 * Muestra el icono de la antorcha/luz, anillo de selección y estado de candado.
 */
export class LightsLayer extends Container {
  private isMaster: boolean;
  private iconMap = new Map<string, Container>();

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
  }

  public update(entities: Entity[], selectedIds: string[] = [], isPlayerPreview = false) {
    // Si no es máster o es vista previa de jugadores, ocultar iconos de luz
    if (!this.isMaster || isPlayerPreview) {
      this.visible = false;
      return;
    }

    this.visible = true;
    const lightEntities = entities.filter((e) => e.type === 'light');
    const currentIds = new Set<string>();

    for (const light of lightEntities) {
      currentIds.add(light.id);
      let container = this.iconMap.get(light.id);

      if (!container) {
        container = new Container();
        container.label = light.id;
        const gfx = new Graphics();
        gfx.label = 'gfx';
        container.addChild(gfx);
        this.iconMap.set(light.id, container);
        this.addChild(container);
      }

      container.x = light.x;
      container.y = light.y;
      container.zIndex = 50;
      container.alpha = light.visibleToPlayers ? 1.0 : 0.45;

      const isSelected = selectedIds.includes(light.id);
      const gfx = container.getChildByLabel('gfx') as Graphics;
      if (gfx) {
        gfx.clear();

        const colorHex = parseColor(light.light?.color, 0xffaa44).rgb;

        // Halo tenue
        gfx.circle(0, 0, 16);
        gfx.fill({ color: colorHex, alpha: 0.25 });

        // Círculo central antorcha
        gfx.circle(0, 0, 10);
        gfx.fill({ color: colorHex, alpha: 0.9 });
        gfx.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });

        // Llama / chispa interior
        gfx.circle(0, 0, 4);
        gfx.fill({ color: 0xffffff, alpha: 1.0 });

        // Indicador de selección
        if (isSelected) {
          gfx.circle(0, 0, 18);
          gfx.stroke({ width: 2, color: 0x38bdf8, alpha: 0.95 });
        }

        // Indicador de candado
        if (light.locked) {
          gfx.circle(8, -8, 4);
          gfx.fill({ color: 0xff4444, alpha: 1.0 });
          gfx.stroke({ width: 1, color: 0x000000 });
        }
      }
    }

    // Limpiar luces eliminadas
    for (const [id, container] of this.iconMap.entries()) {
      if (!currentIds.has(id)) {
        this.removeChild(container);
        container.destroy({ children: true });
        this.iconMap.delete(id);
      }
    }
  }
}
