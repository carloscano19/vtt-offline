import React from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { PropertiesTab } from './PropertiesTab';
import { LayersTab } from './LayersTab';
import { LibraryTab } from './LibraryTab';
import { MusicTab } from './MusicTab';
import { X, Sliders, Layers, FolderOpen, Music } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const activeSidebarTab = useUIStore((s) => s.activeSidebarTab);
  const setActiveSidebarTab = useUIStore((s) => s.setActiveSidebarTab);

  if (!activeSidebarTab) return null;

  return (
    <aside className="w-[360px] h-[calc(100vh-3.5rem)] bg-slate-900/95 border-l border-slate-700/80 flex flex-col shadow-2xl z-20 backdrop-blur-sm">
      {/* Encabezado del panel lateral con pestañas de navegación */}
      <div className="h-11 px-1.5 bg-slate-900 border-b border-slate-700/80 flex items-center justify-between text-xs font-semibold text-slate-300 gap-1 select-none">
        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto py-1 scrollbar-none">
          <button
            onClick={() => setActiveSidebarTab('properties')}
            className={`px-2 py-1 rounded flex items-center gap-1 transition-all text-[11px] font-medium whitespace-nowrap ${
              activeSidebarTab === 'properties'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Propiedades de la entidad seleccionada"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Propiedades</span>
          </button>

          <button
            onClick={() => setActiveSidebarTab('layers')}
            className={`px-2 py-1 rounded flex items-center gap-1 transition-all text-[11px] font-medium whitespace-nowrap ${
              activeSidebarTab === 'layers'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Capas y orden de profundidad (zIndex)"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Capas</span>
          </button>

          <button
            onClick={() => setActiveSidebarTab('library')}
            className={`px-2 py-1 rounded flex items-center gap-1 transition-all text-[11px] font-medium whitespace-nowrap ${
              activeSidebarTab === 'library'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Biblioteca de mapas, tokens e imágenes"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Biblioteca</span>
          </button>

          <button
            onClick={() => setActiveSidebarTab('music')}
            className={`px-2 py-1 rounded flex items-center gap-1 transition-all text-[11px] font-medium whitespace-nowrap ${
              activeSidebarTab === 'music'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Música ambiental y efectos"
          >
            <Music className="w-3.5 h-3.5" />
            <span>Música</span>
          </button>
        </div>

        <button
          onClick={() => setActiveSidebarTab(null)}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors ml-1"
          title="Cerrar panel lateral"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Contenido de la pestaña activa */}
      <div className="flex-1 overflow-hidden">
        {activeSidebarTab === 'properties' && <PropertiesTab />}
        {activeSidebarTab === 'layers' && <LayersTab />}
        {activeSidebarTab === 'library' && <LibraryTab />}
        {activeSidebarTab === 'music' && <MusicTab />}
      </div>
    </aside>
  );
};
