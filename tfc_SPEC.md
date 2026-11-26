# Spec: TFC Insight – Analyse-Dashboard für The Fresh Connection

> Status: **Entwurf zur Freigabe** · Stand 26.11.2026 · Team 6, Kurs „Supply Chain management – November 26“

---

## 1. Ziel

### Was wir bauen
Eine passwortgeschützte Web-App (Docker Compose), die die Spieldaten von *The Fresh Connection* (TFC) pro Runde aufbereitet. Sie

1. zeigt das **ganze Unternehmen als klickbares Flussdiagramm** (Lieferanten → Einkauf → Rohwarenlager → Mischen/Abfüllen → Fertigwarenlager → Kunden, darüber Supply-Chain-Planung, daneben Finanzen/ROI),
2. bereitet die **Berichte, KPIs und Finanzen** je Runde verständlich auf, inklusive Rundenvergleich,
3. lässt eine **KI** (LLM) die Rundendaten analysieren, die **Schwachstellen** benennen und **konkrete Einstellungsänderungen** vorschlagen, die den **ROI** erhöhen sollen.

### Für wen
Die fünf Mitglieder von Team 6. Alle sehen dieselben Daten. Ein Admin (E-Mail aus der `.env`) lädt die Rundendateien hoch und verwaltet die freigeschalteten E-Mail-Adressen.

### Warum
Im Spiel sind die Daten auf viele Tabs, aufklappbare Tabellen und Tooltips verteilt. Zusammenhänge zwischen den Abteilungen sind schwer zu sehen, zum Beispiel: Vitamin-C-Verfügbarkeit → Planerfüllung der C-power-Produkte → Servicegrad → Strafzahlungen → ROI. Die App macht diese Ketten sichtbar und gibt pro Runde eine priorisierte Änderungsliste.

### User Stories
- Als **Teammitglied** öffne ich das Dashboard und sehe sofort den ROI der letzten Runde, die Entwicklung über die Runden und die wichtigsten Schwachstellen.
- Als **Teammitglied** klicke ich im Flussdiagramm auf „Abfüllung“ und sehe Laufzeit, Umrüstzeit, Ausfallzeit, Planerfüllung, die aktuell eingestellten Werte (Schichten, SMED, Speed) und die Vorschläge der KI für diesen Bereich.
- Als **Teammitglied** sehe ich zu jedem Vorschlag: was ich wo im Spiel einstellen soll (Rolle › Tab › Objekt › Parameter), von welchem Wert auf welchen, warum, welche Daten das belegen, welche ROI-Wirkung erwartet wird und welche Risiken es gibt.
- Als **Admin** lade ich nach jeder Runde eine JSON-Datei hoch, die ich mit einem Bookmarklet direkt aus dem TFC-Spiel erzeugt habe.
- Als **Admin** lege ich E-Mail-Adressen an oder entferne sie. Entfernte Nutzer verlieren sofort den Zugang.
- Als **Nutzer** melde ich mich an, indem ich meine E-Mail eingebe und auf den Link in der Mail klicke oder den Code eintippe. Danach bleibe ich 30 Tage eingeloggt.

---

## 2. Capability Map

| Modul-ID | Verantwortung | Hängt ab von |
|---|---|---|
| `auth` | Magic-Link- und Code-Login, Sessions (30 Tage), Allowlist der E-Mail-Adressen, Admin aus ENV, Rollen (admin/member) | – |
| `round-data` | Dateiformat (JSON-Schema v1), Bookmarklet-Export aus TFC, Upload, Validierung, Speicherung und Versionierung pro Runde | `auth` |
| `analysis` | KI-Analyse pro Runde: Prompt, strukturierte Antwort, Validierung gegen die Spieldaten, Caching, Neu-Generierung | `round-data` |
| `dashboard` | Übersichtsseite, klickbares Unternehmens-Flussdiagramm, Detailansichten je Bereich, Rundenvergleich, Darstellung der KI-Ergebnisse | `round-data`, `analysis` |

**Reihenfolge:** `auth` → `round-data` → `analysis` → `dashboard`

Abhängigkeiten zeigen nur in eine Richtung. Die Schnittstellen werden im Kapitel des bereitstellenden Moduls definiert.

---

## 3. Annahmen

1. Ein Spiel, ein Team (Team 6). Kein Multi-Tenant-Betrieb. Die Datenstruktur lässt aber ein `teamId`-Feld zu, damit man später erweitern kann.
2. Die App läuft auf einem eigenen Server hinter einem Reverse Proxy (Plesk/nginx), der TLS terminiert. Compose stellt nur App und Datenbank bereit.
3. Die Oberfläche ist auf Deutsch. Spielbegriffe bleiben im englischen Original (z. B. „Safety stock“, „Delivery window“), damit man sie im Spiel wiederfindet.
4. Mails werden per SMTP verschickt, die Zugangsdaten kommen aus der ENV (z. B. eigener mailcow).
5. Als KI-Anbieter sind **Anthropic (Claude)** und **Google (Gemini)** möglich. Die API-Keys stehen in der ENV. Welcher Anbieter und welches Modell genutzt werden, stellt der Admin in den Einstellungen um (Default aus der ENV). Details: Abschnitt 9.
6. Die App **ändert nie etwas im Spiel**. Sie liest nur hochgeladene Dateien. Einstellungen nimmt der Mensch im Spiel selbst vor.

---

## 4. Tech-Stack

| Bereich | Wahl |
|---|---|
| Framework | **Nuxt** (aktuelle stabile Major-Version bei Projektstart, derzeit Nuxt 4), Vue 3, TypeScript `strict` |
| Server | Nitro-Server-Routen von Nuxt (`server/api/**`) |
| Datenbank | **PostgreSQL** (aktuelle stabile Version, Container `postgres:17-alpine` o. neuer) |
| ORM / Migrationen | Drizzle ORM + drizzle-kit |
| Validierung | Zod (Upload-Schema, API-Eingaben, KI-Antwort) |
| UI | Nuxt UI (Tailwind) |
| Flussdiagramm | Vue Flow (`@vue-flow/core`) |
| Charts | Apache ECharts über `vue-echarts` |
| Mail | Nodemailer (SMTP) |
| KI | `@anthropic-ai/sdk` (Claude) und `@google/genai` (Gemini), hinter einem gemeinsamen Interface `LlmProvider` |
| Tests | Vitest + `@nuxt/test-utils`, Playwright (E2E) |
| Paketmanager | pnpm |
| Lokale Mail im Dev | Mailpit (nur im Compose-Profil `dev`) |

> Neue Abhängigkeiten über diese Liste hinaus: siehe Grenzen, „Vorher fragen“.

---

## 5. Commands

```bash
# Entwicklung
pnpm install
docker compose --profile dev up -d db mailpit   # Postgres + Mailpit lokal
pnpm db:migrate                                 # drizzle-kit migrate
pnpm dev                                        # http://localhost:3000

# Qualität
pnpm lint                                       # eslint . --max-warnings 0
pnpm typecheck                                  # nuxi typecheck
pnpm test                                       # vitest run --coverage
pnpm test:e2e                                   # playwright test

# Bookmarklet bauen (minifiziert nach public/bookmarklet/)
pnpm build:bookmarklet

# Produktion
cp .env.example .env                            # Werte eintragen
docker compose up -d --build                    # app + db, Migration läuft beim Start
docker compose logs -f app
```

### ENV-Variablen (`.env.example`)

```dotenv
# Pflicht
APP_URL=https://tfc.example.de           # öffentliche URL, für Links in Mails
ADMIN_EMAIL=admin@example.de             # immer erlaubt, immer Admin
SESSION_SECRET=                          # >= 32 Zeichen, signiert Cookies
DATABASE_URL=postgres://tfc:tfc@db:5432/tfc
POSTGRES_PASSWORD=

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="TFC Insight <noreply@example.de>"

# KI – mindestens ein Anbieter muss konfiguriert sein, damit die Analyse läuft
AI_PROVIDER=anthropic                    # Default-Anbieter: anthropic | gemini (im Admin-UI umstellbar)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5-5        # Default-Modell für Claude
GEMINI_API_KEY=
GEMINI_MODEL=                            # Default-Modell für Gemini, z. B. aktuelles Gemini-Pro-Modell

# Optional
LOGIN_TOKEN_TTL_MINUTES=15
SESSION_TTL_DAYS=30
UPLOAD_MAX_MB=10
```

Die App startet nicht, wenn eine Pflichtvariable fehlt oder `SESSION_SECRET` zu kurz ist. Sie meldet dann klar, welche Variable fehlt.

---

## 6. Projektstruktur

```
tfc-dashboard/
├─ SPEC.md
├─ docker-compose.yml          # services: app, db (+ mailpit im Profil dev)
├─ Dockerfile                  # multi-stage, node:22-alpine, non-root user
├─ .env.example
├─ nuxt.config.ts
├─ drizzle.config.ts
├─ app/
│  ├─ pages/
│  │  ├─ login.vue             # E-Mail eingeben
│  │  ├─ login/verify.vue      # Code eingeben / Link-Landing
│  │  ├─ index.vue             # Übersicht (aktuellste Runde)
│  │  ├─ rounds/[round]/index.vue        # Unternehmens-Flussdiagramm + KI-Ergebnis
│  │  ├─ rounds/[round]/[area].vue       # Detailansicht je Bereich
│  │  ├─ compare.vue           # Rundenvergleich
│  │  └─ settings/
│  │     ├─ rounds.vue         # Upload, Liste, Löschen (Admin)
│  │     ├─ users.vue          # Allowlist (Admin)
│     ├─ ai.vue             # KI-Anbieter und Modell (Admin)
│  │     └─ bookmarklet.vue    # Anleitung + Bookmarklet zum Ziehen
│  ├─ components/
│  │  ├─ flow/                 # CompanyFlow.vue, AreaNode.vue
│  │  ├─ charts/               # KpiTrend.vue, CostWaterfall.vue …
│  │  ├─ analysis/             # WeaknessCard.vue, RecommendationCard.vue
│  │  └─ tables/               # ReportTable.vue (Zahlen formatiert)
│  ├─ composables/
│  └─ middleware/auth.global.ts
├─ server/
│  ├─ api/
│  │  ├─ auth/{request,verify,logout,me}.ts
│  │  ├─ users/…               # admin only
│  │  ├─ rounds/…              # upload, list, get, delete
│  │  └─ analysis/…            # get, regenerate
│  ├─ db/schema.ts
│  ├─ db/migrations/
│  ├─ utils/                   # session.ts, mail.ts, rateLimit.ts, env.ts
│  └─ services/
│     ├─ round-data/           # schema.ts (Zod v1), normalize.ts
│     └─ analysis/             # prompt.ts, response-schema.ts, validate.ts, run.ts
│        └─ providers/         # types.ts (LlmProvider), anthropic.ts, gemini.ts, index.ts (Auswahl)
├─ shared/
│  ├─ round-schema.ts          # Zod-Schema v1 (geteilt Client/Server/Bookmarklet)
│  └─ areas.ts                 # Definition der Flussdiagramm-Bereiche
├─ bookmarklet/
│  ├─ src/export.ts            # Exportlogik (läuft im TFC-Tab)
│  └─ build.ts                 # esbuild → public/bookmarklet/
└─ tests/
   ├─ fixtures/round-0.json    # echte Runde 0 von Team 6 (aus Export vom 26.11.2026)
   ├─ fixtures/tfc-html/       # gespeicherte HTML-Antworten des Spiels für Bookmarklet-Tests
   ├─ unit/
   ├─ integration/
   └─ e2e/
```

---

## 7. Modul `auth`

### Verhalten
1. `/login`: Der Nutzer gibt seine E-Mail ein → `POST /api/auth/request`.
2. Ist die E-Mail auf der Allowlist oder gleich `ADMIN_EMAIL` (Vergleich case-insensitiv, getrimmt), verschickt der Server eine Mail mit
   - einem **Link** `APP_URL/login/verify?token=…` (32 Byte Zufall, base64url) und
   - einem **6-stelligen Code**.
   Beide sind **15 Minuten** gültig und **einmal** verwendbar. Eine neue Anfrage macht ältere Tokens dieser E-Mail ungültig.
3. **Keine User-Enumeration:** Die Antwort ist immer gleich („Falls die Adresse freigeschaltet ist, kommt gleich eine Mail“), egal ob die Adresse erlaubt ist.
4. Link-Klick oder Code-Eingabe (`POST /api/auth/verify`) erzeugt eine Session. Das Cookie ist `httpOnly`, `Secure` (in Produktion), `SameSite=Lax`, `Max-Age` = 30 Tage, Name `tfc_session`.
5. Die Session-ID wird nur gehasht (SHA-256) in der DB gespeichert, ebenso Tokens und Codes.
6. **Rate Limits:** höchstens 5 Login-Anfragen pro E-Mail und 20 pro IP in 15 Minuten. Höchstens 5 falsche Code-Eingaben pro Token, danach ist das Token ungültig.
7. `POST /api/auth/logout` löscht die Session. Wird eine E-Mail von der Allowlist entfernt, werden **alle Sessions dieser E-Mail sofort gelöscht**.
8. `ADMIN_EMAIL` ist immer erlaubt und immer Admin, auch wenn sie nicht in der DB steht. Sie kann in der Oberfläche nicht gelöscht werden.

### Rollen
| Rolle | Darf |
|---|---|
| `admin` | alles: Runden hochladen/löschen, Analyse neu erzeugen, Allowlist verwalten |
| `member` | alles lesen, Analyse ansehen |

### Datenmodell (Auszug)
```ts
allowed_emails  (id, email UNIQUE, created_at, created_by)
login_tokens    (id, email, token_hash, code_hash, expires_at, used_at, failed_attempts, created_at)
sessions        (id_hash PK, email, created_at, expires_at, last_seen_at, user_agent)
```

### Schnittstelle für andere Module
`requireUser(event) → { email, role }` und `requireAdmin(event)`. Beide werfen 401 bzw. 403.

### Akzeptanzkriterien
- [ ] Eine nicht freigeschaltete E-Mail bekommt keine Mail, die API-Antwort ist aber identisch mit der für eine freigeschaltete.
- [ ] Ein Link nach 15 Minuten oder bei zweiter Verwendung führt zu „Link abgelaufen“.
- [ ] Nach dem Login ist das Cookie 30 Tage gültig. Nach dem Entfernen der E-Mail ist der nächste Request 401.
- [ ] Der sechste falsche Code wird abgelehnt, auch wenn er richtig wäre.
- [ ] `ADMIN_EMAIL` kann sich ohne DB-Eintrag einloggen und sieht die Einstellungen.

---

## 8. Modul `round-data`

### 8.1 Woher die Daten kommen (aus dem Spiel analysiert)

Alle Daten liegen in TFC unter `https://game.thefreshconnection.eu/v10/` und sind für eingeloggte Nutzer per `fetch` (same origin) abrufbar:

| Inhalt | Endpunkt (Runde `R`) | Format |
|---|---|---|
| Berichte je Rolle | `/v10/mycompany/{Role}/history/{R}/{report}/load` | HTML mit `<table class="report-table">` |
| KPI-Dashboard je Rolle | `/v10/mycompany/{Role}/history/{R}/kpidashboard/load` | HTML + Script mit `createKpiChart("id", {…JSON…})` |
| Finanzen | `/v10/mycompany/none/history/{R}/combined_finance/load` | HTML-Tabelle mit Ebenen über CSS-Klassen (`total`, `normal`, `sub`, `subsub`) |
| Entscheidungen einer gespielten Runde | `/v10/history/decisionlog/{Role}?round={R}` | HTML-Formulare (`fieldset` › `legend`, `.form-row`, `input/select`) |
| Entscheidungen der laufenden Runde | `/v10/MyCompany/{Role}/{Tab}` (siehe Tabelle unten) | wie oben |
| Tooltip-Texte | `/v10/tooltip/load/{key}?isEntity=false` | HTML-Fragment |

`Role` ∈ `Purchasing`, `Operations`, `Sales`, `SupplyChainManagement`.

Berichte (Stand v10):

| Rolle | Berichte (`report`) |
|---|---|
| Purchasing | `purchasing_supplier`, `purchasing_component` |
| Operations | `operations_warehousing`, `operations_mixingbottling` |
| Sales | `sales_customer`, `sales_product`, `sales_customerproduct`, `sales_productcustomer` |
| SupplyChainManagement | `scm_component`, `scm_product` |

Entscheidungsseiten der laufenden Runde:

| Rolle | Tab | Pfad |
|---|---|---|
| Purchasing | agreements | `Purchasing/Supplier/Index` |
| Operations | inbound / mixing / bottling / outbound | `Operations/IngaandMagazijn`, `Operations/Mengen`, `Operations/Afvullen`, `Operations/OutboundWarehouse/Index` |
| Sales | agreements / ord.mgmt. / cat.mgmt | `Sales/Customer/Index`, `Sales/Algemeen`, `Sales/ProductRationalisatie` |
| Supply Chain | component / production / product | `SupplyChainManagement/VoorraadBesturingComponenten`, `…/ProductieBesturing`, `…/StockManagement/Index` |

**Besonderheiten, die der Export lösen muss:**
- Eine noch nicht gespielte Runde liefert für Berichte nur eine Fehlerseite („The specified blob does not exist“). Der Export markiert die Runde dann als `"status": "open"` und enthält nur Entscheidungen.
- KPI-Werte referenzieren Objekte über interne IDs (`KPILevel`, z. B. `69816`). Die Namen stehen in den Entscheidungsseiten als `<i data-entitytype="klant" data-entity-id="69816">` neben dem Namen. `KPILevel: null` bedeutet „Gesamt“.
- `sales_customerproduct` und `sales_productcustomer` sind im Spiel aufklappbare, verschachtelte Tabellen. Der Export muss die Hierarchie über die CSS-Klassen der Zeilen auflösen, damit jede Zeile Kunde **und** Produkt kennt.
- Zahlen sind formatierte Strings (`€ 1,319`, `93.4%`, `-0.0%`, `67,394`). Der Export speichert den **Rohstring und den Zahlwert**.
- Gesperrte Felder sind `disabled`/`readonly`. Infos ohne Eingabefeld (z. B. Lead time, Country, Contract index) werden als `kind: "info"` übernommen.

### 8.2 Dateiformat: `tfc-round` JSON, Schema v1

Eine Datei = eine Runde eines Teams. Dateiname-Vorschlag: `tfc_team6_round0_2026-11-26.json`. Zeichensatz UTF-8.

```jsonc
{
  "schema": "tfc-round",
  "schemaVersion": 1,
  "exportedAt": "2026-11-26T14:30:00Z",
  "exporter": { "kind": "bookmarklet", "version": "1.0.0" },
  "game": {
    "version": "v10",
    "course": "Supply Chain management - November 26",
    "team": "Team 6",
    "teamId": 254903
  },
  "round": 0,
  "status": "played",                 // "played" | "open" (laufende Runde, nur Entscheidungen)

  // Stammdaten: alle Objekte, auf die sich Berichte/KPIs/Entscheidungen beziehen
  "entities": {
    "customers":      [{ "id": 69816,  "name": "Food & Groceries" }],
    "suppliers":      [{ "id": 463793, "name": "Mono Packaging Materials", "component": "Pack 1 liter" }],
    "components":     [{ "id": 175120, "name": "Pack 1 liter" }],
    "products":       [{ "id": 225329, "name": "Fressie Orange 1 liter",
                         "spec": { "shelfLifeWeeks": 20, "perOuterBox": 10, "perPalletLayer": 120, "perPallet": 600, "litersPerPack": 1.0 } }],
    "bottlingLines":  [{ "id": 142703, "name": "Swiss Fill 2", "inUse": true }],
    "mixers":         [{ "id": 2, "name": "Fruitmix MQ", "inUse": true }],
    "warehouses":     [{ "id": 13943, "name": "DC Netherlands" }]
  },

  // Finanzen (GuV + ROI). Hierarchie über level + parentKey.
  "finance": {
    "columns": ["current", "previous", "difference"],     // Spaltenköpfe im Spiel: "0", "-1", "Difference"
    "rows": [
      { "key": "income_RoI", "parentKey": null, "level": 0, "label": "ROI",
        "unit": "percent", "values": { "current": -0.0768, "previous": -0.0768, "difference": 0 } },
      { "key": "income_premiespenalties", "parentKey": "income_Revenue", "level": 1, "label": "Bonus or penalties",
        "unit": "eur", "values": { "current": -322708, "previous": -322708, "difference": 0 } }
    ]
  },

  // KPI-Dashboards (Verlauf, enthält auch Vorrunden)
  "kpis": [
    { "role": "SupplyChainManagement", "kpiNumber": 3, "key": "kpi_3",
      "title": "Availability components (%)", "format": "p1", "entityType": "component",
      "points": [ { "round": 0, "entityId": 175132, "entityName": "Vitamin C", "value": 0.8426 },
                  { "round": 0, "entityId": null, "entityName": "Gesamt", "value": 0.9941 } ] }
  ],

  // Berichte: eine Tabelle = Spaltendefinition + Zeilen mit Dimensionen + Werten
  "reports": {
    "scm_product": {
      "role": "SupplyChainManagement",
      "title": "Product",
      "tables": [{
        "title": "Product",
        "dimensions": ["warehouse", "product"],
        "columns": [
          { "key": "demand_per_week_pieces", "label": "Demand per week (pieces)", "unit": "pieces", "tooltipKey": "…" },
          { "key": "service_level_pieces",   "label": "Service level (pieces)",   "unit": "percent" },
          { "key": "stock_value",            "label": "Stock value",              "unit": "eur" }
        ],
        "rows": [
          { "dims": { "warehouse": "DC Netherlands", "product": "Fressie Orange 1 liter" },
            "isTotal": false,
            "cells": {
              "demand_per_week_pieces": { "raw": "67,394",   "value": 67394 },
              "service_level_pieces":   { "raw": "93.4%",    "value": 0.934 },
              "stock_value":            { "raw": "€ 49,522", "value": 49522 }
            } }
        ]
      }]
    }
    // … alle Berichte aus 8.1
  },

  // Entscheidungen: flach, ein Eintrag pro Feld (auch reine Infos)
  "decisions": [
    { "role": "SupplyChainManagement", "tab": "component", "group": "Stock management components",
      "object": { "type": "component", "id": 175132, "name": "Vitamin C" },
      "parameter": "Safety stock (weeks)", "fieldName": "…", "tooltipKey": "componentinput_bestelparameterwaarde",
      "kind": "number", "value": 2.0, "raw": "2.0",
      "constraints": { "min": 0, "max": 8, "step": null },
      "options": null, "editable": true, "locked": false },
    { "role": "Purchasing", "tab": "agreements", "group": "Vitamin C",
      "object": { "type": "supplier", "id": 463777, "name": "Seitan Vitamins" },
      "parameter": "Trade unit", "kind": "select", "value": "Drum",
      "options": ["Drum", "IBC", "Tank"], "editable": true, "locked": false },
    { "role": "Purchasing", "tab": "agreements", "group": "Vitamin C",
      "object": { "type": "supplier", "id": 463777, "name": "Seitan Vitamins" },
      "parameter": "Lead time (days)", "kind": "info", "value": 60, "raw": "60", "editable": false, "locked": false }
  ],

  // Tooltip-Erklärungen aus dem Spiel, Key → Text
  "tooltips": {
    "componentinput_bestelparameterwaarde": "In general, a quantity of stock planned to be in inventory … minimum 0 weeks, maximum 8 weeks."
  }
}
```

**Regeln zum Format**
- `unit` ∈ `eur`, `percent` (als Anteil, also 0.934), `pieces`, `liters`, `weeks`, `days`, `hours`, `fte`, `count`, `ratio`, `text`.
- `kind` ∈ `number`, `select`, `checkbox`, `info`.
- `constraints.min/max` werden aus den Tooltip-Texten gelesen („minimum … is 0 weeks, the maximum is 8 weeks“), wenn das Spiel sie nicht als Attribut liefert.
- Spalten-`key`s werden aus dem Label als `snake_case` erzeugt und sind stabil.
- Unbekannte zusätzliche Felder sind erlaubt (Vorwärtskompatibilität). Pflichtfelder fehlen → Upload wird abgelehnt.
- Das Zod-Schema in `shared/round-schema.ts` ist die **einzige Quelle der Wahrheit** und wird auch als JSON Schema (`/schema/tfc-round.v1.json`) ausgeliefert.

### 8.3 Bookmarklet
- Die Seite `/settings/bookmarklet` zeigt einen Link „TFC exportieren“ zum Ziehen in die Lesezeichenleiste und eine kurze Anleitung.
- Im eingeloggten TFC-Tab angeklickt, öffnet er ein kleines Overlay: Rundenauswahl (Vorschlag: letzte gespielte Runde), Fortschrittsanzeige und Button „Herunterladen“.
- Er lädt alle Endpunkte aus 8.1 per `fetch` (same origin, mit höchstens 4 parallelen Anfragen), baut das JSON v1 und lädt es als Datei herunter. **Er sendet keine Daten an einen anderen Server** und speichert nichts im Spiel.
- Er ist eigenständig, also nicht von externen Skripten abhängig, weil die CSP des Spiels fremde Skripte blockieren kann. Als Fallback gibt es denselben Code zum Einfügen in die Browser-Konsole.
- Stößt er auf unbekannte Strukturen (neue Spielversion), bricht er nicht ab. Er schreibt sie in `warnings[]` in die Datei.

### 8.4 Upload und Speicherung
- `/settings/rounds` (nur Admin): Datei per Drag & Drop, max. 10 MB. Vor dem Speichern gibt es eine Vorschau: Runde, Team, Status, Anzahl Berichte/Entscheidungen, Warnungen.
- Gibt es die Runde schon, wird die neue Datei als **neue Version** gespeichert. Die alte bleibt erhalten und ist wiederherstellbar. Die neueste Version ist aktiv.
- Eine Runde mit Status `open` kann später durch eine `played`-Version ersetzt werden.
- Speicherung: Original-JSON (`jsonb`) plus normalisierte Tabellen für schnelle Abfragen (`kpi_points`, `report_rows`, `decisions`, `finance_rows`).

### Akzeptanzkriterien
- [ ] Das Fixture `tests/fixtures/round-0.json` wird ohne Fehler akzeptiert und alle 10 Berichte, die Finanzen (66 Zeilen), 4 KPI-Dashboards und alle Entscheidungen sind abfragbar.
- [ ] Eine Datei mit `schemaVersion: 2` oder fehlendem `round` wird mit einer verständlichen Fehlermeldung (Feldpfad) abgelehnt.
- [ ] Der Bookmarklet-Parser liefert für die gespeicherten HTML-Fixtures exakt die Werte des Fixtures, z. B. Fressie Orange 1 liter: Demand per week 67.394, Service level (pieces) 0,934.
- [ ] In `sales_customerproduct` hat jede Zeile `customer` und `product`. Die Summe je Produkt entspricht `sales_product` (Toleranz ±3 Stück wegen Rundung).
- [ ] Hochladen derselben Runde erzeugt Version 2. Version 1 ist in der Versionsliste sichtbar und wiederherstellbar.

---

## 9. Modul `analysis` (KI)

### Grundidee
Die **Bewertung** (Schwachstellen und Vorschläge) kommt vollständig von der KI. Die App liefert ihr die Daten aufbereitet und prüft die Antwort maschinell, bevor sie angezeigt wird.

### KI-Anbieter: Claude oder Gemini
- Beide Anbieter laufen hinter demselben Interface. Der Rest des Moduls (Prompt, Schema, Validierung, Speicherung) weiß nicht, welcher Anbieter antwortet:

```ts
// server/services/analysis/providers/types.ts
export interface LlmProvider {
  id: 'anthropic' | 'gemini'
  model: string
  /** Returns JSON that must match `responseJsonSchema`; caller validates with Zod. */
  generateStructured(input: {
    system: string
    user: string
    responseJsonSchema: Record<string, unknown>
    maxOutputTokens: number
  }): Promise<{ json: unknown; usage: { inputTokens: number; outputTokens: number } }>
}
```

- **Claude:** strukturierte Ausgabe über Tool-Use mit dem Antwort-Schema als Tool-Input.
- **Gemini:** strukturierte Ausgabe über `responseMimeType: "application/json"` und `responseSchema`. Gemini unterstützt nicht alle JSON-Schema-Konstrukte. Deshalb wird das Antwort-Schema bewusst einfach gehalten (Objekte, Arrays, Strings, Zahlen, Enums, keine `oneOf`/`$ref`).
- **Einstellungen → KI** (nur Admin):
  - Anbieter auswählen. Nur Anbieter mit gesetztem API-Key sind auswählbar.
  - Modell pro Anbieter eintragen. Die Vorbelegung kommt aus `ANTHROPIC_MODEL` bzw. `GEMINI_MODEL`.
  - Button „Verbindung testen“ (kleiner Testaufruf, zeigt Erfolg oder Fehlermeldung).
  - Die Auswahl wird in der DB gespeichert (`app_settings`) und überschreibt `AI_PROVIDER` aus der ENV.
- **API-Keys bleiben ausschließlich in der ENV.** Sie werden nie in der DB gespeichert, nie an den Browser geschickt und nie geloggt. Die UI zeigt nur „gesetzt / nicht gesetzt“.
- Beim Neu-Analysieren kann der Admin einmalig einen anderen Anbieter wählen, um zwei Analysen derselben Runde zu vergleichen. Beide bleiben gespeichert, die UI zeigt, welche von welchem Modell stammt.

### Ablauf
1. Ein Admin lädt eine `played`-Runde hoch → die Analyse startet automatisch im Hintergrund (Job-Tabelle, Status `queued/running/done/failed`). Die UI zeigt den Fortschritt.
2. **Eingabe an das Modell:**
   - die aktuelle Runde (kompakt: Finanzen, KPIs, alle Berichtstabellen, alle Entscheidungen mit Optionen, Grenzen und Tooltips),
   - eine verdichtete Zusammenfassung aller früheren Runden (ROI, Kosten-Hauptposten, Kern-KPIs, geänderte Entscheidungen),
   - ein fester System-Prompt mit TFC-Domänenwissen: die Abteilungen, typische Zielkonflikte (Servicegrad ↔ Bestand ↔ Obsoletes, Losgröße ↔ Transport ↔ Lagerplatz, Kapazität ↔ Umrüsten) und die ROI-Logik des Spiels,
   - die Liste der **erlaubten Entscheidungen** (nur `editable && !locked`) samt erlaubter Werte.
3. **Ausgabe:** striktes JSON nach `server/services/analysis/response-schema.ts` (über die strukturierte Ausgabe des jeweiligen Anbieters erzwungen, siehe oben):

```jsonc
{
  "summary": "2–4 Sätze Gesamtlage",
  "roiDrivers": [ { "label": "Bonus or penalties", "financeKey": "income_premiespenalties", "impactEur": -322708, "comment": "…" } ],
  "weaknesses": [
    { "id": "w1", "area": "supply-chain", "severity": "high",          // low | medium | high | critical
      "title": "Vitamin C ist zu oft nicht verfügbar",
      "explanation": "…",
      "evidence": [ { "ref": "kpis[SupplyChainManagement/kpi_3]/Vitamin C/round 0", "value": 0.8426 },
                    { "ref": "reports.purchasing_supplier/Seitan Vitamins/delivery_reliability", "value": 0.815 } ] }
  ],
  "recommendations": [
    { "id": "r1", "priority": 1, "area": "supply-chain", "addresses": ["w1"],
      "changes": [ { "role": "SupplyChainManagement", "tab": "component", "object": "Vitamin C",
                     "parameter": "Safety stock (weeks)", "from": 2.0, "to": 6.0 } ],
      "rationale": "…",
      "expectedEffect": { "roiDirection": "up", "estimatedRoiDeltaPp": { "low": 0.5, "high": 2.0 },
                          "kpis": [ { "name": "Service level C-power", "direction": "up" } ] },
      "risks": "…", "dependsOn": ["Purchasing: Vitamin C Agreed delivery reliability"], "confidence": "medium" }
  ]
}
```

4. **Validierung der KI-Antwort (Pflicht):**
   - JSON entspricht dem Schema. Sonst erfolgt ein automatischer Retry (max. 2), danach `failed` mit Fehlermeldung.
   - Jede `change` verweist auf eine existierende, **änderbare** Entscheidung. `from` entspricht dem aktuellen Wert, `to` liegt innerhalb von Optionen bzw. `min/max`. Ungültige Änderungen werden **nicht verworfen, sondern markiert** („Prüfen: Wert außerhalb des erlaubten Bereichs“).
   - Jede `evidence.ref` muss sich auflösen lassen und der Wert muss zu den Daten passen (Toleranz 1 %). Nicht belegbare Evidenz wird als „nicht belegt“ markiert.
5. Das Ergebnis wird je **Runde + Datei-Version + Prompt-Version + Anbieter + Modell** gespeichert. Erneutes Öffnen kostet keine API-Aufrufe. Der Admin kann „Neu analysieren“ auslösen. Alte Analysen bleiben einsehbar.
6. Für jeden Lauf werden Token-Verbrauch und Kosten gespeichert. Ein Limit pro Tag ist per ENV einstellbar (`ANALYSIS_MAX_RUNS_PER_DAY`, Default 10).

### Hinweis in der UI
Die KI-Ergebnisse tragen sichtbar den Hinweis „KI-Vorschlag, vor dem Umsetzen prüfen“. Jeder Vorschlag zeigt seine Belege, damit man ihn nachvollziehen kann.

### Akzeptanzkriterien
- [ ] Für das Fixture Runde 0 entsteht (mit gemocktem Modell) eine Analyse, die gespeichert und angezeigt wird.
- [ ] Eine Modellantwort mit `to: 12` für „Safety stock (weeks)“ (max. 8) wird als ungültig markiert und nicht als umsetzbar angezeigt.
- [ ] Eine Änderung an einem gesperrten Feld (z. B. „Frozen period of production“) wird als ungültig markiert.
- [ ] Ein zweiter Aufruf derselben Analyse löst keinen API-Call aus.
- [ ] Ist weder `ANTHROPIC_API_KEY` noch `GEMINI_API_KEY` gesetzt, funktioniert der Rest der App. Der Analysebereich zeigt „KI nicht konfiguriert“.
- [ ] Mit gemockten Antworten beider Anbieter durchläuft dieselbe Runde dieselbe Validierung und erzeugt Analysen im selben Format.
- [ ] Nach dem Umstellen auf Gemini in den Einstellungen nutzt die nächste Analyse Gemini mit dem eingetragenen Modell, und die Analyse zeigt „Gemini · Modellname“ an.
- [ ] Ein Anbieter ohne API-Key ist in den Einstellungen ausgegraut und nicht auswählbar.
- [ ] Kein API-Key taucht in einer API-Antwort, im HTML oder in den Logs auf.

---

## 10. Modul `dashboard`

### 10.1 Übersicht (`/` → aktuellste Runde)
- Kopf: Runde, Status, ROI dieser Runde mit Veränderung zur Vorrunde, Mini-Verlauf ROI über alle Runden.
- **KI-Zusammenfassung** und die **Top 5 Vorschläge** (sortiert nach Priorität), jeweils mit „Wo im Spiel: Rolle › Tab › Objekt › Parameter: von → nach“.
- Kosten-Wasserfall: Umsatz → Strafen/Boni → Wareneinsatz → Produktion → indirekte Kosten → Ergebnis.

### 10.2 Unternehmens-Flussdiagramm (`/rounds/[round]`)
Ein horizontaler Fluss mit diesen Knoten (`shared/areas.ts`):

```
[Lieferanten ×5] → [Einkauf] → [Rohwarenlager + Tanklager] → [Mischen] → [Abfüllen] → [Fertigwarenlager DC NL] → [Kunden ×3]
                                   ▲─────────── [Supply-Chain-Planung] ───────────▲
                                                                     [Finanzen / ROI] (seitlich, mit allen verbunden)
```

- Jeder Knoten zeigt 2–3 Kennzahlen (z. B. Abfüllen: Planerfüllung, Umrüstzeit %, ungenutzte Kapazität %) und eine **Ampel**. Die Farbe kommt aus der höchsten `severity` der KI-Schwachstellen für diesen Bereich. Ohne Analyse ist der Knoten grau.
- Kanten zeigen Mengenflüsse (z. B. Nachfrage/Woche), die Dicke ist proportional.
- **Klick auf einen Knoten** öffnet rechts ein Detail-Panel (auf Mobilgeräten als Vollbild):
  - **Kennzahlen** mit Verlauf über die Runden,
  - **Berichtstabellen** dieses Bereichs, formatiert, sortierbar, mit Tooltip-Erklärung je Spalte,
  - **Aktuelle Einstellungen** dieses Bereichs mit „änderbar / gesperrt / Info“ und Vergleich zur Vorrunde,
  - **Schwachstellen und Vorschläge** der KI für diesen Bereich.
  - Link „Vollansicht“ → `/rounds/[round]/[area]`.
- Klick auf einen Lieferanten oder Kunden führt in die Detailansicht dieses Objekts.

### 10.3 Rundenvergleich (`/compare`)
- Zwei Runden auswählen: ROI-Differenz, Kostenposten im Vergleich, KPI-Änderungen und eine **Liste aller geänderten Entscheidungen** zwischen den Runden.

### 10.4 Einstellungen (nur Admin)
- **Runden:** Upload, Versionsliste, aktiv setzen, löschen (mit Bestätigung), Analyse neu starten.
- **Nutzer:** E-Mail hinzufügen/entfernen, Liste mit „zuletzt aktiv“.
- **KI:** Anbieter (Claude/Gemini) und Modell wählen, Verbindung testen, Verbrauch der letzten Läufe.
- **Bookmarklet:** Anleitung.

### Nicht-funktionale Anforderungen
- Responsiv ab 375 px Breite. Das Flussdiagramm wird auf schmalen Bildschirmen vertikal angeordnet.
- Ladezeit der Übersicht < 1,5 s bei 5 Runden (ohne KI-Aufruf).
- Zahlen im deutschen Format (`67.394`, `93,4 %`, `49.522 €`), Spielbegriffe auf Englisch.
- Barrierefreiheit: Knoten per Tastatur erreichbar, Ampeln zusätzlich mit Text oder Icon, nicht nur über Farbe.

### Akzeptanzkriterien
- [ ] Mit dem Fixture Runde 0 zeigt die Übersicht ROI −7,68 % und Strafzahlungen −322.708 €.
- [ ] Klick auf „Abfüllen“ zeigt Swiss Fill 2 mit Planerfüllung 78,7 % und die Einstellungen Number of shifts = 2, SMED = aus, Increase speed = aus.
- [ ] Ohne Analyse sind alle Knoten grau und die Seite funktioniert trotzdem.
- [ ] Der Rundenvergleich zwischen Runde 0 und einer geänderten Runde 1 listet genau die geänderten Entscheidungen.

---

## 11. Code-Stil

- TypeScript `strict`, keine `any`. Datenstrukturen werden aus den Zod-Schemas abgeleitet (`z.infer`).
- Vue: `<script setup lang="ts">`, Composition API, Komponenten in PascalCase, Composables `useXyz`.
- Server-Routen sind klein: validieren → Service aufrufen → antworten. Logik liegt in `server/services/**`.
- Dateien und Ordner in kebab-case, Variablen in camelCase, DB-Spalten in snake_case.
- Kommentare auf Englisch, UI-Texte auf Deutsch, an einer Stelle gesammelt (`app/locales/de.ts`).

```ts
// server/api/rounds/[round].get.ts
import { z } from 'zod'
import { requireUser } from '~~/server/utils/session'
import { getActiveRound } from '~~/server/services/round-data/repository'

const params = z.object({ round: z.coerce.number().int().min(0).max(20) })

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const { round } = await getValidatedRouterParams(event, params.parse)
  const data = await getActiveRound(round)
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Runde nicht gefunden' })
  return data
})
```

---

## 12. Teststrategie

| Ebene | Werkzeug | Was |
|---|---|---|
| Unit | Vitest | Zahl-Parser (`€ 1,319` → 1319, `-0.0%` → −0), HTML-Parser des Bookmarklets gegen gespeicherte HTML-Fixtures, Hierarchie-Auflösung, Schema-Validierung, Validierung der KI-Antwort, Token- und Session-Logik |
| Integration | Vitest + `@nuxt/test-utils` + Postgres (Testcontainer oder Compose-DB) | Auth-Flow inkl. Rate Limits, Upload → Normalisierung → Abfrage, Analyse-Job mit gemocktem `LlmProvider` (Claude und Gemini) |
| E2E | Playwright | Login über Mailpit-Mail, Upload des Fixtures, Klick durch das Flussdiagramm, Admin-Allowlist |

- **Kein echter KI-Aufruf in Tests.** Beide Anbieter werden über das Interface `LlmProvider` injiziert und gemockt. Zusätzlich gibt es Vertragstests je Adapter gegen aufgezeichnete Beispielantworten (Claude-Tool-Use-Antwort, Gemini-JSON-Antwort).
- Abdeckung: ≥ 80 % Zeilen in `server/services/**` und `shared/**`, und ≥ 90 % für die Parser in `bookmarklet/`.
- Fixtures: `tests/fixtures/round-0.json` sowie die rohen HTML-Antworten des Spiels (anonymisiert: Spielername entfernt).

---

## 13. Grenzen

**Immer**
- Eingaben serverseitig mit Zod validieren, auch Admin-Uploads.
- Tokens, Codes und Session-IDs nur gehasht speichern.
- Vor jedem Commit `pnpm lint && pnpm typecheck && pnpm test` ausführen.
- KI-Antworten gegen die Spieldaten validieren, bevor sie als umsetzbar angezeigt werden.
- Die Hochladen-Version und die Analyse-Version sichtbar machen (welche Datei, welches Modell, wann).

**Vorher fragen**
- Neue Abhängigkeiten außerhalb von Abschnitt 4.
- Änderungen am Dateiformat (neue `schemaVersion`).
- Änderungen am DB-Schema nach dem ersten produktiven Deployment.
- Einen dritten KI-Anbieter hinzufügen oder das `LlmProvider`-Interface ändern.

**Nie**
- Secrets committen (`.env` steht in `.gitignore`).
- Aus der App heraus Aktionen im TFC-Spiel auslösen (kein Speichern, kein „Deal“, kein Login ins Spiel).
- Daten aus dem Bookmarklet an einen anderen Server als den eigenen Browser-Download senden.
- Spieldaten oder E-Mail-Adressen in Logs schreiben (E-Mails maskieren: `m***@example.de`).
- Fehlschlagende Tests löschen oder überspringen, um grün zu werden.

---

## 14. Erfolgskriterien (gesamt)

1. `docker compose up -d --build` auf einem frischen Server mit ausgefüllter `.env` startet App und DB. Die Migration läuft automatisch, und `/login` ist erreichbar.
2. Login per Link **und** per Code funktioniert. Das Cookie hält 30 Tage. Entfernte Nutzer sind sofort ausgesperrt.
3. Das Bookmarklet erzeugt im eingeloggten TFC-Tab eine gültige Datei für Runde 0. Die Datei lässt sich hochladen und alle Werte stimmen mit dem Spiel überein (Stichprobe aus Abschnitt 10).
4. Nach dem Upload liegt innerhalb von 2 Minuten eine KI-Analyse vor, deren Vorschläge alle auf änderbare Felder mit gültigen Werten verweisen oder sichtbar als ungültig markiert sind.
5. Jeder Knoten im Flussdiagramm ist klickbar und zeigt Kennzahlen, Tabellen, Einstellungen und KI-Hinweise seines Bereichs.
6. Lint, Typecheck, Unit-, Integrations- und E2E-Tests laufen grün.

---

## 15. Offene Fragen

| # | Frage | Annahme bis zur Klärung |
|---|---|---|
| F1 | ~~Welcher KI-Anbieter?~~ | **Geklärt:** Claude und Gemini, im Admin-UI umschaltbar, Keys in der ENV |
| F2 | Domain bzw. Subdomain für die App? | per `APP_URL` frei wählbar |
| F3 | Soll die KI auch Fragen im Chat beantworten können („Was passiert, wenn wir SMED aktivieren?“)? | Nicht in v1, nur die automatische Analyse pro Runde |
| F4 | Sollen Vorschläge mit „umgesetzt / verworfen“ markiert werden können, damit die KI in der nächsten Runde weiß, was ausprobiert wurde? | Nicht in v1, aber im Datenmodell vorgesehen (`recommendation_status`) |
| F5 | Sollen die Mails auf Deutsch sein? | Ja |
