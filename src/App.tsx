import React from 'react';
import { MasterApp } from './ui/master/MasterApp';
import { PlayersApp } from './ui/players/PlayersApp';
import { RemotePlayerApp } from './ui/remote/RemotePlayerApp';
import { PwaReloadPrompt } from './ui/common/PwaReloadPrompt';

export const App: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get('window');
  const playCode = params.get('play');

  return (
    <>
      <PwaReloadPrompt />
      {playCode ? (
        <RemotePlayerApp roomCode={playCode} />
      ) : windowType === 'players' ? (
        <PlayersApp />
      ) : (
        <MasterApp />
      )}
    </>
  );
};
