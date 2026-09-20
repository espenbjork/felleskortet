# Privat produktstatistikk

Felleskortet bruker frivillig, anonym produktstatistikk. Analyse er avslått
til en PostHog-prosjektnøkkel er satt i `analyse.js`. Dashboardet skal være
privat i PostHog og bruke EU-regionen.

## Det som aldri sendes

- kjøpstekst, butikknavn eller kategori
- beløp, valuta eller dato
- filnavn eller innhold fra opplastede filer
- navn på personer eller potter
- delingslenker, URL-er eller oppgjørets lokale avtrykk
- sesjonsopptak eller automatisk registrerte klikk

## Dashboard

| Kort | Datagrunnlag |
| --- | --- |
| Anonyme brukere | Unike brukere av `app_opened` |
| Importerte transaksjoner | Sum `transactions_count` på `invoice_imported` |
| Fordelte transaksjoner | Sum `transactions_count` på `transaction_assigned` |
| Ferdige oppgjør | Antall `settlement_completed` |
| Delte oppgjør | Antall `settlement_shared` |
| Åpnede delinger | Antall `shared_settlement_opened` |
| Godtatt eller fordelt på nytt | `shared_settlement_decided`, fordelt på `decision` |
| Uenigheter | Sum `disagreements_count` på `settlement_compared` |
| Eksport | Antall `settlement_exported` |
| Gjennomsnittlig tid per oppgjør | Snitt `active_duration_seconds` på `settlement_completed` |
| Gjennomsnittlig tid per transaksjon | Snitt `seconds_per_transaction` på `settlement_completed` |
| Ventetid mellom fordelinger | Snitt `assignment_seconds` på `transaction_assigned` |

Legg også inn en trakt:

`app_opened` → `invoice_imported` → `swiping_started` →
`settlement_completed` → `settlement_shared`.

Retensjon måles som andelen anonyme brukere som kommer tilbake og sender en
ny `invoice_imported` innen 7 og 30 dager.

Aktiv tid summerer opptil fem minutter mellom hver fordeling. Lengre opphold
regnes som pause, slik at en sovende nettleser ikke ødelegger gjennomsnittet.
