import React, { useState } from 'react';
import { useGameStore } from '../../../stores/useGameStore';
import { useUIStore } from '../../../stores/useUIStore';
import { Entity, EffectPresetId } from '../../../types/entity';
import {
  Sparkles,
  Flame,
  Search,
  Plus,
  Cloud,
  Zap,
  Snowflake,
  Compass,
  Lightbulb
} from 'lucide-react';

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

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredItems = CATALOG_ITEMS.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleAddEffect = (item: EffectCatalogItem) => {
    // Colocar en el centro de la vista del máster ajustado a cuadrícula
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

  return (
    <div className="flex flex-col h-full text-slate-200 select-none">
      {/* Cabecera y búsqueda */}
      <div className="p-3 border-b border-slate-700/80 space-y-2 bg-slate-900/90">
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
      </div>

      {/* Lista de tarjetas de efectos */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredItems.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            No se encontraron efectos con ese filtro.
          </div>
        ) : (
          filteredItems.map((item) => {
            const Icon = item.icon;
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
                className="group p-2.5 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-500/60 rounded-xl transition-all cursor-grab active:cursor-grabbing flex items-start justify-between gap-2.5 shadow-sm"
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
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddEffect(item)}
                  className="px-2 py-1 rounded bg-slate-700/80 hover:bg-amber-600 border border-slate-600 hover:border-amber-500 text-slate-300 hover:text-white transition-colors shrink-0 text-xs flex items-center gap-1"
                  title="Añadir al centro de la vista del mapa"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Añadir</span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Pie recordatorio de arrastre */}
      <div className="p-2.5 bg-slate-900 border-t border-slate-700/80 text-[11px] text-slate-400 text-center">
        💡 Haz clic en <strong>Añadir</strong> o arrastra cualquier efecto directamente al tablero.
      </div>
    </div>
  );
};
