import React from 'react';
import { MasterApp } from './ui/master/MasterApp';
import { PlayersApp } from './ui/players/PlayersApp';
import { PwaReloadPrompt } from './ui/common/PwaReloadPrompt';

export const App: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get('window');

  return (
    <>
      <PwaReloadPrompt />
      {windowType === 'players' ? <PlayersApp /> : <MasterApp />}
    </>
  );
};
