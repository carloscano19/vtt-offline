import React, { useEffect, useState } from 'react';
import { cloudSync, formatStorageBytes } from '../../../modules/sync/cloudSync';
import { authManager } from '../../../modules/auth/authManager';
import { HardDrive } from 'lucide-react';

interface StorageIndicatorProps {
  compact?: boolean;
}

export const StorageIndicator: React.FC<StorageIndicatorProps> = ({ compact = false }) => {
  const [currentUser, setCurrentUser] = useState(authManager.getUser());
  const [usage, setUsage] = useState({
    usedBytes: 0,
    totalBytes: 1024 * 1024 * 1024,
    percentage: 0
  });

  const updateUsage = () => {
    cloudSync.getStorageUsage().then(setUsage);
  };

  useEffect(() => {
    updateUsage();
    const unbindAuth = authManager.onAuthStateChange((user) => {
      setCurrentUser(user);
      if (user) updateUsage();
    });
    const unbindSync = cloudSync.onStatusChange(() => {
      updateUsage();
    });
    return () => {
      unbindAuth();
      unbindSync();
    };
  }, []);

  if (!currentUser) return null;

  if (compact) {
    return (
      <div
        className="flex items-center gap-1.5 text-[10px] text-slate-400 select-none py-1 px-2 bg-slate-950/60 rounded border border-slate-800"
        title={`Almacenamiento en la nube: ${formatStorageBytes(usage.usedBytes)} de ${formatStorageBytes(usage.totalBytes)} (${usage.percentage}%)`}
      >
        <HardDrive className="w-3 h-3 text-sky-400 shrink-0" />
        <span className="truncate">
          {formatStorageBytes(usage.usedBytes)} / {formatStorageBytes(usage.totalBytes)} ({usage.percentage}%)
        </span>
        <div className="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden shrink-0 ml-auto">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              usage.percentage > 85 ? 'bg-rose-500' : usage.percentage > 60 ? 'bg-amber-400' : 'bg-sky-400'
            }`}
            style={{ width: `${Math.max(3, Math.min(100, usage.percentage))}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 bg-slate-800/60 border border-slate-700/60 rounded-lg space-y-1.5 select-none text-[11px]">
      <div className="flex items-center justify-between text-slate-300">
        <span className="flex items-center gap-1.5 text-slate-400">
          <HardDrive className="w-3.5 h-3.5 text-sky-400" />
          <span>Almacenamiento nube</span>
        </span>
        <span className="font-semibold text-slate-200">
          {formatStorageBytes(usage.usedBytes)} / {formatStorageBytes(usage.totalBytes)} ({usage.percentage}%)
        </span>
      </div>
      <div className="w-full bg-slate-750 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            usage.percentage > 85 ? 'bg-rose-500' : usage.percentage > 60 ? 'bg-amber-400' : 'bg-sky-400'
          }`}
          style={{ width: `${Math.max(3, Math.min(100, usage.percentage))}%` }}
        />
      </div>
    </div>
  );
};
