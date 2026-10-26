import { MusicState, MusicTrack } from '../../types/game';
import { getAsset } from '../../db/dexie';
import { useGameStore } from '../../stores/useGameStore';

class AudioManager {
  private audioElement: HTMLAudioElement | null = null;
  private currentTrackId: string | null = null;
  private currentObjectUrl: string | null = null;
  private isInitialized = false;

  public init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';

    this.audioElement.onended = () => {
      this.handleTrackEnded();
    };

    this.isInitialized = true;
  }

  private handleTrackEnded() {
    const music = useGameStore.getState().game.music;
    if (music.loopTrack) {
      if (this.audioElement) {
        this.audioElement.currentTime = 0;
        this.audioElement.play().catch(() => {});
      }
      return;
    }

    // Pasar a la siguiente pista
    const playlist = music.playlist;
    if (playlist.length === 0) return;

    const currentIndex = playlist.findIndex((t) => t.id === music.currentTrackId);
    const nextIndex = (currentIndex + 1) % playlist.length;
    const nextTrack = playlist[nextIndex];

    if (nextTrack) {
      useGameStore.getState().setMusicState({ currentTrackId: nextTrack.id, isPlaying: true });
    }
  }

  public async sync(music: MusicState) {
    if (!this.audioElement) {
      this.init();
    }
    if (!this.audioElement) return;

    // Volumen
    const targetVolume = Math.max(0, Math.min(1, music.volume ?? 0.8));
    if (this.audioElement.volume !== targetVolume) {
      this.audioElement.volume = targetVolume;
    }

    // Bucle
    this.audioElement.loop = !!music.loopTrack;

    // Cambio de pista
    if (music.currentTrackId !== this.currentTrackId) {
      this.currentTrackId = music.currentTrackId;

      if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = null;
      }

      if (!music.currentTrackId) {
        this.audioElement.pause();
        this.audioElement.src = '';
        return;
      }

      const track = music.playlist.find((t) => t.id === music.currentTrackId);
      if (!track || !track.assetId) {
        this.audioElement.pause();
        this.audioElement.src = '';
        return;
      }

      const asset = await getAsset(track.assetId);
      if (!asset || !asset.blob) {
        console.warn(`[audioManager] No se encontró el asset de audio ID="${track.assetId}"`);
        return;
      }

      this.currentObjectUrl = URL.createObjectURL(asset.blob);
      this.audioElement.src = this.currentObjectUrl;

      if (music.isPlaying) {
        this.audioElement.play().catch((err) => {
          console.warn('[audioManager] Autoplay bloqueado por el navegador hasta interacción:', err);
        });
      }
      return;
    }

    // Play / Pausa sobre la misma pista
    if (music.isPlaying && this.audioElement.paused && this.audioElement.src) {
      this.audioElement.play().catch(() => {});
    } else if (!music.isPlaying && !this.audioElement.paused) {
      this.audioElement.pause();
    }
  }

  public destroy() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    this.isInitialized = false;
  }
}

export const audioManager = new AudioManager();
