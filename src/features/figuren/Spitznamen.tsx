/**
 * F-08/F-16: Spitznamen einer Figur als Chips. Neue Namen mit Enter oder Komma (Einfügen mit Kommas teilt auf),
 * × entfernt. Klick auf einen Chip öffnet den Kontext: wer nennt die Figur so, ab welchem Kapitel, Notiz.
 * Die Namen speisen die Erkennung (Figur.aliase), der Kontext steht in Figur.spitznamen.
 */
import { useState } from 'react';
import { mitAliasen, mitSpitznameKontext, spitznameKontext } from '@core/figuren/namen';
import type { Figur, ProjektDaten } from '@core/model/types';
import { f as fmt, useTexte, vergleich } from '../../i18n';
import { useStore } from '../../state/store';
import { EntwurfFeld } from '../akte/gemeinsam';

export function SpitznamenFeld({ f, daten, id }: { f: Figur; daten: ProjektDaten; id: string }) {
  const figurAendern = useStore((s) => s.planung.figurAendern);
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState<string | null>(null);
  const t = useTexte();
  const T = t.figuren.karte.spitznamen;
  const tp = t.figuren.karte.planung;

  const speichern = (neu: Figur) => void figurAendern(f.id, { aliase: neu.aliase, spitznamen: neu.spitznamen });
  const hinzufuegen = (text: string) => {
    const namen = text
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (namen.length) speichern(mitAliasen(f, [...f.aliase, ...namen]));
    setEingabe('');
  };
  const entfernen = (name: string) => {
    if (offen === name) setOffen(null);
    speichern(mitAliasen(f, f.aliase.filter((a) => a !== name)));
  };
  const kontext = offen ? (spitznameKontext(f, offen) ?? { name: offen }) : null;
  const andere = Object.values(daten.figuren)
    .filter((x) => x.id !== f.id)
    .sort((a, b) => vergleich(a.name, b.name));

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span className="pl-spitznamen" onClick={(e) => e.currentTarget === e.target && document.getElementById(id)?.focus()}>
        {f.aliase.map((a) => {
          const k = spitznameKontext(f, a);
          return (
            <span key={a} className="pl-spitzname" data-offen={offen === a || undefined}>
              <button type="button" className="pl-spitzname__name" aria-expanded={offen === a} title={T.kontextTitel} onClick={() => setOffen(offen === a ? null : a)}>
                {a}
                {k && <span className="pl-spitzname__punkt" aria-label={T.mitKontext} />}
              </button>
              <button type="button" className="pl-spitzname__weg" aria-label={fmt(T.entfernen, { name: a })} onClick={() => entfernen(a)}>
                ×
              </button>
            </span>
          );
        })}
        <input
          id={id}
          className="pl-spitznamen__eingabe"
          value={eingabe}
          placeholder={f.aliase.length ? T.weitere : tp.aliasePlatzhalter}
          aria-label={tp.auchGenannt}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(',')) hinzufuegen(v);
            else setEingabe(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              hinzufuegen(eingabe);
            } else if (e.key === 'Backspace' && !eingabe && f.aliase.length) entfernen(f.aliase[f.aliase.length - 1]!);
          }}
          onBlur={() => eingabe.trim() && hinzufuegen(eingabe)}
        />
      </span>
      {kontext && (
        <span className="pl-spitzname__kontext" role="group" aria-label={fmt(T.kontextLabel, { name: kontext.name })}>
          <span style={{ fontWeight: 600 }}>{fmt(T.werNennt, { name: kontext.name })}</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {(kontext.von ?? []).map((v) => (
              <span key={v} className="pl-spitzname">
                <span className="pl-spitzname__name">{daten.figuren[v]?.name ?? v}</span>
                <button
                  type="button"
                  className="pl-spitzname__weg"
                  aria-label={fmt(T.entfernen, { name: daten.figuren[v]?.name ?? v })}
                  onClick={() => speichern(mitSpitznameKontext(f, { ...kontext, von: kontext.von!.filter((x) => x !== v) }))}
                >
                  ×
                </button>
              </span>
            ))}
            <select
              className="pl-select"
              aria-label={T.figurHinzu}
              value=""
              onChange={(e) => e.target.value && speichern(mitSpitznameKontext(f, { ...kontext, von: [...(kontext.von ?? []), e.target.value] }))}
            >
              <option value="">{kontext.von?.length ? T.figurHinzu : T.alle}</option>
              {andere
                .filter((x) => !kontext.von?.includes(x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{T.abKapitel}</span>
            <select
              className="pl-select"
              value={kontext.abKapitel ?? ''}
              onChange={(e) => speichern(mitSpitznameKontext(f, { ...kontext, abKapitel: e.target.value || undefined }))}
            >
              <option value="">{T.vonAnfang}</option>
              {daten.projekt.kapitel.map((k, i) => (
                <option key={k} value={k}>
                  {fmt(t.gemeinsam.kapitelKurz, { nr: i + 1 })} · {daten.plaene[k]?.titel ?? daten.kapitel[k]?.titel ?? k}
                </option>
              ))}
            </select>
          </label>
          <EntwurfFeld
            key={`${f.id}-${kontext.name}-notiz`}
            className="pl-eingabe"
            placeholder={T.notiz}
            wert={kontext.notiz ?? ''}
            onSpeichern={(notiz) => speichern(mitSpitznameKontext(f, { ...kontext, notiz }))}
          />
        </span>
      )}
    </span>
  );
}
