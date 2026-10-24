import React from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { PropertiesTab } from './PropertiesTab';
import { LayersTab } from './LayersTab';
import { LibraryTab } from './LibraryTab';
import { X, Sliders, Layers, FolderOpen } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const activeSidebarTab = useUIStore((s) => s.activeSidebarTab);
  const setActiveSidebarTab = useUIStore((s) => s.setActiveSidebarTab);

  if (!activeSidebarTab) return null;

  return (
    <aside className="w-80 h-[calc(100vh-3.5rem)] bg-slate-900/95 border-l border-slate-700/80 flex flex-col shadow-2xl z-20 backdrop-blur-sm">
      {/* Encabezado del panel lateral */}
      <div className="h-10 px-4 bg-slate-850 border-b border-slate-700/80 flex items-center justify-between text-xs font-semibold text-slate-300">
        <div className="flex items-center gap-2">
          {activeSidebarTab === 'properties' && <Sliders className="w-4 h-4 text-sky-400" />}
          {activeSidebarTab === 'layers' && <Layers className="w-4 h-4 text-sky-400" />}
          {activeSidebarTab === 'library' && <FolderOpen className="w-4 h-4 text-sky-400" />}
          <span className="capitalize">{activeSidebarTab}</span>
        </div>
        <button
          onClick={() => setActiveSidebarTab(null)}
          className="p-1 text-slate-400 hover:text-white rounded"
          title="Cerrar panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Contenido de la pestaña activa */}
      <div className="flex-1 overflow-hidden">
        {activeSidebarTab === 'properties' && <PropertiesTab />}
        {activeSidebarTab === 'layers' && <LayersTab />}
        {activeSidebarTab === 'library' && <LibraryTab />}
      </div>
    </aside>
  );
};
