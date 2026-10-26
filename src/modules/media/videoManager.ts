import { Texture } from 'pixi.js';
import { getAsset } from '../../db/dexie';
import { applyChromaKeyToImageData } from '../filters/chromaKey';
import { EntityChromaKey } from '../../types/entity';

interface VideoInstance {
  video: HTMLVideoElement;
  texture: Texture;
  assetId: string;
  blobUrl: string;
  canvas?: HTMLCanvasElement;
  ctx?: CanvasRenderingContext2D | null;
  chromaKey?: EntityChromaKey;
  targetScale: number; // 1.0 down to 0.25 si el frame excede 8ms
  rvfcHandle?: number;
  isProcessing: boolean;
  destroyed: boolean;
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

  private getInstanceKey(assetId: string, chromaKey?: EntityChromaKey): string {
    if (chromaKey && chromaKey.enabled) {
      return `${assetId}_ck_${chromaKey.color}_${chromaKey.tolerance}`;
    }
    return assetId;
  }

  /**
   * Obtiene o inicializa un elemento de vídeo HTML5 y su textura Pixi en bucle.
   * Si chromaKey está habilitado:
   *  - Dibuja cada frame a un canvas reducido (máximo 1024 px de lado).
   *  - Aplica applyChromaKeyToImageData con suavizado de bordes.
   *  - Actualiza la textura Pixi desde el canvas.
   *  - Usa requestVideoFrameCallback si está disponible (o fallback a requestAnimationFrame).
   *  - Si el coste por frame supera los 8 ms, reduce targetScale automáticamente.
   */
  public async getVideoTexture(
    assetId: string,
    chromaKey?: EntityChromaKey
  ): Promise<{ texture: Texture; video: HTMLVideoElement } | null> {
    const key = this.getInstanceKey(assetId, chromaKey);
    if (this.instances.has(key)) {
      const inst = this.instances.get(key)!;
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

    // Caso 1: Vídeo normal sin Chroma Key
    if (!chromaKey || !chromaKey.enabled) {
      const texture = Texture.from(video);
      const inst: VideoInstance = {
        video,
        texture,
        assetId,
        blobUrl,
        targetScale: 1.0,
        isProcessing: false,
        destroyed: false
      };
      this.instances.set(key, inst);
      return { texture, video };
    }

    // Caso 2: Vídeo con Chroma Key mediante Canvas
    const vidW = video.videoWidth || 640;
    const vidH = video.videoHeight || 360;
    const maxSide = Math.max(vidW, vidH);
    const initialScale = maxSide > 1024 ? 1024 / maxSide : 1.0;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vidW * initialScale));
    canvas.height = Math.max(1, Math.round(vidH * initialScale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const texture = Texture.from(canvas);

    const inst: VideoInstance = {
      video,
      texture,
      assetId,
      blobUrl,
      canvas,
      ctx,
      chromaKey,
      targetScale: initialScale,
      isProcessing: false,
      destroyed: false
    };

    this.instances.set(key, inst);

    // Bucle de procesamiento de frames con requestVideoFrameCallback o rAF
    const processFrame = () => {
      if (inst.destroyed) return;

      if (!video.paused && !video.ended && video.readyState >= 2) {
        const start = performance.now();
        const curW = inst.canvas!.width;
        const curH = inst.canvas!.height;

        // Dibujar frame actual
        inst.ctx!.drawImage(video, 0, 0, curW, curH);
        const imgData = inst.ctx!.getImageData(0, 0, curW, curH);

        // Procesar chroma key con suavizado de bordes
        applyChromaKeyToImageData(imgData, inst.chromaKey!.color, inst.chromaKey!.tolerance);
        inst.ctx!.putImageData(imgData, 0, 0);

        // Actualizar textura en Pixi
        inst.texture.source.update();

        const duration = performance.now() - start;

        // Si tarda más de 8ms, reducir resolución automáticamente para mantener 60 fps
        if (duration > 8 && inst.targetScale > 0.25) {
          inst.targetScale = Math.max(0.25, inst.targetScale * 0.85);
          const newW = Math.max(1, Math.round(vidW * inst.targetScale));
          const newH = Math.max(1, Math.round(vidH * inst.targetScale));
          inst.canvas!.width = newW;
          inst.canvas!.height = newH;
        }
      }

      if ('requestVideoFrameCallback' in video) {
        (video as any).requestVideoFrameCallback(processFrame);
      } else {
        requestAnimationFrame(processFrame);
      }
    };

    if ('requestVideoFrameCallback' in video) {
      (video as any).requestVideoFrameCallback(processFrame);
    } else {
      requestAnimationFrame(processFrame);
    }

    return { texture, video };
  }
}

export const videoManager = new VideoManager();
