import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme';
import { App } from './app/App';
import { initialisiereSprache } from './i18n';
import { initialisiereFunktionen } from './state/funktionen';
import { initialisiereDarstellung } from './state/darstellung';

void Promise.all([initialisiereSprache(), initialisiereFunktionen(), initialisiereDarstellung()]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
