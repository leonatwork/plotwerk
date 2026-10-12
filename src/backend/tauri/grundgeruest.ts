/** Grundgerüst eines neuen Projektordners (über core/projekt, damit Format und Reihenfolge stimmen). */
import { STANDARD_KI } from '@core/ki/index';
import {
  leereEntscheidungen,
  speichereAkte,
  speichereAnmerkungen,
  speichereEntscheidungen,
  speichereIdeen,
  speichereProjekt,
  speichereStraenge,
  type ProjektDateisystem,
} from '@core/projekt';

export async function legeGrundgeruestAn(fs: ProjektDateisystem, titel: string): Promise<void> {
  await speichereProjekt(fs, { version: 1, titel: titel.trim(), kapitel: [], ki: STANDARD_KI, notiz: '' });
  await speichereAkte(fs, []);
  await speichereStraenge(fs, []);
  await speichereIdeen(fs, []);
  await speichereAnmerkungen(fs, []);
  await speichereEntscheidungen(fs, leereEntscheidungen());
}
