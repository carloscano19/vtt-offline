import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Upload,
  Folder,
  Search,
  CheckSquare,
  Square,
  Sparkles,
  Flame,
  Lightbulb,
  Cloud,
  Check,
  AlertCircle,
  Film,
  Image as ImageIcon,
  HardDrive
} from 'lucide-react';
import {
  readZipPack,
  extractEntryBlob,
  ZipPackItem,
  ZipPackResult
} from '../../../modules/import/zipPackReader';
import { AssetItem } from '../../../types/game';
import { saveAsset } from '../../../db/dexie';
import { cloudSync, formatStorageBytes } from '../../../modules/sync/cloudSync';
import { getMediaDimensions } from '../../../utils/mediaDimensions';

interface ZipPackModalProps {
  isOpen: boolean;
  file: File | null;
  onClose: () => void;
  onImportSuccess: () => void;
  onOpenCredits: () => void;
}

// Tarjeta individual para cada efecto del ZIP con carga perezosa
const ZipPackCard: React.FC<{
  item: ZipPackItem;
  isSelected: boolean;
  category: 'lights' | 'fire' | 'smoke' | 'arcane';
  emitsLight: boolean;
  onToggleSelect: () => void;
  onChangeCategory: (cat: 'lights' | 'fire' | 'smoke' | 'arcane') => void;
  onToggleLight: () => void;
}> = ({
  item,
  isSelected,
  category,
  emitsLight,
  onToggleSelect,
  onChangeCategory,
  onToggleLight
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);

  // IntersectionObserver para carga perezosa y liberación de memoria
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        root: null,
        rootMargin: '120px', // margen de carga anticipada
        threshold: 0.01
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Extraer y montar blob sólo cuando es visible; revocar al salir de pantalla
  useEffect(() => {
    let active = true;
    let url: string | null = null;

    if (isVisible) {
      setIsLoadingMedia(true);
      extractEntryBlob(item.entry, item.mimeType)
        .then((blob) => {
          if (!active) return;
          url = URL.createObjectURL(blob);
          setMediaUrl(url);
          setIsLoadingMedia(false);
        })
        .catch((err) => {
          console.error(`Error extrayendo ${item.filename}:`, err);
          if (active) setIsLoadingMedia(false);
        });
    } else {
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
        setMediaUrl(null);
      }
      setIsLoadingMedia(false);
    }

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }
    };
  }, [isVisible, item.entry, item.mimeType]);

  const cleanName = item.filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

  return (
    <div
      ref={containerRef}
      className={`relative rounded-lg border transition-all flex flex-col p-2.5 bg-slate-900/90 text-xs select-none ${
        isSelected
          ? 'border-amber-500/80 ring-1 ring-amber-500/50 shadow-md shadow-amber-950/30'
          : 'border-slate-700/70 hover:border-slate-600'
      }`}
    >
      {/* Contenedor de vista previa con fondo transparente ajedrezado */}
      <div
        onClick={onToggleSelect}
        className="relative w-full aspect-square rounded-md overflow-hidden bg-slate-950 cursor-pointer flex items-center justify-center border border-slate-800/80 group"
        style={{
          backgroundImage:
            'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
        }}
      >
        {/* Checkbox en esquina */}
        <div className="absolute top-1.5 left-1.5 z-10 p-0.5 rounded bg-slate-950/80 border border-slate-700">
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-amber-400 fill-amber-400/20" />
          ) : (
            <Square className="w-4 h-4 text-slate-400 group-hover:text-slate-200" />
          )}
        </div>

        {/* Tipo de archivo en esquina derecha */}
        <span className="absolute top-1.5 right-1.5 z-10 text-[9px] font-mono px-1 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-slate-400 uppercase font-semibold">
          {item.extension}
        </span>

        {/* Renderizado animado condicional */}
        {isVisible && mediaUrl ? (
          item.extension === 'webm' || item.extension === 'mp4' ? (
            <video
              src={mediaUrl}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-contain pointer-events-none"
            />
          ) : (
            <img
              src={mediaUrl}
              alt={cleanName}
              className="w-full h-full object-contain pointer-events-none"
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500 gap-1">
            {isLoadingMedia ? (
              <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            ) : item.extension === 'webm' || item.extension === 'mp4' ? (
              <Film className="w-6 h-6 opacity-40" />
            ) : (
              <ImageIcon className="w-6 h-6 opacity-40" />
            )}
            <span className="text-[10px] opacity-60">
              {isLoadingMedia ? 'Cargando...' : 'En pausa'}
            </span>
          </div>
        )}
      </div>

      {/* Metadatos y controles */}
      <div className="mt-2 space-y-1.5 flex-1 flex flex-col justify-between">
        <div>
          <div
            className="font-medium text-slate-200 truncate cursor-pointer hover:text-amber-300"
            onClick={onToggleSelect}
            title={item.fullPath}
          >
            {cleanName}
          </div>
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span className="truncate max-w-[120px]" title={item.folder}>
              {item.folder}
            </span>
            <span className="font-mono text-slate-500">
              {formatStorageBytes(item.size)}
            </span>
          </div>
        </div>

        <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between gap-1.5">
          {/* Selector de categoría */}
          <select
            value={category}
            onChange={(e) => onChangeCategory(e.target.value as any)}
            className="bg-slate-800 text-[11px] text-slate-200 border border-slate-700 rounded px-1.5 py-0.5 focus:outline-none focus:border-amber-500"
            title="Categoría en el catálogo"
          >
            <option value="fire">Fuego</option>
            <option value="lights">Luces</option>
            <option value="smoke">Humo</option>
            <option value="arcane">Arcano</option>
          </select>

          {/* Switch de emisión de luz */}
          <button
            type="button"
            onClick={onToggleLight}
            className={`p-1 rounded flex items-center gap-1 text-[11px] border transition-colors ${
              emitsLight
                ? 'bg-amber-950/60 text-amber-300 border-amber-500/60'
                : 'bg-slate-800/80 text-slate-500 border-slate-700 hover:text-slate-300'
            }`}
            title={emitsLight ? 'Emite luz (activo)' : 'No emite luz'}
          >
            <Lightbulb className="w-3 h-3" />
            <span className="text-[10px]">{emitsLight ? 'Luz' : 'Sin luz'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const ZipPackModal: React.FC<ZipPackModalProps> = ({
  isOpen,
  file,
  onClose,
  onImportSuccess,
  onOpenCredits
}) => {
  const [loadingZip, setLoadingZip] = useState(false);
  const [packResult, setPackResult] = useState<ZipPackResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [itemCategories, setItemCategories] = useState<Map<string, 'lights' | 'fire' | 'smoke' | 'arcane'>>(new Map());
  const [itemEmitsLight, setItemEmitsLight] = useState<Map<string, boolean>>(new Map());

  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState<string>('all');
  const [freeCloudBytes, setFreeCloudBytes] = useState<number>(1024 * 1024 * 1024);

  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // 1. Cargar el ZIP al abrir
  useEffect(() => {
    if (!isOpen || !file) {
      setPackResult(null);
      setSelectedIds(new Set());
      return;
    }

    setLoadingZip(true);
    readZipPack(file)
      .then((res) => {
        setPackResult(res);
        // Inicializar categorías y luces con las heurísticas del reader
        const cats = new Map<string, 'lights' | 'fire' | 'smoke' | 'arcane'>();
        const lights = new Map<string, boolean>();
        res.items.forEach((it) => {
          cats.set(it.id, it.category);
          lights.set(it.id, it.emitsLight);
        });
        setItemCategories(cats);
        setItemEmitsLight(lights);
        setSelectedIds(new Set());
      })
      .catch((err) => {
        console.error('Error leyendo ZIP con @zip.js/zip.js:', err);
        alert('No se pudo leer el archivo ZIP. Asegúrate de que sea un archivo ZIP válido.');
        onClose();
      })
      .finally(() => {
        setLoadingZip(false);
      });

    // Consultar espacio libre en la nube
    cloudSync.getStorageUsage().then((u) => {
      setFreeCloudBytes(Math.max(0, u.totalBytes - u.usedBytes));
    });
  }, [isOpen, file]);

  // Cerrar reader cuando se cierre el modal
  useEffect(() => {
    return () => {
      if (packResult?.reader) {
        packResult.reader.close().catch(() => {});
      }
    };
  }, [packResult]);

  // 2. Filtrado de elementos
  const filteredItems = useMemo(() => {
    if (!packResult) return [];
    return packResult.items.filter((item) => {
      const matchesSearch =
        search === '' ||
        item.filename.toLowerCase().includes(search.toLowerCase()) ||
        item.fullPath.toLowerCase().includes(search.toLowerCase());
      const matchesFolder = activeFolder === 'all' || item.folder === activeFolder;
      return matchesSearch && matchesFolder;
    });
  }, [packResult, search, activeFolder]);

  // Cálculo de tamaño seleccionado
  const selectedBytes = useMemo(() => {
    if (!packResult) return 0;
    return packResult.items
      .filter((it) => selectedIds.has(it.id))
      .reduce((acc, it) => acc + (it.size || 0), 0);
  }, [packResult, selectedIds]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFolder = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredItems.forEach((it) => next.add(it.id));
      return next;
    });
  };

  const handleDeselectAllFolder = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredItems.forEach((it) => next.delete(it.id));
      return next;
    });
  };

  // 3. Proceso de importación de los seleccionados
  const handleImportSelected = async () => {
    if (!packResult || selectedIds.size === 0 || isImporting) return;

    const toImport = packResult.items.filter((it) => selectedIds.has(it.id));
    setIsImporting(true);
    setImportProgress({ current: 0, total: toImport.length });

    try {
      for (let i = 0; i < toImport.length; i++) {
        const item = toImport[i];
        setImportProgress({ current: i + 1, total: toImport.length });

        const blob = await extractEntryBlob(item.entry, item.mimeType);
        const cat = itemCategories.get(item.id) || item.category;
        const emits = itemEmitsLight.get(item.id) ?? item.emitsLight;

        const lightColor = cat === 'fire' ? '#ff7700' : cat === 'lights' ? '#ffaa33' : '#38bdf8';
        const lightRadius = 4;
        const flicker = cat === 'fire' || cat === 'lights';

        const assetId = crypto.randomUUID();
        const assetType =
          item.extension === 'webm' || item.extension === 'mp4'
            ? 'video'
            : item.extension === 'gif'
            ? 'gif'
            : 'image';

        let dimensions: { width: number; height: number } | null = null;
        try {
          dimensions = await getMediaDimensions(blob);
        } catch {}

        const newAsset: AssetItem = {
          id: assetId,
          name: item.filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
          type: assetType,
          mimeType: item.mimeType,
          blob,
          width: dimensions?.width,
          height: dimensions?.height,
          tags: [
            'effect',
            `category:${cat}`,
            emits ? 'emits_light' : 'no_light',
            `light_color:${lightColor}`,
            `light_radius:${lightRadius}`,
            flicker ? 'flicker' : 'no_flicker',
            `source:${item.origin}`,
            `origin:${item.origin} (CC BY-NC-SA 4.0)`
          ],
          createdAt: Date.now()
        };

        await saveAsset(newAsset);
        if (cloudSync.isCloudEligible(newAsset.type)) {
          cloudSync.enqueueUpload(newAsset.id);
        }
      }

      onImportSuccess();
      onClose();
    } catch (err) {
      console.error('Error importando efectos seleccionados:', err);
      alert('Ocurrió un error al importar algunos efectos del ZIP.');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-5xl w-full h-[88vh] flex flex-col overflow-hidden text-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Importar Pack de Efectos</span>
                {packResult && (
                  <span className="text-xs px-2 py-0.5 rounded font-mono font-normal bg-slate-800 border border-slate-700 text-slate-300">
                    {packResult.zipName}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {packResult
                  ? `${packResult.totalItems} efectos encontrados en ${packResult.folders.length} carpetas`
                  : 'Leyendo estructura del archivo ZIP...'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isImporting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Filtros y Estadísticas */}
        <div className="p-3 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            {/* Buscador */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por nombre o ruta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-md bg-slate-800/80 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors text-xs"
              />
            </div>

            {/* Selector de Carpeta */}
            {packResult && packResult.folders.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                <select
                  value={activeFolder}
                  onChange={(e) => setActiveFolder(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-amber-500 max-w-[200px] truncate"
                >
                  <option value="all">Todas las carpetas ({packResult.totalItems})</option>
                  {packResult.folders.map((f) => {
                    const count = packResult.items.filter((it) => it.folder === f).length;
                    return (
                      <option key={f} value={f}>
                        {f} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Acciones de selección rápida y contadores */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectAllFolder}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors text-[11px]"
              >
                Marcar carpeta ({filteredItems.length})
              </button>
              <button
                type="button"
                onClick={handleDeselectAllFolder}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors text-[11px]"
              >
                Desmarcar
              </button>
            </div>

            <div className="h-4 w-[1px] bg-slate-800" />

            {/* Contador de seleccionados y espacio */}
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <div className="text-amber-400 font-semibold">
                {selectedIds.size} seleccionados ({formatStorageBytes(selectedBytes)})
              </div>
              <div className="text-slate-400 flex items-center gap-1" title="Espacio libre en la nube">
                <Cloud className="w-3.5 h-3.5 text-sky-400" />
                <span>{formatStorageBytes(freeCloudBytes)} libres</span>
              </div>
            </div>
          </div>
        </div>

        {/* Catálogo de Elementos con scroll y render perezoso */}
        <div className="flex-1 p-4 overflow-y-auto">
          {loadingZip ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Leyendo estructura del ZIP con @zip.js/zip.js...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
              <Folder className="w-8 h-8 opacity-40" />
              <p className="text-xs">No se encontraron efectos con los filtros seleccionados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredItems.map((item) => {
                const isSelected = selectedIds.has(item.id);
                const category = itemCategories.get(item.id) || item.category;
                const emitsLight = itemEmitsLight.get(item.id) ?? item.emitsLight;

                return (
                  <ZipPackCard
                    key={item.id}
                    item={item}
                    isSelected={isSelected}
                    category={category}
                    emitsLight={emitsLight}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onChangeCategory={(cat) =>
                      setItemCategories((prev) => new Map(prev).set(item.id, cat))
                    }
                    onToggleLight={() =>
                      setItemEmitsLight((prev) => new Map(prev).set(item.id, !emitsLight))
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Pie con Créditos y Botón de Importar */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span>
              Origen:{' '}
              <strong className="text-slate-300">
                {packResult?.items[0]?.origin || 'JB2A'}
              </strong>
            </span>
            <span>·</span>
            <button
              type="button"
              onClick={onOpenCredits}
              className="text-amber-400 hover:text-amber-300 underline font-medium"
            >
              Efectos animados: JB2A (CC BY-NC-SA 4.0)
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {isImporting && (
              <div className="flex items-center gap-2 text-amber-400 text-xs">
                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span>
                  Importando {importProgress.current} de {importProgress.total}...
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleImportSelected}
              disabled={selectedIds.size === 0 || isImporting}
              className="px-4 py-1.5 rounded-lg text-white font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed shadow transition-colors flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              <span>Añadir seleccionados ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
