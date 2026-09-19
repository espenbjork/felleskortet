# Kortsveip

Del en regning ved å sveipe hver utgift i en pott. Laget for å slippe å sitte
med kredittkortregninga og en kalkulator den 20. hver måned.

🔗 https://espenbjork.github.io/kortsveip/

Ren HTML, CSS og JS. Ingen rammeverk, ingen byggesteg, ingen server, ingen
produksjonsavhengigheter eller eksterne skrifter. **All kontodata blir liggende
i nettleseren** (`localStorage`), og det finnes ikke noe sted å sende den.

## Hva den gjør

| | |
| --- | --- |
| **Leser regninga** | PDF, regneark (`.xlsx`), CSV, TSV eller limt inn tekst |
| **Flere fakturaer** | Velg eller slipp inn flere filer samtidig, se den samlede bunken og start når du er klar |
| **Tidslinje** | Alt kronologisk, gruppert på måned, med filter på dato |
| **Potter du velger selv** | Personer, felles, og «utenfor» for f.eks. jobbutgifter |
| **Fire sveiperetninger** | → ← ↑ ↓, flere potter blir knapper under kortet |
| **Husker butikker** | «Rema» havnet i Felles sist, så foreslås det neste gang |
| **Tar hele kjeden** | «4 kjøp til fra Rema. Samme der?» |
| **Sammenlikner** | Har begge sveipet, legges uenighetene øverst |
| **Oppgjør** | Egne utgifter + din del av felles, og hvem som skylder hvem |

## Slik henger den sammen

`les.js` gjør en fil om til en liste utgifter. `app.js` gjør resten.

### Innlesing

Fem strategier prøves, og den som finner flest utgifter vinner:

1. **PDF.** Innholdsstrømmene blåses opp, teksten plukkes ut med posisjon, og
   settes sammen til linjer igjen. Fakturaer settes gjerne i to spalter, så
   linjene sorteres spaltevis: leser man radvis, havner en overskrift som «Nye
   transaksjoner for Espen» midt i den andres kjøp. Her kreves dato på hver
   linje, ellers leses rentetabeller og småtekst som kjøp. Skannede PDF-er har
   ingen tekst å hente, og da sier appen fra.
2. **Regneark.** Xlsx er en zip med XML i. Sentralkatalogen leses for hånd,
   `sharedStrings.xml` og første ark blåses opp med `DecompressionStream`, og
   cellene plukkes ut med `DOMParser`. Ingen biblioteker.
3. **Avgrenset tabell.** Gjetter skilletegn (`;` `\t` `,` `|`), finner
   overskriftsrada, ellers gjettes kolonnene ut fra innholdet.
4. **Linjer.** Én transaksjon per linje, limt fra nettbanken.
5. **Blokker.** Loddrett lim der dato, tekst og beløp står under hverandre.

Beløp tolkes både norsk og engelsk: `1 234,56`, `1.234,56`, `438.20`,
`(120,00)`, `120,00-`. Er de fleste beløpene negative, snus fortegnet, så
utgifter alltid er positive videre. Datoer kan være tekst eller regnearkets
dagnummer. Filer som ikke er UTF-8 leses om igjen som windows-1252, for norske
bankeksporter er ofte latin-1.

Fakturaer med flere kort merker hvem kortet tilhører, enten som en egen rad
(`540185******6963 | Victoria Steen`) eller som en overskrift («Nye
transaksjoner for Espen Bjørk»). Begge fanges opp, og kortet viser hvem kjøpet
gikk på. Kontogebyrer og innbetalinger nullstiller eieren, så de ikke havner på
den som tilfeldigvis sto sist. Det er et hint, ikke en fordeling: hvem som brukte kortet er
sjelden det samme som hvem utgiften er.

### Potter

En pott har et navn, en farge og en type:

| Type | Betyr |
| --- | --- |
| `person` | Egne utgifter. Er med i delingen av felles. |
| `felles` | Deles likt mellom alle person-potter. |
| `utenfor` | Holdes helt utenfor oppgjøret, f.eks. jobbutgifter som refunderes. |

De fire første pottene får hver sin sveiperetning, i rekkefølgen → ← ↑ ↓.
Resten får knapper under kortet. Er det færre enn fire potter, blir ↓ til
«usikker», som legger kortet bakerst i bunken.

En ny pott blir `utenfor` som standard. En pott som feilaktig er `person` tar
en andel av felles uten at det synes noe sted, mens en feil `utenfor` dukker
opp som sitt eget kort i oppgjøret.

### Flere fakturaer og perioden

Bunken kan inneholde regninger fra flere kortleverandører. Hvert kjøp husker
hvilken faktura det kom fra. Hele fakturaen får et innholdsavtrykk, så samme
fil stoppes ved ny import, mens to legitime kjøp med samme dato, beløp og tekst
beholdes.

Sveipebunken er **kronologisk på tvers av regningene**, ikke én regning av
gangen. Har du SAS Mastercard og Amex for samme måned, sveiper du august én
gang, i den rekkefølgen kjøpene faktisk skjedde. Kjøp uten dato havner bakerst.
Ligger det mer enn én regning i bunken, viser kortet hvilken det kom fra.

Regninga får navn etter fila, eller «Limt inn <dato>» når den er limt. To like
navn ville gjort både periodevalget og kryssene ubrukelige, så den andre blir
«… (2)». Trykk på navnet i lista for å kalle den «Amex» i stedet.

Flere filer kan velges eller slippes inn samtidig. De leses etter tur og legges
i den samme bunken uten at sveipingen starter. Kvitteringen øverst viser for
eksempel «98 transaksjoner funnet» og «68 fra SAS Mastercard og 30 fra Amex»,
med hver regning listet med antall, datospenn og sum. Du kan legge til flere,
gi regningene navn og kontrollere totalen før du trykker «Start sveipingen».

Velges én fil, vises forhåndsvisningen og kolonnevalget før den legges til.
Velges flere samtidig, brukes den automatiske tolkningen, og innbetalinger
holdes utenfor. En fil som trenger manuelt kolonnevalg kan legges til separat.

Periodevalget øverst gjelder **overalt**: sveiping, oppgjør og tidslinje ser
den samme utvalgte bunken. Det er med vilje: med to fakturaer i bunken ville et
oppgjør over alt vært et oppgjør for ingenting spesielt. Står det et utvalg,
sier linja under hvor mange kjøp som ligger utenfor.

Velger du en **regning**, filtreres det på selve regninga, ikke på datoene
hennes. To kort for samme måned overlapper alltid i tid, så et datointervall
kan ikke skille dem: «Amex» ville tatt med SAS-kjøpene som falt innenfor, og
begge knappene ville vist et vilkårlig miks. Datofeltene er for utsnitt på
tvers. En ny import nullstiller utvalget, ellers ville de nye kjøpene ligget
skjult bak et filter du satte for noe annet.

### Oppgjøret

```
andel = egne utgifter + (felles / antall personer)
```

Den siste personen får eventuelle øre til overs, så summene går nøyaktig opp i
regninga. Potter merket `utenfor` er ikke med i `felles`-delingen og vises for
seg.

### Deling

«Kopier delingslenke» pakker fordelingen i `#deling=…` bakerst i adressen.
`#`-delen sendes aldri til noen server, så lenka kan gå i en melding uten at
tallene tar veien om noen andre.

Lenka inneholder **bare** fordelingen, ikke utgiftene: pottenavn, en stabil
transaksjonsnøkkel, ett tegn per utgift og et kort avtrykk av regninga. Nøklene
gjør at to personer kan importere flere fakturaer i ulik rekkefølge uten at
valgene havner på feil kjøp. Begge må ha lastet inn de samme regningene. Er
avtrykket et annet, sier appen fra i stedet for å blande dem.

Når den andres lenke leses inn:

- **Enige** → beholdes.
- **Bare den andre har tatt den** → hentes inn.
- **Uenige** → legges først i køen, og kortet viser begges valg.

## Justeringer

| Hva | Hvor |
| --- | --- |
| Sveipeterskler, antall retninger | `KONFIG` øverst i `app.js` |
| Kategori-ikoner | `KATEGORIER` i `app.js` |
| Pottfarger | `PALETT` i `app.js` |
| Kolonnegjenkjenning | `HODE` i `les.js` |
| Spalteavstand i PDF-er | `GAP` i `sorterSpaltevis` i `les.js` |

## Lokale data

«Ny regning» fjerner regning og fordeling, men beholder potter og butikkminne.
«Slett alle lokale data» nederst på siden fjerner også dette minnet. Appen
bruker systemskrifter og gjør ingen eksterne nettverkskall.

## Taster

→ ← ↑ ↓ sveiper til de fire første pottene. `Z` angrer.

## Ikke gjort ennå

- Koble en transaksjon til kvitteringen, f.eks. Rema-historikk, så du ser hva
  som faktisk lå i handlekurven. Det er ofte der «er dette felles?» avgjøres.
- Flere enn to personer er støttet i regnestykket, men oppgjørsteksten er
  skrevet for to.
