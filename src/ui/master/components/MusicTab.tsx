import React, { useRef, useState } from 'react';
import { useGameStore } from '../../../stores/useGameStore';
import { AssetItem, MusicTrack } from '../../../types/game';
import { saveAsset } from '../../../db/dexie';
import {
  Play,
  Pause,
  SkipForward,
  Repeat,
  Volume2,
  VolumeX,
  Upload,
  Trash2,
  Music,
  Edit2,
  Check
} from 'lucide-react';

export const MusicTab: React.FC = () => {
  const music = useGameStore((s) => s.game.music);
  const setMusicState = useGameStore((s) => s.setMusicState);
  const addMusicTrack = useGameStore((s) => s.addMusicTrack);
  const removeMusicTrack = useGameStore((s) => s.removeMusicTrack);
  const updateMusicTrack = useGameStore((s) => s.updateMusicTrack);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lowerName = file.name.toLowerCase();
      if (
        !lowerName.endsWith('.mp3') &&
        !lowerName.endsWith('.ogg') &&
        !lowerName.endsWith('.wav') &&
        !file.type.includes('audio')
      ) {
        continue;
      }

      const assetId = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const cleanName = file.name.replace(/\.[^/.]+$/, '');

      const asset: AssetItem = {
        id: assetId,
        name: cleanName,
        type: 'audio',
        mimeType: file.type || 'audio/mpeg',
        blob: file,
        createdAt: Date.now()
      };

      await saveAsset(asset);

      const track: MusicTrack = {
        id: `track_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: cleanName,
        assetId
      };

      addMusicTrack(track);

      // Si no hay ninguna pista sonando, poner esta como actual
      if (!music.currentTrackId) {
        setMusicState({ currentTrackId: track.id });
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePlayPause = () => {
    if (!music.currentTrackId && music.playlist.length > 0) {
      setMusicState({ currentTrackId: music.playlist[0].id, isPlaying: true });
    } else {
      setMusicState({ isPlaying: !music.isPlaying });
    }
  };

  const handleNext = () => {
    if (music.playlist.length === 0) return;
    const currentIndex = music.playlist.findIndex((t) => t.id === music.currentTrackId);
    const nextIndex = (currentIndex + 1) % music.playlist.length;
    setMusicState({ currentTrackId: music.playlist[nextIndex].id, isPlaying: true });
  };

  const handleSelectTrack = (trackId: string) => {
    if (music.currentTrackId === trackId) {
      setMusicState({ isPlaying: !music.isPlaying });
    } else {
      setMusicState({ currentTrackId: trackId, isPlaying: true });
    }
  };

  const startRename = (track: MusicTrack) => {
    setEditingTrackId(track.id);
    setEditingName(track.name);
  };

  const saveRename = (trackId: string) => {
    if (editingName.trim()) {
      updateMusicTrack(trackId, { name: editingName.trim() });
    }
    setEditingTrackId(null);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200">
      {/* Controles de reproducción principales */}
      <div className="p-4 bg-slate-850 border-b border-slate-700/80 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reproductor</span>
          <span className="text-xs text-sky-400 font-medium">Solo en Máster / HDMI</span>
        </div>

        {/* Botones de reproducción */}
        <div className="flex items-center justify-center gap-3 py-1">
          <button
            onClick={handlePlayPause}
            className={`p-3 rounded-full shadow-lg transition-all ${
              music.isPlaying ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-sky-500 hover:bg-sky-400 text-white'
            }`}
            title={music.isPlaying ? 'Pausar música' : 'Reproducir música'}
          >
            {music.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>

          <button
            onClick={handleNext}
            className="p-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Siguiente pista"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            onClick={() => setMusicState({ loopTrack: !music.loopTrack })}
            className={`p-2.5 rounded-full border transition-colors ${
              music.loopTrack
                ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
            }`}
            title="Repetir pista en bucle"
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Control de volumen */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => setMusicState({ volume: music.volume > 0 ? 0 : 0.8 })}
            className="text-slate-400 hover:text-slate-200 p-1"
          >
            {music.volume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-red-400" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={music.volume ?? 0.8}
            onChange={(e) => setMusicState({ volume: parseFloat(e.target.value) })}
            className="w-full accent-sky-500 bg-slate-700 h-1.5 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-[11px] font-mono text-slate-400 w-8 text-right">
            {Math.round((music.volume ?? 0.8) * 100)}%
          </span>
        </div>
      </div>

      {/* Cabecera de la lista de pistas e importar */}
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Music className="w-3.5 h-3.5 text-sky-400" />
          <span>Pistas ({music.playlist.length})</span>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors"
          title="Importar archivos de música (.mp3, .ogg, .wav)"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Importar audio</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mp3,audio/ogg,audio/wav,audio/*,.mp3,.ogg,.wav"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Lista de pistas */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {music.playlist.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-slate-500 space-y-2">
            <Music className="w-8 h-8 opacity-40" />
            <p className="text-xs">No hay pistas de música importadas.</p>
            <p className="text-[11px] text-slate-600">
              Pulsa "Importar audio" para añadir canciones de ambiente o combate (.mp3, .ogg, .wav).
            </p>
          </div>
        ) : (
          music.playlist.map((track, idx) => {
            const isCurrent = music.currentTrackId === track.id;
            const isEditing = editingTrackId === track.id;

            return (
              <div
                key={track.id}
                className={`group flex items-center justify-between p-2 rounded text-xs transition-colors ${
                  isCurrent ? 'bg-sky-950/60 border border-sky-600/50 text-white' : 'hover:bg-slate-800/80 text-slate-300'
                }`}
              >
                {/* Botón de reproducción y nombre */}
                <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                  <button
                    onClick={() => handleSelectTrack(track.id)}
                    className={`p-1.5 rounded transition-colors ${
                      isCurrent && music.isPlaying
                        ? 'text-amber-400 bg-amber-950/50'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title={isCurrent && music.isPlaying ? 'Pausar' : 'Reproducir esta pista'}
                  >
                    {isCurrent && music.isPlaying ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {isEditing ? (
                    <div className="flex items-center gap-1 flex-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveRename(track.id)}
                        autoFocus
                        className="w-full bg-slate-800 border border-sky-500 rounded px-1.5 py-0.5 text-xs text-white outline-none"
                      />
                      <button
                        onClick={() => saveRename(track.id)}
                        className="p-1 text-emerald-400 hover:text-emerald-300"
                        title="Guardar nombre"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => handleSelectTrack(track.id)}
                      className="truncate cursor-pointer select-none font-medium"
                      title={track.name}
                    >
                      {idx + 1}. {track.name}
                    </span>
                  )}
                </div>

                {/* Acciones de pista */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!isEditing && (
                    <button
                      onClick={() => startRename(track)}
                      className="p-1 text-slate-400 hover:text-slate-200 rounded"
                      title="Renombrar pista"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => removeMusicTrack(track.id)}
                    className="p-1 text-slate-400 hover:text-red-400 rounded"
                    title="Eliminar pista"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
