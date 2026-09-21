/* Rene hjelpefunksjoner som kan brukes både i nettleseren og i tester. */
(function eksporter(rot, lag) {
  const api = lag();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else rot.FelleskortetKjerne = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const ore = (n) => Math.round(Number(n) * 100) / 100;

  function normaliserTekst(verdi) {
    return String(verdi || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function postSignatur(post) {
    return [
      String(post.dato || ''),
      ore(post.belop).toFixed(2),
      normaliserTekst(post.tekst),
      normaliserTekst(post.eier),
    ].join('|');
  }

  function hash(tekst) {
    const s = String(tekst);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  /** Samme innhold gir samme fakturaavtrykk, uansett importrekkefølge. */
  function fakturaFingeravtrykk(poster) {
    return hash((poster || []).map(postSignatur).sort().join('\n'));
  }

  /**
   * Nøklene er stabile mellom nettlesere og skiller også identiske rader.
   * Forekomstnummeret er bare relevant når to rader ellers er helt like.
   */
  function transaksjonsNokler(poster, fakturaAvtrykk) {
    const fp = fakturaAvtrykk || fakturaFingeravtrykk(poster);
    const brukt = new Map();
    return (poster || []).map((post) => {
      const signatur = postSignatur(post);
      const forekomst = (brukt.get(signatur) || 0) + 1;
      brukt.set(signatur, forekomst);
      return `${fp}.${hash(signatur)}.${forekomst.toString(36)}`;
    });
  }

  const POTTTYPER = ['person', 'felles', 'utenfor'];

  /**
   * Versjon 5 bruker tabeller i stedet for gjentatte feltnavn og lar
   * mottakeren gjenskape transaksjonsnøklene. Det gjør særlig store oppgjør
   * betydelig mindre uten å fjerne noe mottakeren ser eller bruker.
   */
  function kompaktDelingsdata(data) {
    return [
      5,
      data.fra || '',
      (data.potter || []).map((p) => [p.n || '', Math.max(0, POTTTYPER.indexOf(p.t))]),
      Number.isInteger(data.betaler) ? data.betaler : -1,
      (data.fakturaer || []).map((f) => [f.n || '', f.k || '']),
      (data.poster || []).map((p) => [
        p.d || 0,
        p.x || '',
        Math.round(Number(p.b) * 100),
        p.e || 0,
        Number.isInteger(p.f) ? p.f : 0,
        Number.isInteger(p.p) ? p.p : -1,
      ]),
    ];
  }

  /** Gjør versjon 5 om til samme form resten av appen bruker for versjon 4. */
  function utvidDelingsdata(data) {
    if (!Array.isArray(data) || data[0] !== 5 || !Array.isArray(data[2])
      || !Array.isArray(data[4]) || !Array.isArray(data[5])) return data;
    return {
      v: 5,
      fra: data[1] || '',
      potter: data[2].map((p) => ({ n: p[0] || '', t: POTTTYPER[p[1]] || 'person' })),
      betaler: data[3],
      fakturaer: data[4].map((f) => ({ n: f[0] || '', k: f[1] || '' })),
      poster: data[5].map((p) => ({
        d: p[0] || '', x: p[1] || '', b: Number(p[2]) / 100,
        e: p[3] || '', f: p[4], p: p[5],
      })),
    };
  }

  /** Fordeler fellesbeløpet og lar siste person ta avrundingsresten. */
  function fordelAndeler(personer, fellesSum) {
    const liste = (personer || []).map((p) => ({ ...p }));
    if (!liste.length) return [];
    const felles = ore(fellesSum);
    const total = ore(liste.reduce((sum, p) => sum + ore(p.egne), 0) + felles);
    let brukt = 0;
    liste.forEach((person, i) => {
      if (i === liste.length - 1) return;
      person.del = ore(felles / liste.length);
      person.betaler = ore(ore(person.egne) + person.del);
      brukt = ore(brukt + person.betaler);
    });
    const siste = liste[liste.length - 1];
    siste.betaler = ore(total - brukt);
    siste.del = ore(siste.betaler - ore(siste.egne));
    return liste;
  }

  /** Finner postene der to fordelinger peker på ulike pottnavn. */
  function finnUenigheter(poster, denAndresTildeling, finnPottNavn) {
    const deres = denAndresTildeling || {};
    return (poster || [])
      .filter((post) => {
        const deresNavn = deres[post.id];
        if (!deresNavn || !post.pott) return false;
        const mittNavn = finnPottNavn(post.pott);
        return String(mittNavn || '').toLowerCase() !== String(deresNavn).toLowerCase();
      })
      .map((post) => post.id);
  }

  return {
    fakturaFingeravtrykk,
    finnUenigheter,
    fordelAndeler,
    hash,
    kompaktDelingsdata,
    normaliserTekst,
    postSignatur,
    transaksjonsNokler,
    utvidDelingsdata,
  };
}));
