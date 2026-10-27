import { Container, Sprite, Texture, ColorMatrixFilter } from 'pixi.js';
import { Entity, EntityAnimations } from '../../types/entity';
import { getTextureForAsset, getGifDataForAsset } from '../utils/textureCache';
import { getFrameTextureForTime, AnimatedGifData } from '../../modules/media/gifDecoder';
import { videoManager } from '../../modules/media/videoManager';

export class MapsLayer extends Container {
  private isMaster: boolean;
  private spriteMap: Map<string, Sprite> = new Map();
  private animTime = 0;

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
  }

  public async syncEntities(entities: Entity[]) {
    const mapEntities = entities.filter((e) => e.type === 'map');
    const currentIds = new Set<string>();

    for (const entity of mapEntities) {
      if (!this.isMaster && !entity.visibleToPlayers) {
        continue;
      }

      currentIds.add(entity.id);
      let sprite = this.spriteMap.get(entity.id);

      if (!sprite) {
        sprite = new Sprite(Texture.EMPTY);
        sprite.label = entity.id;
        this.spriteMap.set(entity.id, sprite);
        this.addChild(sprite);
      }

      // Guardar metadatos para animaciones y filtros
      (sprite as any)._baseX = entity.x;
      (sprite as any)._baseY = entity.y;
      (sprite as any)._baseRotation = entity.rotation;
      (sprite as any)._animations = entity.animations;

      // Carga asíncrona de textura si aún no se ha cargado o si cambió el assetId o chromaKey
      const currentLoadedAssetId = (sprite as any)._loadedAssetId;
      const ck = entity.chromaKey;
      const currentCkKey = ck && ck.enabled ? `ck_${ck.color}_${ck.tolerance}` : 'no_ck';
      const prevCkKey = (sprite as any)._loadedCkKey;

      const needsReload =
        entity.assetId &&
        (sprite.texture === Texture.EMPTY ||
          currentLoadedAssetId !== entity.assetId ||
          prevCkKey !== currentCkKey);

      if (needsReload) {
        (sprite as any)._loadedAssetId = entity.assetId;
        (sprite as any)._loadedCkKey = currentCkKey;

        getGifDataForAsset(entity.assetId!, ck).then((gifData) => {
          if (gifData && sprite && !sprite.destroyed) {
            (sprite as any)._gifData = gifData;
          }
        });

        videoManager.registerActiveEntityVideo(entity.id);

        getTextureForAsset(entity.assetId!, ck).then((tex) => {
          if (tex && sprite && !sprite.destroyed) {
            sprite.texture = tex;
          }
        });
      }

      // Filtros visuales (tono, saturación, brillo)
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

      // Actualizar transformaciones espaciales en el mundo
      sprite.x = entity.x;
      sprite.y = entity.y;
      sprite.rotation = entity.rotation;
      sprite.scale.set(entity.scaleX, entity.scaleY);
      sprite.zIndex = entity.zIndex ?? 0;

      // Opacidad configurable combinada con visibilidad para jugadores en la vista del máster
      const entityOpacity = typeof entity.opacity === 'number' ? entity.opacity : 1.0;
      if (this.isMaster) {
        sprite.alpha = (entity.visibleToPlayers ? 1.0 : 0.45) * entityOpacity;
      } else {
        sprite.alpha = entityOpacity;
      }
    }

    // Eliminar sprites que ya no existan o se hayan ocultado
    for (const [id, sprite] of this.spriteMap.entries()) {
      if (!currentIds.has(id)) {
        videoManager.unregisterActiveEntityVideo(id);
        this.removeChild(sprite);
        sprite.destroy();
        this.spriteMap.delete(id);
      }
    }
  }

  public animate(deltaSeconds: number, gridSize: number) {
    this.animTime += deltaSeconds;
    const now = Date.now();
    const effectiveGrid = gridSize > 0 ? gridSize : 70;

    for (const [, sprite] of this.spriteMap.entries()) {
      // 1. Frame sincronizado de GIF
      const gifData = (sprite as any)._gifData as AnimatedGifData | undefined;
      if (gifData && gifData.textures.length > 0) {
        sprite.texture = getFrameTextureForTime(gifData, now);
      }

      // 2. Animaciones físicas
      const anim = (sprite as any)._animations as EntityAnimations | undefined;
      const baseX = Number.isFinite((sprite as any)._baseX) ? (sprite as any)._baseX : sprite.x;
      const baseY = Number.isFinite((sprite as any)._baseY) ? (sprite as any)._baseY : sprite.y;
      const baseRot = Number.isFinite((sprite as any)._baseRotation) ? (sprite as any)._baseRotation : 0;

      let offsetX = 0;
      let offsetY = 0;
      let extraRot = 0;

      if (anim) {
        if (anim.rotation?.enabled) {
          const dirMultiplier = anim.rotation.direction === 'ccw' ? -1 : 1;
          const vps = anim.rotation.speed ?? 0.2;
          const rotSpeed = vps * (Math.PI * 2) * dirMultiplier;
          extraRot = this.animTime * rotSpeed;
        }

        if (anim.shake?.enabled) {
          const intensity = anim.shake.intensity ?? 4;
          const freq = (anim.shake.speed ?? 5) * 8;
          offsetX += Math.sin(this.animTime * freq) * intensity;
          offsetY += Math.cos(this.animTime * freq * 1.3) * intensity;
        }

        if (anim.sway?.enabled) {
          const distSquares = typeof anim.sway.distanceInSquares === 'number' && Number.isFinite(anim.sway.distanceInSquares)
            ? anim.sway.distanceInSquares
            : 1;
          const distPx = distSquares * effectiveGrid;

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

      sprite.x = baseX + offsetX;
      sprite.y = baseY + offsetY;
      sprite.rotation = baseRot + extraRot;
    }
  }

  public getMapSprite(id: string): Sprite | undefined {
    return this.spriteMap.get(id);
  }
}
