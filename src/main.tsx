import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme';
import { App } from './app/App';
import { initialisiereSprache } from './i18n';
import { initialisiereFunktionen } from './state/funktionen';

void Promise.all([initialisiereSprache(), initialisiereFunktionen()]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
