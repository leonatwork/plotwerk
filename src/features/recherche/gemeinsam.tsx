/** Gemeinsame Teile der Recherche-Ablage (G8): Symbole, Ziel-Chips, Link öffnen, Dateien aus Drag & Drop. */
import type { MouseEvent } from 'react';
import type { RechercheArt, Verweis } from '@core/model/types';
import { linkPruefen, zielInfo, type ZielArt } from '@core/recherche/index';
import { istTauri } from '../../backend';
import { datum, f, sprache, texte, useTexte } from '../../i18n';
import { useStore, type Auswahl, type Bereich, type Store } from '../../state/store';
import { klassen, mitteilen, type IconProps } from '../../ui';

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const IconBild = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m20.5 16-5-5-8.5 8.5" />
  </Svg>
);

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);

export const IconNotiz = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.5h8.5L19 8v12.5H6Z" />
    <path d="M14 3.5V8h5M9 12.5h7M9 16h5" />
  </Svg>
);

export const IconExtern = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4.5h5.5V10M19.5 4.5 11 13" />
    <path d="M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" />
  </Svg>
);

export const IconRaster = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
  </Svg>
);

export const IconListe = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <path d="M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5" />
  </Svg>
);

export function ArtSymbol({ art, size = 14 }: { art: RechercheArt; size?: number }) {
  if (art === 'bild') return <IconBild size={size} />;
  if (art === 'link') return <IconLink size={size} />;
  return <IconNotiz size={size} />;
}

/** Öffnet eine geprüfte http(s)-Adresse im Standardbrowser (nur auf Klick). */
export async function linkOeffnen(url: string | undefined): Promise<void> {
  const l = url ? linkPruefen(url) : null;
  const t = texte().recherche.link;
  if (!l) {
    await mitteilen(t.ungueltig, t.titel);
    return;
  }
  try {
    if (istTauri()) {
      const { linkImBrowserOeffnen } = await import('../../backend/tauri/recherche');
      await linkImBrowserOeffnen(l.url);
    } else {
      window.open(l.url, '_blank', 'noopener,noreferrer');
    }
  } catch (e) {
    await mitteilen(e instanceof Error ? e.message : String(e), t.titel);
  }
}

/** Ziel in seinem Bereich öffnen (Figur, Ort, Kapitel, Szene, Plan-Karte …). */
export function zielOeffnen(store: Pick<Store, 'oeffne' | 'daten'>, v: Verweis): void {
  const daten = store.daten;
  if (!daten) return;
  const info = zielInfo(daten, v, sprache());
  const ziel: Record<ZielArt, [Bereich, Partial<Auswahl>]> = {
    figur: ['figuren', { figur: v.id }],
    ort: ['orte', { ort: v.id }],
    kapitel: ['schreiben', { kapitel: v.id }],
    szene: ['schreiben', { kapitel: info.kapitel }],
    plan: ['akte', { plan: v.id }],
    idee: ['akte', {}],
    gruppe: ['beziehungen', { gruppe: v.id }],
  };
  const [bereich, auswahl] = ziel[info.art];
  store.oeffne(bereich, auswahl);
}

export interface ZielChipProps {
  verweis: Verweis;
  /** × zum Lösen */
  onLoesen?: () => void;
  /** Klick öffnet das Ziel (Standard: ja) */
  oeffnen?: boolean;
  klein?: boolean;
}

/** Chip „Figur Paul“, „Kap. 3 · Lotte“ – Klick öffnet, × löst. Fehlende Ziele gestrichelt. */
export function ZielChip({ verweis, onLoesen, oeffnen = true, klein }: ZielChipProps) {
  const t = useTexte();
  const tz = t.recherche.ziel;
  const daten = useStore((s) => s.daten);
  const oeffne = useStore((s) => s.oeffne);
  if (!daten) return null;
  const info = zielInfo(daten, verweis, sprache());
  const artName = t.recherche.zielArt[info.art];
  const name = info.name ?? f(tz.fehlt, { id: verweis.id });
  const titel = info.name ? f(tz.titel, { art: artName, name: info.name }) : tz.gibtsNicht;
  return (
    <span className={klassen('rc-ziel', !info.name && 'rc-ziel--fehlt', klein && 'rc-ziel--klein', `rc-ziel--${info.art}`)}>
      {oeffnen && info.name ? (
        <button
          type="button"
          className="rc-ziel__name"
          title={f(tz.oeffnen, { titel })}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            zielOeffnen({ oeffne, daten }, verweis);
          }}
        >
          <span className="rc-ziel__art">{artName}</span> {name}
        </button>
      ) : (
        <span className="rc-ziel__name" title={titel}>
          <span className="rc-ziel__art">{artName}</span> {name}
        </span>
      )}
      {onLoesen && (
        <button
          type="button"
          className="rc-ziel__weg"
          aria-label={f(tz.loesenLabel, { name })}
          title={tz.loesen}
          onClick={(e) => {
            e.stopPropagation();
            onLoesen();
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Bilddateien und Adressen aus einem Drop/Einfügen. */
export function ausUebergabe(dt: DataTransfer | null): { dateien: File[]; links: string[] } {
  if (!dt) return { dateien: [], links: [] };
  const dateien = [...(dt.files ?? [])];
  const links: string[] = [];
  if (dateien.length === 0) {
    const liste = dt.getData('text/uri-list') || dt.getData('text/plain');
    for (const zeile of liste.split(/\r?\n/)) {
      const t = zeile.trim();
      if (t && !t.startsWith('#') && /^https?:\/\//i.test(t) && linkPruefen(t)) links.push(t);
    }
  }
  return { dateien, links };
}

/** Enthält der Drag Dateien oder Adressen? (während dragover sind die Inhalte noch nicht lesbar) */
export function uebergabeMoeglich(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  const typen = [...(dt.types ?? [])];
  return typen.includes('Files') || typen.includes('text/uri-list');
}

export function datumKurz(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return datum(d, { day: 'numeric', month: 'short', year: 'numeric' });
}
