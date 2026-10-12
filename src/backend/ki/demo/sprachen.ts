/**
 * Sprachabhängige Teile der Demo-KI (Prüfung, Erwähnungen, Vorschläge): Suchmuster für den Buchtext und die
 * Texte der Antworten. Die Antwortsprache folgt der Buchsprache (Prefix mit englischen Beschriftungen = englisches
 * Buch, siehe leseBuchKontext). Besitzer: KI.
 *
 * Alle Belege in den Tabellen stehen wörtlich in fixtures/demo-projekt bzw. fixtures/demo-projekt-en; einige sind
 * absichtlich falsch (erfundenes Zitat, Ersatztext, unbekannte Figur) – die Antwortprüfung in core/ki verwirft sie.
 */
import type { GelesenerKontext } from '@core/ki/index';

export type DemoBeleg = [kapitel: string, zitat: string];

export interface DemoFigur {
  name: string;
  aliase: string[];
  rolle: 'haupt' | 'neben';
  kurz: string;
  belege: DemoBeleg[];
}

export interface DemoOrt {
  name: string;
  aliase: string[];
  in: string;
  belege: DemoBeleg[];
}

export interface DemoBeziehung {
  von: string;
  zu: string;
  art: string;
  kategorie: 'arbeit' | 'dates' | 'sonstige';
  unsicher: boolean;
  belege: DemoBeleg[];
  begruendung: string;
}

export interface DemoSprache {
  /** Konjunktion für Teilsätze (mit Leerzeichen) */
  und: string;
  /** einleitende Wendung, die ein Zitat nicht braucht („Beim Bezahlen …“) */
  einleitung: RegExp;
  /** Name nach „für“/„for“ (Gruppe 1) – Kandidat für einen unbekannten Namen */
  unbekannt: RegExp;
  postkarte: RegExp;
  manteltasche: RegExp;
  fahrzeug: RegExp;
  spaet: RegExp;
  frueh: RegExp;
  wochentag: RegExp;
  /** großgeschriebenes Pronomen mitten im Satz */
  anrede: RegExp;
  alkoholFeld: RegExp;
  verneinung: RegExp;
  getraenk: RegExp;
  /** wörtliche Rede (Gruppe 1 = Inhalt) */
  dialog: RegExp;
  /** namenlose Personen („der Mann am Fischstand“) */
  personen: RegExp;
  /** Artikel vor Namen beim Vergleich */
  artikel: RegExp;
  t: {
    unbekanntTitel: (name: string) => string;
    unbekanntErklaerung: (name: string, anzahl: number) => string;
    unbekanntFaden: (name: string) => string;
    postkartenTitel: string;
    postkartenErklaerung: (erste: number, letzte: number) => string;
    postkartenFaden: string;
    treffenTitel: (name: string) => string;
    treffenErklaerung: (a: number, b: number, name: string, wagen: string) => string;
    wagen: (a: number, fa: string, b: number, fb: string) => string;
    tageTitel: (namen: string[]) => string;
    tageErklaerung: (nummern: number[]) => string;
    anredeTitel: (wort: string) => string;
    anredeErklaerung: (nr: number, wort: string) => string;
    alkoholTitel: (name: string) => string;
    alkoholErklaerung: (name: string, feld: string, wert: string, nr: number) => string;
    vageTitel: (name: string) => string;
    vageErklaerung: (name: string) => string;
    raumZitat: (name: string) => string;
    raumTitel: (name: string) => string;
    raumErklaerung: string;
    hoelzernTitel: string;
    hoelzernErklaerung: string;
    schwebe: string;
    keine: string;
    gruppenBezug: (gruppen: string[]) => string;
    unbekanntVorschlag: (name: string) => string;
    personVorschlag: string;
    schreibweiseVorschlag: (name: string) => string;
  };
  figuren: DemoFigur[];
  orte: DemoOrt[];
  beziehungen: DemoBeziehung[];
}

const liste = (teile: string[], und: string) => (teile.length <= 1 ? teile.join('') : `${teile.slice(0, -1).join(', ')}${und}${teile[teile.length - 1]}`);

const DE: DemoSprache = {
  und: ' und ',
  einleitung: /^Beim \p{Lu}\p{Ll}+ /u,
  unbekannt: /(?<![\p{L}])für (\p{Lu}\p{Ll}+)(?![\p{L}])/gu,
  postkarte: /Postkarte/,
  manteltasche: /Manteltasche/,
  fahrzeug: /(?<![\p{L}])(Saab|Volvo|Auto|Wagen)(?![\p{L}])/u,
  spaet: /zu spät/,
  frueh: /zu früh/,
  wochentag: /(?<![\p{L}])(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)(?![\p{L}])/u,
  anrede: /(?<=\p{Ll}\s)Sie(?![\p{L}])/u,
  alkoholFeld: /alkohol/i,
  verneinung: /(?<![\p{L}])(nein|kein|keinen|nicht)(?![\p{L}])/iu,
  getraenk: /(?<![\p{L}])(Aperol|Wein|Bier|Sekt|Schnaps)(?![\p{L}])/u,
  dialog: /„([^“"„]{8,})[“"]/,
  personen:
    /(?<![\p{L}])(?:[Dd]er|[Dd]ie) (?:Mann|Frau|Kollege|Kollegin|Chef|Chefin|Kunde|Kundin|Kellner|Kellnerin|Fahrer|Fahrerin)(?: am \p{Lu}\p{Ll}+)?(?![\p{L}])/gu,
  artikel: /^(der|die|das)\s+/,
  t: {
    unbekanntTitel: (n) => `»${n}« ist keiner Figur zugeordnet`,
    unbekanntErklaerung: (n, a) =>
      a === 1 ? `Der Name ${n} kommt nur hier vor und gehört zu keiner angelegten Figur.` : `Der Name ${n} kommt ${a}-mal vor und gehört zu keiner angelegten Figur.`,
    unbekanntFaden: (n) => `»${n}«`,
    postkartenTitel: 'Wer steckt die zweite Postkarte in Pauls Mantel?',
    postkartenErklaerung: (a, b) => `Die erste Postkarte taucht in Kap. ${a} auf, eine weitere in Kap. ${b}. Woher die zweite kommt, bleibt bisher unbeantwortet.`,
    postkartenFaden: 'Die Postkarten in der Manteltasche',
    treffenTitel: (n) => `Treffen mit ${n}: zu spät oder zu früh?`,
    treffenErklaerung: (a, b, n, w) =>
      `In Kap. ${a} kommt der Erzähler zu spät zum Treffen mit ${n}, in Kap. ${b} ist er viel zu früh da, und er kommt jeweils anders an${w}. Wenn beide Kapitel dasselbe Treffen meinen, widersprechen sich die Angaben.`,
    wagen: (a, fa, b, fb) => ` (Kap. ${a}: ${fa}, Kap. ${b}: ${fb})`,
    tageTitel: (namen) => `Nur ${namen.join(' und ')} ${namen.length === 1 ? 'ist' : 'sind'} verankert`,
    tageErklaerung: (nr) => `Nur ${nr.map((n) => `Kap. ${n}`).join(' und ')} ${nr.length === 1 ? 'nennt' : 'nennen'} einen Wochentag. Die Abstände zwischen den übrigen Kapiteln sind offen.`,
    anredeTitel: () => 'Großgeschriebenes „Sie“ mitten im Satz',
    anredeErklaerung: (nr) => `In Kap. ${nr} steht „Sie“ großgeschrieben mitten im Satz. Gemeint ist offenbar eine dritte Person, keine Anrede.`,
    alkoholTitel: (n) => `${n} trinkt Alkohol – laut Planung nicht`,
    alkoholErklaerung: (n, feld, wert, nr) => `In der Planung von ${n} steht unter „${feld}“: ${wert}. In Kap. ${nr} bestellt der Erzähler ein alkoholisches Getränk.`,
    vageTitel: (n) => `${n}: widersprüchliche Angaben?`,
    vageErklaerung: (n) => `Es bleibt widersprüchlich, wer ${n} ist und was in dieser Nacht passiert.`,
    raumZitat: (n) => `${n} lacht laut und verlässt den Raum`,
    raumTitel: (n) => `Verlässt ${n} den Raum zweimal?`,
    raumErklaerung: 'Die Figur verlässt den Raum, ist im nächsten Absatz aber noch da.',
    hoelzernTitel: 'Frage wirkt hölzern',
    hoelzernErklaerung: 'Besser: „Und, wie läuft es so?“ – formuliere die Frage stattdessen beiläufiger.',
    schwebe: 'Was genau geschieht, bleibt bewusst in der Schwebe.',
    keine: 'Keine.',
    gruppenBezug: (g) => `${g.join(', ')} ${g.length === 1 ? 'taucht' : 'tauchen'} im Kapitel auf.`,
    unbekanntVorschlag: (n) => `»${n}« wird genannt, gehört aber zu keiner angelegten Figur.`,
    personVorschlag: 'Eine Person ohne Namen, die keiner angelegten Figur entspricht.',
    schreibweiseVorschlag: (n) => `Andere Schreibweise von „${n}“.`,
  },
  figuren: [
    { name: 'Paul', aliase: [], rolle: 'haupt', kurz: 'Architekt, Hauptfigur', belege: [['grundriss', 'Paul schneidet mit dem Skalpell das letzte Fenster aus.'], ['fassade', 'Paul sagt, er kümmert sich darum.']] },
    { name: 'Ole', aliase: [], rolle: 'neben', kurz: 'Kollege von Paul', belege: [['grundriss', 'Ole sitzt auf der Fensterbank neben dem Oleander und isst einen Apfel.']] },
    { name: 'Malte', aliase: [], rolle: 'neben', kurz: 'Kollege, zeigt Ansichten', belege: [['fassade', 'Malte zeigt die Ansichten für Nordhaven.']] },
    { name: 'Konrad', aliase: [], rolle: 'neben', kurz: 'leitet das Meeting', belege: [['fassade', 'Konrad kommt als Letzter und schließt die Tür hinter sich.']] },
    { name: 'Herr Kessler', aliase: ['Herrn Kessler'], rolle: 'neben', kurz: 'Investor von Nordhaven', belege: [['fassade', 'Er berichtet, dass Herr Kessler die ganze Fassade aus Glas haben will, ohne einen einzigen Backstein.']] },
    { name: 'Lotte', aliase: [], rolle: 'haupt', kurz: 'Kleinanzeige', belege: [['lotte', 'Die Verkäuferin hieß Lotte und hat ihm geholfen, ihn die vier Stockwerke hinaufzutragen.']] },
    { name: 'Vera', aliase: [], rolle: 'neben', kurz: 'Verabredung im Restaurant', belege: [['ebbe', 'Vera erzählt von ihrer Werkstatt, in der sie alte Orgeln restauriert, Paul hört nur halb zu.']] },
    { name: 'Die Fremde', aliase: [], rolle: 'neben', kurz: 'im Fährhaus', belege: [['bis-bald', 'Die Fremde auf der Bank gegenüber schläft noch, eingewickelt in einen gelben Regenmantel.']] },
    { name: 'Alter Mann am Kai', aliase: ['alter Mann'], rolle: 'neben', kurz: 'am Kai', belege: [['ebbe', 'Ein alter Mann bleibt neben ihm stehen und fragt, ob er sich verlaufen habe.']] },
    { name: 'Fiete', aliase: [], rolle: 'neben', kurz: 'nur erwähnt', belege: [['funkstille', 'ob er die Krabben wieder für Fiete mitnimmt']] },
    { name: 'Der Mann am Fischstand', aliase: [], rolle: 'neben', kurz: 'Verkäufer am Fischstand', belege: [['funkstille', 'Der Mann am Fischstand fragt, ob er die Krabben wieder für Fiete mitnimmt.']] },
    // absichtlich ungültig: erfundenes Zitat
    { name: 'Oles Schwester', aliase: [], rolle: 'neben', kurz: 'ruft Ole an', belege: [['grundriss', 'Oles Schwester ruft an und fragt nach dem Schlüssel.']] },
  ],
  orte: [
    { name: 'Büro', aliase: [], in: '', belege: [['weissraum', 'Am Montag ist im Büro jeder Zeichentisch voller Papierrollen und Kaffeebecher, nur auf Pauls Tisch liegt nichts.']] },
    { name: 'Teeküche', aliase: [], in: 'Büro', belege: [['grundriss', 'Auf dem langen Tisch in der Teeküche steht das Modell des alten Speichers, dreißig Zentimeter hoch, aus grauer Pappe.']] },
    { name: 'Zeichensaal', aliase: [], in: 'Büro', belege: [['fassade', 'Im Zeichensaal hängen die Pläne schon an der Glaswand, als Paul hereinkommt.']] },
    { name: 'Pauls Wohnung', aliase: [], in: '', belege: [['lotte', 'In Pauls Wohnung riecht es nach Terpentin und frischem Kaffee.']] },
    { name: 'Lindenhof', aliase: ['Linden-Hof'], in: '', belege: [['lotte', 'fährt mit seinem alten Saab 900 zum Lindenhof']] },
    { name: 'Fährhaus', aliase: [], in: '', belege: [['bis-bald', 'Paul wacht auf einer Holzbank im Fährhaus auf, den Kopf an der kalten Scheibe.']] },
    { name: 'Kornspeicher', aliase: [], in: '', belege: [['staub', 'Im Kornspeicher liegt der Staub von hundert Jahren auf den Dielen.']] },
    { name: 'Fischstand', aliase: [], in: '', belege: [['funkstille', 'Erst am Fischstand dreht er sie um']] },
    { name: 'Fischrestaurant', aliase: [], in: '', belege: [['ebbe', 'Das Fischrestaurant liegt zwei Straßen hinter dem Linden Hof.']] },
    { name: 'Nordkai', aliase: [], in: '', belege: [['fassade', 'Auf dem Tisch liegt die Morgenzeitung, die Schlagzeile quer über der Titelseite: Werfthalle am Nordkai verkauft.']] },
  ],
  beziehungen: [
    { von: 'Ole', zu: 'Paul', art: 'Kollege', kategorie: 'arbeit', unsicher: false, belege: [['grundriss', 'Ole sitzt auf der Fensterbank neben dem Oleander und isst einen Apfel.']], begruendung: 'Beide sind in der Teeküche, Ole fragt, was Nordhaven zu den Fenstern sagt.' },
    { von: 'Malte', zu: 'Paul', art: 'Kollege', kategorie: 'arbeit', unsicher: false, belege: [['fassade', 'Malte zeigt die Ansichten für Nordhaven.']], begruendung: 'Malte und Paul sitzen im selben Meeting zum Nordhaven-Auftrag.' },
    { von: 'Konrad', zu: 'Paul', art: 'Chef', kategorie: 'arbeit', unsicher: false, belege: [['fassade', 'Konrad will die neuen Zeichnungen bis Monatsende sehen.']], begruendung: 'Konrad verteilt im Meeting die Aufgaben, Paul übernimmt die Glasfassade.' },
    { von: 'Herr Kessler', zu: 'Paul', art: 'Kunde', kategorie: 'arbeit', unsicher: true, belege: [['fassade', 'Er berichtet, dass Herr Kessler die ganze Fassade aus Glas haben will, ohne einen einzigen Backstein.']], begruendung: 'Herr Kessler tritt nicht auf, seine Forderung wird im Meeting weitergegeben.' },
    { von: 'Lotte', zu: 'Paul', art: 'Kleinanzeige', kategorie: 'dates', unsicher: false, belege: [['lotte', 'Die Verkäuferin hieß Lotte und hat ihm geholfen, ihn die vier Stockwerke hinaufzutragen.']], begruendung: 'Lotte hat Paul über Kleinanzeigen einen Zeichentisch verkauft, seitdem schreiben sie sich.' },
    { von: 'Vera', zu: 'Paul', art: 'Verabredung', kategorie: 'dates', unsicher: false, belege: [['ebbe', 'Vera erzählt von ihrer Werkstatt, in der sie alte Orgeln restauriert, Paul hört nur halb zu.']], begruendung: 'Paul und Vera essen gemeinsam im Fischrestaurant.' },
    { von: 'Die Fremde', zu: 'Paul', art: 'Nacht im Fährhaus', kategorie: 'dates', unsicher: false, belege: [['bis-bald', 'Die Fremde auf der Bank gegenüber schläft noch, eingewickelt in einen gelben Regenmantel.']], begruendung: 'Paul wacht im Fährhaus auf, sie schläft auf der Bank gegenüber.' },
    { von: 'Herr Kessler', zu: 'Konrad', art: 'Kunde', kategorie: 'arbeit', unsicher: false, belege: [['fassade', 'Er berichtet, dass Herr Kessler die ganze Fassade aus Glas haben will, ohne einen einzigen Backstein.']], begruendung: 'Konrad gibt die Forderung von Herrn Kessler weiter.' },
    { von: 'Malte', zu: 'Ole', art: 'Kollege', kategorie: 'arbeit', unsicher: false, belege: [['fassade', 'Malte hat den Beamer angeschlossen, Ole ist heute auf der Baustelle.']], begruendung: 'Beide gehören zum Team im Zeichensaal.' },
    { von: 'Paul', zu: 'Fiete', art: 'kauft für ihn ein', kategorie: 'sonstige', unsicher: true, belege: [['funkstille', 'ob er die Krabben wieder für Fiete mitnimmt']], begruendung: 'Der Mann am Fischstand fragt, ob Paul die Krabben wieder für Fiete mitnimmt; Fiete selbst tritt nicht auf.' },
    { von: 'Der Mann am Fischstand', zu: 'Paul', art: 'kennt ihn vom Fischstand', kategorie: 'sonstige', unsicher: false, belege: [['funkstille', 'Der Mann am Fischstand fragt, ob er die Krabben wieder für Fiete mitnimmt.']], begruendung: 'Der Mann am Fischstand spricht Paul auf frühere Einkäufe an.' },
    { von: 'Alter Mann am Kai', zu: 'Paul', art: 'Passant', kategorie: 'sonstige', unsicher: true, belege: [['ebbe', 'Ein alter Mann bleibt neben ihm stehen und fragt, ob er sich verlaufen habe.']], begruendung: 'Er spricht Paul am Kai an; Paul hat ihn vorher nicht kommen hören.' },
    // absichtlich ungültig: erfundenes Zitat, Ersatztext, unbekannte Figur
    { von: 'Vera', zu: 'Ole', art: 'Ex-Freundin', kategorie: 'dates', unsicher: false, belege: [['ebbe', 'Vera war früher mit Ole zusammen.']], begruendung: 'Vera kennt Ole von früher.' },
    { von: 'Lotte', zu: 'Vera', art: 'Freundin', kategorie: 'sonstige', unsicher: false, belege: [['ebbe', 'Vera nickt, und er verspricht']], begruendung: 'Besser: „Lotte kennt Vera aus der Schule“ – formuliere die Szene stattdessen deutlicher.' },
    { von: 'Paul', zu: 'Hafenmeister', art: 'Bekannter', kategorie: 'sonstige', unsicher: true, belege: [['funkstille', 'Vor dem Stand hält ein grauer Lieferwagen mit der Aufschrift Kranich.']], begruendung: 'Der Hafenmeister kennt Paul.' },
  ],
};

const EN: DemoSprache = {
  und: ' and ',
  einleitung: /^(?!)/u,
  unbekannt: /(?<![\p{L}])for (\p{Lu}\p{Ll}+)(?![\p{L}])/gu,
  postkarte: /postcard/,
  manteltasche: /coat pocket/,
  fahrzeug: /(?<![\p{L}])(Saab|Volvo|car)(?![\p{L}])/u,
  spaet: /(?<![\p{L}])(?:be|too) late(?![\p{L}])/u,
  frueh: /(?<![\p{L}])(?:too|half an hour) early(?![\p{L}])/u,
  wochentag: /(?<![\p{L}])(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?![\p{L}])/u,
  anrede: /(?<=\p{Ll}\s)(?:Her|Him|She|He)(?![\p{L}])/u,
  alkoholFeld: /alcohol/i,
  verneinung: /(?<![\p{L}])(no|not|never|doesn['’]t)(?![\p{L}])/iu,
  getraenk: /(?<![\p{L}])(Aperol|wine|beer|champagne|whisky|gin)(?![\p{L}])/u,
  dialog: /“([^”"“]{8,})[”"]/,
  personen: /(?<![\p{L}])[Tt]he (?:man|woman|colleague|boss|customer|waiter|waitress|driver)(?: at the \p{Ll}+(?: \p{Ll}+)?)?(?![\p{L}])/gu,
  artikel: /^the\s+/,
  t: {
    unbekanntTitel: (n) => `“${n}” isn’t assigned to any character`,
    unbekanntErklaerung: (n, a) =>
      a === 1
        ? `The name ${n} only appears here and doesn’t belong to any character you have created.`
        : `The name ${n} appears ${a} times and doesn’t belong to any character you have created.`,
    unbekanntFaden: (n) => `“${n}”`,
    postkartenTitel: 'Who put the second postcard in Paul’s coat?',
    postkartenErklaerung: (a, b) => `The first postcard turns up in Ch. ${a}, another one in Ch. ${b}. Where the second one comes from is still unanswered.`,
    postkartenFaden: 'The postcards in the coat pocket',
    treffenTitel: (n) => `Meeting with ${n}: late or early?`,
    treffenErklaerung: (a, b, n, w) =>
      `In Ch. ${a} the narrator is late for the meeting with ${n}, in Ch. ${b} he is far too early, and he arrives differently each time${w}. If both chapters mean the same meeting, the details contradict each other.`,
    wagen: (a, fa, b, fb) => ` (Ch. ${a}: ${fa}, Ch. ${b}: ${fb})`,
    tageTitel: (namen) => `Only ${namen.join(' and ')} ${namen.length === 1 ? 'is' : 'are'} anchored`,
    tageErklaerung: (nr) => `Only ${nr.map((n) => `Ch. ${n}`).join(' and ')} ${nr.length === 1 ? 'names' : 'name'} a weekday. The gaps between the other chapters are open.`,
    anredeTitel: (w) => `Capitalised “${w}” mid-sentence`,
    anredeErklaerung: (nr, w) => `In Ch. ${nr} “${w}” is capitalised in the middle of a sentence. It apparently refers to a person, it isn’t a name.`,
    alkoholTitel: (n) => `${n} drinks alcohol – not according to the plan`,
    alkoholErklaerung: (n, feld, wert, nr) => `In the plan for ${n}, “${feld}” says: ${wert}. In Ch. ${nr} the narrator orders an alcoholic drink.`,
    vageTitel: (n) => `${n}: contradictory details?`,
    vageErklaerung: (n) => `It remains contradictory who ${n} is and what happens that night.`,
    raumZitat: (n) => `${n} laughs out loud and leaves the room`,
    raumTitel: (n) => `Does ${n} leave the room twice?`,
    raumErklaerung: 'The character leaves the room but is still there in the next paragraph.',
    hoelzernTitel: 'Question sounds wooden',
    hoelzernErklaerung: 'Better: “So, how’s it going?” – phrase the question more casually instead.',
    schwebe: 'What exactly happens is deliberately left open.',
    keine: 'None.',
    gruppenBezug: (g) => `${liste(g, ' and ')} ${g.length === 1 ? 'appears' : 'appear'} in the chapter.`,
    unbekanntVorschlag: (n) => `“${n}” is mentioned but doesn’t belong to any character you have created.`,
    personVorschlag: 'A person without a name who doesn’t match any character you have created.',
    schreibweiseVorschlag: (n) => `Different spelling of “${n}”.`,
  },
  figuren: [
    { name: 'Paul', aliase: [], rolle: 'haupt', kurz: 'Architect, main character', belege: [['floor-plan', 'Paul cuts out the last window with the scalpel.'], ['facade', 'Paul says he’ll take care of it.']] },
    { name: 'Ole', aliase: [], rolle: 'neben', kurz: 'Paul’s colleague', belege: [['floor-plan', 'Ole sits on the windowsill next to the oleander and eats an apple.']] },
    { name: 'Malte', aliase: [], rolle: 'neben', kurz: 'Colleague, shows elevations', belege: [['facade', 'Malte shows the elevations for Nordhaven.']] },
    { name: 'Konrad', aliase: [], rolle: 'neben', kurz: 'runs the meeting', belege: [['facade', 'Konrad comes in last and closes the door behind him.']] },
    { name: 'Mr Kessler', aliase: [], rolle: 'neben', kurz: 'Investor at Nordhaven', belege: [['facade', 'He reports that Mr Kessler wants the whole facade in glass, without a single brick.']] },
    { name: 'Lotte', aliase: [], rolle: 'haupt', kurz: 'Classified ad', belege: [['lotte', 'The seller was called Lotte and helped him carry it up the four flights of stairs.']] },
    { name: 'Vera', aliase: [], rolle: 'neben', kurz: 'Date at the restaurant', belege: [['low-tide', 'Vera talks about her workshop, where she restores old organs, Paul is only half listening.']] },
    { name: 'The Stranger', aliase: [], rolle: 'neben', kurz: 'in the ferry house', belege: [['see-you-soon', 'The Stranger on the bench opposite is still asleep, wrapped in a yellow raincoat.']] },
    { name: 'Old Man on the Quay', aliase: ['old man'], rolle: 'neben', kurz: 'on the quay', belege: [['low-tide', 'An old man stops beside him and asks whether he has lost his way.']] },
    { name: 'Fiete', aliase: [], rolle: 'neben', kurz: 'only mentioned', belege: [['radio-silence', 'whether the shrimps are for Fiete again']] },
    { name: 'The Man at the Fish Stall', aliase: [], rolle: 'neben', kurz: 'seller at the fish stall', belege: [['radio-silence', 'The man at the fish stall wants to know, as always, whether the shrimps are for Fiete again.']] },
    // absichtlich ungültig: erfundenes Zitat
    { name: 'Ole’s Sister', aliase: [], rolle: 'neben', kurz: 'calls Ole', belege: [['floor-plan', 'Ole’s sister calls and asks about the key.']] },
  ],
  orte: [
    { name: 'Office', aliase: [], in: '', belege: [['white-space', 'On Monday every drawing table in the office is covered in paper rolls and coffee cups, only Paul’s table is empty.']] },
    { name: 'Kitchenette', aliase: [], in: 'Office', belege: [['floor-plan', 'On the long table in the kitchenette stands the model of the old granary, thirty centimetres tall, made of grey cardboard.']] },
    { name: 'Drawing Studio', aliase: [], in: 'Office', belege: [['facade', 'In the drawing studio the plans are already hanging on the glass wall when Paul comes in.']] },
    { name: 'Paul’s Flat', aliase: [], in: '', belege: [['lotte', 'Paul’s flat smells of turpentine and fresh coffee.']] },
    { name: 'Lindenhof', aliase: ['Linden-Hof'], in: '', belege: [['lotte', 'drives his old Saab 900 to the Lindenhof']] },
    { name: 'Ferry House', aliase: [], in: '', belege: [['see-you-soon', 'Paul wakes up on a wooden bench in the ferry house, his head against the cold window.']] },
    { name: 'Granary', aliase: [], in: '', belege: [['dust', 'In the granary the dust of a hundred years lies on the floorboards.']] },
    { name: 'Fish Stall', aliase: [], in: '', belege: [['radio-silence', 'Only at the fish stall does he turn it over']] },
    { name: 'Fish Restaurant', aliase: [], in: '', belege: [['low-tide', 'The fish restaurant is two streets behind the Linden Hof.']] },
    { name: 'North Quay', aliase: [], in: '', belege: [['facade', 'On the table lies the morning paper, the headline right across the front page: Shipyard hall on the North Quay sold.']] },
  ],
  beziehungen: [
    { von: 'Ole', zu: 'Paul', art: 'Colleague', kategorie: 'arbeit', unsicher: false, belege: [['floor-plan', 'Ole sits on the windowsill next to the oleander and eats an apple.']], begruendung: 'Both are in the kitchenette, Ole asks what Nordhaven says to the windows.' },
    { von: 'Malte', zu: 'Paul', art: 'Colleague', kategorie: 'arbeit', unsicher: false, belege: [['facade', 'Malte shows the elevations for Nordhaven.']], begruendung: 'Malte and Paul are in the same meeting about the Nordhaven job.' },
    { von: 'Konrad', zu: 'Paul', art: 'Boss', kategorie: 'arbeit', unsicher: false, belege: [['facade', 'Konrad wants to see the new drawings by the end of the month.']], begruendung: 'Konrad hands out the tasks in the meeting, Paul takes on the glass facade.' },
    { von: 'Mr Kessler', zu: 'Paul', art: 'Client', kategorie: 'arbeit', unsicher: true, belege: [['facade', 'He reports that Mr Kessler wants the whole facade in glass, without a single brick.']], begruendung: 'Mr Kessler doesn’t appear himself, his demand is passed on in the meeting.' },
    { von: 'Lotte', zu: 'Paul', art: 'Classified ad', kategorie: 'dates', unsicher: false, belege: [['lotte', 'The seller was called Lotte and helped him carry it up the four flights of stairs.']], begruendung: 'Lotte sold Paul a drawing table on Kleinanzeigen, since then they have been writing to each other.' },
    { von: 'Vera', zu: 'Paul', art: 'Date', kategorie: 'dates', unsicher: false, belege: [['low-tide', 'Vera talks about her workshop, where she restores old organs, Paul is only half listening.']], begruendung: 'Paul and Vera have dinner together at the fish restaurant.' },
    { von: 'The Stranger', zu: 'Paul', art: 'Night in the ferry house', kategorie: 'dates', unsicher: false, belege: [['see-you-soon', 'The Stranger on the bench opposite is still asleep, wrapped in a yellow raincoat.']], begruendung: 'Paul wakes up in the ferry house, she is asleep on the bench opposite.' },
    { von: 'Mr Kessler', zu: 'Konrad', art: 'Client', kategorie: 'arbeit', unsicher: false, belege: [['facade', 'He reports that Mr Kessler wants the whole facade in glass, without a single brick.']], begruendung: 'Konrad passes on Mr Kessler’s demand.' },
    { von: 'Malte', zu: 'Ole', art: 'Colleague', kategorie: 'arbeit', unsicher: false, belege: [['facade', 'Malte has connected the projector, Ole is at the building site today.']], begruendung: 'Both belong to the team in the drawing studio.' },
    { von: 'Paul', zu: 'Fiete', art: 'shops for him', kategorie: 'sonstige', unsicher: true, belege: [['radio-silence', 'whether the shrimps are for Fiete again']], begruendung: 'The man at the fish stall asks whether the shrimps are for Fiete again, Fiete himself doesn’t appear.' },
    { von: 'The Man at the Fish Stall', zu: 'Paul', art: 'knows him from the fish stall', kategorie: 'sonstige', unsicher: false, belege: [['radio-silence', 'The man at the fish stall wants to know, as always, whether the shrimps are for Fiete again.']], begruendung: 'The man at the fish stall talks to Paul about earlier purchases.' },
    { von: 'Old Man on the Quay', zu: 'Paul', art: 'Passer-by', kategorie: 'sonstige', unsicher: true, belege: [['low-tide', 'An old man stops beside him and asks whether he has lost his way.']], begruendung: 'He speaks to Paul on the quay, Paul didn’t hear him coming.' },
    // absichtlich ungültig: erfundenes Zitat, Ersatztext, unbekannte Figur
    { von: 'Vera', zu: 'Ole', art: 'Ex-girlfriend', kategorie: 'dates', unsicher: false, belege: [['low-tide', 'Vera used to go out with Ole.']], begruendung: 'Vera knows Ole from before.' },
    { von: 'Lotte', zu: 'Vera', art: 'Friend', kategorie: 'sonstige', unsicher: false, belege: [['low-tide', 'Vera nods, and he promises']], begruendung: 'Better: “Lotte knows Vera from school” – make the scene clearer instead.' },
    { von: 'Paul', zu: 'Harbour master', art: 'Acquaintance', kategorie: 'sonstige', unsicher: true, belege: [['radio-silence', 'A grey van with the word Kranich on its side pulls up in front of the stall.']], begruendung: 'The harbour master knows Paul.' },
  ],
};

/** Regeln und Texte für die Buchsprache des mitgeschickten Kontexts. */
export function demoSprache(ctx: GelesenerKontext): DemoSprache {
  return ctx.sprache === 'en' ? EN : DE;
}
