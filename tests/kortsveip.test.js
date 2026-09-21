'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fakturaFingeravtrykk,
  finnUenigheter,
  fordelAndeler,
  kompaktDelingsdata,
  postSignatur,
  transaksjonsNokler,
  utvidDelingsdata,
} = require('../kjerne.js');
const { lesTekst, tilTall } = require('../les.js');

const post = (dato, tekst, belop, eier = null) => ({ dato, tekst, belop, eier });

test('fakturaavtrykket er uavhengig av radrekkefølgen og inkluderer teksten', () => {
  const a = post('2026-08-01', 'REMA 1000', 438.20, 'Espen');
  const b = post('2026-08-02', 'RUTER', 465, 'Victoria');
  assert.equal(fakturaFingeravtrykk([a, b]), fakturaFingeravtrykk([b, a]));
  assert.notEqual(fakturaFingeravtrykk([a]), fakturaFingeravtrykk([{ ...a, tekst: 'KIWI' }]));
});

test('identiske, legitime kjøp får hver sin stabile nøkkel', () => {
  const like = [post('2026-08-01', 'RUTER', 42), post('2026-08-01', 'RUTER', 42)];
  const nokler = transaksjonsNokler(like);
  assert.equal(new Set(nokler).size, 2);
  assert.deepEqual(nokler, transaksjonsNokler(like));
});

test('deling kan slås opp etter transaksjonsnøkkel i ulik importrekkefølge', () => {
  const sas = [post('2026-08-01', 'SAS', 100), post('2026-08-02', 'HOTELL', 200)];
  const amex = [post('2026-08-03', 'AMEX KJØP', 300)];
  const merk = (poster) => {
    const nokler = transaksjonsNokler(poster);
    return poster.map((p, i) => ({ ...p, nokkel: nokler[i] }));
  };
  const sender = [...merk(sas), ...merk(amex)];
  const mottaker = [...merk(amex), ...merk(sas)];
  const fordeling = new Map(sender.map((p, i) => [p.nokkel, i % 2 ? 'Felles' : 'Espen']));
  mottaker.forEach((p) => assert.ok(fordeling.has(p.nokkel), postSignatur(p)));
});

test('norske og engelske beløpsformater tolkes likt', () => {
  assert.equal(tilTall('1 234,56'), 1234.56);
  assert.equal(tilTall('1,234.56'), 1234.56);
  assert.equal(tilTall('(120,00)'), -120);
  assert.equal(tilTall('120,00-'), -120);
});

test('innbetaling flagges og kreditering beholder motsatt fortegn', () => {
  const resultat = lesTekst('Dato;Tekst;Beløp\n01.08.2026;REMA;-100,00\n02.08.2026;KIWI;-50,00\n03.08.2026;INNBETALING TAKK;150,00');
  assert.equal(resultat.poster.length, 3);
  assert.equal(resultat.poster[0].belop, 100);
  assert.equal(resultat.poster[2].belop, -150);
  assert.equal(resultat.poster[2].innbetaling, true);
});

test('øreavrunding går nøyaktig opp også med tre personer', () => {
  const andeler = fordelAndeler([
    { id: 'a', egne: 0 }, { id: 'b', egne: 0 }, { id: 'c', egne: 0 },
  ], 100);
  assert.equal(andeler.reduce((sum, p) => sum + p.betaler, 0), 100);
  assert.deepEqual(andeler.map((p) => p.betaler), [33.33, 33.33, 33.34]);
});

test('bare ulike fordelinger blir markert som uenigheter', () => {
  const poster = [
    { id: '1', pott: 'meg' },
    { id: '2', pott: 'felles' },
    { id: '3', pott: 'samboer' },
  ];
  const navn = { meg: 'Espen', felles: 'Felles', samboer: 'Victoria' };
  const deres = { 1: 'Espen', 2: 'Victoria', 3: 'Victoria' };
  assert.deepEqual(finnUenigheter(poster, deres, (id) => navn[id]), ['2']);
});

test('kompakt deling beholder hele oppgjøret uten transaksjonsnøkler', () => {
  const original = {
    fra: 'Espen',
    potter: [{ n: 'Espen', t: 'person' }, { n: 'Felles', t: 'felles' }],
    betaler: 0,
    fakturaer: [{ n: 'Amex august', k: 'amex.pdf' }],
    poster: [{ k: 'unødvendig.nøkkel.1', d: '2026-08-03', x: 'REMA 1000', b: 438.2, e: 'Espen', f: 0, p: 1 }],
  };
  const kompakt = kompaktDelingsdata(original);
  const utvidet = utvidDelingsdata(kompakt);
  assert.equal(kompakt[0], 5);
  assert.equal(JSON.stringify(kompakt).includes('unødvendig'), false);
  assert.deepEqual(utvidet, {
    v: 5,
    fra: 'Espen',
    potter: original.potter,
    betaler: 0,
    fakturaer: original.fakturaer,
    poster: [{ d: '2026-08-03', x: 'REMA 1000', b: 438.2, e: 'Espen', f: 0, p: 1 }],
  });
});
