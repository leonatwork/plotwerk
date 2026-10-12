/**
 * Stile für Figuren-Bögen und Figurenstimme (G3). Besitzer: G3 Figuren.
 * Als <style>-Element, weil die Gruppe nur .tsx-Dateien im Ordner figuren/ besitzt. Farben nur über Tokens.
 */
const CSS = `
.fb-seite {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 26px 30px 40px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: var(--surface);
}
.fb-kopf {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.fb-titel {
  margin: 0;
  font-family: var(--schrift-titel);
  font-weight: 400;
  font-size: 34px;
  line-height: 1;
  color: var(--ink);
}
.fb-leise {
  font-size: 12px;
  color: var(--ink-quiet);
  line-height: 1.45;
}
.fb-raster-huelle {
  overflow-x: auto;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background: var(--surface);
}
.fb-raster {
  display: grid;
  column-gap: 0;
  row-gap: 0;
  width: 100%;
  font-size: 12px;
}
.fb-raster > .fb-zelle {
  border-bottom: 1px solid var(--line-faint);
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.fb-raster > .fb-name {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--surface);
  border-right: 1px solid var(--line-soft);
  border-bottom: 1px solid var(--line-soft);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
}
.fb-raster > .fb-ecke {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--inspector);
  border-right: 1px solid var(--line-soft);
  border-bottom: 1px solid var(--line-soft);
}
.fb-akt {
  background: var(--inspector);
  border-bottom: 1px solid var(--line-soft);
  border-left: 1px solid var(--line-soft);
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-quiet);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fb-kapitelkopf {
  background: var(--inspector);
  border-bottom: 1px solid var(--line-soft);
  padding: 4px 2px;
  font-size: 11px;
  color: var(--ink-quiet);
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.fb-kapitelkopf--aktgrenze,
.fb-raster > .fb-zelle.fb-aktgrenze {
  border-left: 1px solid var(--line-soft);
}
.fb-stufenzelle {
  padding: 5px 3px;
  border-bottom: 1px dashed var(--line-faint);
  min-width: 0;
  display: flex;
}
.fb-stufe {
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  min-height: 28px;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--fb-farbe) 45%, var(--line-soft));
  border-left: 4px solid var(--fb-farbe);
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--fb-farbe) 14%, var(--surface)) 0 var(--fb-anteil, 100%),
    color-mix(in srgb, var(--fb-farbe) 4%, var(--surface)) var(--fb-anteil, 100%) 100%
  );
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}
.fb-stufe:hover {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--fb-farbe) 22%, var(--surface)) 0 var(--fb-anteil, 100%),
    color-mix(in srgb, var(--fb-farbe) 9%, var(--surface)) var(--fb-anteil, 100%) 100%
  );
}
.fb-stufe[aria-pressed='true'] {
  background: var(--fb-farbe);
  border-color: var(--fb-farbe);
  color: var(--on-farbe);
}
.fb-stufe__zahl {
  font-weight: 400;
  font-size: 11px;
  opacity: 0.75;
  flex: 0 0 auto;
}
.fb-stufe--akt {
  border-style: dashed;
  border-left-style: solid;
}
.fb-leerstufe {
  font: inherit;
  font-size: 12px;
  flex: 1;
  min-height: 28px;
  border: 1px dashed var(--dashed);
  border-radius: 6px;
  background: transparent;
  color: var(--ink-quiet);
  cursor: pointer;
  text-align: left;
  padding: 0 10px;
}
.fb-leerstufe:hover {
  color: var(--ink);
  border-color: var(--dotted);
}
.fb-linie {
  position: absolute;
  top: 50%;
  height: 2px;
  margin-top: -1px;
  background: color-mix(in srgb, var(--fb-farbe) 55%, var(--surface));
  pointer-events: none;
}
.fb-punkt {
  font: inherit;
  position: relative;
  z-index: 1;
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 999px;
  border: 0;
  background: var(--fb-farbe);
  cursor: pointer;
}
.fb-punkt--nachricht {
  background: var(--surface);
  border: 2px solid var(--fb-farbe);
}
.fb-punkt--erwaehnt {
  background: var(--surface);
  border: 1.5px dashed var(--fb-farbe);
}
.fb-punkt--unbestimmt {
  background: color-mix(in srgb, var(--fb-farbe) 30%, var(--surface));
}
.fb-punkt:hover {
  transform: scale(1.15);
}
.fb-beleg-marke {
  position: absolute;
  z-index: 1;
  top: 3px;
  right: 3px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  background: var(--chip-accent);
  color: var(--accent-dark);
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  pointer-events: none;
}
.fb-ohnetext {
  width: 100%;
  height: 100%;
  background: repeating-linear-gradient(135deg, var(--schraffur) 0 4px, var(--surface) 4px 8px);
}
.fb-legende {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  align-items: center;
  font-size: 12px;
  color: var(--ink-quiet);
}
.fb-legende span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.fb-legende .fb-punkt {
  width: 11px;
  height: 11px;
  cursor: default;
  --fb-farbe: var(--ink-quiet);
}
.fb-legende .fb-punkt:hover {
  transform: none;
}
.fb-meldung {
  font-size: 12px;
  line-height: 1.45;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--warm-flaeche);
  color: var(--warm-dark);
  border: 1px solid var(--notiz-line);
}
.fb-fehler {
  font-size: 12px;
  color: var(--accent-dark);
}
.fb-beleg {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  line-height: 1.45;
}
.fb-beleg > .pl-link {
  font-size: 13px;
  text-align: left;
  flex: 1;
  min-width: 0;
}
.fb-zitat {
  color: var(--ink-soft);
}
.fb-zitat-knopf {
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  text-align: left;
  padding: 6px 10px;
  border: 0;
  border-left: 3px solid var(--line);
  border-radius: 0 6px 6px 0;
  background: var(--inspector);
  color: var(--ink-soft);
  cursor: pointer;
  width: 100%;
}
.fb-zitat-knopf:hover {
  background: var(--surface-muted);
  color: var(--ink);
}
.fb-zitat-knopf--auffaellig {
  border-left-color: var(--accent);
  background: var(--accent-flaeche);
}
.fb-zitat-knopf__kap {
  display: block;
  font-size: 11px;
  color: var(--ink-quiet);
  margin-bottom: 2px;
}
.fb-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-quiet);
}
.fb-beobachtung {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background: var(--surface);
}
.fb-beobachtung--alt {
  opacity: 0.7;
}
.fb-beobachtung h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
}
.fb-beobachtung p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-soft);
}
.fb-reihe {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.fb-vage {
  font-size: 12px;
  line-height: 1.45;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--real-vage) 10%, var(--surface));
  color: var(--vage-dark);
  border: 1px solid color-mix(in srgb, var(--real-vage) 35%, var(--surface));
}
@media (prefers-reduced-motion: no-preference) {
  .fb-punkt {
    transition: transform 0.12s ease;
  }
}
`;

export function BoegenStil() {
  return <style data-plotwerk="figurenbogen">{CSS}</style>;
}
