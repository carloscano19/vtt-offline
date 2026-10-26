import { Texture } from 'pixi.js';
import { getAsset } from '../../db/dexie';
import { applyChromaKeyToImageData } from '../filters/chromaKey';

interface VideoInstance {
  video: HTMLVideoElement;
  texture: Texture;
  assetId: string;
  blobUrl: string;
  canvas?: HTMLCanvasElement;
  ctx?: CanvasRenderingContext2D | null;
}

class VideoManager {
  private instances = new Map<string, VideoInstance>();
  private activeEntityVideos = new Set<string>(); // IDs de entidades que están usando vídeo
  private warningListeners = new Set<(showWarning: boolean, count: number) => void>();

  public onWarningChange(listener: (showWarning: boolean, count: number) => void): () => void {
    this.warningListeners.add(listener);
    return () => this.warningListeners.delete(listener);
  }

  private notifyWarning() {
    const count = this.activeEntityVideos.size;
    const show = count > 6;
    for (const listener of this.warningListeners) {
      listener(show, count);
    }
  }

  public registerActiveEntityVideo(entityId: string) {
    if (!this.activeEntityVideos.has(entityId)) {
      this.activeEntityVideos.add(entityId);
      this.notifyWarning();
    }
  }

  public unregisterActiveEntityVideo(entityId: string) {
    if (this.activeEntityVideos.has(entityId)) {
      this.activeEntityVideos.delete(entityId);
      this.notifyWarning();
    }
  }

  public getActiveVideoCount(): number {
    return this.activeEntityVideos.size;
  }

  /**
   * Obtiene o inicializa un elemento de vídeo HTML5 y su textura Pixi en bucle.
   */
  public async getVideoTexture(assetId: string): Promise<{ texture: Texture; video: HTMLVideoElement } | null> {
    if (this.instances.has(assetId)) {
      const inst = this.instances.get(assetId)!;
      if (inst.video.paused) {
        inst.video.play().catch(() => {});
      }
      return { texture: inst.texture, video: inst.video };
    }

    const asset = await getAsset(assetId);
    if (!asset || !asset.blob) return null;

    const blobUrl = URL.createObjectURL(asset.blob);
    const video = document.createElement('video');
    video.src = blobUrl;
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    await new Promise<void>((resolve) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => resolve();
      // Timeout defensivo
      setTimeout(resolve, 2000);
    });

    try {
      await video.play();
    } catch {
      // Ignorar si el navegador bloquea autoplay hasta interacción
    }

    const texture = Texture.from(video);
    const inst: VideoInstance = {
      video,
      texture,
      assetId,
      blobUrl
    };

    this.instances.set(assetId, inst);
    return { texture, video };
  }
}

export const videoManager = new VideoManager();
