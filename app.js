/* ============================================================
   KORTSVEIP
   Del en regning ved å sveipe hver utgift i en pott.

   Ingen backend, ingen rammeverk, ingen byggesteg. Regninga
   leses i nettleseren, og blir liggende der (localStorage).
   Deling skjer med en kode i adressefeltets #-del, som aldri
   sendes til noen server.

   Innlesingen bor i les.js. Denne fila er:
     1. Konfig og småverktøy
     2. Potter (navn, type, sveiperetning)
     3. Tilstand og lagring
     4. Importskjermen
     5. Sveiping
     6. Sammenlikning, når begge har sveipet
     7. Oppgjør, deling og eksport
     8. Koblinger og oppstart
   ============================================================ */
'use strict';

const {
  fakturaFingeravtrykk,
  finnUenigheter,
  fordelAndeler,
  hash: kortHash,
  transaksjonsNokler,
} = window.KortsveipKjerne;

/* ─── 1. KONFIG ─────────────────────────────────────────── */

const KONFIG = {
  dragTerskel: 0.32,   // andel av kortbredden du må dra sidelengs
  terskelOpp: 88,
  terskelNed: 104,
  synligeKort: 3,
  toastMs: 7000,
  maksRetninger: 4,    // flere potter enn dette havner som knapper under
  lagerNokkel: 'kortsveip.tilstand.v2',
  minneNokkel: 'kortsveip.minne.v2',
};

// Rekkefølgen potter får sveiperetning i.
const RETNINGER = [
  { id: 'hoyre', pil: '→', tast: 'ArrowRight' },
  { id: 'venstre', pil: '←', tast: 'ArrowLeft' },
  { id: 'opp', pil: '↑', tast: 'ArrowUp' },
  { id: 'ned', pil: '↓', tast: 'ArrowDown' },
];

const PALETT = ['#2f6f5e', '#bd6a39', '#4a5d8a', '#8a5a83', '#5c7a3a', '#a9761a', '#3f6f8a', '#8a3a3a'];

const POTTTYPER = {
  person: { navn: 'Person', hjelp: 'Egne utgifter' },
  felles: { navn: 'Felles', hjelp: 'Deles likt mellom personene' },
  utenfor: { navn: 'Utenfor', hjelp: 'Holdes utenfor oppgjøret, f.eks. jobbutgifter' },
};

const KATEGORIER = [
  { ikon: '🛒', ord: ['rema', 'kiwi', 'coop', 'meny', 'extra', 'bunnpris', 'spar', 'joker', 'oda', 'obs', 'europris', 'normal', 'nille'] },
  { ikon: '🍔', ord: ['foodora', 'wolt', 'mcdonald', 'burger', 'pizza', 'sushi', 'kebab', 'restaurant', 'bistro', 'pub', 'deli', 'ramen', 'kro'] },
  { ikon: '☕', ord: ['kaffe', 'espresso', 'coffee', 'starbucks', 'baker', 'bakeri', 'samson', 'godt br', 'united bakeries', 'innom'] },
  { ikon: '⛽', ord: ['circle k', 'shell', 'esso', 'uno-x', 'st1', 'bensin', 'drivstoff', 'recharge', 'lading'] },
  { ikon: '🅿️', ord: ['easypark', 'apcoa', 'parkering', 'bilglass', 'bomring'] },
  { ikon: '🚆', ord: ['ruter', 'flytoget', 'entur', 'vy ', 'atb', 'skyss', 'kolumbus', 'bysykkel'] },
  { ikon: '🚕', ord: ['taxi', 'uber', 'bolt', 'voi', 'tier', 'ryde', 'drosje'] },
  { ikon: '✈️', ord: ['norwegian', 'wideroe', 'widerøe', 'flyr', 'airbnb', 'booking.com', 'hotel', 'hotell', 'scandinavian airlines'] },
  { ikon: '🏥', ord: ['volvat', 'dropin', 'lege', 'tannlege', 'sykehus', 'fysio', 'klinikk'] },
  { ikon: '💊', ord: ['apotek', 'farmasiet', 'boots', 'vitus'] },
  { ikon: '👕', ord: ['zalando', 'cubus', 'dressmann', 'bikbok', 'weekday', 'zara', 'nike', 'adidas', 'xxl', 'volt fashion', 'dinsko', 'carlings'] },
  { ikon: '🏠', ord: ['ikea', 'jernia', 'clas oh', 'biltema', 'maxbo', 'byggmakker', 'granit', 'jysk', 'bohus', 'power', 'elkjøp', 'ellos', 'jotex'] },
  { ikon: '📺', ord: ['netflix', 'hbo', 'viaplay', 'disney', 'spotify', 'tidal', 'youtube', 'apple.com', 'icloud', 'microsoft', 'adobe', 'anthropic', 'storytel'] },
  { ikon: '📰', ord: ['aftenposten', 'e24', 'vg ', 'dagbladet', 'morgenlevering', 'unison'] },
  { ikon: '🔌', ord: ['telenor', 'telia', 'talkmore', 'onecall', 'fjordkraft', 'tibber', 'hafslund', 'elvia', 'strøm'] },
  { ikon: '🐶', ord: ['musti', 'veterin', 'arken zoo', 'dogman', 'dyrebutikk'] },
  { ikon: '🍷', ord: ['vinmonopol'] },
  { ikon: '🏋️', ord: ['sats', 'evo fitness', 'fresh fitness', 'treningssenter', 'yoga', 'squash', 'baneleie'] },
  { ikon: '🎬', ord: ['kino', 'nordisk film', 'odeon', 'teater', 'konsert', 'ticketmaster'] },
  { ikon: '🏛️', ord: ['kommune', 'skatteetaten', 'politiet', 'statens'] },
];

/* ─── Småverktøy ────────────────────────────────────────── */

const $ = (sel, rot = document) => rot.querySelector(sel);
const $$ = (sel, rot = document) => Array.from(rot.querySelectorAll(sel));

const nfTo = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfHel = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const kr = (n) => `${nfTo.format(n)} kr`;
const krHel = (n) => `${nfHel.format(Math.round(n))} kr`;
const ore = (n) => Math.round(n * 100) / 100;

function visDato(iso, langt = false) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nb-NO', langt
    ? { day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'short' });
}

function harOrd(tekst, ord) {
  if (ord.length > 4) return tekst.includes(ord);
  const i = tekst.indexOf(ord);
  return i === 0 || (i > 0 && /[^a-zæøå0-9]/.test(tekst[i - 1]));
}

function gjettIkon(tekst) {
  const t = tekst.toLowerCase();
  for (const kat of KATEGORIER) if (kat.ord.some((o) => harOrd(t, o))) return kat.ikon;
  return '💳';
}

/** «REMA 1000 GRÜNERLØKKA» og «REMA 1000 TORSHOV» får samme nøkkel. */
function kjedeNokkel(tekst) {
  const reint = String(tekst)
    .toLowerCase()
    .replace(/\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?/g, ' ')
    .replace(/\*+\s*\d+/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\b(nok|usd|eur|sek|dkk|gbp|kurs|kjop|kjøp|varekjop|varekjøp|betaling|as|asa|ab|ltd|inc)\b/g, ' ')
    .replace(/[^a-zæøåäöüé ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!reint) return String(tekst).toLowerCase().trim().slice(0, 12);
  const ord = reint.split(' ');
  return ord[0].length >= 4 ? ord[0] : ord.slice(0, 2).join(' ');
}

function kjedeNavn(tekst) {
  const ord = String(tekst).trim().split(/\s+/).filter((o) => /[a-zæøåA-ZÆØÅ]/.test(o));
  if (!ord.length) return String(tekst).trim().slice(0, 22);
  const antall = ord[0].length >= 4 ? 1 : 2;
  const hale = ord[antall] && ord[antall].length <= 2 ? 1 : 0;
  return ord.slice(0, antall + hale).join(' ').slice(0, 22);
}

/** Lesbart butikknavn: rydder bort referanser og roper ikke. */
function pentNavn(tekst) {
  let t = String(tekst)
    .replace(/^(VFI|AER|DINTER|NETS|SQ)\*/i, '')
    .replace(/\*+\s*\d+/g, ' ')
    .replace(/\b[A-Z0-9]*\d[A-Z0-9]{5,}\b/g, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/\b(nok|kurs|kortkj(ø|o)p|varekj(ø|o)p)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) t = String(tekst).trim();
  if (t === t.toUpperCase()) {
    t = t.replace(/[\p{L}][\p{L}'’-]*/gu, (o) => o[0] + o.slice(1).toLowerCase());
  }
  return t.length > 42 ? `${t.slice(0, 41).trim()}…` : t;
}

/* ─── 2. POTTER ─────────────────────────────────────────── */

let pottTeller = 0;
function nyPott(navn, type) {
  pottTeller += 1;
  return {
    id: `p${pottTeller}-${Math.random().toString(36).slice(2, 6)}`,
    navn,
    type,
    farge: PALETT[(pottTeller - 1) % PALETT.length],
  };
}

const standardPotter = () => [
  nyPott('Meg', 'person'),
  nyPott('Samboer', 'person'),
  nyPott('Felles', 'felles'),
];

const pott = (id) => S.potter.find((p) => p.id === id) || null;
const pottNavn = (id) => (pott(id) ? pott(id).navn : 'Ikke satt');
const pottFarge = (id) => (pott(id) ? pott(id).farge : 'var(--ink-3)');
const personer = () => S.potter.filter((p) => p.type === 'person');

/** Potter som har fått en sveiperetning, i rekkefølge. */
const retningsPotter = () => S.potter.slice(0, KONFIG.maksRetninger);
const knappePotter = () => S.potter.slice(KONFIG.maksRetninger);

/** Retningen en pott har, eller null. «ned» er «usikker» når det er plass. */
function retningFor(pottId) {
  const i = S.potter.findIndex((p) => p.id === pottId);
  return i >= 0 && i < KONFIG.maksRetninger ? RETNINGER[i] : null;
}

/* ─── 3. TILSTAND ───────────────────────────────────────── */

const S = {
  fakturaer: [],        // {id, navn, kilde, antall, sum, fra, til}
  periode: { fra: null, til: null, faktura: null },
  potter: standardPotter(),
  jeg: null,            // hvilken person-pott du er
  betaler: null,        // hvem som legger ut for hele regninga
  poster: [],
  historikk: [],
  tvist: [],            // id-er der du og den andre er uenige, tas først
  andre: null,          // { navn, tildeling: {postId: pottNavn} }
  filter: 'alle',
  skjerm: 'start',
};

let minne = {};        // kjedenøkkel → pottnavn, huskes på tvers av regninger
let sisteRå = '';      // siste innlesing, for ny tolkning ved kolonnebytte
let sisteFil = null;
let sisteFilNavn = '';
let importert = null;
let mottattDeling = null;

function lagre() {
  try {
    localStorage.setItem(KONFIG.lagerNokkel, JSON.stringify({
      fakturaer: S.fakturaer, periode: S.periode,
      potter: S.potter, jeg: S.jeg, betaler: S.betaler, poster: S.poster,
      tvist: S.tvist, andre: S.andre, skjerm: S.skjerm,
    }));
  } catch { /* privat modus, appen virker likevel */ }
}
function lagreMinne() {
  try { localStorage.setItem(KONFIG.minneNokkel, JSON.stringify(minne)); } catch { /* ignorer */ }
}
function hentLagret() {
  try {
    minne = JSON.parse(localStorage.getItem(KONFIG.minneNokkel) || '{}') || {};
    const d = JSON.parse(localStorage.getItem(KONFIG.lagerNokkel) || 'null');
    if (!d || !Array.isArray(d.poster) || !d.poster.length) return false;
    S.fakturaer = d.fakturaer || [];
    S.periode = d.periode || { fra: null, til: null, faktura: null };
    S.potter = (d.potter && d.potter.length) ? d.potter : standardPotter();
    S.jeg = d.jeg || null;
    S.betaler = d.betaler || null;
    S.poster = d.poster;
    sikreDelingsnokler();
    S.tvist = d.tvist || [];
    S.andre = d.andre || null;
    S.skjerm = ['oppgjor', 'tidslinje'].includes(d.skjerm) ? d.skjerm : 'sveip';
    return true;
  } catch { return false; }
}

const finn = (id) => S.poster.find((p) => p.id === id);
const erTvist = (id) => S.tvist.includes(id);

/** Gir også eldre, lokalt lagrede regninger stabile nøkler for deling. */
function sikreDelingsnokler() {
  S.fakturaer.forEach((f) => {
    const poster = S.poster.filter((p) => p.faktura === f.id);
    if (!poster.length) return;
    f.fingeravtrykk = f.fingeravtrykk || fakturaFingeravtrykk(poster);
    const nokler = transaksjonsNokler(poster, f.fingeravtrykk);
    poster.forEach((post, i) => { post.delingsnokkel = post.delingsnokkel || nokler[i]; });
  });
  const utenFaktura = S.poster.filter((p) => !p.delingsnokkel);
  if (utenFaktura.length) {
    const avtrykk = fakturaFingeravtrykk(utenFaktura);
    const nokler = transaksjonsNokler(utenFaktura, avtrykk);
    utenFaktura.forEach((post, i) => { post.delingsnokkel = nokler[i]; });
  }
}

/** Er posten innenfor perioden som er valgt? */
/**
 * To kort for samme måned overlapper alltid i tid, så et datointervall
 * kan ikke skille dem: «Amex» ville tatt med SAS-kjøpene som falt innenfor.
 * Velger du en regning, filtreres det derfor på selve regninga.
 * Datofeltene er for når du vil ha et utsnitt på tvers av dem.
 */
function iPeriode(p) {
  if (S.periode.faktura) return p.faktura === S.periode.faktura;
  if (!S.periode.fra && !S.periode.til) return true;
  if (!p.dato) return false;
  if (S.periode.fra && p.dato < S.periode.fra) return false;
  if (S.periode.til && p.dato > S.periode.til) return false;
  return true;
}

/**
 * Postene periodevalget gjelder for. Sveiping, oppgjør og tidslinje
 * ser alle den samme utvalgte bunken, så tallene aldri sier én ting
 * ett sted og noe annet et annet.
 */
const aktivePoster = () => S.poster.filter(iPeriode);

/** Eldste først. Kjøp uten dato havner bakerst, som på tidslinja. */
const etterDato = (a, b) => String(a.dato || '~').localeCompare(String(b.dato || '~'));

/**
 * Køen: uenigheter først, så det som ikke er fordelt, kronologisk.
 * Ligger det flere regninger i bunken, blandes de til én tidsrekke,
 * så du sveiper august én gang og ikke én regning av gangen.
 */
function koen() {
  const tvist = S.tvist.map(finn).filter((p) => p && iPeriode(p)).sort(etterDato);
  const rest = aktivePoster()
    .filter((p) => p.pott == null && !erTvist(p.id))
    .sort(etterDato);
  return tvist.concat(rest);
}

function huskValg(post, pottId) {
  const p = pott(pottId);
  if (!p) return;
  minne[kjedeNokkel(post.tekst)] = p.navn;
  lagreMinne();
}
function minneFor(post) {
  const navn = minne[kjedeNokkel(post.tekst)];
  if (!navn) return null;
  const p = S.potter.find((x) => x.navn.toLowerCase() === String(navn).toLowerCase());
  return p ? p.id : null;
}

/* ─── Skjermbytte ───────────────────────────────────────── */

const skjermer = {
  start: '#skjerm-start', sveip: '#skjerm-sveip',
  oppgjor: '#skjerm-oppgjor', tidslinje: '#skjerm-tidslinje',
};
const REKKE = ['start', 'sveip', 'oppgjor', 'tidslinje'];

function visSkjerm(navn) {
  S.skjerm = navn;
  for (const [k, sel] of Object.entries(skjermer)) $(sel).hidden = k !== navn;
  const naa = REKKE.indexOf(navn);
  $$('.steps__item').forEach((el) => {
    const i = REKKE.indexOf(el.dataset.skjerm);
    el.removeAttribute('aria-current');
    el.toggleAttribute('data-done', i < naa && i < 3);
    el.disabled = !S.poster.length && el.dataset.skjerm !== 'start';
    if (i === naa) el.setAttribute('aria-current', 'step');
  });
  $('#knapp-nullstill').hidden = navn === 'start' && !S.poster.length;
  $('#periode').hidden = navn === 'start' || !S.poster.length;
  if (navn !== 'start') tegnPeriode();
  if (navn === 'sveip') tegnSveip();
  if (navn === 'oppgjor') tegnOppgjor();
  if (navn === 'tidslinje') tegnTidslinje();
  window.scrollTo(0, 0);
  lagre();
}

function melding(tekst, type = '') {
  const el = $('#melding');
  el.textContent = tekst;
  el.dataset.type = type;
}

/* ─── 4. IMPORTSKJERMEN ─────────────────────────────────── */

function tegnPotter() {
  const liste = $('#potter');
  liste.textContent = '';

  S.potter.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'pott';
    li.style.setProperty('--pf', p.farge);

    const r = i < KONFIG.maksRetninger ? RETNINGER[i] : null;
    const merke = document.createElement('span');
    merke.className = 'pott__retning';
    merke.textContent = r ? r.pil : '•';
    merke.title = r ? 'Sveipes ' + { hoyre: 'til høyre', venstre: 'til venstre', opp: 'opp', ned: 'ned' }[r.id] : 'Egen knapp under kortet';

    const navn = document.createElement('input');
    navn.className = 'pott__navn';
    navn.type = 'text';
    navn.value = p.navn;
    navn.maxLength = 18;
    navn.id = `pott-navn-${p.id}`;
    navn.setAttribute('aria-label', `Navn på pott ${i + 1}`);
    navn.addEventListener('input', () => {
      p.navn = navn.value.slice(0, 18);
      oppdaterPottnavn();
      lagre();
    });

    const type = document.createElement('select');
    type.className = 'pott__type';
    type.id = `pott-type-${p.id}`;
    type.setAttribute('aria-label', `Type for ${p.navn}`);
    for (const [k, v] of Object.entries(POTTTYPER)) {
      const o = document.createElement('option');
      o.value = k; o.textContent = v.navn;
      type.append(o);
    }
    type.value = p.type;
    type.addEventListener('change', () => { p.type = type.value; tegnPotter(); lagre(); });

    const bort = document.createElement('button');
    bort.className = 'pott__bort';
    bort.type = 'button';
    bort.textContent = '×';
    bort.setAttribute('aria-label', `Fjern ${p.navn}`);
    bort.disabled = S.potter.length <= 2;
    bort.addEventListener('click', () => {
      S.poster.forEach((x) => { if (x.pott === p.id) x.pott = null; });
      S.potter = S.potter.filter((x) => x.id !== p.id);
      if (S.jeg === p.id) S.jeg = null;
      if (S.betaler === p.id) S.betaler = null;
      tegnPotter(); lagre();
    });

    li.append(merke, navn, type, bort);
    liste.append(li);
  });

  $('#legg-til-pott').disabled = S.potter.length >= 8;
  $('#pott-hjelp').textContent = S.potter.length > KONFIG.maksRetninger
    ? `De fire første sveipes. ${S.potter.length - KONFIG.maksRetninger} til får egen knapp under kortet.`
    : 'Hver pott får sin sveiperetning. Legg til flere, så får de knapper under kortet.';

  tegnRoller();
}

/** «Jeg er» og «hvem betaler», begge blant person-pottene. */
function tegnRoller() {
  for (const [boks, felt, ekstra] of [['#jeg-er', 'jeg', null], ['#betaler-valg', 'betaler', 'Felles konto']]) {
    const el = $(boks);
    el.textContent = '';
    const valg = personer().map((p) => ({ id: p.id, navn: p.navn }));
    if (ekstra) valg.push({ id: 'ingen', navn: ekstra });
    if (!valg.length) { el.textContent = 'Legg til minst én person-pott.'; continue; }
    if (S[felt] && !valg.some((v) => v.id === S[felt])) S[felt] = null;

    valg.forEach((v) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.textContent = v.navn;
      b.setAttribute('aria-pressed', String(S[felt] === v.id));
      b.addEventListener('click', () => {
        S[felt] = S[felt] === v.id ? null : v.id;
        tegnRoller(); lagre();
        if (S.skjerm === 'oppgjor') tegnOppgjor();
      });
      el.append(b);
    });
  }
}

function oppdaterPottnavn() {
  if (S.skjerm === 'sveip') tegnSveip();
  if (S.skjerm === 'oppgjor') tegnOppgjor();
  tegnRoller();
}

async function lesInnFil(fil) {
  melding(`Leser ${fil.name} …`);
  sisteFil = fil; sisteRå = ''; sisteFilNavn = fil.name;
  vis(await lesFil(fil));
}

/** Flere valgte filer legges rett i bunken og starter aldri sveipingen. */
async function lesInnFiler(filer) {
  const liste = Array.from(filer || []);
  if (!liste.length) return;
  if (liste.length === 1) { await lesInnFil(liste[0]); return; }

  importert = null;
  $('#forhandsvisning').hidden = true;
  melding(`Leser ${liste.length} filer …`);
  const lagtTil = [];
  const feil = [];
  let holdtUtenfor = 0;

  for (const fil of liste) {
    const res = await lesFil(fil);
    if (res.feil) { feil.push(`${fil.name}: ${res.feil}`); continue; }
    const poster = res.poster.filter((p) => !p.innbetaling);
    holdtUtenfor += res.poster.length - poster.length;
    const resultat = leggTilResultat(res, fil.name, poster, false);
    if (resultat.feil) feil.push(`${fil.name}: ${resultat.feil}`);
    else lagtTil.push(resultat.faktura);
  }

  sisteFil = null; sisteRå = ''; sisteFilNavn = '';
  tegnFakturaer();
  visSkjerm('start');
  const deler = [];
  if (lagtTil.length) deler.push(`${lagtTil.length} ${lagtTil.length === 1 ? 'regning' : 'regninger'} lagt til`);
  if (holdtUtenfor) deler.push(`${holdtUtenfor} ${holdtUtenfor === 1 ? 'innbetaling' : 'innbetalinger'} holdt utenfor`);
  if (feil.length) deler.push(`${feil.length} ${feil.length === 1 ? 'fil kunne ikke legges til' : 'filer kunne ikke legges til'}`);
  melding(`${deler.join('. ')}.${lagtTil.length ? ' Legg til flere eller start sveipingen når du er klar.' : ''}`,
    feil.length ? 'feil' : 'ok');
}

function lesInnTekst(tekst, overstyr) {
  sisteRå = tekst; sisteFil = null; sisteFilNavn = '';
  vis(lesTekst(tekst, overstyr));
}

function vis(res) {
  if (res.feil) {
    importert = null;
    $('#forhandsvisning').hidden = true;
    melding(res.feil, 'feil');
    return;
  }
  importert = res;
  melding('', '');
  tegnForhandsvisning();
}

function aktuellePoster() {
  if (!importert) return [];
  const medInn = $('#ta-med-innbetalinger').checked;
  return importert.poster.filter((p) => medInn || !p.innbetaling);
}

function tegnForhandsvisning() {
  const poster = aktuellePoster();
  $('#forhandsvisning').hidden = false;
  $('#antall-funnet').textContent = String(poster.length);
  $('#sum-funnet').textContent = kr(poster.reduce((s, p) => s + p.belop, 0));

  const liste = $('#preview-liste');
  liste.textContent = '';
  poster.slice(0, 6).forEach((p) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="preview__dato"></span><span class="preview__tekst"></span><span class="preview__belop"></span>';
    li.children[0].textContent = visDato(p.dato);
    li.children[1].textContent = pentNavn(p.tekst);
    li.children[2].textContent = kr(p.belop);
    liste.append(li);
  });
  if (poster.length > 6) {
    const li = document.createElement('li');
    li.className = 'preview__note';
    li.textContent = `… og ${poster.length - 6} til`;
    liste.append(li);
  }

  const antallInn = importert.poster.filter((p) => p.innbetaling).length;
  $('#sjekk-innbetalinger').hidden = antallInn === 0;
  const note = $('#filtrert-note');
  note.hidden = antallInn === 0;
  note.textContent = antallInn
    ? `${antallInn} ${antallInn === 1 ? 'rad' : 'rader'} så ut som innbetaling på kortet og er holdt utenfor.`
    : '';

  tegnKolonnevalg();
  tegnMinnevalg(poster);
  $('#knapp-legg-til').disabled = poster.length === 0;
}

function tegnKolonnevalg() {
  const boks = $('#kolonnevalg');
  const kol = importert && importert.kol;
  if (!kol || !Array.isArray(kol.datarader)) { boks.hidden = true; return; }
  boks.hidden = false;

  const bredde = Math.max(...kol.datarader.map((r) => r.length), kol.hode ? kol.hode.length : 0);
  for (const [felt, id] of [['dato', '#kol-dato'], ['tekst', '#kol-tekst'], ['belop', '#kol-belop']]) {
    const sel = $(id);
    sel.textContent = '';
    for (let i = 0; i < bredde; i += 1) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = (kol.hode && kol.hode[i]) ? kol.hode[i] : `Kolonne ${i + 1}`;
      sel.append(o);
    }
    sel.value = String(kol[felt]);
  }
}

function tegnMinnevalg(poster) {
  const boks = $('#sjekk-minne');
  const treff = poster.filter((p) => minneFor(p));
  boks.hidden = treff.length === 0;
  if (treff.length) {
    $('#minne-tekst').textContent = `Fyll ut de ${treff.length} utgiftene jeg har sortert før automatisk`;
  }
}

function fakturaNavn(filnavn = sisteFilNavn) {
  const grunn = filnavn
    ? filnavn.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 40)
    : `Limt inn ${new Date().toLocaleDateString('nb-NO')}`;
  return unikt(grunn);
}

/**
 * To regninger som heter det samme er to regninger du ikke kan skille,
 * og da er både periodevalget og kryssene ubrukelige. Limer du inn to
 * ganger samme dag, blir den andre «… (2)».
 */
function unikt(grunn) {
  const tatt = new Set(S.fakturaer.map((f) => f.navn));
  if (!tatt.has(grunn)) return grunn;
  let n = 2;
  while (tatt.has(`${grunn} (${n})`)) n += 1;
  return `${grunn} (${n})`;
}

/**
 * Legger postene til bunken. Hele fakturaen får et innholdsavtrykk, så vi
 * stopper en dobbeltimport uten å fjerne legitime, identiske enkeltkjøp.
 */
function leggTilResultat(res, filnavn, poster, brukMinne) {
  if (!poster.length) return { feil: 'Fant ingen utgifter å legge til.' };
  const avtrykk = fakturaFingeravtrykk(poster);
  const finnes = S.fakturaer.find((f) => f.fingeravtrykk === avtrykk);
  if (finnes) {
    return { feil: `Ligger inne fra før som «${finnes.navn}»` };
  }

  const forste = S.poster.length === 0;
  const nokler = transaksjonsNokler(poster, avtrykk);
  const nye = poster.map((p, i) => ({ ...p, delingsnokkel: nokler[i] }));

  const datoer = nye.map((p) => p.dato).filter(Boolean).sort();
  const faktura = {
    id: `f${S.fakturaer.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
    navn: fakturaNavn(filnavn),
    kilde: res.kilde,
    antall: nye.length,
    sum: ore(nye.reduce((sum, p) => sum + p.belop, 0)),
    fra: datoer[0] || null,
    til: datoer[datoer.length - 1] || null,
    fingeravtrykk: avtrykk,
  };
  S.fakturaer.push(faktura);
  S.poster = S.poster.concat(nye.map((p) => ({
    ...p, faktura: faktura.id, pott: brukMinne ? minneFor(p) : null,
  })));

  if (forste) { S.historikk = []; S.tvist = []; S.andre = null; S.filter = 'alle'; }
  // Sto det et utvalg, ville de nye kjøpene falt utenfor uten å si fra
  S.periode = { fra: null, til: null, faktura: null };
  return { faktura, antall: nye.length };
}

function leggTilPoster() {
  const poster = aktuellePoster();
  if (!poster.length) return;
  const resultat = leggTilResultat(importert, sisteFilNavn, poster, $('#bruk-minne').checked);
  if (resultat.feil) {
    melding(`Denne fakturaen ${resultat.feil}. Ingenting lagt til.`, 'feil');
    return;
  }

  importert = null;
  sisteFilNavn = '';
  $('#forhandsvisning').hidden = true;
  $('#lim-inn').value = '';
  melding(`${resultat.faktura.navn} er lagt til med ${resultat.antall} kjøp. Legg til flere eller start sveipingen når du er klar.`, 'ok');
  tegnFakturaer();
  visSkjerm('start');
  // Kvitteringen står øverst på importskjermen, så den er i syne uten rulling
  const kvi = $('#kvittering');
  kvi.classList.remove('kvittering--ny');
  void kvi.offsetWidth;
  kvi.classList.add('kvittering--ny');
}

/* ─── Fakturaene i bunken ───────────────────────────────── */

function tegnFakturaer() {
  const panel = $('#faktura-panel');
  panel.hidden = S.fakturaer.length === 0;
  if (!S.fakturaer.length) return;

  $('#faktura-sum').textContent = `${S.poster.length} kjøp · ${kr(S.poster.reduce((sum, p) => sum + p.belop, 0))}`;

  // Svart på hvitt at alt kom inn, og hvor mye hver regning bidro med.
  // Uten den må du telle deg fram til om regning nummer to faktisk ble lest.
  const antall = new Map();
  S.poster.forEach((p) => antall.set(p.faktura, (antall.get(p.faktura) || 0) + 1));
  const deler = S.fakturaer.map((f) => `${antall.get(f.id) || 0} fra ${f.navn}`);
  $('#kvittering-tall').textContent = S.poster.length === 1
    ? '1 transaksjon funnet'
    : `${S.poster.length} transaksjoner funnet`;
  $('#kvittering-fra').textContent = deler.length > 1
    ? `${deler.slice(0, -1).join(', ')} og ${deler[deler.length - 1]}`
    : (S.fakturaer.length === 1 ? `fra ${S.fakturaer[0].navn}` : '');
  const liste = $('#fakturaer');
  liste.textContent = '';
  S.fakturaer.forEach((f) => {
    const li = document.createElement('li');
    li.className = 'faktura';
    li.innerHTML = '<span class="faktura__navn"></span><span class="faktura__meta"></span>'
      + '<span class="faktura__sum"></span>';
    li.children[0].textContent = f.navn;
    li.children[0].title = 'Trykk for å gi regninga et annet navn';
    li.children[0].setAttribute('role', 'button');
    li.children[0].tabIndex = 0;
    const dopOm = () => {
      const svar = window.prompt('Hva heter denne regninga?', f.navn);
      if (svar == null) return;
      const rent = svar.trim().slice(0, 40);
      if (!rent || rent === f.navn) return;
      f.navn = S.fakturaer.some((x) => x !== f && x.navn === rent) ? unikt(rent) : rent;
      lagre(); tegnFakturaer(); tegnPeriode();
      if (S.skjerm === 'sveip') tegnStokk();
    };
    li.children[0].addEventListener('click', dopOm);
    li.children[0].addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dopOm(); }
    });
    li.children[1].textContent = `${f.antall} kjøp · ${f.fra ? `${visDato(f.fra)} – ${visDato(f.til)}` : 'uten datoer'}`;
    li.children[2].textContent = kr(f.sum);

    const bort = document.createElement('button');
    bort.className = 'faktura__bort';
    bort.type = 'button';
    bort.textContent = '×';
    bort.setAttribute('aria-label', `Fjern ${f.navn}`);
    bort.addEventListener('click', () => {
      if (!window.confirm(`Fjerne «${f.navn}» og de ${f.antall} kjøpene?`)) return;
      S.poster = S.poster.filter((p) => p.faktura !== f.id);
      S.fakturaer = S.fakturaer.filter((x) => x.id !== f.id);
      S.tvist = S.tvist.filter((id) => finn(id));
      // Et filter som peker på en regning som er borte, skjuler alt
      if (S.periode.faktura === f.id) S.periode = { fra: null, til: null, faktura: null };
      lagre(); tegnFakturaer();
      if (S.skjerm !== 'start') visSkjerm(S.poster.length ? S.skjerm : 'start');
    });
    li.append(bort);
    liste.append(li);
  });
}

/* ─── Perioden ──────────────────────────────────────────── */

function settPeriode(fra, til, faktura) {
  S.periode = { fra: fra || null, til: til || null, faktura: faktura || null };
  S.tvist = S.tvist.filter((id) => { const p = finn(id); return p && iPeriode(p); });
  lagre();
  tegnPeriode();
  if (S.skjerm === 'sveip') tegnSveip();
  if (S.skjerm === 'oppgjor') tegnOppgjor();
  if (S.skjerm === 'tidslinje') tegnTidslinje();
}

function tegnPeriode() {
  const boks = $('#periode-chips');
  boks.textContent = '';
  const valg = [{ id: null, navn: 'Hele bunken' }];
  S.fakturaer.forEach((f) => valg.push({ id: f.id, navn: f.navn }));

  valg.forEach((v) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = v.navn;
    const pa = v.id ? S.periode.faktura === v.id
      : !S.periode.faktura && !S.periode.fra && !S.periode.til;
    b.setAttribute('aria-pressed', String(pa));
    b.addEventListener('click', () => settPeriode(null, null, v.id));
    boks.append(b);
  });

  $('#periode-fra').value = S.periode.fra || '';
  $('#periode-til').value = S.periode.til || '';

  const utenfor = S.poster.length - aktivePoster().length;
  const note = $('#periode-note') || (() => {
    const el = document.createElement('p');
    el.className = 'periode__note';
    el.id = 'periode-note';
    $('#periode').append(el);
    return el;
  })();
  const valgt = S.periode.faktura && S.fakturaer.find((f) => f.id === S.periode.faktura);
  note.textContent = utenfor
    ? (valgt
      ? `Viser bare «${valgt.navn}»: ${aktivePoster().length} av ${S.poster.length} kjøp. De andre ${utenfor} er ikke borte, trykk «Hele bunken».`
      : `${aktivePoster().length} av ${S.poster.length} kjøp er med. ${utenfor} ligger utenfor perioden.`)
    : '';
}

/* ─── Tidslinja ─────────────────────────────────────────── */

function tegnTidslinje() {
  const alle = aktivePoster().slice().sort((a, b) => String(a.dato).localeCompare(String(b.dato)));
  const synlige = alle.filter((p) => S.filter === 'alle' || (p.pott || 'uten') === S.filter);

  $('#tid-oppsummering').textContent = alle.length
    ? `${alle.length} kjøp fra ${visDato(alle[0].dato, true)} til ${visDato(alle[alle.length - 1].dato, true)}, til sammen ${kr(alle.reduce((s, p) => s + p.belop, 0))}.`
    : 'Ingen kjøp i denne perioden.';

  // Filtre på pott, med antall innenfor perioden
  const boks = $('#tid-filtre');
  boks.textContent = '';
  const antall = { uten: 0 };
  alle.forEach((p) => { const k = p.pott || 'uten'; antall[k] = (antall[k] || 0) + 1; });
  const valg = [{ id: 'alle', navn: `Alle (${alle.length})` }];
  S.potter.forEach((pt) => valg.push({ id: pt.id, navn: `${pt.navn} (${antall[pt.id] || 0})` }));
  if (antall.uten) valg.push({ id: 'uten', navn: `Ikke satt (${antall.uten})` });
  valg.forEach((v) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = v.navn;
    b.setAttribute('aria-pressed', String(S.filter === v.id));
    b.addEventListener('click', () => { S.filter = v.id; tegnTidslinje(); });
    boks.append(b);
  });

  // Gruppert på måned, med månedssum
  const liste = $('#tid-liste');
  liste.textContent = '';
  const manedSum = new Map();
  synlige.forEach((p) => {
    const m = String(p.dato || '').slice(0, 7);
    manedSum.set(m, ore((manedSum.get(m) || 0) + p.belop));
  });

  let maned = '';
  synlige.forEach((p) => {
    const m = String(p.dato || '').slice(0, 7);
    if (m !== maned) {
      maned = m;
      const h = document.createElement('li');
      h.className = 'tid__maned';
      h.innerHTML = '<span></span><span></span>';
      h.children[0].textContent = m
        ? new Date(`${m}-01T12:00:00`).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' })
        : 'Uten dato';
      h.children[1].textContent = kr(manedSum.get(m) || 0);
      liste.append(h);
    }
    const li = document.createElement('li');
    li.className = 'tid__post';
    li.style.setProperty('--linjefarge', pottFarge(p.pott));
    li.innerHTML = '<span class="tid__dag"></span><span class="tid__navn"></span>'
      + '<span class="tid__belop"></span><span class="tid__pott"></span>';
    li.children[0].textContent = visDato(p.dato);
    li.children[1].textContent = pentNavn(p.tekst);
    li.children[1].title = p.tekst;
    li.children[2].textContent = (p.belop < 0 ? '− ' : '') + kr(Math.abs(p.belop));
    li.children[3].textContent = p.pott ? pottNavn(p.pott) : '—';
    li.children[3].style.setProperty('--pf', pottFarge(p.pott));
    liste.append(li);
  });

  $('#tid-melding').textContent = synlige.length ? '' : 'Ingen kjøp med dette filteret.';
}

/* ─── 5. SVEIPING ───────────────────────────────────────── */

const stack = () => $('#stack');
let toastTimer = null;

/** Hvilken pott en sveiperetning fører til. Tomme retninger: bare «ned». */
function pottForRetning(rid) {
  const i = RETNINGER.findIndex((r) => r.id === rid);
  const p = S.potter[i];
  if (p) return p.id;
  return rid === 'ned' ? 'usikker' : null;
}

function basisTransform(dybde) {
  return `translate(0px, calc(-50% + ${dybde * 9}px)) scale(${(1 - dybde * 0.04).toFixed(3)})`;
}

function lagKort(post, dybde) {
  const el = document.createElement('article');
  el.className = 'kort';
  el.dataset.id = post.id;
  el.style.zIndex = String(KONFIG.synligeKort - dybde);
  el.style.transform = basisTransform(dybde);
  if (dybde === 0) el.dataset.topp = 'true';

  const kreditt = post.belop < 0;
  el.innerHTML = `
    <div class="kort__topp">
      <span class="kort__kat" aria-hidden="true"></span>
      <span class="kort__dato"></span>
    </div>
    <h2 class="kort__butikk"></h2>
    <p class="kort__belop${kreditt ? ' kort__belop--kreditt' : ''}"></p>
    <p class="kort__meta"></p>
    <div class="kort__merker"></div>`;

  $('.kort__kat', el).textContent = gjettIkon(post.tekst);
  $('.kort__dato', el).textContent = visDato(post.dato);
  $('.kort__butikk', el).textContent = pentNavn(post.tekst);
  $('.kort__belop', el).textContent = (kreditt ? '− ' : '') + kr(Math.abs(post.belop));
  $('.kort__meta', el).textContent = kreditt ? `Kreditering · ${post.tekst}` : post.tekst;

  const merker = $('.kort__merker', el);
  const merke = (tekst, farge, klasse) => {
    const s = document.createElement('span');
    s.className = `merke ${klasse || ''}`;
    s.textContent = tekst;
    if (farge) s.style.setProperty('--mf', farge);
    merker.append(s);
  };
  // Med flere regninger i samme bunke er «hvilken regning» like nyttig
  // som «hvems kort», for kortteksten alene sier det ikke.
  if (S.fakturaer.length > 1) {
    const f = S.fakturaer.find((x) => x.id === post.faktura);
    if (f) merke(f.navn, null, 'merke--faktura');
  }
  if (post.eier) merke(`${post.eier}s kort`, null, 'merke--eier');
  if (erTvist(post.id)) {
    merke(`Du: ${pottNavn(post.pott)}`, pottFarge(post.pott), 'merke--sterk');
    const deres = S.andre && S.andre.tildeling[post.id];
    if (deres) merke(`${S.andre.navn}: ${deres}`, null, 'merke--sterk merke--andre');
  } else {
    const husket = minneFor(post);
    if (husket) merke(`Sist: ${pottNavn(husket)}`, null);
  }

  // Stemplene som toner inn når du drar
  retningsPotter().forEach((p, i) => {
    const s = document.createElement('span');
    s.className = `stempel stempel--${RETNINGER[i].id}`;
    s.dataset.stempel = p.id;
    s.textContent = p.navn;
    s.style.setProperty('--sf', p.farge);
    el.append(s);
  });
  if (S.potter.length < KONFIG.maksRetninger) {
    const s = document.createElement('span');
    s.className = 'stempel stempel--ned';
    s.dataset.stempel = 'usikker';
    s.textContent = 'Usikker';
    s.style.setProperty('--sf', 'var(--ink-3)');
    el.append(s);
  }
  return el;
}

function tegnStokk() {
  // Etter mottakerens første, egne fordeling starter en kort runde med bare
  // de postene hvor de to valgene faktisk er forskjellige.
  if (S.andre && !S.andre.sammenlignet
      && !aktivePoster().some((p) => p.pott == null)) {
    S.tvist = finnUenigheter(aktivePoster(), S.andre.tildeling, pottNavn);
    S.andre.sammenlignet = true;
    lagre();
    if (S.tvist.length) si(`${S.tvist.length} ${S.tvist.length === 1 ? 'uenighet' : 'uenigheter'} å gå gjennom`);
    else si(`Du og ${S.andre.navn} fordelte alt likt`);
  }
  const ko = koen();
  $$('.kort:not(.kort--flyr)', stack()).forEach((e) => e.remove());
  const synlige = ko.slice(0, KONFIG.synligeKort);
  for (let i = synlige.length - 1; i >= 0; i -= 1) stack().append(lagKort(synlige[i], i));

  const topp = $('.kort[data-topp]', stack());
  if (topp) koblePeker(topp);

  $('#tomt').hidden = ko.length > 0;
  stack().hidden = ko.length === 0;
  $('#knapp-angre').disabled = S.historikk.length === 0;

  const totalt = aktivePoster().length;
  const gjort = totalt - ko.length;
  $('#framdrift-fill').style.width = totalt ? `${(gjort / totalt) * 100}%` : '0%';
  $('#framdrift-tall').textContent = `${gjort} av ${totalt}`;
  const sumIgjen = ko.reduce((s, p) => s + p.belop, 0);
  $('#framdrift-sum').textContent = ko.length ? `${krHel(sumIgjen)} igjen` : 'ferdig';

  const tvistIgjen = S.tvist.length;
  $('#tvist-varsel').hidden = tvistIgjen === 0;
  if (tvistIgjen) {
    $('#tvist-varsel').textContent = `${tvistIgjen} ${tvistIgjen === 1 ? 'utgift' : 'utgifter'} dere er uenige om. De kommer først.`;
  }
}

/** Knappene under kortet, som følger pottene. */
function tegnKontroller() {
  const rad = $('#kontroller');
  rad.textContent = '';
  retningsPotter().forEach((p, i) => {
    const b = document.createElement('button');
    b.className = `knapp knapp--${RETNINGER[i].id}`;
    b.type = 'button';
    b.dataset.pott = p.id;
    b.style.setProperty('--kf', p.farge);
    b.innerHTML = '<span class="knapp__pil" aria-hidden="true"></span><span class="knapp__navn"></span>';
    b.children[0].textContent = RETNINGER[i].pil;
    b.children[1].textContent = p.navn;
    b.addEventListener('click', () => sveip(p.id));
    rad.append(b);
  });

  const ekstra = $('#kontroller-ekstra');
  ekstra.textContent = '';
  knappePotter().forEach((p) => {
    const b = document.createElement('button');
    b.className = 'btn btn--pott';
    b.type = 'button';
    b.textContent = p.navn;
    b.style.setProperty('--kf', p.farge);
    b.addEventListener('click', () => sveip(p.id));
    ekstra.append(b);
  });
  $('#knapp-usikker').hidden = S.potter.length < KONFIG.maksRetninger;
}

function tegnSveip() { tegnKontroller(); tegnStokk(); }

function koblePeker(el) {
  let startX = 0; let startY = 0; let dx = 0; let dy = 0;
  let drar = false; let pekerId = null;
  const terskelX = () => Math.max(60, el.offsetWidth * KONFIG.dragTerskel);

  function retning() {
    if (Math.abs(dx) > Math.abs(dy)) {
      return { rid: dx > 0 ? 'hoyre' : 'venstre', styrke: Math.min(1, Math.abs(dx) / terskelX()) };
    }
    if (dy < 0) return { rid: 'opp', styrke: Math.min(1, -dy / KONFIG.terskelOpp) };
    return { rid: 'ned', styrke: Math.min(1, dy / KONFIG.terskelNed) };
  }

  function tegn() {
    el.style.transform = `translate(${dx}px, calc(-50% + ${dy}px)) rotate(${dx / 18}deg)`;
    const { rid, styrke } = retning();
    const mål = pottForRetning(rid);
    $$('[data-stempel]', el).forEach((s) => { s.style.opacity = s.dataset.stempel === mål ? String(styrke) : '0'; });
    $('#sone-a').style.opacity = rid === 'hoyre' && mål ? String(styrke * 0.9) : '0';
    $('#sone-b').style.opacity = rid === 'venstre' && mål ? String(styrke * 0.9) : '0';
  }

  function nullstill() {
    el.classList.add('kort--tilbake');
    el.style.transform = basisTransform(0);
    $$('[data-stempel]', el).forEach((s) => { s.style.opacity = '0'; });
    $('#sone-a').style.opacity = '0';
    $('#sone-b').style.opacity = '0';
    setTimeout(() => el.classList.remove('kort--tilbake'), 360);
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drar = true; pekerId = e.pointerId;
    startX = e.clientX; startY = e.clientY; dx = 0; dy = 0;
    el.classList.remove('kort--tilbake', 'kort--dropp');
    try { el.setPointerCapture(pekerId); } catch { /* ignorer */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (!drar || e.pointerId !== pekerId) return;
    dx = e.clientX - startX; dy = e.clientY - startY; tegn();
  });
  const slipp = (e) => {
    if (!drar || (e && e.pointerId !== pekerId)) return;
    drar = false;
    try { el.releasePointerCapture(pekerId); } catch { /* ignorer */ }
    $('#sone-a').style.opacity = '0';
    $('#sone-b').style.opacity = '0';
    const { rid, styrke } = retning();
    const mål = pottForRetning(rid);
    if (mål && styrke >= 1 && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) sveip(mål, el);
    else nullstill();
  };
  el.addEventListener('pointerup', slipp);
  el.addEventListener('pointercancel', slipp);
}

function flyUt(el, rid, ferdig) {
  let kjort = false;
  const rydd = () => { if (kjort) return; kjort = true; el.remove(); ferdig(); };
  el.classList.add('kort--flyr', 'kort--dropp');
  el.removeAttribute('data-topp');
  const bredde = window.innerWidth + 200;
  const hoyde = window.innerHeight + 200;
  const mal = {
    hoyre: `translate(${bredde}px, calc(-50% - 40px)) rotate(24deg)`,
    venstre: `translate(${-bredde}px, calc(-50% - 40px)) rotate(-24deg)`,
    opp: `translate(0px, calc(-50% - ${hoyde}px)) rotate(-4deg)`,
    ned: `translate(0px, calc(-50% + ${hoyde}px)) rotate(4deg)`,
  };
  requestAnimationFrame(() => {
    el.style.transform = mal[rid] || mal.ned;
    el.style.opacity = '0';
  });
  el.addEventListener('transitionend', rydd, { once: true });
  setTimeout(rydd, 500);
}

/** Hovedhandlingen. `mål` er en pott-id, eller 'usikker'. */
function sveip(mål, fraElement) {
  const ko = koen();
  if (!ko.length) return;
  const post = ko[0];
  const el = fraElement || $('.kort[data-topp]', stack());
  const varTvist = erTvist(post.id);
  const i = S.potter.findIndex((p) => p.id === mål);
  const rid = i >= 0 && i < KONFIG.maksRetninger ? RETNINGER[i].id : 'ned';

  if (mål === 'usikker') {
    const indeks = S.poster.indexOf(post);
    S.poster.splice(indeks, 1);
    S.poster.push(post);
    S.historikk.push({ type: 'senere', id: post.id, indeks, tvist: varTvist });
    if (varTvist) S.tvist = S.tvist.filter((x) => x !== post.id);
    si(`${pentNavn(post.tekst)} tatt til side`);
  } else {
    const fra = post.pott;
    post.pott = mål;
    huskValg(post, mål);
    S.historikk.push({ type: 'en', endringer: [{ id: post.id, fra }], tvist: varTvist });
    if (varTvist) S.tvist = S.tvist.filter((x) => x !== post.id);
    si(`${pentNavn(post.tekst)} til ${pottNavn(mål)}`);
  }
  lagre();

  const etter = () => { tegnStokk(); if (mål !== 'usikker') tilbySamme(post, mål); };
  if (el) flyUt(el, rid, etter); else etter();
}

function si(tekst) { $('#sveip-status').textContent = tekst; }

function angre() {
  const h = S.historikk.pop();
  if (!h) return;
  if (h.type === 'senere') {
    const i = S.poster.findIndex((p) => p.id === h.id);
    if (i >= 0) {
      const [post] = S.poster.splice(i, 1);
      S.poster.splice(Math.min(h.indeks, S.poster.length), 0, post);
    }
    if (h.tvist && !S.tvist.includes(h.id)) S.tvist.unshift(h.id);
  } else {
    h.endringer.forEach(({ id, fra }) => {
      const p = finn(id);
      if (p) p.pott = fra;
      if (h.tvist && !S.tvist.includes(id)) S.tvist.unshift(id);
    });
  }
  skjulToast(); lagre(); tegnStokk(); si('Angret');
}

/** «4 kjøp til fra Rema. Samme der?» */
function tilbySamme(post, pottId) {
  const nokkel = kjedeNokkel(post.tekst);
  const like = koen().filter((p) => kjedeNokkel(p.tekst) === nokkel);
  if (!like.length) return;

  const toast = $('#toast');
  toast.textContent = '';
  const tekst = document.createElement('span');
  tekst.className = 'toast__tekst';
  tekst.textContent = `${like.length} til fra ${kjedeNavn(post.tekst)}. Samme der?`;
  const ja = document.createElement('button');
  ja.className = 'toast__btn';
  ja.type = 'button';
  ja.textContent = `Alle til ${pottNavn(pottId)}`;
  ja.addEventListener('click', () => {
    const endringer = like.map((p) => ({ id: p.id, fra: p.pott }));
    like.forEach((p) => { p.pott = pottId; });
    S.tvist = S.tvist.filter((id) => !like.some((p) => p.id === id));
    S.historikk.push({ type: 'flere', endringer });
    lagre(); skjulToast(); tegnStokk();
    si(`${like.length} utgifter til ${pottNavn(pottId)}`);
  });
  const lukk = document.createElement('button');
  lukk.className = 'toast__lukk';
  lukk.type = 'button';
  lukk.setAttribute('aria-label', 'Lukk');
  lukk.textContent = '×';
  lukk.addEventListener('click', skjulToast);

  toast.append(tekst, ja, lukk);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(skjulToast, KONFIG.toastMs);
}

function skjulToast() {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  toast.hidden = true;
  toast.textContent = '';
}

/* ─── 6. SAMMENLIKNING ──────────────────────────────────── */

const B64 = {
  innBytes(bytes) {
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  utBytes(s) {
    const ryddet = s.replace(/-/g, '+').replace(/_/g, '/');
    const utfylt = ryddet + '='.repeat((4 - (ryddet.length % 4)) % 4);
    const bin = atob(utfylt);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
  inn(str) {
    return this.innBytes(new TextEncoder().encode(str));
  },
  ut(s) {
    return new TextDecoder().decode(this.utBytes(s));
  },
};

async function komprimer(tekst) {
  const strøm = new Blob([tekst]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(strøm).arrayBuffer());
}

async function dekomprimer(bytes) {
  const strøm = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(strøm).text();
}

async function pakkDeling(data) {
  const json = JSON.stringify(data);
  if ('CompressionStream' in window && 'DecompressionStream' in window) {
    try { return `g4.${B64.innBytes(await komprimer(json))}`; } catch { /* bruk ukomprimert */ }
  }
  return `j4.${B64.inn(json)}`;
}

async function lesDelingsdata(rå) {
  const kode = String(rå).trim().replace(/^.*#deling=/, '');
  if (kode.length > 1500000) throw new Error('Delingslenka er for stor.');
  let json;
  if (kode.startsWith('g4.')) {
    if (!('DecompressionStream' in window)) throw new Error('Nettleseren kan ikke åpne denne delingslenka. Prøv en nyere nettleser.');
    json = await dekomprimer(B64.utBytes(kode.slice(3)));
  } else if (kode.startsWith('j4.')) {
    json = B64.ut(kode.slice(3));
  } else {
    json = B64.ut(kode);
  }
  if (json.length > 5000000) throw new Error('Delingslenka inneholder for mye data.');
  return JSON.parse(json);
}

/** Avtrykk av stabile transaksjonsnøkler, uavhengig av importrekkefølgen. */
function fingeravtrykk(poster) {
  return kortHash(poster.map((p) => p.delingsnokkel || '').sort().join(';'));
}

/** Avtrykket fra versjon 2 beholdes bare for å kunne lese gamle lenker. */
function fingeravtrykkV2(poster) {
  return kortHash(poster.map((p) => `${p.dato}|${p.belop}`).sort().join(';'));
}

const TEGN = '0123456789abcdefghijklmnopqrstuvwxyz';

async function lagDelingskode() {
  sikreDelingsnokler();
  const poster = aktivePoster();
  const fakturaer = S.fakturaer.filter((f) => poster.some((p) => p.faktura === f.id));
  const fakturaIndeks = new Map(fakturaer.map((f, i) => [f.id, i]));
  return pakkDeling({
    v: 4,
    fra: S.jeg ? pottNavn(S.jeg) : 'Den andre',
    potter: S.potter.map((p) => ({ n: p.navn, t: p.type })),
    betaler: S.potter.findIndex((p) => p.id === S.betaler),
    fakturaer: fakturaer.map((f) => ({ n: f.navn, k: f.kilde || '' })),
    poster: poster.map((p) => ({
      k: p.delingsnokkel,
      d: p.dato || '',
      x: p.tekst,
      b: p.belop,
      e: p.eier || '',
      f: fakturaIndeks.get(p.faktura) || 0,
      p: S.potter.findIndex((x) => x.id === p.pott),
    })),
  });
}

async function delingslenke() {
  const base = location.origin + location.pathname;
  return `${base}#deling=${await lagDelingskode()}`;
}

function gyldigV4(d) {
  return d && d.v === 4 && Array.isArray(d.potter) && d.potter.length > 0
    && d.potter.length <= 30 && Array.isArray(d.fakturaer) && d.fakturaer.length <= 100
    && Array.isArray(d.poster) && d.poster.length > 0 && d.poster.length <= 10000
    && d.poster.every((p) => p && typeof p.x === 'string' && Number.isFinite(Number(p.b))
      && Number.isInteger(p.f) && p.f >= 0 && p.f < d.fakturaer.length
      && Number.isInteger(p.p) && p.p >= 0 && p.p < d.potter.length);
}

function visMottattDeling(d) {
  mottattDeling = d;
  const antall = d.poster.length;
  const sum = d.poster.reduce((total, p) => total + Number(p.b), 0);
  $('#deling-mottatt').hidden = false;
  $('#deling-mottatt-tittel').textContent = `${d.fra || 'Den andre'} har delt et oppgjør`;
  $('#deling-mottatt-info').textContent = `${antall} ${antall === 1 ? 'kjøp' : 'kjøp'} · ${kr(sum)} · ${d.fakturaer.length} ${d.fakturaer.length === 1 ? 'regning' : 'regninger'}`;
  $('#deling-mottatt-melding').textContent = S.poster.length
    ? 'Når du velger, erstatter dette oppgjøret det du har åpent nå.' : '';
  $('#faktura-panel').hidden = true;
  $('#oppsett-panel').hidden = true;
  $('#slippsone').hidden = true;
  visSkjerm('start');
  $('#deling-mottatt').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Oppretter en lokal bunke fra hele oppgjøret i versjon 4-lenka. */
function importerMottattDeling(godta) {
  const d = mottattDeling;
  if (!gyldigV4(d)) return { feil: 'Delingslenka mangler deler av oppgjøret.' };
  pottTeller = 0;
  S.potter = d.potter.map((p) => nyPott(String(p.n || 'Pott').slice(0, 50), POTTTYPER[p.t] ? p.t : 'person'));
  S.fakturaer = d.fakturaer.map((f, i) => ({
    id: `delt-f${i + 1}`,
    navn: String(f.n || `Regning ${i + 1}`).slice(0, 60),
    kilde: String(f.k || 'Delt oppgjør').slice(0, 80),
    antall: 0, sum: 0, fra: null, til: null,
  }));
  const deres = {};
  S.poster = d.poster.map((rad, i) => {
    const id = `delt-${i + 1}-${kortHash(rad.k || `${rad.d}|${rad.x}|${rad.b}`)}`;
    const post = {
      id, dato: rad.d || '', tekst: rad.x, belop: ore(Number(rad.b)),
      eier: rad.e || null, faktura: S.fakturaer[rad.f].id,
      delingsnokkel: rad.k || null, pott: godta ? S.potter[rad.p].id : null,
    };
    deres[id] = S.potter[rad.p].navn;
    return post;
  });
  S.fakturaer.forEach((f) => {
    const poster = S.poster.filter((p) => p.faktura === f.id);
    const datoer = poster.map((p) => p.dato).filter(Boolean).sort();
    f.antall = poster.length;
    f.sum = ore(poster.reduce((sum, p) => sum + p.belop, 0));
    f.fra = datoer[0] || null;
    f.til = datoer[datoer.length - 1] || null;
    f.fingeravtrykk = fakturaFingeravtrykk(poster);
  });
  S.jeg = (personer().find((p) => p.navn.toLowerCase() !== String(d.fra || '').toLowerCase()) || {}).id || null;
  S.betaler = S.potter[d.betaler] ? S.potter[d.betaler].id : null;
  S.periode = { fra: null, til: null, faktura: null };
  S.historikk = []; S.tvist = []; S.filter = 'alle';
  S.andre = { navn: d.fra || 'Den andre', tildeling: deres, sammenlignet: godta };
  mottattDeling = null;
  $('#deling-mottatt').hidden = true;
  $('#oppsett-panel').hidden = false;
  $('#slippsone').hidden = false;
  lagre(); tegnPotter(); tegnFakturaer();
  visSkjerm(godta ? 'oppgjor' : 'sveip');
  return { navn: S.andre.navn, antall: S.poster.length };
}

/**
 * Tar imot den andres fordeling. Enighet beholdes, uenighet legges
 * først i køen, og det bare den andre har tatt, hentes inn.
 */
async function brukDelingskode(rå) {
  const kode = String(rå).trim().replace(/^.*#deling=/, '');
  let d;
  try { d = await lesDelingsdata(kode); } catch (feil) { return { feil: feil.message || 'Koden ser ikke riktig ut. Kopier hele lenka på nytt.' }; }
  if (d && d.v === 4) {
    if (!gyldigV4(d)) return { feil: 'Delingslenka mangler deler av oppgjøret.' };
    visMottattDeling(d);
    return { mottatt: true, navn: d.fra || 'Den andre', antall: d.poster.length };
  }
  const erV3 = d && d.v === 3 && Array.isArray(d.fordeling);
  const erV2 = d && typeof d.tild === 'string';
  if (!d || (!erV3 && !erV2) || !Array.isArray(d.potter)) return { feil: 'Koden mangler innhold.' };
  if (!S.poster.length) return { feil: 'Last inn den samme regninga først, så kan dere sammenlikne.' };
  sikreDelingsnokler();
  const lokaltAvtrykk = erV3 ? fingeravtrykk(S.poster) : fingeravtrykkV2(S.poster);
  if (d.fp !== lokaltAvtrykk) {
    return { feil: 'Dette er andre regninger enn dem du har lastet inn. Begge må bruke de samme filene.' };
  }
  if (erV2 && d.tild.length !== S.poster.length) return { feil: 'Antall utgifter stemmer ikke. Begge må bruke de samme filene.' };

  let etterNokkel = null;
  if (erV3) {
    if (d.fordeling.length !== S.poster.length) return { feil: 'Antall utgifter stemmer ikke. Begge må bruke de samme filene.' };
    etterNokkel = new Map(d.fordeling.filter((rad) => Array.isArray(rad) && rad.length === 2));
    if (etterNokkel.size !== S.poster.length || S.poster.some((p) => !etterNokkel.has(p.delingsnokkel))) {
      return { feil: 'Delingslenka mangler noen av utgiftene. Kopier en ny lenke og prøv igjen.' };
    }
  }
  const delteTegn = erV3 ? Array.from(etterNokkel.values()) : Array.from(d.tild);
  if (d.potter.length > TEGN.length || delteTegn.some((tegn) => tegn !== '-'
    && (TEGN.indexOf(tegn) < 0 || !d.potter[TEGN.indexOf(tegn)]))) {
    return { feil: 'Delingslenka inneholder ukjente potter. Kopier en ny lenke og prøv igjen.' };
  }

  // Potter den andre har, men ikke du, legges til.
  let nye = 0;
  d.potter.forEach((p) => {
    if (!S.potter.some((x) => x.navn.toLowerCase() === String(p.n).toLowerCase())) {
      S.potter.push(nyPott(p.n, POTTTYPER[p.t] ? p.t : 'person'));
      nye += 1;
    }
  });

  const deres = {};
  let enige = 0; let uenige = 0; let hentet = 0;
  const tvist = [];
  S.poster.forEach((post, i) => {
    const tegn = erV3 ? etterNokkel.get(post.delingsnokkel) : d.tild[i];
    const idx = TEGN.indexOf(tegn);
    if (idx < 0 || !d.potter[idx]) return;
    const navn = d.potter[idx].n;
    deres[post.id] = navn;
    const min = post.pott ? pottNavn(post.pott).toLowerCase() : null;
    if (!min) {
      const treff = S.potter.find((x) => x.navn.toLowerCase() === String(navn).toLowerCase());
      if (treff) { post.pott = treff.id; hentet += 1; }
    } else if (min === String(navn).toLowerCase()) {
      enige += 1;
    } else {
      tvist.push(post.id); uenige += 1;
    }
  });

  S.andre = { navn: d.fra || 'Den andre', tildeling: deres };
  S.tvist = tvist;
  S.historikk = [];
  lagre();
  return { enige, uenige, hentet, nye, navn: S.andre.navn };
}

/* ─── 7. OPPGJØR ────────────────────────────────────────── */

/**
 * Hver person betaler sine egne utgifter pluss sin del av felles.
 * Potter merket «utenfor» holdes helt utenfor delingen.
 * Den siste personen får eventuelle øre til overs, så summene
 * går nøyaktig opp i regninga.
 */
function beregn() {
  const perPott = {};
  S.potter.forEach((p) => { perPott[p.id] = { sum: 0, antall: 0 }; });
  let usortert = { sum: 0, antall: 0 };

  aktivePoster().forEach((p) => {
    if (!p.pott || !perPott[p.pott]) { usortert.sum = ore(usortert.sum + p.belop); usortert.antall += 1; return; }
    perPott[p.pott].sum = ore(perPott[p.pott].sum + p.belop);
    perPott[p.pott].antall += 1;
  });

  const pers = personer();
  const fellesSum = ore(S.potter.filter((p) => p.type === 'felles')
    .reduce((s, p) => s + perPott[p.id].sum, 0));
  const utenfor = S.potter.filter((p) => p.type === 'utenfor')
    .map((p) => ({ ...p, ...perPott[p.id] }))
    .filter((p) => p.antall > 0);
  const utenforSum = ore(utenfor.reduce((s, p) => s + p.sum, 0));

  const aaDele = ore(pers.reduce((s, p) => s + perPott[p.id].sum, 0) + fellesSum);
  const fordelte = fordelAndeler(pers.map((p) => ({ id: p.id, egne: perPott[p.id].sum })), fellesSum);
  const andeler = pers.map((p, i) => ({
    pott: p,
    egne: perPott[p.id].sum,
    antall: perPott[p.id].antall,
    del: fordelte[i].del,
    betaler: fordelte[i].betaler,
  }));

  return {
    perPott, usortert, fellesSum, utenfor, utenforSum, aaDele, andeler,
    total: ore(aaDele + utenforSum + usortert.sum),
  };
}

function tegnOppgjor() {
  const r = beregn();

  // Dommen
  const dom = $('#dom');
  dom.textContent = '';
  if (!r.andeler.length) {
    dom.textContent = 'Legg til minst én person-pott for å få et oppgjør.';
  } else if (S.betaler && S.betaler !== 'ingen') {
    const skyldnere = r.andeler.filter((a) => a.pott.id !== S.betaler && a.betaler > 0.5);
    dom.textContent = skyldnere.length
      ? `${skyldnere.map((a) => `${a.pott.navn} skylder ${krHel(a.betaler)}`).join(', ')} til ${pottNavn(S.betaler)}.`
      : 'Ingen skylder noe.';
  } else {
    dom.textContent = r.andeler.map((a) => `${a.pott.navn} betaler ${krHel(a.betaler)}`).join(' · ');
  }

  // Ett kort per person, pluss felles og eventuelt utenfor
  const totaler = $('#totaler');
  totaler.textContent = '';
  const kort = (navn, sum, under, farge) => {
    const li = document.createElement('li');
    li.className = 'total';
    li.style.setProperty('--linjefarge', farge);
    li.innerHTML = '<p class="total__navn"></p><p class="total__sum"></p><p class="total__antall"></p>';
    li.children[0].textContent = navn;
    li.children[1].textContent = kr(sum);
    li.children[2].textContent = under;
    totaler.append(li);
  };
  r.andeler.forEach((a) => kort(`${a.pott.navn} betaler`, a.betaler,
    `${kr(a.egne)} egne + ${kr(a.del)} av felles`, a.pott.farge));
  const fellesPotter = S.potter.filter((p) => p.type === 'felles');
  if (fellesPotter.length) {
    const antall = fellesPotter.reduce((s, p) => s + r.perPott[p.id].antall, 0);
    kort('Felles', r.fellesSum, `${antall} utgifter, delt på ${r.andeler.length || 1}`,
      fellesPotter[0].farge);
  }
  r.utenfor.forEach((p) => kort(p.navn, p.sum, `${p.antall} utgifter, utenfor oppgjøret`, p.farge));

  $('#sum-linje').textContent = r.usortert.antall
    ? `${kr(r.aaDele)} fordelt av ${kr(r.total)}`
    : `${kr(r.total)} · hele regninga`;

  const beskjed = $('#melding-sum');
  beskjed.textContent = r.usortert.antall
    ? `${r.usortert.antall} ${r.usortert.antall === 1 ? 'utgift er' : 'utgifter er'} ikke fordelt (${kr(r.usortert.sum)}), og teller ikke med.`
    : '';
  beskjed.dataset.type = r.usortert.antall ? 'feil' : '';

  tegnFiltre(r);
  tegnRader();
}

function tegnFiltre(r) {
  const boks = $('#filtre');
  boks.textContent = '';
  const valg = [{ id: 'alle', navn: `Alle (${aktivePoster().length})` }];
  S.potter.forEach((p) => valg.push({ id: p.id, navn: `${p.navn} (${r.perPott[p.id].antall})` }));
  if (r.usortert.antall) valg.push({ id: 'uten', navn: `Ikke satt (${r.usortert.antall})` });

  valg.forEach((v) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = v.navn;
    b.setAttribute('aria-pressed', String(S.filter === v.id));
    b.addEventListener('click', () => { S.filter = v.id; tegnOppgjor(); });
    boks.append(b);
  });
}

function tegnRader() {
  const liste = $('#rader');
  liste.textContent = '';
  const synlige = aktivePoster().filter((p) => S.filter === 'alle' || (p.pott || 'uten') === S.filter);

  synlige.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'rad';
    li.style.setProperty('--linjefarge', pottFarge(p.pott));
    li.innerHTML = '<span class="rad__dato"></span><span class="rad__tekst"></span>'
      + '<span class="rad__belop"></span><span class="rad__valg"></span>';
    li.children[0].textContent = visDato(p.dato);
    li.children[1].textContent = pentNavn(p.tekst);
    li.children[1].title = p.tekst;
    li.children[2].textContent = (p.belop < 0 ? '− ' : '') + kr(Math.abs(p.belop));

    const valg = li.children[3];
    S.potter.forEach((pt) => {
      const knapp = document.createElement('button');
      knapp.className = 'velg';
      knapp.type = 'button';
      knapp.textContent = pt.navn;
      knapp.style.setProperty('--velgfarge', pt.farge);
      knapp.setAttribute('aria-pressed', String(p.pott === pt.id));
      knapp.setAttribute('aria-label', `Sett ${pentNavn(p.tekst)} til ${pt.navn}`);
      knapp.addEventListener('click', () => {
        p.pott = p.pott === pt.id ? null : pt.id;
        if (p.pott) huskValg(p, p.pott);
        S.tvist = S.tvist.filter((id) => id !== p.id);
        lagre(); tegnOppgjor();
      });
      valg.append(knapp);
    });
    liste.append(li);
  });

  if (!synlige.length) {
    const li = document.createElement('li');
    li.className = 'sum__hint';
    li.textContent = 'Ingen utgifter i denne potten.';
    liste.append(li);
  }
}

/* ─── Eksport ───────────────────────────────────────────── */

function periode() {
  const datoer = aktivePoster().map((p) => p.dato).filter(Boolean).sort();
  if (!datoer.length) return '';
  const fra = datoer[0]; const til = datoer[datoer.length - 1];
  return fra === til ? visDato(fra, true) : `${visDato(fra)} – ${visDato(til, true)}`;
}

function oppsummeringstekst() {
  const r = beregn();
  const linjer = [`Oppgjør${periode() ? ` ${periode()}` : ''}`, `Hele regninga: ${kr(r.total)}`, ''];
  r.andeler.forEach((a) => linjer.push(`${a.pott.navn}: ${kr(a.egne)} egne`));
  if (r.fellesSum) linjer.push(`Felles: ${kr(r.fellesSum)} (delt på ${r.andeler.length || 1})`);
  r.utenfor.forEach((p) => linjer.push(`${p.navn}: ${kr(p.sum)} (utenfor oppgjøret)`));
  linjer.push('');
  r.andeler.forEach((a) => linjer.push(`${a.pott.navn} betaler ${kr(a.betaler)}`));
  if (r.usortert.antall) linjer.push('', `(${r.usortert.antall} utgifter er ikke fordelt)`);
  return linjer.join('\n');
}

function csvCelle(v) {
  const s = String(v == null ? '' : v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function lastNedCsv() {
  const r = beregn();
  const rader = [['Dato', 'Tekst', 'Beløp', 'Pott']];
  S.poster.forEach((p) => rader.push([p.dato || '', p.tekst, nfTo.format(p.belop), pottNavn(p.pott)]));
  rader.push([]);
  r.andeler.forEach((a) => rader.push(['', `${a.pott.navn} egne`, nfTo.format(a.egne), '']));
  if (r.fellesSum) rader.push(['', 'Felles', nfTo.format(r.fellesSum), '']);
  r.utenfor.forEach((p) => rader.push(['', `${p.navn} (utenfor)`, nfTo.format(p.sum), '']));
  r.andeler.forEach((a) => rader.push(['', `${a.pott.navn} betaler`, nfTo.format(a.betaler), '']));

  const csv = rader.map((rad) => rad.map(csvCelle).join(';')).join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kortsveip-oppgjor-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function kopier(tekst) {
  try { await navigator.clipboard.writeText(tekst); return true; } catch { /* fall videre */ }
  const ta = document.createElement('textarea');
  ta.value = tekst;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

/* ─── Eksempeldata ──────────────────────────────────────── */
// Oppdiktet regning, kjørt gjennom den samme parseren som ekte filer.
// Den har både en jobbutgift og to personer, så alle fire potter er i bruk.
const DEMO = `Dato;Forklaring;Beløp;Valuta
03.03.2025;REMA 1000 GRUNERLOKKA OSLO;-438,20;NOK
03.03.2025;RUTER APP OSLO;-465,00;NOK
04.03.2025;FOODORA NORGE AS;-389,00;NOK
05.03.2025;VINMONOPOLET TORSHOV;-612,50;NOK
06.03.2025;H&M HENNES & MAURITZ OSLO;-799,00;NOK
07.03.2025;NETFLIX.COM;-199,00;NOK
08.03.2025;KIWI 812 SANDAKER;-287,45;NOK
09.03.2025;SATS ELIXIA NYDALEN;-549,00;NOK
10.03.2025;CIRCLE K STOROKKRYSSET;-742,10;NOK
11.03.2025;APOTEK 1 STORO;-268,90;NOK
12.03.2025;IKEA FURUSET;-2 349,00;NOK
13.03.2025;REMA 1000 TORSHOV;-521,75;NOK
14.03.2025;OSLO KINO RINGEN;-320,00;NOK
15.03.2025;SPOTIFY P1A2B3C4;-139,00;NOK
16.03.2025;MUSTI OG MIRRI STORO;-478,00;NOK
17.03.2025;SCANDIC HOTEL BERGEN;-2 190,00;NOK
17.03.2025;WIDEROE.NO BODO;-1 890,00;NOK
18.03.2025;KAFFEBRENNERIET GRUNERLOKKA;-96,00;NOK
19.03.2025;ZALANDO SE;-1 249,00;NOK
20.03.2025;REMA 1000 GRUNERLOKKA OSLO;-312,30;NOK
21.03.2025;TELIA NORGE AS;-598,00;NOK
22.03.2025;XXL SPORT & VILLMARK STORO;-1 099,00;NOK
23.03.2025;ZALANDO SE RETUR;249,00;NOK
25.03.2025;INNBETALING TAKK;12 500,00;NOK`;

/* ─── 8. KOBLINGER ──────────────────────────────────────── */

function koble() {
  // Potter
  $('#legg-til-pott').addEventListener('click', () => {
    // «Utenfor» som standard: en pott som feilaktig er «person» tar en andel
    // av felles uten at det synes, mens en feil «utenfor» vises som eget kort.
    S.potter.push(nyPott(`Pott ${S.potter.length + 1}`, 'utenfor'));
    tegnPotter(); lagre();
    const siste = $$('.pott__navn').pop();
    if (siste) { siste.focus(); siste.select(); }
  });

  // Filvelger og slippsone
  const sone = $('#dropzone');
  $('#fil-input').addEventListener('change', async (e) => {
    if (e.target.files && e.target.files.length) await lesInnFiler(e.target.files);
    e.target.value = '';
  });
  ['dragenter', 'dragover'].forEach((n) => sone.addEventListener(n, (e) => {
    e.preventDefault(); sone.classList.add('is-over');
  }));
  ['dragleave', 'drop'].forEach((n) => sone.addEventListener(n, (e) => {
    e.preventDefault(); sone.classList.remove('is-over');
  }));
  sone.addEventListener('drop', async (e) => {
    const filer = e.dataTransfer && e.dataTransfer.files;
    if (filer && filer.length) await lesInnFiler(filer);
    else if (e.dataTransfer) lesInnTekst(e.dataTransfer.getData('text/plain'));
  });

  $('#knapp-les').addEventListener('click', () => lesInnTekst($('#lim-inn').value));
  $('#knapp-demo').addEventListener('click', () => {
    if (!S.potter.some((p) => p.type === 'utenfor')) S.potter.push(nyPott('Jobb', 'utenfor'));
    S.potter[0].navn = S.potter[0].navn === 'Meg' ? 'Espen' : S.potter[0].navn;
    S.potter[1].navn = S.potter[1].navn === 'Samboer' ? 'Victoria' : S.potter[1].navn;
    tegnPotter();
    $('#lim-inn').value = DEMO;
    lesInnTekst(DEMO);
    melding('Eksempeldata lastet, med en jobb-pott på kjøpet. Trykk «Legg til regninga».', 'ok');
  });

  ['#kol-dato', '#kol-tekst', '#kol-belop'].forEach((id) => $(id).addEventListener('change', async () => {
    const overstyr = {
      dato: Number($('#kol-dato').value),
      tekst: Number($('#kol-tekst').value),
      belop: Number($('#kol-belop').value),
    };
    if (sisteFil) vis(await lesFil(sisteFil, overstyr));
    else lesInnTekst(sisteRå, overstyr);
    $('#kolonnevalg').open = true;
  }));
  $('#ta-med-innbetalinger').addEventListener('change', tegnForhandsvisning);
  $('#knapp-legg-til').addEventListener('click', leggTilPoster);
  $('#knapp-start-sveip').addEventListener('click', () => visSkjerm('sveip'));

  // Klikkbar navigasjon mellom skjermene
  $$('.steps__item').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.skjerm !== 'start' && !S.poster.length) return;
    visSkjerm(b.dataset.skjerm);
  }));

  // Perioden
  $('#periode-fra').addEventListener('change', () => settPeriode($('#periode-fra').value, S.periode.til, null));
  $('#periode-til').addEventListener('change', () => settPeriode(S.periode.fra, $('#periode-til').value, null));
  $('#periode-nullstill').addEventListener('click', () => settPeriode(null, null, null));
  $('#knapp-avbryt').addEventListener('click', () => {
    importert = null;
    $('#forhandsvisning').hidden = true;
    $('#lim-inn').value = '';
    melding('');
  });

  // Sveipeskjermen
  $('#knapp-angre').addEventListener('click', angre);
  $('#knapp-usikker').addEventListener('click', () => sveip('usikker'));
  $('#knapp-til-oppgjor').addEventListener('click', () => visSkjerm('oppgjor'));
  $('#knapp-hopp-til-oppgjor').addEventListener('click', () => visSkjerm('oppgjor'));

  // Oppgjøret
  $('#knapp-tilbake').addEventListener('click', () => visSkjerm('sveip'));
  $('#knapp-csv').addEventListener('click', lastNedCsv);
  $('#knapp-kopier').addEventListener('click', async () => {
    const ok = await kopier(oppsummeringstekst());
    const el = $('#melding-sum');
    el.textContent = ok ? 'Oppsummeringen er kopiert.' : 'Fikk ikke kopiert. Marker teksten manuelt.';
    el.dataset.type = ok ? 'ok' : 'feil';
  });

  // Deling og sammenlikning
  $('#knapp-del').addEventListener('click', async () => {
    if (!S.jeg) {
      const el = $('#delings-svar');
      el.hidden = false;
      el.dataset.type = 'feil';
      el.textContent = 'Si først hvem du er, under «Jeg er» på importskjermen. Da vet den andre hvem lenka kommer fra.';
      return;
    }
    const el = $('#delings-svar');
    el.hidden = false;
    if (aktivePoster().some((p) => !p.pott)) {
      el.dataset.type = 'feil';
      el.textContent = 'Fordel alle kjøpene før du deler oppgjøret.';
      return;
    }
    el.dataset.type = '';
    el.textContent = 'Gjør oppgjøret klart …';
    const lenke = await delingslenke();
    $('#delings-lenke').value = lenke;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Kortsveip-oppgjør', text: `${pottNavn(S.jeg)} har delt et oppgjør med deg.`, url: lenke });
        el.dataset.type = 'ok';
        el.textContent = 'Oppgjøret er delt.';
        $('#delings-lenke').hidden = true;
        return;
      } catch (feil) {
        if (feil && feil.name === 'AbortError') { el.textContent = 'Delingen ble avbrutt.'; return; }
      }
    }
    const ok = await kopier(lenke);
    el.dataset.type = ok ? 'ok' : 'feil';
    el.textContent = ok ? 'Hele oppgjøret er kopiert som en lenke. Send den til den du deler med.' : 'Kopier lenka under og send den videre.';
    $('#delings-lenke').hidden = ok;
  });
  $('#knapp-sammenlign').addEventListener('click', async () => {
    const res = await brukDelingskode($('#kode-inn').value);
    const el = $('#delings-svar');
    el.hidden = false;
    if (res.feil) { el.textContent = res.feil; el.dataset.type = 'feil'; return; }
    if (res.mottatt) {
      el.dataset.type = 'ok';
      el.textContent = `Oppgjøret fra ${res.navn} er klart. Velg om du vil godta eller fordele selv.`;
      return;
    }
    el.dataset.type = 'ok';
    el.textContent = `Sammenliknet med ${res.navn}: ${res.enige} dere er enige om, `
      + `${res.hentet} hentet fra ${res.navn}, ${res.uenige} dere er uenige om.`
      + (res.nye ? ` ${res.nye} nye potter lagt til.` : '')
      + (res.uenige ? ' Uenighetene kommer først i sveipebunken.' : '');
    $('#kode-inn').value = '';
    tegnPotter();
    if (res.uenige) visSkjerm('sveip'); else tegnOppgjor();
  });
  $('#knapp-godta-deling').addEventListener('click', () => {
    const res = importerMottattDeling(true);
    if (res.feil) $('#deling-mottatt-melding').textContent = res.feil;
  });
  $('#knapp-fordel-selv').addEventListener('click', () => {
    const res = importerMottattDeling(false);
    if (res.feil) $('#deling-mottatt-melding').textContent = res.feil;
  });

  // Ny regning
  $('#knapp-nullstill').addEventListener('click', () => {
    if (!window.confirm('Nullstille og starte på en ny regning? Fordelingen forsvinner. Pottene og butikkene appen har lært, beholdes.')) return;
    S.poster = []; S.historikk = []; S.tvist = []; S.andre = null;
    S.fakturaer = []; S.periode = { fra: null, til: null, faktura: null };
    importert = null; mottattDeling = null;
    $('#deling-mottatt').hidden = true;
    $('#oppsett-panel').hidden = false;
    $('#slippsone').hidden = false;
    tegnFakturaer();
    try { localStorage.removeItem(KONFIG.lagerNokkel); } catch { /* ignorer */ }
    $('#lim-inn').value = '';
    $('#forhandsvisning').hidden = true;
    melding('');
    visSkjerm('start');
  });

  // Full personvernrydding, også av butikkminnet som «Ny regning» beholder.
  $('#knapp-slett-alt').addEventListener('click', () => {
    if (!window.confirm('Slette alle regninger, fordelinger, potter og innlærte butikkvalg fra denne nettleseren? Dette kan ikke angres.')) return;
    S.fakturaer = []; S.periode = { fra: null, til: null, faktura: null };
    S.poster = []; S.historikk = []; S.tvist = []; S.andre = null;
    S.filter = 'alle'; S.jeg = null; S.betaler = null;
    pottTeller = 0; S.potter = standardPotter();
    minne = {}; importert = null; mottattDeling = null; sisteRå = ''; sisteFil = null; sisteFilNavn = '';
    $('#deling-mottatt').hidden = true;
    $('#oppsett-panel').hidden = false;
    $('#slippsone').hidden = false;
    $('#lim-inn').value = '';
    $('#kode-inn').value = '';
    $('#forhandsvisning').hidden = true;
    $('#delings-svar').hidden = true;
    tegnPotter(); tegnFakturaer(); melding('Alle lokale data er slettet.', 'ok');
    visSkjerm('start');
    try {
      localStorage.removeItem(KONFIG.lagerNokkel);
      localStorage.removeItem(KONFIG.minneNokkel);
    } catch { /* appen er allerede nullstilt i minnet */ }
    if (location.hash) history.replaceState(null, '', location.pathname);
  });

  // Hurtigtaster
  document.addEventListener('keydown', (e) => {
    if (S.skjerm !== 'sveip') return;
    const mål = e.target;
    if (mål && /^(INPUT|TEXTAREA|SELECT)$/.test(mål.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const r = RETNINGER.find((x) => x.tast === e.key);
    if (r) {
      const p = pottForRetning(r.id);
      if (p) { e.preventDefault(); sveip(p); }
    } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
      e.preventDefault(); angre();
    }
  });
}

/* ─── Oppstart ──────────────────────────────────────────── */

async function start() {
  koble();
  const gjenopptatt = hentLagret();
  tegnPotter();
  tegnFakturaer();

  // Delingslenke i adressefeltet kan nå inneholde hele oppgjøret.
  const hash = location.hash || '';
  if (hash.includes('deling=')) {
    const res = await brukDelingskode(hash);
    const el = $('#delings-svar');
    el.hidden = false;
    if (res.feil) {
      el.dataset.type = 'feil';
      el.textContent = res.feil;
      $('#kode-inn').value = hash.replace(/^.*#deling=/, '');
      melding(res.feil, 'feil');
    } else if (!res.mottatt) {
      el.dataset.type = 'ok';
      el.textContent = `Sammenliknet med ${res.navn}: ${res.enige} enige, ${res.hentet} hentet, ${res.uenige} uenige.`;
      tegnPotter();
    }
    history.replaceState(null, '', location.pathname);
  }

  if (mottattDeling) {
    visSkjerm('start');
  } else if (gjenopptatt) {
    visSkjerm(S.skjerm);
    const ig = koen().length;
    si(ig ? `Fortsetter der du slapp, ${ig} igjen` : 'Alt er sortert');
  } else {
    visSkjerm('start');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
