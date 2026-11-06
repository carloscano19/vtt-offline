import React, { Suspense, lazy } from 'react';
import { PwaReloadPrompt } from './ui/common/PwaReloadPrompt';

const MasterApp = lazy(() => import('./ui/master/MasterApp').then((m) => ({ default: m.MasterApp })));
const PlayersApp = lazy(() => import('./ui/players/PlayersApp').then((m) => ({ default: m.PlayersApp })));
const RemotePlayerApp = lazy(() => import('./ui/remote/RemotePlayerApp').then((m) => ({ default: m.RemotePlayerApp })));

const ScreenLoader: React.FC = () => (
  <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center text-slate-300 select-none">
    <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-3" />
    <span className="text-xs font-medium text-slate-400">Cargando...</span>
  </div>
);

export const App: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get('window');
  const playCode = params.get('play');

  return (
    <>
      <PwaReloadPrompt />
      <Suspense fallback={<ScreenLoader />}>
        {playCode ? (
          <RemotePlayerApp roomCode={playCode} />
        ) : windowType === 'players' ? (
          <PlayersApp />
        ) : (
          <MasterApp />
        )}
      </Suspense>
    </>
  );
};
