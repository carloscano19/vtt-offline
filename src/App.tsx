import React from 'react';
import { MasterApp } from './ui/master/MasterApp';
import { PlayersApp } from './ui/players/PlayersApp';

export const App: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get('window');

  if (windowType === 'players') {
    return <PlayersApp />;
  }

  return <MasterApp />;
};
