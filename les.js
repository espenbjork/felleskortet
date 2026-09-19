/* ============================================================
   KORTSVEIP · INNLESING
   Gjør en regning om til en liste utgifter, uansett hvilken
   form banken serverer den i.

     lesFil(File)      → {poster, kol, kilde, ...}   xlsx, csv, txt
     lesTekst(streng)  → samme, for limt inn tekst

   Fire strategier prøves, og den som finner flest utgifter
   vinner: regneark, avgrenset tabell, én linje per kjøp, og
   loddrett lim der dato, tekst og beløp står under hverandre.

   Ingen avhengigheter. Xlsx pakkes ut med DecompressionStream,
   som alle nyere nettlesere har.
   ============================================================ */
'use strict';

/* ─── Tall ──────────────────────────────────────────────── */

/**
 * «1 234,56» «1.234,56» «-438,20» «438.20» «kr 1 234» «(120,00)» «120,00-»
 * Returnerer null hvis strengen ikke er et tall.
 */
function tilTall(verdi) {
  if (typeof verdi === 'number') return Number.isFinite(verdi) ? verdi : null;
  if (verdi == null) return null;

  let t = String(verdi).replace(/[   ]/g, ' ').trim();
  if (!t) return null;

  let negativ = false;
  if (/^\(.*\)$/.test(t)) { negativ = true; t = t.slice(1, -1).trim(); }
  t = t.replace(/\b(kr|nok)\b/gi, '').replace(/−/g, '-').trim();
  if (/^[-–]/.test(t)) { negativ = true; t = t.replace(/^[-–]\s*/, ''); }
  if (/[-–]$/.test(t)) { negativ = true; t = t.replace(/\s*[-–]$/, ''); }
  if (!/^[\d\s.,']*\d[\d\s.,']*$/.test(t)) return null;

  t = t.replace(/[\s']/g, '');

  const sisteKomma = t.lastIndexOf(',');
  const sistePunkt = t.lastIndexOf('.');
  let desimal = -1;
  if (sisteKomma >= 0 && sistePunkt >= 0) {
    desimal = Math.max(sisteKomma, sistePunkt);
  } else if (sisteKomma >= 0 || sistePunkt >= 0) {
    const pos = Math.max(sisteKomma, sistePunkt);
    const bak = t.length - pos - 1;
    const antall = (t.match(/[.,]/g) || []).length;
    if (antall === 1 && bak >= 1 && bak <= 2) desimal = pos;
  }

  let heltall; let brok = '';
  if (desimal >= 0) {
    heltall = t.slice(0, desimal).replace(/[.,]/g, '');
    brok = t.slice(desimal + 1).replace(/[.,]/g, '');
  } else {
    heltall = t.replace(/[.,]/g, '');
  }
  if (!heltall && !brok) return null;

  const tall = Number(`${heltall || '0'}.${brok || '0'}`);
  if (!Number.isFinite(tall)) return null;
  return negativ ? -tall : tall;
}

/* ─── Datoer ────────────────────────────────────────────── */

const MAANEDER = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli',
  'august', 'september', 'oktober', 'november', 'desember'];

/** Regneark lagrer datoer som dagnummer siden 30.12.1899. */
function serieTilDato(n) {
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** «31 . 08 . 26» → «31.08.26». Amex setter luft rundt punktumene. */
const stramDato = (t) => String(t).replace(/(\d)\s*([./-])\s*(\d)/g, '$1$2$3');

/** Tolker dato. Returnerer ISO (yyyy-mm-dd) eller null. */
function tilDato(verdi) {
  if (verdi == null) return null;
  // Heltall i dagnummer-området kommer fra et regneark.
  if (typeof verdi === 'number') {
    return Number.isInteger(verdi) && verdi > 20000 && verdi < 60000 ? serieTilDato(verdi) : null;
  }
  const t = stramDato(String(verdi).trim());
  if (!t) return null;

  const lag = (aa, mm, dd) => {
    const y = Number(aa); const m = Number(mm); const d = Number(dd);
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
    if (y < 1990 || y > 2100) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  let m;
  if ((m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return lag(m[1], m[2], m[3]);
  if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    const aa = m[3].length === 2 ? String(2000 + Number(m[3])) : m[3];
    return lag(aa, m[2], m[1]);
  }
  if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})\.?$/))) {
    return lag(String(new Date().getFullYear()), m[2], m[1]);
  }
  if ((m = t.match(/^(\d{1,2})\.?\s*([a-zæøå]{3,})\.?\s*(\d{4})?$/i))) {
    const i = MAANEDER.findIndex((n) => n.startsWith(m[2].toLowerCase().slice(0, 3)));
    if (i >= 0) return lag(m[3] || String(new Date().getFullYear()), i + 1, m[1]);
  }
  return null;
}

const erDato = (s) => tilDato(s) !== null;
const erTall = (s) => tilTall(s) !== null;

/* ─── Xlsx ──────────────────────────────────────────────── */
/* Et regneark er en zip med XML i. Vi leser sentralkatalogen,
   blåser opp de to filene vi trenger, og plukker cellene ut. */

function finnFiler(buffer) {
  const dv = new DataView(buffer);
  let eocd = -1;
  const minst = Math.max(0, dv.byteLength - 65557);
  for (let i = dv.byteLength - 22; i >= minst; i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Fila ser ikke ut som et regneark.');

  const antall = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const filer = {};
  for (let i = 0; i < antall; i += 1) {
    if (p + 46 > dv.byteLength || dv.getUint32(p, true) !== 0x02014b50) break;
    const metode = dv.getUint16(p + 10, true);
    const komprimert = dv.getUint32(p + 20, true);
    const navnLen = dv.getUint16(p + 28, true);
    const ekstraLen = dv.getUint16(p + 30, true);
    const kommLen = dv.getUint16(p + 32, true);
    const lokal = dv.getUint32(p + 42, true);
    const navn = new TextDecoder().decode(new Uint8Array(buffer, p + 46, navnLen));
    filer[navn] = { metode, komprimert, lokal };
    p += 46 + navnLen + ekstraLen + kommLen;
  }
  return filer;
}

async function pakkUt(buffer, f) {
  const dv = new DataView(buffer);
  const navnLen = dv.getUint16(f.lokal + 26, true);
  const ekstraLen = dv.getUint16(f.lokal + 28, true);
  const start = f.lokal + 30 + navnLen + ekstraLen;
  const rå = new Uint8Array(buffer, start, f.komprimert);
  if (f.metode === 0) return new TextDecoder().decode(rå);
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Nettleseren din kan ikke pakke ut regneark. Lagre fila som CSV i stedet.');
  }
  const strøm = new Blob([rå]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(strøm).arrayBuffer());
}

/** «BC12» → 54. Kolonnebokstavene er base-26. */
function kolonneNr(ref) {
  const m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return -1;
  let n = 0;
  for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Leser første ark og gir tilbake rader som lister med celleverdier. */
async function lesXlsx(buffer) {
  const filer = finnFiler(buffer);
  const arkNavn = Object.keys(filer)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()[0];
  if (!arkNavn) throw new Error('Fant ingen ark i regnearket.');

  const tolk = new DOMParser();
  let delte = [];
  if (filer['xl/sharedStrings.xml']) {
    const doc = tolk.parseFromString(await pakkUt(buffer, filer['xl/sharedStrings.xml']), 'application/xml');
    delte = Array.from(doc.getElementsByTagName('si')).map((si) => Array.from(si.getElementsByTagName('t'))
      .map((t) => t.textContent).join(''));
  }

  const ark = tolk.parseFromString(await pakkUt(buffer, filer[arkNavn]), 'application/xml');
  const rader = [];
  for (const rad of Array.from(ark.getElementsByTagName('row'))) {
    const ut = [];
    for (const celle of Array.from(rad.getElementsByTagName('c'))) {
      const i = kolonneNr(celle.getAttribute('r'));
      if (i < 0) continue;
      const type = celle.getAttribute('t');
      const v = celle.getElementsByTagName('v')[0];
      let verdi = '';
      if (type === 's') verdi = delte[Number(v ? v.textContent : -1)] || '';
      else if (type === 'inlineStr') {
        verdi = Array.from(celle.getElementsByTagName('t')).map((t) => t.textContent).join('');
      } else if (v) {
        const tall = Number(v.textContent);
        verdi = Number.isFinite(tall) && type !== 'str' ? tall : v.textContent;
      }
      ut[i] = verdi;
    }
    for (let i = 0; i < ut.length; i += 1) if (ut[i] === undefined) ut[i] = '';
    if (ut.some((c) => String(c).trim() !== '')) rader.push(ut);
  }
  return rader;
}

/* ─── Avgrenset tekst ───────────────────────────────────── */

function splittRader(tekst, skille) {
  const rader = []; let rad = []; let felt = ''; let iSitat = false;
  for (let i = 0; i < tekst.length; i += 1) {
    const c = tekst[i];
    if (iSitat) {
      if (c === '"') {
        if (tekst[i + 1] === '"') { felt += '"'; i += 1; } else iSitat = false;
      } else felt += c;
    } else if (c === '"') iSitat = true;
    else if (c === skille) { rad.push(felt); felt = ''; }
    else if (c === '\n') { rad.push(felt); rader.push(rad); rad = []; felt = ''; }
    else if (c !== '\r') felt += c;
  }
  rad.push(felt); rader.push(rad);
  return rader
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''));
}

function gjettSkilletegn(tekst) {
  const linjer = tekst.split('\n').filter((l) => l.trim()).slice(0, 25);
  if (!linjer.length) return null;
  let best = null; let bestPoeng = 0;
  for (const d of [';', '\t', ',', '|']) {
    const tellinger = linjer.map((l) => (l.split(d).length - 1)).sort((x, y) => x - y);
    const median = tellinger[Math.floor(tellinger.length / 2)];
    if (median >= 1 && median > bestPoeng) { bestPoeng = median; best = d; }
  }
  return best;
}

/* ─── Kolonner ──────────────────────────────────────────── */

const HODE = {
  dato: /^(dato|date|bokf|transaksjonsdato|kjøpsdato|kjopsdato|betalingsdato|rentedato|valuteringsdato|posted|trans.?date)/i,
  tekst: /(tekst|beskriv|forklar|spesifikasjon|melding|merchant|butikk|brukssted|sted|detalj|narrative|description|title|mottaker)/i,
  belop: /^(bel(ø|o)p|amount|sum|verdi|value|transaksjonsbel)/i,
  ut: /(ut fra konto|uttak|debet|debit|belastet|ut\b)/i,
  inn: /(inn p(å|a) konto|innskudd|kredit|credit|godskrevet|inn\b)/i,
  hopp: /(valuta|currency|kurs|rate|saldo|balance|kontonr|kontonummer|referanse|arkiv|status|kategori|melding til|utl\.?\s*bel)/i,
};

/** Kolonnen som gir høyest snittpoeng, utenom de i «unntatt». */
function beste(rader, bredde, poeng, unntatt = []) {
  let best = -1; let bestSum = 0;
  for (let k = 0; k < bredde; k += 1) {
    if (unntatt.includes(k)) continue;
    let sum = 0;
    for (const r of rader) sum += poeng(r[k] == null ? '' : r[k]);
    if (sum > bestSum) { bestSum = sum; best = k; }
  }
  return bestSum > 0 ? best : -1;
}

/**
 * Finner dato-, tekst- og beløpskolonnen. Leter etter en overskriftsrad
 * først, og gjetter ut fra innholdet hvis den ikke finnes. Overskriftsrada
 * trenger ikke stå først: fakturaer har gjerne flere bolker under
 * hverandre, én per kort.
 */
function finnKolonner(rader) {
  const bredde = Math.max(...rader.map((r) => r.length));

  let hodeRad = -1;
  for (let i = 0; i < Math.min(rader.length, 40); i += 1) {
    const r = rader[i].map((c) => String(c));
    if (r.length >= 2 && r.some((c) => HODE.dato.test(c))
        && r.some((c) => HODE.belop.test(c) || HODE.ut.test(c) || HODE.inn.test(c))) {
      hodeRad = i; break;
    }
  }

  if (hodeRad >= 0) {
    const hode = rader[hodeRad].map((c) => String(c));
    const finn = (re, unntak) => hode.findIndex((c) => re.test(c) && !(unntak && unntak.test(c)));
    const kol = {
      dato: finn(HODE.dato),
      tekst: finn(HODE.tekst),
      belop: finn(HODE.belop, HODE.hopp),
      ut: finn(HODE.ut, HODE.hopp),
      inn: finn(HODE.inn, HODE.hopp),
    };
    if (kol.dato >= 0 && (kol.belop >= 0 || kol.ut >= 0)) {
      if (kol.tekst < 0) {
        kol.tekst = beste(rader, bredde, (v) => (/[a-zæøå]{3}/i.test(String(v)) ? String(v).length : 0),
          [kol.dato, kol.belop, kol.ut, kol.inn]);
      }
      // Alle rader er kandidater, ikke bare de under den første overskriften.
      return { ...kol, hode, datarader: rader };
    }
  }

  const dato = beste(rader, bredde, (v) => (erDato(v) ? 1 : 0));
  const belop = beste(rader, bredde, (v) => {
    const n = tilTall(v);
    if (n === null || erDato(v)) return 0;
    return /[.,]\d{2}\s*$/.test(String(v)) || !Number.isInteger(n) ? 2 : 1;
  }, [dato]);
  const tekst = beste(rader, bredde, (v) => (/[a-zæøå]{3}/i.test(String(v)) ? Math.min(String(v).length, 40) : 0), [dato, belop]);
  return { dato, tekst, belop, ut: -1, inn: -1, hode: null, datarader: rader };
}

/* Fakturaer med flere kort har en rad per korteier:
   «540185******6963 | Victoria Steen». Vi noterer hvem radene under
   tilhører, så kortet kan vise det. */
const KORTEIER = /^\d{4,6}\*{2,}\d{3,4}$/;
// Amex: «Nye transaksjoner for Espen Bjørk Kort som slutter med 71019»
const KORTEIER_LINJE = /^nye transaksjoner for\s+(.+?)(?:\s+kort som slutter.*)?$/i;

function byggPost(rad, kol) {
  const hent = (i) => (i >= 0 && rad[i] != null ? rad[i] : '');
  const streng = (i) => String(hent(i)).trim();

  let belop = null;
  if (kol.belop >= 0) belop = tilTall(hent(kol.belop));
  if (belop === null && kol.ut >= 0) {
    const ut = tilTall(hent(kol.ut));
    const inn = kol.inn >= 0 ? tilTall(hent(kol.inn)) : null;
    if (ut !== null && ut !== 0) belop = -Math.abs(ut);
    else if (inn !== null && inn !== 0) belop = Math.abs(inn);
  }
  if (belop === null || belop === 0) return null;

  const dato = tilDato(hent(kol.dato));
  if (!dato) return null;   // uten dato er det som regel en sum- eller notatrad

  const tekst = streng(kol.tekst) || rad.filter((c) => /[a-zæøå]{3}/i.test(String(c))).join(' ').trim();
  if (!tekst) return null;

  return { dato, tekst: tekst.replace(/\s+/g, ' '), belop };
}

function lesTabellrader(rader, overstyr) {
  const auto = finnKolonner(rader);
  const kol = overstyr ? { ...auto, ...overstyr, ut: -1, inn: -1 } : auto;
  const poster = [];
  let eier = null;
  for (const rad of kol.datarader) {
    const første = String(rad[0] == null ? '' : rad[0]).trim();
    if (KORTEIER.test(første)) {
      const navn = rad.slice(1).map((c) => String(c).trim()).find((c) => /[a-zæøå]{2}/i.test(c));
      eier = navn || null;
      continue;
    }
    const p = byggPost(rad, kol);
    if (p) poster.push(eier ? { ...p, eier } : p);
  }
  return poster.length ? { poster, kol, kilde: 'tabell' } : null;
}

function lesTabell(tekst, overstyr) {
  const skille = gjettSkilletegn(tekst);
  if (!skille) return null;
  const rader = splittRader(tekst, skille);
  if (rader.length < 2) return null;
  return lesTabellrader(rader, overstyr);
}

/* ─── Limt inn tekst ────────────────────────────────────── */

/** Én transaksjon per linje. */
function lesLinjer(tekst) {
  const poster = [];
  for (const rå of tekst.split('\n')) {
    const linje = rå.replace(/[  ]/g, ' ').trim();
    if (!linje || linje.length < 4) continue;

    // Beløpet må starte på egen ordgrense, ellers napper vi siste siffer
    // i en referanse: «SPOTIFY P1A2B3C4 139,00» er 139,00, ikke 4 139,00.
    const m = linje.match(/^(.*?)(?:^|\s)(-?\s?(?:kr\s*)?(?:\d{1,3}(?:[ .']\d{3})+|\d+)[.,]\d{2}\s*(?:kr|NOK)?-?)\s*$/i);
    if (!m) continue;
    const belop = tilTall(m[2]);
    if (belop === null || belop === 0) continue;

    let rest = m[1].trim();
    let dato = null;
    const dm = rest.match(/^(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|\d{4}-\d{2}-\d{2})\s+/);
    if (dm) { dato = tilDato(dm[1]); rest = rest.slice(dm[0].length).trim(); }
    const dm2 = rest.match(/^(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\s+/);
    if (dm2 && tilDato(dm2[1])) rest = rest.slice(dm2[0].length).trim();

    rest = rest.replace(/[;\t|]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/[a-zæøå]{2}/i.test(rest)) continue;
    poster.push({ dato, tekst: rest, belop });
  }
  return poster.length ? { poster, kol: null, kilde: 'linjer' } : null;
}

/** Loddrett lim: dato, tekst og beløp på hver sin linje. */
function lesBlokker(tekst) {
  const linjer = tekst.split('\n').map((l) => l.replace(/[  ]/g, ' ').trim()).filter(Boolean);
  const poster = [];
  let dato = null; let ord = [];

  const flush = (belop) => {
    const t = ord.join(' ').replace(/\s+/g, ' ').trim();
    if (t && belop !== null && belop !== 0 && /[a-zæøå]{2}/i.test(t)) poster.push({ dato, tekst: t, belop });
    ord = [];
  };

  for (const linje of linjer) {
    const somDato = /^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?\.?$|^\d{4}-\d{2}-\d{2}$/.test(linje) ? tilDato(linje) : null;
    const somTall = /^-?\s?(?:kr\s*)?\d[\d\s.']*(?:[.,]\d{1,2})?\s*(?:kr|NOK)?-?$/i.test(linje) ? tilTall(linje) : null;
    if (somDato) { if (ord.length) flush(null); dato = somDato; }
    else if (somTall !== null) flush(somTall);
    else ord.push(linje);
  }
  return poster.length ? { poster, kol: null, kilde: 'blokk' } : null;
}

/* ─── Fellesdel ─────────────────────────────────────────── */

const INNBETALING = /(innbetal|betaling\s+(mottatt|registrert)|takk for betaling|payment\s+(received|thank)|direkte\s?remittering|autogiro|avtalegiro|overf(ø|o)rt\s+fra|bankgiro|saldooverf)/i;

let løpenr = 0;
const nyId = () => `u${(løpenr += 1)}-${Math.random().toString(36).slice(2, 7)}`;

/** Gjør rå funn om til ferdige poster, med fortegn snudd riktig vei. */
function foredle(funn) {
  const nonzero = funn.poster.filter((p) => p.belop !== 0);
  const negative = nonzero.filter((p) => p.belop < 0).length;
  // Er de fleste beløpene negative, er utgifter negative. Snu, så utgifter
  // alltid er positive tall videre i appen.
  const snu = negative > nonzero.length * 0.6 ? -1 : 1;

  const poster = funn.poster.map((p) => ({
    id: nyId(),
    dato: p.dato,
    tekst: String(p.tekst).slice(0, 120),
    belop: Math.round(p.belop * snu * 100) / 100,
    eier: p.eier || null,
    pott: null,
    innbetaling: INNBETALING.test(p.tekst),
  }));

  return { poster, kol: funn.kol, kilde: funn.kilde, snudd: snu === -1 };
}

/** Leser limt inn eller opplastet tekst. */
function lesTekst(rå, overstyr) {
  const tekst = String(rå || '').replace(/^﻿/, '');
  if (!tekst.trim()) return { feil: 'Ingenting å lese. Lim inn noe, eller velg en fil.' };

  if (overstyr) {
    const t = lesTabell(tekst, overstyr);
    return t ? foredle(t) : { feil: 'Fant ingen beløp med de kolonnene. Prøv en annen.' };
  }

  const forsøk = [lesTabell(tekst), lesLinjer(tekst), lesBlokker(tekst)].filter(Boolean);
  if (!forsøk.length) {
    return { feil: 'Fant ingen beløp her. Sjekk at hver utgift har et beløp, f.eks. «438,20».' };
  }
  forsøk.sort((x, y) => y.poster.length - x.poster.length);
  return foredle(forsøk[0]);
}

/** Leser en opplastet fil: PDF, regneark, CSV eller ren tekst. */
async function lesFil(fil, overstyr) {
  if (/\.pdf$/i.test(fil.name) || /pdf/i.test(fil.type || '')) {
    try {
      const funn = lesPdfTekst(await lesPdfLinjer(await fil.arrayBuffer()));
      if (!funn) return { feil: 'Fant ingen kjøp i PDF-en. Kopier gjerne teksten fra PDF-leseren og lim den inn i stedet.' };
      return foredle(funn);
    } catch (e) {
      return { feil: e.message || 'Fikk ikke lest PDF-en.' };
    }
  }

  const erRegneark = /\.xlsx?$/i.test(fil.name)
    || /spreadsheet|excel/i.test(fil.type || '');

  if (erRegneark) {
    try {
      const rader = await lesXlsx(await fil.arrayBuffer());
      if (!rader.length) return { feil: 'Regnearket så tomt ut.' };
      const funn = lesTabellrader(rader, overstyr);
      if (!funn) return { feil: 'Fant ingen utgifter i regnearket. Sjekk at det har en dato- og en beløpskolonne.' };
      return foredle(funn);
    } catch (e) {
      return { feil: e.message || 'Fikk ikke lest regnearket.' };
    }
  }

  const buffer = await fil.arrayBuffer();
  let tekst = new TextDecoder('utf-8').decode(buffer);
  // Mange norske bankeksporter er latin-1. Bytt hvis æ, ø og å ble tegnsalat.
  if (tekst.includes('�')) {
    try { tekst = new TextDecoder('windows-1252').decode(buffer); } catch { /* behold utf-8 */ }
  }
  return lesTekst(tekst, overstyr);
}

/* ─── PDF ───────────────────────────────────────────────── */
/* En PDF er objekter med komprimerte innholdsstrømmer. Vi blåser opp
   strømmene, plukker ut teksten med posisjon, og setter den sammen til
   linjer igjen. Det holder for fakturaer satt med ekte tekst. Skannede
   PDF-er har ingen tekst å hente, og da sier vi fra. */

/** Hele fila som latin-1-streng, så vi kan lete med vanlige regexer. */
function somTekst(bytes) {
  let ut = '';
  const BIT = 0x8000;
  for (let i = 0; i < bytes.length; i += BIT) {
    ut += String.fromCharCode.apply(null, bytes.subarray(i, i + BIT));
  }
  return ut;
}

/**
 * Pakker ut og beholder det som kom ut selv om strømmen ender i søppel.
 * Mellom komprimerte data og «endstream» ligger det gjerne et linjeskift,
 * og DecompressionStream kaster på det, der andre utpakkere bare ignorerer.
 */
async function blåsOpp(bytes, format) {
  const ds = new DecompressionStream(format);
  const skriver = ds.writable.getWriter();
  skriver.write(bytes).catch(() => {});
  skriver.close().catch(() => {});

  const leser = ds.readable.getReader();
  const deler = []; let lengde = 0;
  try {
    for (;;) {
      const { value, done } = await leser.read();
      if (done) break;
      deler.push(value); lengde += value.length;
    }
  } catch { /* behold det vi rakk å få ut */ }

  const ut = new Uint8Array(lengde);
  let o = 0;
  for (const d of deler) { ut.set(d, o); o += d.length; }
  return ut;
}

/** Tar en PDF-strenglitteral og gir teksten. Takler \( \) og oktal. */
function pdfStreng(rå) {
  let ut = ''; let i = 0;
  while (i < rå.length) {
    const c = rå[i];
    if (c === '\\' && i + 1 < rå.length) {
      const n = rå[i + 1];
      if (n >= '0' && n <= '7') {
        let j = 1;
        while (j < 3 && rå[i + 1 + j] >= '0' && rå[i + 1 + j] <= '7') j += 1;
        ut += String.fromCharCode(parseInt(rå.slice(i + 1, i + 1 + j), 8));
        i += 1 + j;
        continue;
      }
      ut += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' })[n] || n;
      i += 2;
      continue;
    }
    ut += c;
    i += 1;
  }
  return ut;
}

// Td/TD flytter, Tm setter, Tj/TJ skriver.
const PDFOPS = new RegExp(
  '([-\\d.]+)\\s+([-\\d.]+)\\s+(Td|TD)'
  + '|([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s+Tm'
  + '|\\(((?:[^()\\\\]|\\\\.)*)\\)\\s*Tj'
  + '|\\[((?:[^\\[\\]\\\\]|\\\\.)*)\\]\\s*TJ', 'g');

/** Plukker ut (y, x, tekst) fra én innholdsstrøm. */
function tekstBiter(innhold, side) {
  const biter = [];
  let x = 0; let y = 0;
  PDFOPS.lastIndex = 0;
  let m;
  while ((m = PDFOPS.exec(innhold)) !== null) {
    if (m[3]) { x += Number(m[1]); y += Number(m[2]); }
    else if (m[9] !== undefined) { x = Number(m[8]); y = Number(m[9]); }
    else if (m[10] !== undefined) biter.push({ side, y: Math.round(y * 10) / 10, x, t: pdfStreng(m[10]) });
    else if (m[11] !== undefined) {
      const deler = m[11].match(/\((?:[^()\\]|\\.)*\)/g) || [];
      const t = deler.map((p) => pdfStreng(p.slice(1, -1))).join('');
      if (t.trim()) biter.push({ side, y: Math.round(y * 10) / 10, x, t });
    }
  }
  return biter;
}

/** Leser en PDF og gir tilbake tekstlinjer i leserekkefølge. */
async function lesPdfLinjer(buffer) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Nettleseren din kan ikke pakke ut PDF-er. Kopier teksten fra PDF-leseren og lim den inn i stedet.');
  }
  const hel = somTekst(new Uint8Array(buffer));
  const biter = [];
  let side = 0;
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(hel)) !== null) {
    const start = m.index + m[0].length;
    const slutt = hel.indexOf('endstream', start);
    if (slutt < 0) continue;
    const bytes = Uint8Array.from(hel.slice(start, slutt), (c) => c.charCodeAt(0) & 0xff);
    const ut = await blåsOpp(bytes, 'deflate');
    if (!ut.length) continue;                      // bilder og annet ukomprimert hopper vi over
    const innhold = somTekst(ut);
    if (!/T[jJ]/.test(innhold)) continue;
    biter.push(...tekstBiter(innhold, side));
    side += 1;
  }
  if (!biter.length) {
    throw new Error('Fant ingen tekst i PDF-en. Er den skannet, må du lime inn tallene i stedet.');
  }

  // Samle biter med samme y til linjer.
  const grupper = new Map();
  for (const b of biter) {
    const n = `${b.side}|${b.y}`;
    if (!grupper.has(n)) grupper.set(n, []);
    grupper.get(n).push(b);
  }
  const linjer = Array.from(grupper.values())
    .map((del) => {
      const sortert = del.sort((a, b) => a.x - b.x);
      return {
        side: sortert[0].side,
        y: sortert[0].y,
        x: sortert[0].x,
        tekst: sortert.map((d) => d.t).join(' ').replace(/\s+/g, ' ').trim(),
      };
    })
    .filter((l) => l.tekst);

  return sorterSpaltevis(linjer).map((l) => l.tekst);
}

/**
 * Fakturaer settes gjerne i to spalter. Leser man radvis, blandes
 * spaltene, og en overskrift som «Nye transaksjoner for Espen» havner
 * midt i den andres kjøp. Vi finner spaltene ved å se etter tydelige
 * hull mellom linjestartene, og leser en spalte om gangen.
 */
function sorterSpaltevis(linjer) {
  const GAP = 50;   // punkter mellom to spalter
  const perSide = new Map();
  for (const l of linjer) {
    if (!perSide.has(l.side)) perSide.set(l.side, []);
    perSide.get(l.side).push(l);
  }

  const ut = [];
  for (const side of Array.from(perSide.keys()).sort((a, b) => a - b)) {
    const del = perSide.get(side);
    const xer = Array.from(new Set(del.map((l) => l.x))).sort((a, b) => a - b);
    const grenser = [];
    for (let i = 1; i < xer.length; i += 1) {
      if (xer[i] - xer[i - 1] > GAP) grenser.push(xer[i]);
    }
    const spalte = (x) => grenser.filter((g) => x >= g).length;
    del.sort((a, b) => (spalte(a.x) - spalte(b.x)) || (b.y - a.y));
    ut.push(...del);
  }
  return ut;
}

/**
 * Tolker linjene fra en PDF-faktura. Her kreves dato på hver linje:
 * en fakturaside er full av summer, rentetabeller og småtekst som
 * ellers ville blitt lest som kjøp.
 */
function lesPdfTekst(linjer) {
  const poster = [];
  let eier = null;
  for (const rå of linjer) {
    const linje = stramDato(rå.replace(/[  ]/g, ' ').trim());
    if (!linje) continue;

    const eierTreff = KORTEIER_LINJE.exec(linje);
    if (eierTreff) { eier = eierTreff[1].trim(); continue; }
    // Kontogebyrer og innbetalinger hører til kontoen, ikke til forrige korteier.
    if (/^(andre kontotransaksjoner|innbetalinger|gjeldende renter)/i.test(linje)) { eier = null; continue; }

    const m = linje.match(/^(.*?)(?:^|\s)(-?\s?(?:kr\s*)?(?:\d{1,3}(?:[ .']\d{3})+|\d+)[.,]\d{2}\s*(?:kr|NOK)?-?)\s*$/i);
    if (!m) continue;
    const belop = tilTall(m[2]);
    if (belop === null || belop === 0) continue;

    let rest = m[1].trim();
    const dm = rest.match(/^(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|\d{4}-\d{2}-\d{2})\s+/);
    if (!dm) continue;                       // uten dato er det en sum- eller notatlinje
    const dato = tilDato(dm[1]);
    if (!dato) continue;
    rest = rest.slice(dm[0].length).replace(/\s+/g, ' ').trim();
    if (!/[a-zæøå]{2}/i.test(rest)) continue;

    poster.push(eier ? { dato, tekst: rest, belop, eier } : { dato, tekst: rest, belop });
  }
  return poster.length ? { poster, kol: null, kilde: 'pdf' } : null;
}
