import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../../stores/useGameStore';
import { useUIStore } from '../../../stores/useUIStore';
import { Entity, EffectPresetId } from '../../../types/entity';
import { AssetItem } from '../../../types/game';
import { getAllAssets, saveAsset } from '../../../db/dexie';
import { cloudSync } from '../../../modules/sync/cloudSync';
import {
  Sparkles,
  Flame,
  Search,
  Plus,
  Cloud,
  Zap,
  Snowflake,
  Compass,
  Lightbulb,
  Upload,
  Eye,
  EyeOff,
  Trash2,
  X,
  Film,
  Image as ImageIcon,
  Check,
  Package
} from 'lucide-react';
import { ZipPackModal } from './ZipPackModal';

interface EffectCatalogItem {
  id: EffectPresetId;
  name: string;
  category: 'lights' | 'fire' | 'smoke' | 'arcane';
  description: string;
  defaultColor: string;
  defaultScale: number;
  emitsLight: boolean;
  baseLightRadius: number;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

const CATALOG_ITEMS: EffectCatalogItem[] = [
  // 1. Fuentes de luz
  {
    id: 'torch',
    name: 'Antorcha de pared',
    category: 'lights',
    description: 'Soporte con antorcha encendida y chispas parpadeantes.',
    defaultColor: '#ff9922',
    defaultScale: 0.75,
    emitsLight: true,
    baseLightRadius: 4,
    icon: Flame
  },
  {
    id: 'campfire',
    name: 'Hoguera',
    category: 'lights',
    description: 'Piedras y troncos con llamas vivas y brasas ascendentes.',
    defaultColor: '#ff7700',
    defaultScale: 1.0,
    emitsLight: true,
    baseLightRadius: 5,
    icon: Flame
  },
  {
    id: 'brazier',
    name: 'Brasero de hierro',
    category: 'lights',
    description: 'Cuenco metálico ornamental con brasas incandescentes.',
    defaultColor: '#ff8811',
    defaultScale: 1.0,
    emitsLight: true,
    baseLightRadius: 4,
    icon: Flame
  },
  {
    id: 'lantern',
    name: 'Farol',
    category: 'lights',
    description: 'Farol de mano metálico con cristal y luz cálida constante.',
    defaultColor: '#ffcc44',
    defaultScale: 0.75,
    emitsLight: true,
    baseLightRadius: 4,
    icon: Lightbulb
  },
  {
    id: 'candle',
    name: 'Vela',
    category: 'lights',
    description: 'Cilindro de cera con llama suave y tenue.',
    defaultColor: '#ffe066',
    defaultScale: 0.5,
    emitsLight: true,
    baseLightRadius: 2,
    icon: Flame
  },

  // 2. Fuego
  {
    id: 'fire_small',
    name: 'Llamas pequeñas',
    category: 'fire',
    description: 'Llamas ágiles y chispas bajas en el suelo.',
    defaultColor: '#ff5500',
    defaultScale: 1.0,
    emitsLight: true,
    baseLightRadius: 3,
    icon: Flame
  },
  {
    id: 'fire_large',
    name: 'Incendio grande',
    category: 'fire',
    description: 'Fuego turbulento expansivo con masa de brasas ardientes.',
    defaultColor: '#ff3300',
    defaultScale: 2.0,
    emitsLight: true,
    baseLightRadius: 6,
    icon: Flame
  },
  {
    id: 'fire_magic',
    name: 'Fuego mágico',
    category: 'fire',
    description: 'Llama etérea mística con tinte personalizable.',
    defaultColor: '#a855f7',
    defaultScale: 1.0,
    emitsLight: true,
    baseLightRadius: 4,
    icon: Sparkles
  },

  // 3. Humo y niebla
  {
    id: 'smoke_light',
    name: 'Humo ligero',
    category: 'smoke',
    description: 'Volutas suaves semitransparentes en ascenso lento.',
    defaultColor: '#94a3b8',
    defaultScale: 1.0,
    emitsLight: false,
    baseLightRadius: 0,
    icon: Cloud
  },
  {
    id: 'smoke_dense',
    name: 'Humareda densa',
    category: 'smoke',
    description: 'Hollín oscuro espeso y ondulante que bloquea la visión.',
    defaultColor: '#334155',
    defaultScale: 1.5,
    emitsLight: false,
    baseLightRadius: 0,
    icon: Cloud
  },
  {
    id: 'fog_low',
    name: 'Niebla baja',
    category: 'smoke',
    description: 'Bruma horizontal a ras de suelo flotando suavemente.',
    defaultColor: '#cbd5e1',
    defaultScale: 2.0,
    emitsLight: false,
    baseLightRadius: 0,
    icon: Cloud
  },

  // 4. Arcanos y Elementales
  {
    id: 'magic_seal',
    name: 'Sello mágico rúnico',
    category: 'arcane',
    description: 'Círculo rúnico con anillos concéntricos y pulsación de maná.',
    defaultColor: '#38bdf8',
    defaultScale: 2.0,
    emitsLight: true,
    baseLightRadius: 3,
    icon: Compass
  },
  {
    id: 'portal',
    name: 'Portal dimensional',
    category: 'arcane',
    description: 'Vórtice espiral acelerado con partículas atraídas al núcleo.',
    defaultColor: '#818cf8',
    defaultScale: 1.5,
    emitsLight: true,
    baseLightRadius: 4,
    icon: Sparkles
  },
  {
    id: 'lightning',
    name: 'Rayos eléctricos',
    category: 'arcane',
    description: 'Arcos eléctricos fractales intermitentes con destellos y chispas.',
    defaultColor: '#67e8f9',
    defaultScale: 1.0,
    emitsLight: true,
    baseLightRadius: 4,
    icon: Zap
  },
  {
    id: 'ice_zone',
    name: 'Zona de hielo',
    category: 'arcane',
    description: 'Escarcha cristalina fría con brillos y vaho gélido.',
    defaultColor: '#38bdf8',
    defaultScale: 1.5,
    emitsLight: false,
    baseLightRadius: 0,
    icon: Snowflake
  }
];

export const EffectsTab: React.FC = () => {
  const game = useGameStore((s) => s.game);
  const addEntity = useGameStore((s) => s.addEntity);
  const selectEntity = useUIStore((s) => s.selectEntity);
  const setActiveSidebarTab = useUIStore((s) => s.setActiveSidebarTab);
  const setShowCreditsModal = useUIStore((s) => s.setShowCreditsModal);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Efectos personalizados del usuario cargados de Dexie
  const [customAssets, setCustomAssets] = useState<AssetItem[]>([]);
  const [assetUrls, setAssetUrls] = useState<Map<string, string>>(new Map());

  // Gestión de efectos procedurales ocultos en local
  const [hiddenPresets, setHiddenPresets] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('vtt_hidden_effects');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showHidden, setShowHidden] = useState(false);

  // Modal para añadir efecto propio individual
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalCategory, setModalCategory] = useState<'lights' | 'fire' | 'smoke' | 'arcane'>('fire');
  const [modalEmitsLight, setModalEmitsLight] = useState(true);
  const [modalLightColor, setModalLightColor] = useState('#ff7700');
  const [modalLightRadius, setModalLightRadius] = useState(4);
  const [modalFlicker, setModalFlicker] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal para importar pack (ZIP)
  const [isZipModalOpen, setIsZipModalOpen] = useState(false);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleZipSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setZipFile(file);
    setIsZipModalOpen(true);
    if (zipInputRef.current) {
      zipInputRef.current.value = '';
    }
  };

  const loadCustomAssets = async () => {
    const all = await getAllAssets();
    const effects = all.filter(
      (a) => a.tags?.includes('effect') || a.tags?.some((t) => t.startsWith('category:'))
    );
    setCustomAssets(effects);

    // Generar object URLs para las miniaturas
    const urls = new Map<string, string>();
    effects.forEach((a) => {
      if (a.blob) {
        urls.set(a.id, URL.createObjectURL(a.blob));
      }
    });
    setAssetUrls(urls);
  };

  useEffect(() => {
    loadCustomAssets();
    const unbind = cloudSync.onStatusChange(() => {
      loadCustomAssets();
    });
    return () => {
      unbind();
      assetUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleToggleHidePreset = (presetId: string) => {
    setHiddenPresets((prev) => {
      const updated = prev.includes(presetId) ? prev.filter((id) => id !== presetId) : [...prev, presetId];
      try {
        localStorage.setItem('vtt_hidden_effects', JSON.stringify(updated));
      } catch (err) {
        console.error('Error guardando efectos ocultos:', err);
      }
      return updated;
    });
  };

  const handleResetHidden = () => {
    setHiddenPresets([]);
    try {
      localStorage.removeItem('vtt_hidden_effects');
    } catch {}
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setModalFile(file);
    // Extraer nombre por defecto sin extensión
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    setModalName(cleanName);

    // Deducir categoría inicial sugerida
    const lower = cleanName.toLowerCase();
    if (lower.includes('luz') || lower.includes('antorcha') || lower.includes('light') || lower.includes('vela')) {
      setModalCategory('lights');
      setModalEmitsLight(true);
      setModalLightColor('#ffaa33');
    } else if (lower.includes('fuego') || lower.includes('fire') || lower.includes('llama')) {
      setModalCategory('fire');
      setModalEmitsLight(true);
      setModalLightColor('#ff6600');
    } else if (lower.includes('humo') || lower.includes('smoke') || lower.includes('niebla') || lower.includes('fog')) {
      setModalCategory('smoke');
      setModalEmitsLight(false);
      setModalLightColor('#94a3b8');
    } else if (lower.includes('magia') || lower.includes('arcane') || lower.includes('portal') || lower.includes('rayo')) {
      setModalCategory('arcane');
      setModalEmitsLight(true);
      setModalLightColor('#a855f7');
    }
  };

  const handleSaveCustomEffect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalFile || !modalName.trim()) return;

    setIsSaving(true);
    try {
      const isGif = modalFile.type === 'image/gif' || modalFile.name.toLowerCase().endsWith('.gif');
      const isVideo = modalFile.type.startsWith('video/') || modalFile.name.toLowerCase().endsWith('.mp4') || modalFile.name.toLowerCase().endsWith('.webm');
      const assetType = isGif ? 'gif' : isVideo ? 'video' : 'image';

      const assetId = crypto.randomUUID();
      const newAsset: AssetItem = {
        id: assetId,
        name: modalName.trim(),
        type: assetType,
        mimeType: modalFile.type || (isGif ? 'image/gif' : isVideo ? 'video/mp4' : 'image/png'),
        blob: modalFile,
        tags: [
          'effect',
          `category:${modalCategory}`,
          modalEmitsLight ? 'emits_light' : 'no_light',
          `light_color:${modalLightColor}`,
          `light_radius:${modalLightRadius}`,
          modalFlicker ? 'flicker' : 'no_flicker'
        ],
        createdAt: Date.now()
      };

      await saveAsset(newAsset);
      if (cloudSync.isCloudEligible(newAsset.type)) {
        cloudSync.enqueueUpload(newAsset.id);
      }

      await loadCustomAssets();
      setIsModalOpen(false);
      setModalFile(null);
      setModalName('');
    } catch (err) {
      console.error('Error al guardar efecto propio:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCustomEffect = async (assetId: string) => {
    try {
      await cloudSync.deleteAssetComplete(assetId);
      await loadCustomAssets();
    } catch (err) {
      console.error('Error al borrar efecto:', err);
    }
  };

  // Extraer metadatos de un custom asset
  const parseCustomMetadata = (asset: AssetItem) => {
    const tags = asset.tags || [];
    const catTag = tags.find((t) => t.startsWith('category:'));
    const category = (catTag ? catTag.replace('category:', '') : 'fire') as 'lights' | 'fire' | 'smoke' | 'arcane';
    const emitsLight = tags.includes('emits_light') || category === 'lights' || category === 'fire';
    const colTag = tags.find((t) => t.startsWith('light_color:'));
    const color = colTag ? colTag.replace('light_color:', '') : '#ff7700';
    const radTag = tags.find((t) => t.startsWith('light_radius:'));
    const baseLightRadius = radTag ? parseInt(radTag.replace('light_radius:', '')) || 4 : 4;
    const flicker = tags.includes('flicker') || category === 'lights' || category === 'fire';
    const originTag = tags.find((t) => t.startsWith('source:'));
    const origin = originTag ? originTag.replace('source:', '') : null;
    return { category, emitsLight, color, baseLightRadius, flicker, origin };
  };

  // Filtrado de procedurales
  const filteredProceduralItems = CATALOG_ITEMS.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    const isHidden = hiddenPresets.includes(item.id);
    const passesHidden = showHidden || !isHidden;
    return matchesSearch && matchesCat && passesHidden;
  });

  // Filtrado de personalizados
  const filteredCustomItems = customAssets.filter((asset) => {
    const meta = parseCustomMetadata(asset);
    const matchesSearch = asset.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === 'all' || meta.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleAddProceduralEffect = (item: EffectCatalogItem) => {
    const camera = game.masterCamera;
    const gridSize = game.grid.size || 70;
    const posX = Math.round(camera.x / gridSize) * gridSize;
    const posY = Math.round(camera.y / gridSize) * gridSize;

    const newEffect: Entity = {
      id: `effect_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'effect',
      name: item.name,
      x: posX,
      y: posY,
      rotation: 0,
      scaleX: item.defaultScale,
      scaleY: item.defaultScale,
      zIndex: 25,
      visibleToPlayers: true,
      locked: false,
      effect: {
        preset: item.id,
        category: item.category,
        color: item.defaultColor,
        intensity: 80,
        speed: 1.0,
        emitsLight: item.emitsLight,
        baseLightRadius: item.baseLightRadius
      },
      light: item.emitsLight
        ? {
            color: item.defaultColor,
            intensity: 80,
            brightRadiusInSquares: item.baseLightRadius * item.defaultScale,
            dimRadiusInSquares: 2 * item.defaultScale,
            edgeHardness: 0.5,
            flicker:
              item.id === 'torch' ||
              item.id === 'campfire' ||
              item.id === 'brazier' ||
              item.id === 'candle' ||
              item.id.startsWith('fire')
          }
        : undefined
    };

    addEntity(newEffect);
    selectEntity(newEffect.id);
    setActiveSidebarTab('properties');
  };

  const handleAddCustomEffect = (asset: AssetItem) => {
    const camera = game.masterCamera;
    const gridSize = game.grid.size || 70;
    const posX = Math.round(camera.x / gridSize) * gridSize;
    const posY = Math.round(camera.y / gridSize) * gridSize;
    const meta = parseCustomMetadata(asset);

    const newEffect: Entity = {
      id: `effect_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'effect',
      name: asset.name,
      assetId: asset.id,
      x: posX,
      y: posY,
      rotation: 0,
      scaleX: 1.0,
      scaleY: 1.0,
      zIndex: 25,
      visibleToPlayers: true,
      locked: false,
      effect: {
        preset: 'custom',
        category: meta.category,
        color: meta.color,
        intensity: 80,
        speed: 1.0,
        emitsLight: meta.emitsLight,
        baseLightRadius: meta.baseLightRadius
      },
      light: meta.emitsLight
        ? {
            color: meta.color,
            intensity: 80,
            brightRadiusInSquares: meta.baseLightRadius,
            dimRadiusInSquares: 2,
            edgeHardness: 0.5,
            flicker: meta.flicker
          }
        : undefined
    };

    addEntity(newEffect);
    selectEntity(newEffect.id);
    setActiveSidebarTab('properties');
  };

  return (
    <div className="flex flex-col h-full text-slate-200 select-none">
      {/* Cabecera y acciones */}
      <div className="p-3 border-b border-slate-700/80 space-y-2 bg-slate-900/90">
        {/* Botones de añadir individual o importar pack ZIP */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="py-2 px-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40 transition-all border border-amber-400/30 truncate"
            title="Añadir un efecto propio individual (GIF, Vídeo o PNG)"
          >
            <Upload className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Añadir efecto</span>
          </button>

          <button
            onClick={() => zipInputRef.current?.click()}
            className="py-2 px-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 shadow-md border border-amber-500/30 transition-all truncate"
            title="Importar pack de efectos desde un archivo ZIP (ej. JB2A) sin descomprimir"
          >
            <Package className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span className="truncate">Importar pack (ZIP)</span>
          </button>
        </div>

        <input
          ref={zipInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={handleZipSelect}
        />

        {/* Buscador */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar efectos..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Filtros de categoría */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'lights', label: 'Luces' },
            { id: 'fire', label: 'Fuego' },
            { id: 'smoke', label: 'Humo' },
            { id: 'arcane', label: 'Arcano' }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Barra de estado si hay efectos ocultos */}
        {hiddenPresets.length > 0 && (
          <div className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-800/60 px-2 py-1 rounded border border-slate-700/60">
            <span>{hiddenPresets.length} efecto(s) oculto(s)</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowHidden(!showHidden)}
                className="text-amber-400 hover:underline flex items-center gap-0.5"
              >
                {showHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showHidden ? 'Ocultar' : 'Ver todos'}</span>
              </button>
              <button
                onClick={handleResetHidden}
                className="text-slate-400 hover:text-white"
                title="Restablecer todos los efectos"
              >
                Restablecer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Catálogo de tarjetas */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {/* 1. SECCIÓN: Efectos Propios del Usuario */}
        {filteredCustomItems.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-amber-400 flex items-center gap-1 uppercase tracking-wider px-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Mis Efectos ({filteredCustomItems.length})</span>
            </div>

            {filteredCustomItems.map((asset) => {
              const meta = parseCustomMetadata(asset);
              const previewUrl = assetUrls.get(asset.id);
              const isVideo = asset.type === 'video';

              return (
                <div
                  key={asset.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/vtt-effect',
                      JSON.stringify({
                        preset: 'custom',
                        assetId: asset.id,
                        category: meta.category,
                        name: asset.name,
                        color: meta.color,
                        scale: 1.0,
                        emitsLight: meta.emitsLight,
                        baseLightRadius: meta.baseLightRadius,
                        flicker: meta.flicker
                      })
                    );
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="group p-2.5 bg-slate-800/90 hover:bg-slate-800 border border-amber-600/50 hover:border-amber-400 rounded-xl transition-all cursor-grab active:cursor-grabbing flex items-start justify-between gap-2.5 shadow-sm"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    {/* Miniatura animada (vídeo, gif o imagen) */}
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/15 bg-slate-950 flex items-center justify-center">
                      {previewUrl ? (
                        isVideo ? (
                          <video
                            src={previewUrl}
                            muted
                            loop
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={previewUrl}
                            alt={asset.name}
                            className="w-full h-full object-cover"
                          />
                        )
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-500" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-white group-hover:text-amber-300 transition-colors truncate max-w-[130px]">
                          {asset.name}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-amber-950/80 border border-amber-500/60 text-amber-300">
                          {asset.type.toUpperCase()}
                        </span>
                        {meta.emitsLight && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-amber-950/80 border border-amber-600/60 text-amber-300 flex items-center gap-0.5">
                            <Flame className="w-2.5 h-2.5 text-amber-400" />
                            Luz
                          </span>
                        )}
                        {meta.origin && (
                          <span
                            className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-sky-950/80 border border-sky-500/60 text-sky-300 font-mono"
                            title={`Origen: ${meta.origin}`}
                          >
                            {meta.origin}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 capitalize">
                        Categoría: {meta.category === 'lights' ? 'Luces' : meta.category === 'fire' ? 'Fuego' : meta.category === 'smoke' ? 'Humo' : 'Arcano'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAddCustomEffect(asset)}
                      className="px-2 py-1 rounded bg-amber-600/90 hover:bg-amber-600 text-white transition-colors text-xs flex items-center gap-1 font-medium"
                      title="Añadir al centro de la vista del mapa"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Añadir</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomEffect(asset.id)}
                      className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors"
                      title="Eliminar de mi biblioteca"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 2. SECCIÓN: Efectos Procedurales */}
        <div className="space-y-1.5">
          {filteredCustomItems.length > 0 && (
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 pt-1">
              Catálogo Procedural
            </div>
          )}

          {filteredProceduralItems.length === 0 && filteredCustomItems.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">
              No se encontraron efectos con ese filtro.
            </div>
          ) : (
            filteredProceduralItems.map((item) => {
              const Icon = item.icon;
              const isHidden = hiddenPresets.includes(item.id);

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/vtt-effect',
                      JSON.stringify({
                        preset: item.id,
                        name: item.name,
                        color: item.defaultColor,
                        scale: item.defaultScale,
                        emitsLight: item.emitsLight,
                        baseLightRadius: item.baseLightRadius
                      })
                    );
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className={`group p-2.5 bg-slate-800/70 hover:bg-slate-800 border rounded-xl transition-all cursor-grab active:cursor-grabbing flex items-start justify-between gap-2.5 shadow-sm ${
                    isHidden
                      ? 'opacity-50 border-slate-700/40 bg-slate-900/60'
                      : 'border-slate-700/80 hover:border-amber-500/60'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border border-white/10 shadow-inner"
                      style={{ backgroundColor: `${item.defaultColor}25` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: item.defaultColor }} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                          {item.name}
                        </span>
                        {item.emitsLight && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-amber-950/80 border border-amber-600/60 text-amber-300 flex items-center gap-0.5">
                            <Flame className="w-2.5 h-2.5 text-amber-400" />
                            Luz
                          </span>
                        )}
                        {isHidden && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-slate-800 border border-slate-600 text-slate-400">
                            Oculto
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAddProceduralEffect(item)}
                      className="px-2 py-1 rounded bg-slate-700/80 hover:bg-amber-600 border border-slate-600 hover:border-amber-500 text-slate-300 hover:text-white transition-colors text-xs flex items-center gap-1"
                      title="Añadir al centro de la vista del mapa"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Añadir</span>
                    </button>

                    {/* Botón Ocultar del catálogo */}
                    <button
                      type="button"
                      onClick={() => handleToggleHidePreset(item.id)}
                      className={`p-1 rounded transition-colors ${
                        isHidden
                          ? 'text-amber-400 hover:bg-slate-700'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/80 opacity-0 group-hover:opacity-100'
                      }`}
                      title={isHidden ? 'Mostrar en el catálogo' : 'Ocultar del catálogo'}
                    >
                      {isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pie recordatorio de arrastre */}
      <div className="p-2.5 bg-slate-900 border-t border-slate-700/80 text-[11px] text-slate-400 text-center">
        💡 Haz clic en <strong>Añadir</strong> o arrastra cualquier efecto directamente al tablero.
      </div>

      {/* Modal: Añadir efecto propio */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
              <span className="font-semibold text-sm text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Añadir Efecto Propio</span>
              </span>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomEffect} className="space-y-3.5 text-xs">
              {/* Selector de archivo */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Archivo animado o imagen
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".gif,.mp4,.webm,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-3 bg-slate-800 hover:bg-slate-700/80 border border-dashed border-slate-600 rounded-lg text-center flex flex-col items-center justify-center gap-1 transition-colors"
                >
                  <Upload className="w-5 h-5 text-amber-400" />
                  {modalFile ? (
                    <span className="text-emerald-400 font-semibold truncate max-w-[280px]">
                      ✓ {modalFile.name} ({(modalFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  ) : (
                    <>
                      <span className="text-slate-300 font-medium">
                        Seleccionar GIF, vídeo (MP4/WebM) o PNG
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Compatible con animaciones en bucle y fondos transparentes
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Nombre */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Nombre del efecto
                </label>
                <input
                  type="text"
                  required
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  placeholder="Ej: Fuego arcano, Aura sagrada, Niebla tóxica..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Categoría */}
              <div>
                <label className="text-slate-300 font-medium block mb-1.5">
                  Categoría
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'lights', label: 'Luces', icon: Flame },
                    { id: 'fire', label: 'Fuego', icon: Flame },
                    { id: 'smoke', label: 'Humo / Niebla', icon: Cloud },
                    { id: 'arcane', label: 'Arcano / Elemental', icon: Sparkles }
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setModalCategory(cat.id as any)}
                      className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-colors ${
                        modalCategory === cat.id
                          ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <cat.icon className="w-4 h-4 text-amber-400" />
                      <span className="font-medium text-[11px]">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Opciones de Iluminación */}
              <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/80 space-y-2.5">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5" />
                    <span>Emite luz dinámica</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={modalEmitsLight}
                    onChange={(e) => setModalEmitsLight(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>

                {modalEmitsLight && (
                  <div className="space-y-2 pt-1 border-t border-slate-700/60">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Color de luz</span>
                      <input
                        type="color"
                        value={modalLightColor}
                        onChange={(e) => setModalLightColor(e.target.value)}
                        className="w-7 h-7 rounded border border-slate-600 bg-transparent cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-400 mb-0.5">
                        <span>Radio de luz claro</span>
                        <span className="text-white font-mono">{modalLightRadius} casillas</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="15"
                        value={modalLightRadius}
                        onChange={(e) => setModalLightRadius(parseInt(e.target.value) || 4)}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <label className="flex items-center justify-between cursor-pointer pt-0.5">
                      <span className="text-slate-400">Parpadeo de antorcha</span>
                      <input
                        type="checkbox"
                        checked={modalFlicker}
                        onChange={(e) => setModalFlicker(e.target.checked)}
                        className="w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!modalFile || !modalName.trim() || isSaving}
                  className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isSaving ? 'Guardando...' : 'Guardar y usar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pie con enlace a créditos */}
      <div className="p-2.5 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between bg-slate-950/60 shrink-0">
        <span className="truncate">Efectos animados para rol</span>
        <button
          type="button"
          onClick={() => setShowCreditsModal(true)}
          className="text-amber-400/90 hover:text-amber-300 underline transition-colors shrink-0 font-medium"
        >
          Créditos: JB2A (CC BY-NC-SA 4.0)
        </button>
      </div>

      {/* Modal para importar pack (ZIP) */}
      <ZipPackModal
        isOpen={isZipModalOpen}
        file={zipFile}
        onClose={() => {
          setIsZipModalOpen(false);
          setZipFile(null);
        }}
        onImportSuccess={() => {
          loadCustomAssets();
        }}
        onOpenCredits={() => {
          setShowCreditsModal(true);
        }}
      />
    </div>
  );
};
