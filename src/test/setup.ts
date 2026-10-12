import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { festeSprache } from '../i18n';

// Tests laufen auf Deutsch (jsdom meldet sonst en-US); englische Ansichten stellen die Sprache selbst um.
festeSprache('de');
beforeEach(() => {
  festeSprache('de');
});

afterEach(() => {
  cleanup();
});
