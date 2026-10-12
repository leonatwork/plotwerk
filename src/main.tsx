import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme';
import { App } from './app/App';
import { initialisiereSprache } from './i18n';

void initialisiereSprache().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
