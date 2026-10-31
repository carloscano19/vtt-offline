import { Container, Sprite, Graphics, Text, TextStyle, Texture, ColorMatrixFilter } from 'pixi.js';
import { Entity, TokenSide, Point2D, EntityAnimations } from '../../types/entity';
import { getTextureForAsset, getGifDataForAsset, getCachedTexture } from '../utils/textureCache';
import { TokenVisibility } from '../../modules/vision/visibilityPolygon';
import { getFrameTextureForTime, AnimatedGifData } from '../../modules/media/gifDecoder';
import { videoManager } from '../../modules/media/videoManager';

/**
 * Comprueba si un punto (x, y) está dentro de un polígono 2D (Ray-casting point in polygon)
 */
function isPointInPolygon(point: Point2D, vs: Point2D[]): boolean {
  const x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export class TokensLayer extends Container {
  private isMaster: boolean;
  private containerMap: Map<string, Container> = new Map();
  private fadeMap = new Map<string, { current: number; target: number }>();
  private animTime = 0;
  private gridSize = 70;
  private cameraZoom = 1.0;

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
  }

  public tick(deltaSeconds: number) {
    if (this.isMaster) return;
    for (const [id, fade] of this.fadeMap.entries()) {
      const diff = fade.target - fade.current;
      if (diff !== 0) {
        const step = deltaSeconds / 0.6;
        fade.current = Math.abs(diff) <= step ? fade.target : fade.current + Math.sign(diff) * step;
        const container = this.containerMap.get(id);
        if (container) {
          const entityOpacity = (container as any)._entityOpacity ?? 1.0;
          container.alpha = entityOpacity * fade.current;
          container.visible = fade.current > 0.001;
        }
      }
    }
  }

  public async syncEntities(
    entities: Entity[],
    selectedIds: string[] = [],
    visibilities: TokenVisibility[] = [],
    isPlayerPreview = false,
    fogEnabled = true,
    gridSize = 70,
    cameraZoom = 1.0
  ) {
    this.gridSize = gridSize > 0 ? gridSize : 70;
    this.cameraZoom = cameraZoom > 0 ? cameraZoom : 1.0;
    const tokenEntities = entities.filter((e) => e.type === 'token' || e.type === 'object');
    const currentIds = new Set<string>();

    const evaluatePlayerVisibility = !this.isMaster || (this.isMaster && isPlayerPreview);

    for (const entity of tokenEntities) {
      let targetVisibility = 1.0;
      if (evaluatePlayerVisibility) {
        if (!entity.visibleToPlayers) {
          targetVisibility = 0.0;
        } else if (fogEnabled && (entity.side === 'enemigo' || entity.side === 'neutral' || entity.type === 'object')) {
          const pt = { x: entity.x, y: entity.y };
          const isInsideAnyVision = visibilities.some((v) => isPointInPolygon(pt, v.polygon));
          if (!isInsideAnyVision) {
            targetVisibility = 0.0;
          }
        }
      }

      let fade = this.fadeMap.get(entity.id);
      if (!fade) {
        fade = { current: targetVisibility, target: targetVisibility };
        this.fadeMap.set(entity.id, fade);
      } else {
        fade.target = targetVisibility;
      }

      if (evaluatePlayerVisibility && fade.current <= 0.001 && targetVisibility === 0.0) {
        continue;
      }

      currentIds.add(entity.id);
      let entityContainer = this.containerMap.get(entity.id);

      if (!entityContainer) {
        entityContainer = new Container();
        entityContainer.label = entity.id;
        this.containerMap.set(entity.id, entityContainer);
        this.addChild(entityContainer);

        const ck = entity.chromaKey;
        const currentCkKey = ck && ck.enabled ? `ck_${ck.color}_${ck.tolerance}` : 'no_ck';
        const initialTex = entity.assetId ? getCachedTexture(entity.assetId, ck) : null;

        // Crear Sprite interior con textura cacheada si existe
        const sprite = new Sprite(initialTex || Texture.EMPTY);
        sprite.label = 'sprite';
        sprite.anchor.set(0.5);
        entityContainer.addChild(sprite);

        if (initialTex && entity.assetId) {
          (entityContainer as any)._loadedAssetId = entity.assetId;
          (entityContainer as any)._loadedCkKey = currentCkKey;
        }

        // Crear Graphics para anillo de bando y selección
        const ring = new Graphics();
        ring.label = 'ring';
        entityContainer.addChild(ring);

        // Crear etiqueta de texto para el nombre
        const nameText = new Text({
          text: entity.name,
          style: new TextStyle({
            fontFamily: 'system-ui, sans-serif',
            fontSize: 12,
            fill: '#ffffff',
            stroke: { color: '#000000', width: 3 },
            align: 'center'
          })
        });
        nameText.label = 'name';
        nameText.anchor.set(0.5, 0);
        entityContainer.addChild(nameText);
      }

      // Guardar metadatos para ticker de animaciones y filtros
      (entityContainer as any)._baseX = entity.x;
      (entityContainer as any)._baseY = entity.y;
      (entityContainer as any)._baseRotation = entity.rotation;
      (entityContainer as any)._animations = entity.animations;

      // Carga asíncrona de textura si aún no se ha cargado o si cambió el assetId o chromaKey
      const currentLoadedAssetId = (entityContainer as any)._loadedAssetId;
      const ck = entity.chromaKey;
      const currentCkKey = ck && ck.enabled ? `ck_${ck.color}_${ck.tolerance}` : 'no_ck';
      const prevCkKey = (entityContainer as any)._loadedCkKey;

      const sp = entityContainer.getChildByLabel('sprite') as Sprite;
      const isAlreadyLoading =
        (entityContainer as any)._isLoadingAssetId === entity.assetId &&
        (entityContainer as any)._isLoadingCkKey === currentCkKey;

      const needsReload =
        entity.assetId &&
        sp &&
        !isAlreadyLoading &&
        (sp.texture === Texture.EMPTY ||
          currentLoadedAssetId !== entity.assetId ||
          prevCkKey !== currentCkKey);

      if (needsReload) {
        (entityContainer as any)._isLoadingAssetId = entity.assetId;
        (entityContainer as any)._isLoadingCkKey = currentCkKey;

        // Comprobar si ya está en caché síncrona
        const fastTex = entity.assetId ? getCachedTexture(entity.assetId, ck) : null;
        if (fastTex) {
          sp.texture = fastTex;
          (entityContainer as any)._loadedAssetId = entity.assetId;
          (entityContainer as any)._loadedCkKey = currentCkKey;
          (entityContainer as any)._isLoadingAssetId = null;
          (entityContainer as any)._isLoadingCkKey = null;
          this.updateEntityVisuals(entityContainer, entity, selectedIds.includes(entity.id));
        } else {
          // Comprobar si es un GIF animado
          getGifDataForAsset(entity.assetId!, ck).then((gifData) => {
            if (gifData && entityContainer && !entityContainer.destroyed) {
              (entityContainer as any)._gifData = gifData;
            }
          });

          // Registrar vídeo si aplica
          videoManager.registerActiveEntityVideo(entity.id);

          getTextureForAsset(entity.assetId!, ck).then((tex) => {
            (entityContainer as any)._isLoadingAssetId = null;
            (entityContainer as any)._isLoadingCkKey = null;
            if (tex && entityContainer && !entityContainer.destroyed) {
              const innerSp = entityContainer.getChildByLabel('sprite') as Sprite;
              if (innerSp) {
                innerSp.texture = tex;
                this.updateEntityVisuals(entityContainer, entity, selectedIds.includes(entity.id));
              }
            }
          });
        }
      }

      // Actualizar transformaciones espaciales en el mundo
      entityContainer.x = entity.x;
      entityContainer.y = entity.y;
      entityContainer.rotation = entity.rotation;
      entityContainer.scale.set(entity.scaleX, entity.scaleY);
      entityContainer.zIndex = entity.zIndex ?? 10;

      // Opacidad configurable combinada con visibilidad para jugadores
      const entityOpacity = typeof entity.opacity === 'number' ? entity.opacity : 1.0;
      (entityContainer as any)._entityOpacity = entityOpacity;

      if (this.isMaster && !isPlayerPreview) {
        entityContainer.alpha = (entity.visibleToPlayers ? 1.0 : 0.45) * entityOpacity;
        entityContainer.visible = true;
      } else {
        const fade = this.fadeMap.get(entity.id);
        const f = fade ? fade.current : 1.0;
        entityContainer.alpha = entityOpacity * f;
        entityContainer.visible = f > 0.001;
      }

      this.updateEntityVisuals(entityContainer, entity, selectedIds.includes(entity.id), isPlayerPreview);
    }

    // Eliminar entidades que ya no existan o se hayan ocultado completamente
    for (const [id, container] of this.containerMap.entries()) {
      if (!currentIds.has(id)) {
        const fade = this.fadeMap.get(id);
        if (!this.isMaster && fade && fade.current > 0.001) {
          continue; // Mantener contenedor visible mientras se desvanece
        }
        videoManager.unregisterActiveEntityVideo(id);
        this.removeChild(container);
        container.destroy({ children: true });
        this.containerMap.delete(id);
        this.fadeMap.delete(id);
      }
    }
  }

  private updateEntityVisuals(container: Container, entity: Entity, isSelected: boolean, isPlayerPreview = false) {
    const sprite = container.getChildByLabel('sprite') as Sprite;
    const ring = container.getChildByLabel('ring') as Graphics;
    const nameText = container.getChildByLabel('name') as Text;

    if (nameText) {
      nameText.text = entity.name;
    }

    if (!sprite || !ring) return;

    const sx = Math.max(0.001, Math.abs(entity.scaleX || 1));
    const sy = Math.max(0.001, Math.abs(entity.scaleY || 1));
    const invSx = 1 / sx;
    const invSy = 1 / sy;
    const cameraZoom = this.cameraZoom > 0 ? this.cameraZoom : 1.0;
    const gridSize = this.gridSize > 0 ? this.gridSize : 70;

    ring.clear();
    const radius = Math.max(25, (sprite.width || 50) / 2);
    const worldRadius = radius * sx;

    // 1. Filtros visuales (Tono, saturación y brillo)
    if (entity.filters) {
      const { hue = 0, saturation = 1, brightness = 1 } = entity.filters;
      if (hue !== 0 || saturation !== 1 || brightness !== 1) {
        let cmf = (sprite as any)._cmf as ColorMatrixFilter;
        if (!cmf) {
          cmf = new ColorMatrixFilter();
          (sprite as any)._cmf = cmf;
        }
        cmf.reset();
        if (hue !== 0) cmf.hue(hue, false);
        if (saturation !== 1) cmf.saturate(saturation, false);
        if (brightness !== 1) cmf.brightness(brightness, false);
        sprite.filters = [cmf];
      } else {
        sprite.filters = null;
      }
    } else {
      sprite.filters = null;
    }

    // 2. Si es token, dibujar anillo según bando
    if (entity.type === 'token') {
      const sideColor = this.getSideColor(entity.side);
      const sideStroke = Math.max(1.5, (3 / cameraZoom) * invSx);
      const sideOffset = (2 / cameraZoom) * invSx;
      ring.circle(0, 0, radius + sideOffset);
      ring.stroke({ width: sideStroke, color: sideColor, alpha: 0.9 });
    }

    // 3. Gestión de estados para tokens (borde rojo sutil y badges apilados)
    let statusesContainer = container.getChildByLabel('statuses') as Container;
    if (!statusesContainer) {
      statusesContainer = new Container();
      statusesContainer.label = 'statuses';
      container.addChild(statusesContainer);
    }

    if (entity.type === 'token') {
      const isPlayerView = !this.isMaster || isPlayerPreview;
      const allStatuses = Array.isArray(entity.statuses) ? entity.statuses : [];
      const visibleStatuses = allStatuses.filter((s) => !isPlayerView || s.visibleToPlayers !== false);

      if (visibleStatuses.length > 0) {
        // Borde rojo sutil alrededor del token (~3px en pantalla, independiente de la escala del token)
        const redStroke = Math.max(1.5, (3 / cameraZoom) * invSx);
        const redOffset = (3.5 / cameraZoom) * invSx;
        ring.circle(0, 0, radius + redOffset);
        ring.stroke({ width: redStroke, color: 0xef4444, alpha: 0.9 });
      }

      statusesContainer.removeChildren();
      if (visibleStatuses.length > 0) {
        statusesContainer.visible = true;
        statusesContainer.rotation = -entity.rotation;
        statusesContainer.scale.x = (entity.scaleX < 0 ? -1 : 1) * invSx;
        statusesContainer.scale.y = (entity.scaleY < 0 ? -1 : 1) * invSy;

        // Situar el contenedor a la derecha del token en el espacio del mundo
        const gap = Math.max(6, 8 / cameraZoom);
        const worldDx = worldRadius + gap;
        const rot = entity.rotation;
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        statusesContainer.x = (worldDx * cosR) / entity.scaleX;
        statusesContainer.y = (-worldDx * sinR) / entity.scaleY;

        // Altura de texto: ~0.22 * gridSize (mínimo 12 px en pantalla)
        const targetTextHeight = Math.max(12 / cameraZoom, 0.22 * gridSize);
        const fontSize = Math.round(targetTextHeight);
        const pillH = Math.round(fontSize * 1.45);
        const pillPadX = Math.round(fontSize * 0.45);
        const badgeSpacing = pillH + Math.max(3, Math.round(fontSize * 0.2));
        const totalHeight = visibleStatuses.length * badgeSpacing - Math.max(3, Math.round(fontSize * 0.2));
        const startY = -totalHeight / 2;

        visibleStatuses.forEach((status, idx) => {
          const badgeItem = new Container();
          const turnsText = status.turnsRemaining !== null ? status.turnsRemaining : '∞';
          const labelStr = `${status.type} ${turnsText}`;

          const t = new Text({
            text: labelStr,
            style: new TextStyle({
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize,
              fontWeight: 'bold',
              fill: '#ffffff'
            })
          });

          const pillW = Math.round(t.width + pillPadX * 2);
          const bg = new Graphics();
          const cornerRadius = Math.max(3, Math.round(fontSize * 0.25));
          bg.roundRect(0, 0, pillW, pillH, cornerRadius);
          bg.fill({ color: 0x1c1917, alpha: 0.88 });
          bg.stroke({ width: Math.max(1, 1.5 / cameraZoom), color: 0xef4444, alpha: 0.85 });

          badgeItem.addChild(bg);
          t.x = pillPadX;
          t.y = Math.round((pillH - t.height) / 2);
          badgeItem.addChild(t);

          badgeItem.x = 0;
          badgeItem.y = startY + idx * badgeSpacing;

          if (this.isMaster && !isPlayerPreview && !status.visibleToPlayers) {
            badgeItem.alpha = 0.5;
          }

          statusesContainer.addChild(badgeItem);
        });
      } else {
        statusesContainer.visible = false;
      }
    } else {
      statusesContainer.removeChildren();
      statusesContainer.visible = false;
    }

    // Indicador visual de selección en máster
    if (this.isMaster && isSelected) {
      const selStroke = Math.max(1.5, (2.5 / cameraZoom) * invSx);
      const selOffset = (6 / cameraZoom) * invSx;
      ring.circle(0, 0, radius + selOffset);
      ring.stroke({ width: selStroke, color: 0x38bdf8, alpha: 0.95 });
    }

    // Indicador visual de candado (bloqueado) o de oculto en máster
    if (this.isMaster) {
      if (entity.locked) {
        const lockR = (5 / cameraZoom) * invSx;
        const lockOff = (5 / cameraZoom) * invSx;
        ring.circle(radius - lockOff, -radius + lockOff, lockR);
        ring.fill({ color: 0xff4444, alpha: 1.0 });
        ring.stroke({ width: Math.max(1, (1 / cameraZoom) * invSx), color: 0x000000 });
      }
      if (!entity.visibleToPlayers) {
        ring.circle(0, 0, radius + (1 / cameraZoom) * invSx);
        ring.stroke({ width: Math.max(1, (1.5 / cameraZoom) * invSx), color: 0x94a3b8, alpha: 0.7 });
      }
      if (entity.side === 'jugador' && entity.vision?.active) {
        const visR = (4 / cameraZoom) * invSx;
        const visOff = (5 / cameraZoom) * invSx;
        ring.circle(-radius + visOff, -radius + visOff, visR);
        ring.fill({ color: 0x38bdf8 });
        ring.stroke({ width: Math.max(1, (1 / cameraZoom) * invSx), color: 0x0284c7 });
      }
    }

    if (nameText) {
      nameText.text = entity.name;
      nameText.visible = entity.type === 'token';
      nameText.rotation = -entity.rotation;
      nameText.scale.x = (entity.scaleX < 0 ? -1 : 1) * invSx;
      nameText.scale.y = (entity.scaleY < 0 ? -1 : 1) * invSy;

      // Situar el nombre debajo del token en el espacio del mundo
      const nameGap = Math.max(5, 6 / cameraZoom);
      const worldDy = worldRadius + nameGap;
      const rot = entity.rotation;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      nameText.x = (worldDy * sinR) / entity.scaleX;
      nameText.y = (worldDy * cosR) / entity.scaleY;

      const nameFontSize = Math.max(11 / cameraZoom, 0.18 * gridSize);
      nameText.style.fontSize = Math.round(nameFontSize);
      nameText.style.stroke = { color: '#000000', width: Math.max(2, 3 / cameraZoom) };
    }
  }

  /**
   * Bucle de animación ejecutado en el Pixi ticker para rotación, temblor, vaivén y GIF sincronizado.
   */
  public animate(deltaSeconds: number, gridSize: number) {
    this.animTime += deltaSeconds;
    const now = Date.now();
    const effectiveGrid = gridSize > 0 ? gridSize : 70;

    for (const [, container] of this.containerMap.entries()) {
      // 1. Frame sincronizado de GIF
      const gifData = (container as any)._gifData as AnimatedGifData | undefined;
      const sprite = container.getChildByLabel('sprite') as Sprite;
      if (gifData && sprite && gifData.textures.length > 0) {
        sprite.texture = getFrameTextureForTime(gifData, now);
      }

      // 2. Animaciones físicas
      const anim = (container as any)._animations as EntityAnimations | undefined;
      const baseX = Number.isFinite((container as any)._baseX) ? (container as any)._baseX : container.x;
      const baseY = Number.isFinite((container as any)._baseY) ? (container as any)._baseY : container.y;
      const baseRot = Number.isFinite((container as any)._baseRotation) ? (container as any)._baseRotation : 0;

      let offsetX = 0;
      let offsetY = 0;
      let extraRot = 0;

      if (anim) {
        // Rotación continua
        if (anim.rotation?.enabled) {
          const dirMultiplier = anim.rotation.direction === 'ccw' ? -1 : 1;
          const vps = anim.rotation.speed ?? 0.2;
          const rotSpeed = vps * (Math.PI * 2) * dirMultiplier;
          extraRot = this.animTime * rotSpeed;
        }

        // Temblor / Shake
        if (anim.shake?.enabled) {
          const intensity = anim.shake.intensity ?? 4;
          const freq = (anim.shake.speed ?? 5) * 8;
          offsetX += Math.sin(this.animTime * freq) * intensity;
          offsetY += Math.cos(this.animTime * freq * 1.3) * intensity;
        }

        // Vaivén / Sway (distancia en casillas en coordenadas del MUNDO)
        if (anim.sway?.enabled) {
          const distSquares = typeof anim.sway.distanceInSquares === 'number' && Number.isFinite(anim.sway.distanceInSquares)
            ? anim.sway.distanceInSquares
            : 1;
          const distPx = distSquares * effectiveGrid;

          // Dirección: soportar número (grados) o string 'horizontal' / 'vertical'
          let dirDeg = 0;
          if (typeof anim.sway.direction === 'number' && Number.isFinite(anim.sway.direction)) {
            dirDeg = anim.sway.direction;
          } else if (typeof (anim.sway as any).direction === 'string') {
            dirDeg = (anim.sway as any).direction.toLowerCase() === 'vertical' ? 90 : 0;
          }
          const dirRad = (dirDeg * Math.PI) / 180;

          const swaySpeed = typeof anim.sway.speed === 'number' && Number.isFinite(anim.sway.speed)
            ? anim.sway.speed
            : 2;
          const swayOffset = Math.sin(this.animTime * swaySpeed) * distPx;

          if (Number.isFinite(swayOffset)) {
            offsetX += Math.cos(dirRad) * swayOffset;
            offsetY += Math.sin(dirRad) * swayOffset;
          }
        }
      }

      container.x = baseX + offsetX;
      container.y = baseY + offsetY;
      container.rotation = baseRot + extraRot;
    }
  }

  private getSideColor(side?: TokenSide): number {
    switch (side) {
      case 'enemigo':
        return 0xef4444;
      case 'neutral':
        return 0xeab308;
      case 'jugador':
      default:
        return 0x10b981;
    }
  }

  public getEntityBounds(entityId: string): { width: number; height: number; radius: number } | null {
    const container = this.containerMap.get(entityId);
    if (!container) return null;
    const sprite = container.getChildByLabel('sprite') as Sprite;
    if (!sprite) return null;

    const w = sprite.width || 70;
    const h = sprite.height || 70;
    return {
      width: w,
      height: h,
      radius: Math.max(w, h) / 2
    };
  }

  public reloadAsset(assetId?: string) {
    for (const container of this.containerMap.values()) {
      const c = container as any;
      if (!assetId || c._loadedAssetId === assetId) {
        c._loadedAssetId = null;
        c._loadedCkKey = null;
        c._gifData = null;
        const sp = container.getChildByLabel('sprite') as Sprite;
        if (sp) {
          sp.texture = Texture.EMPTY;
        }
      }
    }
  }
}
