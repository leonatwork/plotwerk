/*
 * Minimaler Betrachter für die Mockup-Dateien (*.dc.html), damit sie im Browser so erscheinen wie im
 * Mockup-Werkzeug: <x-dc> mit {{…}}-Platzhaltern, <sc-for list as>, <sc-if value>, onClick und setState.
 * Nur für die Design-Referenz (Vergleich, PNG-Export), nicht Teil der App.
 */
(function () {
  class DCLogic {
    constructor(neuZeichnen) {
      this.state = {};
      this.props = {};
      this._neuZeichnen = neuZeichnen;
    }
    setState(teil) {
      this.state = Object.assign({}, this.state, teil);
      this._neuZeichnen();
    }
  }
  window.DCLogic = DCLogic;

  const NUR_PLATZHALTER = /^\s*\{\{([\s\S]+?)\}\}\s*$/;
  const PLATZHALTER = /\{\{([\s\S]+?)\}\}/g;

  function auswerten(ausdruck, umfang) {
    try {
      // eslint-disable-next-line no-new-func
      return new Function('umfang', 'with (umfang) { return (' + ausdruck + '); }')(umfang);
    } catch (e) {
      return undefined;
    }
  }

  function einsetzen(text, umfang) {
    return text.replace(PLATZHALTER, function (_, a) {
      const wert = auswerten(a, umfang);
      return wert == null ? '' : String(wert);
    });
  }

  function zeichne(knoten, umfang, ziel) {
    if (knoten.nodeType === Node.TEXT_NODE) {
      ziel.appendChild(document.createTextNode(einsetzen(knoten.nodeValue, umfang)));
      return;
    }
    if (knoten.nodeType !== Node.ELEMENT_NODE) return;
    const name = knoten.localName;
    if (name === 'sc-for') {
      const liste = auswerten((knoten.getAttribute('list') || '').replace(/^\{\{|\}\}$/g, ''), umfang) || [];
      const als = knoten.getAttribute('as') || 'item';
      liste.forEach(function (eintrag, i) {
        const innen = Object.create(umfang);
        innen[als] = eintrag;
        innen.$index = i;
        knoten.childNodes.forEach(function (k) {
          zeichne(k, innen, ziel);
        });
      });
      return;
    }
    if (name === 'sc-if') {
      const wert = auswerten((knoten.getAttribute('value') || '').replace(/^\s*\{\{|\}\}\s*$/g, ''), umfang);
      if (wert) {
        knoten.childNodes.forEach(function (k) {
          zeichne(k, umfang, ziel);
        });
      }
      return;
    }
    if (name === 'helmet') return;
    const kopie = knoten.cloneNode(false);
    Array.from(knoten.attributes).forEach(function (attr) {
      if (attr.value.indexOf('{{') === -1) return;
      const nur = attr.value.match(NUR_PLATZHALTER);
      if (/^on/i.test(attr.name) && nur) {
        kopie.removeAttribute(attr.name);
        const fn = auswerten(nur[1], umfang);
        if (typeof fn === 'function') kopie.addEventListener(attr.name.slice(2).toLowerCase(), fn);
        return;
      }
      kopie.setAttribute(attr.name, einsetzen(attr.value, umfang));
    });
    knoten.childNodes.forEach(function (k) {
      zeichne(k, umfang, kopie);
    });
    ziel.appendChild(kopie);
  }

  function start() {
    const wurzel = document.querySelector('x-dc');
    if (!wurzel) return;
    const helm = wurzel.querySelector('helmet');
    if (helm) {
      Array.from(helm.children).forEach(function (k) {
        document.head.appendChild(k.cloneNode(true));
      });
    }
    const vorlage = document.createElement('div');
    Array.from(wurzel.childNodes).forEach(function (k) {
      vorlage.appendChild(k);
    });
    const skript = document.querySelector('script[type="text/x-dc"]');
    let logik = null;
    function neuZeichnen() {
      const umfang = logik ? logik.renderVals() || {} : {};
      const frag = document.createDocumentFragment();
      vorlage.childNodes.forEach(function (k) {
        zeichne(k, umfang, frag);
      });
      wurzel.replaceChildren(frag);
    }
    if (skript) {
      // eslint-disable-next-line no-new-func
      const Klasse = new Function('DCLogic', skript.textContent + '\nreturn Component;')(DCLogic);
      logik = new Klasse(neuZeichnen);
    }
    wurzel.style.display = 'block';
    neuZeichnen();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
