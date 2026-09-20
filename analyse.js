/* ============================================================
   FELLESKORTET · FRIVILLIG, ANONYM BRUKSSTATISTIKK

   Slås først på når en PostHog-prosjektnøkkel er satt under.
   Ingen kjøpstekster, beløp, filnavn, pott-navn eller delingslenker
   skal sendes. Autocapture og sesjonsopptak er bevisst deaktivert.
   ============================================================ */
'use strict';

(function startAnalyse() {
  const OPPSETT = {
    prosjektNokkel: 'phc_xR5N7VeHAkjxyFxmZHgMs5qU7fzVwX9RRtPBHn3rDkkY',
    vert: 'https://eu.i.posthog.com',
    samtykkeNokkel: 'felleskortet.analyse.samtykke.v1',
    maltNokkel: 'felleskortet.analyse.malt.v1',
    tidNokkel: 'felleskortet.analyse.tid.v1',
  };

  const ko = [];
  let klar = false;

  function les(nokkel, standard = null) {
    try { return JSON.parse(localStorage.getItem(nokkel)) ?? standard; } catch { return standard; }
  }

  function skriv(nokkel, verdi) {
    try { localStorage.setItem(nokkel, JSON.stringify(verdi)); } catch { /* privat modus */ }
  }

  function samtykke() { return les(OPPSETT.samtykkeNokkel); }

  function tryggeEgenskaper(egenskaper) {
    const trygge = {};
    Object.entries(egenskaper || {}).forEach(([nokkel, verdi]) => {
      if (!/^[a-z][a-z0-9_]*$/.test(nokkel)) return;
      if (typeof verdi === 'boolean' || typeof verdi === 'number') trygge[nokkel] = verdi;
      else if (typeof verdi === 'string' && /^[a-z0-9_-]{1,32}$/i.test(verdi)) trygge[nokkel] = verdi;
    });
    return trygge;
  }

  function spor(navn, egenskaper = {}) {
    if (!OPPSETT.prosjektNokkel || samtykke() !== 'ja') return;
    const hendelse = [navn, tryggeEgenskaper(egenskaper)];
    if (!klar || !window.posthog || typeof window.posthog.capture !== 'function') ko.push(hendelse);
    else window.posthog.capture(...hendelse);
  }

  function sporEnGang(navn, lokalId, egenskaper = {}) {
    if (!OPPSETT.prosjektNokkel || samtykke() !== 'ja') return;
    const malt = les(OPPSETT.maltNokkel, {});
    const nokkel = `${navn}:${lokalId}`;
    if (malt[nokkel]) return;
    malt[nokkel] = Date.now();
    const gamle = Object.entries(malt).sort((a, b) => b[1] - a[1]).slice(0, 100);
    skriv(OPPSETT.maltNokkel, Object.fromEntries(gamle));
    spor(navn, egenskaper);
  }

  function startTidtaking() {
    if (!OPPSETT.prosjektNokkel || samtykke() !== 'ja') return;
    const naa = Date.now();
    const gammel = les(OPPSETT.tidNokkel);
    // En gammel, avbrutt runde skal ikke gjøre neste oppgjør flere dager langt.
    if (!gammel || naa - gammel.startet > 24 * 60 * 60 * 1000) {
      skriv(OPPSETT.tidNokkel, { startet: naa, siste: naa, aktivMs: 0, fordelte: 0 });
    }
  }

  function registrerFordeling(antall = 1) {
    if (!OPPSETT.prosjektNokkel || samtykke() !== 'ja') return {};
    startTidtaking();
    const tid = les(OPPSETT.tidNokkel);
    if (!tid) return {};
    const naa = Date.now();
    // Maks fem minutter mellom to handlinger teller som aktiv tid. Dermed
    // blåser ikke en kaffepause eller en sovende nettleser opp gjennomsnittet.
    const sidenSist = Math.max(0, Math.min(5 * 60 * 1000, naa - tid.siste));
    tid.aktivMs += sidenSist;
    tid.siste = naa;
    tid.fordelte += Math.max(1, antall);
    skriv(OPPSETT.tidNokkel, tid);
    return { assignment_seconds: Number((sidenSist / 1000 / Math.max(1, antall)).toFixed(2)) };
  }

  function avsluttTidtaking(transaksjoner) {
    if (!OPPSETT.prosjektNokkel || samtykke() !== 'ja') return {};
    const tid = les(OPPSETT.tidNokkel);
    if (!tid) return {};
    try { localStorage.removeItem(OPPSETT.tidNokkel); } catch { /* privat modus */ }
    const antall = Math.max(1, Number(transaksjoner) || tid.fordelte || 1);
    const totalSek = Math.max(0, (Date.now() - tid.startet) / 1000);
    const aktivSek = Math.max(0, tid.aktivMs / 1000);
    return {
      duration_seconds: Number(totalSek.toFixed(2)),
      active_duration_seconds: Number(aktivSek.toFixed(2)),
      seconds_per_transaction: Number((aktivSek / antall).toFixed(2)),
    };
  }

  function fjernUrlData(hendelse) {
    if (!hendelse || !hendelse.properties) return hendelse;
    ['$current_url', '$pathname', '$referrer', '$referring_domain', '$host', '$ip'].forEach((k) => {
      delete hendelse.properties[k];
    });
    hendelse.properties.$geoip_disable = true;
    return hendelse;
  }

  function lastPostHog() {
    if (!OPPSETT.prosjektNokkel || samtykke() !== 'ja') return;
    if (window.posthog && typeof window.posthog.capture === 'function') {
      if (typeof window.posthog.opt_in_capturing === 'function') window.posthog.opt_in_capturing();
      klar = true;
      while (ko.length) window.posthog.capture(...ko.shift());
      return;
    }
    if (document.documentElement.dataset.analyseLaster) return;
    document.documentElement.dataset.analyseLaster = 'ja';
    import('https://cdn.jsdelivr.net/npm/posthog-js@1/+esm').then(({ default: posthog }) => {
      window.posthog = posthog;
      posthog.init(OPPSETT.prosjektNokkel, {
        api_host: OPPSETT.vert,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_capture_url_hashes: true,
        disable_session_recording: true,
        person_profiles: 'identified_only',
        persistence: 'localStorage',
        before_send: fjernUrlData,
        loaded: () => {
          klar = true;
          while (ko.length) window.posthog.capture(...ko.shift());
        },
      });
    }).catch(() => { delete document.documentElement.dataset.analyseLaster; });
  }

  function lukkValg() {
    const boks = document.querySelector('#analysevalg');
    if (boks) boks.remove();
  }

  function velg(svar) {
    skriv(OPPSETT.samtykkeNokkel, svar);
    lukkValg();
    if (svar === 'ja') {
      lastPostHog();
      spor('app_opened', { first_after_consent: true });
    }
    else if (window.posthog && typeof window.posthog.opt_out_capturing === 'function') window.posthog.opt_out_capturing();
  }

  function visValg() {
    if (!OPPSETT.prosjektNokkel || document.querySelector('#analysevalg')) return;
    const boks = document.createElement('aside');
    boks.id = 'analysevalg';
    boks.className = 'analysevalg';
    boks.setAttribute('aria-labelledby', 'analysevalg-tittel');
    boks.innerHTML = `
      <div>
        <strong id="analysevalg-tittel">Hjelp oss å gjøre Felleskortet bedre?</strong>
        <p>Vi vil telle anonyme handlinger, som hvor mange som sveiper og fullfører et oppgjør. Vi sender aldri regninger, beløp, butikknavn, filnavn eller fordelinger.</p>
      </div>
      <div class="analysevalg__knapper">
        <button class="btn btn--primary" type="button" data-analyse="ja">Ja, tell anonymt</button>
        <button class="btn btn--ghost" type="button" data-analyse="nei">Nei takk</button>
      </div>`;
    boks.addEventListener('click', (e) => {
      const knapp = e.target.closest('[data-analyse]');
      if (knapp) velg(knapp.dataset.analyse);
    });
    document.body.append(boks);
  }

  window.FelleskortetAnalyse = {
    spor,
    sporEnGang,
    startTidtaking,
    registrerFordeling,
    avsluttTidtaking,
    visValg,
    erAktiv: () => Boolean(OPPSETT.prosjektNokkel && samtykke() === 'ja'),
  };

  if (!OPPSETT.prosjektNokkel) return;
  const visInnstillinger = () => {
    const knapp = document.querySelector('#knapp-analysevalg');
    if (knapp) knapp.hidden = false;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', visInnstillinger, { once: true });
  else visInnstillinger();
  if (samtykke() === 'ja') lastPostHog();
  else if (samtykke() !== 'nei') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', visValg, { once: true });
    else visValg();
  }
})();
