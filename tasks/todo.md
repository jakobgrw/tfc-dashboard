# Aufgabenliste: TFC Insight

> Plan und Begründungen: [`tasks/plan.md`](plan.md) · Spec: `tfc_SPEC.md`
> Größen: S = 1–2 Dateien, M = 3–5 Dateien. Kein Task ist größer als M.
> **Definition of Done für jeden Task:** `pnpm lint && pnpm typecheck && pnpm test` grün, keine übersprungenen Tests, Verhalten zur Laufzeit geprüft.

---

## Phase 1: Fundament

### - [x] T1: Nuxt-Grundgerüst mit Qualitätswerkzeugen und ENV-Prüfung
**Beschreibung:** Nuxt 4, Vue 3, TS strict, Nuxt UI, ESLint, Vitest (mit Coverage) und Playwright einrichten. Die Scripts aus Spec 5 anlegen. `server/utils/env.ts` prüft alle Pflichtvariablen mit Zod und bricht beim Start mit einer klaren Meldung ab. Dazu `.env.example` (inkl. `ANALYSIS_MAX_RUNS_PER_DAY`), `.gitignore`, `app/locales/de.ts` und eine leere Startseite. Das Fixture zieht nach `tests/fixtures/raw/round-0.raw.json` um.
**Akzeptanzkriterien:**
- [x] `pnpm dev` zeigt eine Seite. `pnpm lint`, `pnpm typecheck` und `pnpm test` laufen grün.
- [x] Fehlt z. B. `SESSION_SECRET` oder ist es kürzer als 32 Zeichen, startet der Server nicht und nennt die Variable.
- [x] `.env` ist in `.gitignore`.
**Verifikation:** Unit-Test für `env.ts` (fehlend, zu kurz, gültig). Manuell `pnpm dev` ohne und mit `.env` starten.
**Abhängigkeiten:** keine
**Dateien:** `package.json`, `nuxt.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `server/utils/env.ts`, `.env.example`, `tests/unit/env.test.ts`
**Größe:** M
**Notiz:** Nuxt 4.7 bringt vue-router 5 mit, `vue`/`vue-router` deshalb nicht selbst festlegen (sonst SSR-Fehler `__VUE_OPTIONS_API__`). E2E nutzt optional `PLAYWRIGHT_CHROMIUM_PATH`.

### - [ ] T2: Docker Compose, Postgres, Drizzle und Auto-Migration
**Beschreibung:** Multi-Stage-`Dockerfile` (node:22-alpine, Nutzer ohne Root-Rechte), `docker-compose.yml` mit `app`, `db` (postgres:17-alpine, Healthcheck) und `mailpit` im Profil `dev`. Drizzle-Konfiguration, leeres Schema, `pnpm db:migrate`, Migration beim App-Start (Nitro-Plugin). Health-Route `GET /api/health` (prüft DB).
**Akzeptanzkriterien:**
- [ ] `docker compose --profile dev up -d db mailpit` plus `pnpm db:migrate` läuft fehlerfrei.
- [ ] `docker compose up -d --build` startet App und DB. Die Migration läuft automatisch, `/api/health` liefert 200.
- [ ] Der Container läuft nicht als root.
**Verifikation:** Integrationstest gegen die Compose-DB für die Health-Route. Manuell `docker compose up --build` und `curl /api/health`.
**Abhängigkeiten:** T1
**Dateien:** `Dockerfile`, `docker-compose.yml`, `drizzle.config.ts`, `server/db/schema.ts`, `server/plugins/migrate.ts`
**Größe:** M

### Checkpoint Phase 1
- [ ] Lint, Typecheck und Tests grün
- [ ] Compose startet sauber auf einer leeren Maschine
- [ ] Offene Fragen Q1–Q6 aus `plan.md` beantwortet
- [ ] Review mit euch

---

## Phase 2: Auth

### - [ ] T3: Login-Anfrage mit Mail (Link + Code), ohne User-Enumeration
**Beschreibung:** Tabellen `allowed_emails` und `login_tokens`. `POST /api/auth/request` normalisiert die E-Mail (trim, lowercase), prüft Allowlist bzw. `ADMIN_EMAIL`, erzeugt ein Token (32 Byte, base64url) und einen 6-stelligen Code, speichert beide nur als SHA-256-Hash mit 15 Minuten Gültigkeit und macht ältere Tokens ungültig. Deutsche Mail über Nodemailer. Seite `/login`. Die Antwort ist immer gleich. E-Mails werden in Logs maskiert.
**Akzeptanzkriterien:**
- [ ] Freigeschaltete und nicht freigeschaltete E-Mail bekommen eine identische Antwort (Status und Body). Nur die freigeschaltete erhält eine Mail.
- [ ] In der DB stehen nur Hashes, kein Klartext-Token oder -Code.
- [ ] Eine zweite Anfrage entwertet das erste Token.
**Verifikation:** Unit-Tests für Token-Erzeugung und Hash. Integrationstest mit gemocktem Mailer. Manuell: Mail in Mailpit ansehen.
**Abhängigkeiten:** T2
**Dateien:** `server/db/schema.ts`, `server/api/auth/request.post.ts`, `server/services/auth/tokens.ts`, `server/utils/mail.ts`, `app/pages/login.vue`
**Größe:** M

### - [ ] T4: Verify per Link und Code, Session, Middleware, Rollen
**Beschreibung:** Tabelle `sessions` (Hash der ID). `POST /api/auth/verify` (Token oder E-Mail + Code), einmalige Nutzung, Cookie `tfc_session` (httpOnly, Secure in Produktion, Lax, 30 Tage). `requireUser`/`requireAdmin` in `server/utils/session.ts`. `GET /api/auth/me`, `POST /api/auth/logout`. Seite `/login/verify` (Link-Landing und Code-Eingabe), globale Middleware.
**Akzeptanzkriterien:**
- [ ] Link-Klick und Code-Eingabe führen jeweils zu einer Session mit `Max-Age` von 30 Tagen.
- [ ] Ein abgelaufenes oder zweimal benutztes Token zeigt „Link abgelaufen“.
- [ ] `ADMIN_EMAIL` loggt sich ohne DB-Eintrag ein, `me` liefert `role: admin`. Geschützte Routen geben ohne Cookie 401 zurück, als `member` auf Admin-Routen 403.
**Verifikation:** Integrationstest des ganzen Ablaufs (mit Zeitverschiebung für den Ablauf). Manuell mit Mailpit einloggen.
**Abhängigkeiten:** T3
**Dateien:** `server/api/auth/verify.post.ts`, `server/api/auth/{me,logout}.ts`, `server/utils/session.ts`, `app/pages/login/verify.vue`, `app/middleware/auth.global.ts`
**Größe:** M

### - [ ] T5: Rate Limits und Fehlversuche
**Beschreibung:** Tabelle für Zähler (A4). Höchstens 5 Anfragen pro E-Mail und 20 pro IP in 15 Minuten. Höchstens 5 falsche Codes pro Token, danach ist das Token ungültig. Auch beim Limit bleibt die Antwort für fremde E-Mails gleich.
**Akzeptanzkriterien:**
- [ ] Die sechste Anfrage derselben E-Mail innerhalb von 15 Minuten verschickt keine Mail.
- [ ] Der sechste Code-Versuch wird abgelehnt, auch wenn der Code richtig ist.
- [ ] Die 21. Anfrage derselben IP wird mit 429 abgelehnt.
**Verifikation:** Integrationstests für alle drei Fälle.
**Abhängigkeiten:** T4
**Dateien:** `server/utils/rate-limit.ts`, `server/db/schema.ts`, `server/api/auth/*.ts`, `tests/integration/auth-limits.test.ts`
**Größe:** S

### - [ ] T6: Allowlist-Verwaltung mit sofortigem Aussperren
**Beschreibung:** `server/api/users/*` (nur Admin): Liste mit „zuletzt aktiv“, hinzufügen, entfernen. Beim Entfernen werden alle Sessions dieser E-Mail gelöscht. `ADMIN_EMAIL` erscheint fest und ist nicht löschbar. Seite `/settings/users`.
**Akzeptanzkriterien:**
- [ ] Nach dem Entfernen einer E-Mail liefert ihr nächster Request 401.
- [ ] `ADMIN_EMAIL` lässt sich weder per UI noch per API löschen.
- [ ] Ungültige E-Mail-Adressen werden mit Zod-Fehler abgelehnt.
**Verifikation:** Integrationstest. E2E: Admin legt einen Nutzer an, dieser loggt sich über Mailpit ein, wird entfernt und ist ausgesperrt.
**Abhängigkeiten:** T4
**Dateien:** `server/api/users/{index.get,index.post,[id].delete}.ts`, `server/services/auth/users.ts`, `app/pages/settings/users.vue`, `tests/e2e/auth.spec.ts`
**Größe:** M

### Checkpoint Phase 2
- [ ] Alle Auth-Akzeptanzkriterien aus Spec 7 erfüllt
- [ ] E2E-Login über Mailpit grün
- [ ] Review mit euch (inkl. Security-Blick auf Tokens, Cookies, Limits)

---

## Phase 3: Rundendaten

### - [ ] T7: Zod-Schema v1, JSON Schema und Zahl-Parser
**Beschreibung:** `shared/round-schema.ts` nach Spec 8.2 (Einheiten, `kind`, unbekannte Felder erlaubt, `warnings[]`, `teamId`). Daraus abgeleitete Typen. Route `GET /schema/tfc-round.v1.json`. `shared/parse-number.ts`: `€ 1,319` → 1319, `93.4%` → 0.934, `-0.0%` → −0, `67,394` → 67394, leer → null. `snake_case`-Key-Generator.
**Akzeptanzkriterien:**
- [ ] `schemaVersion: 2` oder fehlendes `round` ergibt einen Fehler mit Feldpfad (z. B. `round: Required`).
- [ ] Der Zahl-Parser besteht eine Tabelle mit allen Formaten aus dem Rohdump.
- [ ] Das JSON Schema ist erreichbar und entspricht dem Zod-Schema.
**Verifikation:** Unit-Tests (≥ 80 % Abdeckung für `shared/`).
**Abhängigkeiten:** T1
**Dateien:** `shared/round-schema.ts`, `shared/parse-number.ts`, `server/routes/schema/tfc-round.v1.json.get.ts`, `tests/unit/round-schema.test.ts`, `tests/unit/parse-number.test.ts`
**Größe:** M

### - [ ] T8: normalize (Rohstruktur → v1) und v1-Fixture
**Beschreibung:** `bookmarklet/src/normalize.ts` (rein, ohne DOM) wandelt die Rohstruktur in v1 um: Finanz-Hierarchie aus Level, Berichte mit Dimensionen und Gruppenzeilen, KPIs aus `dash`, Entscheidungen aus `dec0`/`dec1` mit `kind`, `editable`, `locked` und Grenzen aus Tooltips. Fehlende IDs und Hierarchien werden zu `warnings[]`. Ein Skript erzeugt daraus `tests/fixtures/round-0.json`.
**Akzeptanzkriterien:**
- [ ] Das erzeugte Fixture besteht das Schema aus T7. Es enthält 10 Berichte, die Finanzen (65 Datenzeilen, siehe Q5) und 4 KPI-Dashboards.
- [ ] Stichproben stimmen: Fressie Orange 1 liter Demand per week 67394, Service level (pieces) 0.934. ROI −0.0768. Bonus or penalties −322708.
- [ ] „Safety stock (weeks)“ hat `min 0`/`max 8` aus dem Tooltip. Readonly-Felder sind `editable: false`.
**Verifikation:** Unit-Tests gegen den Rohdump (≥ 90 % Abdeckung für `normalize`).
**Abhängigkeiten:** T7
**Dateien:** `bookmarklet/src/normalize.ts`, `bookmarklet/src/tooltip-constraints.ts`, `scripts/build-fixture.ts`, `tests/unit/normalize.test.ts`, `tests/fixtures/round-0.json`
**Größe:** M

### - [ ] T9: Upload mit Vorschau und Versionierung
**Beschreibung:** Tabellen `rounds` und `round_versions` (Original als `jsonb`, Uploader, Zeitpunkt, aktiv). `POST /api/rounds/preview` (validieren, Zusammenfassung zurückgeben), `POST /api/rounds` (speichern, neue Version bei vorhandener Runde, `open` kann durch `played` ersetzt werden), Versionsliste, aktiv setzen, löschen. Seite `/settings/rounds` mit Drag & Drop und Größenlimit.
**Akzeptanzkriterien:**
- [ ] Das Fixture lässt sich hochladen. Die Vorschau zeigt Runde 0, Team 6, `played`, 10 Berichte und die Anzahl der Entscheidungen und Warnungen.
- [ ] Der zweite Upload derselben Runde erzeugt Version 2. Version 1 ist sichtbar und wieder aktivierbar.
- [ ] Eine Datei über `UPLOAD_MAX_MB` oder als `member` wird abgelehnt (413 bzw. 403).
**Verifikation:** Integrationstests. Manuell Upload im Browser.
**Abhängigkeiten:** T4, T8
**Dateien:** `server/db/schema.ts`, `server/api/rounds/*.ts`, `server/services/round-data/store.ts`, `app/pages/settings/rounds.vue`
**Größe:** M

### - [ ] T10: Normalisierte Tabellen und Abfrage-Repository
**Beschreibung:** Beim Speichern bzw. Aktivieren einer Version die Tabellen `kpi_points`, `report_rows`, `decisions` und `finance_rows` befüllen. `server/services/round-data/repository.ts` mit `getActiveRound`, `listRounds`, `getFinance`, `getKpiSeries`, `getReport`, `getDecisions`. API `GET /api/rounds`, `GET /api/rounds/[round]`.
**Akzeptanzkriterien:**
- [ ] Nach dem Upload sind alle 10 Berichte, die Finanzen, die 4 KPI-Dashboards und alle Entscheidungen über das Repository abfragbar.
- [ ] Beim Aktivieren einer anderen Version liefern die Abfragen deren Daten.
- [ ] Löschen einer Runde entfernt auch ihre normalisierten Zeilen.
**Verifikation:** Integrationstests (Upload → Abfrage).
**Abhängigkeiten:** T9
**Dateien:** `server/db/schema.ts`, `server/services/round-data/normalize-db.ts`, `server/services/round-data/repository.ts`, `server/api/rounds/[round].get.ts`
**Größe:** M

### Checkpoint Phase 3
- [ ] Fixture-Upload Ende zu Ende über die UI
- [ ] Abdeckung ≥ 80 % in `server/services/**` und `shared/**`
- [ ] Review mit euch

---

## Phase 4: Bookmarklet (blockiert, bis Q1 geklärt ist)

### - [ ] T11: extract (HTML → Rohstruktur) gegen gespeicherte Spielseiten
**Beschreibung:** `bookmarklet/src/extract/*`: Berichte (`report-table` inkl. Zeilen-CSS-Klassen für die Kunde/Produkt-Hierarchie), KPI-Skripte (`createKpiChart`), Finanzen (Ebenen über CSS-Klassen), Entscheidungsformulare (`fieldset`/`legend`/`.form-row`, `data-entity-id`), Tooltips, Fehlerseite „blob does not exist“ → `status: open`. Unbekannte Strukturen landen in `warnings[]` statt einen Abbruch auszulösen.
**Akzeptanzkriterien:**
- [ ] extract + normalize liefern für die HTML-Fixtures dieselben Werte wie `tests/fixtures/round-0.json`, ergänzt um Entity-IDs.
- [ ] In `sales_customerproduct` hat jede Zeile `customer` und `product`. Die Summe je Produkt entspricht `sales_product` (± 3 Stück).
- [ ] Abdeckung ≥ 90 % für `bookmarklet/src/**`.
**Verifikation:** Vitest mit happy-dom bzw. jsdom gegen `tests/fixtures/tfc-html/` (DOM-Umgebung ggf. neue Dev-Abhängigkeit, vorher fragen).
**Abhängigkeiten:** T8, **Q1 (HTML-Fixtures)**
**Dateien:** `bookmarklet/src/extract/{reports,kpis,finance,decisions,tooltips}.ts`, `tests/unit/extract.test.ts`, `tests/fixtures/tfc-html/**`
**Größe:** M

### - [ ] T12: Bookmarklet-Runtime, Build und Anleitungsseite
**Beschreibung:** `bookmarklet/src/export.ts`: Overlay mit Rundenauswahl, Fortschritt (höchstens 4 parallele `fetch`), Download als `tfc_team6_round{R}_{Datum}.json`. Kein Versand an Dritte. `bookmarklet/build.ts` (esbuild, über Vite/Nuxt bereits vorhanden) erzeugt `public/bookmarklet/`. Seite `/settings/bookmarklet` mit Link zum Ziehen und Konsolen-Fallback.
**Akzeptanzkriterien:**
- [ ] Im eingeloggten TFC-Tab entsteht eine Datei, die der Upload aus T9 ohne Fehler akzeptiert.
- [ ] Im Netzwerk-Tab gibt es nur Anfragen an `game.thefreshconnection.eu`.
- [ ] Das Bundle hat keine externen Skript-Abhängigkeiten. Der Konsolen-Fallback funktioniert.
**Verifikation:** Unit-Test für die Concurrency-Begrenzung. **Manueller Test im echten Spiel durch euch.**
**Abhängigkeiten:** T11
**Dateien:** `bookmarklet/src/export.ts`, `bookmarklet/src/overlay.ts`, `bookmarklet/build.ts`, `app/pages/settings/bookmarklet.vue`
**Größe:** M

### Checkpoint Phase 4
- [ ] Echter Export aus dem Spiel hochgeladen, Stichproben aus Spec 10 stimmen
- [ ] Review mit euch

---

## Phase 5: Dashboard (ohne KI)

### - [ ] T13: Bereichsdefinition und Unternehmens-Flussdiagramm
**Beschreibung:** `shared/areas.ts`: Knoten, Kanten und die Zuordnung zu Berichten, KPIs, Entscheidungen und Finanzposten. `CompanyFlow.vue` und `AreaNode.vue` mit Vue Flow: 2–3 Kennzahlen je Knoten, Kantendicke nach Menge, Ampel grau (noch ohne KI), Bedienung per Tastatur. Seite `/rounds/[round]`.
**Akzeptanzkriterien:**
- [ ] Alle Knoten aus Spec 10.2 erscheinen mit Kennzahlen aus dem Fixture. Ohne Analyse sind alle grau.
- [ ] Knoten sind per Tab erreichbar und per Enter auslösbar. Die Ampel hat zusätzlich einen Text.
- [ ] Die Kantendicke ist proportional zur Nachfrage pro Woche.
**Verifikation:** Unit-Test für die Kennzahlen-Ableitung je Bereich. Komponententest. Manuell im Browser.
**Abhängigkeiten:** T10
**Dateien:** `shared/areas.ts`, `app/components/flow/{CompanyFlow,AreaNode}.vue`, `app/pages/rounds/[round]/index.vue`, `app/composables/useRound.ts`
**Größe:** M

### - [ ] T14: Übersichtsseite mit ROI, Verlauf und Kosten-Wasserfall
**Beschreibung:** `/` lädt die neueste Runde: Kopf mit ROI und Veränderung zur Vorrunde, ROI-Minilinie (ECharts), Kosten-Wasserfall. Deutsches Zahlenformat über einen gemeinsamen Formatierer. Platzhalter für die KI-Zusammenfassung („KI nicht konfiguriert“ bzw. „keine Analyse“).
**Akzeptanzkriterien:**
- [ ] Mit dem Fixture zeigt die Übersicht ROI −7,68 % und Strafzahlungen −322.708 €.
- [ ] Zahlen erscheinen im Format `67.394`, `93,4 %`, `49.522 €`.
- [ ] Ohne hochgeladene Runde gibt es einen leeren Zustand mit Hinweis auf den Upload.
**Verifikation:** Unit-Test für den Formatierer. Komponententest. Manuell.
**Abhängigkeiten:** T10
**Dateien:** `app/pages/index.vue`, `app/components/charts/{KpiTrend,CostWaterfall}.vue`, `shared/format.ts`
**Größe:** M

### - [ ] T15: Detailpanel und Vollansicht je Bereich
**Beschreibung:** Klick auf einen Knoten öffnet rechts ein Panel (mobil im Vollbild): Kennzahlen mit Verlauf, sortierbare Berichtstabellen mit Tooltip je Spalte, aktuelle Einstellungen (änderbar/gesperrt/Info, Vergleich zur Vorrunde), Platz für KI-Hinweise. Seite `/rounds/[round]/[area]`. Klick auf Lieferant oder Kunde führt zur Objektansicht (Filter in derselben Seite).
**Akzeptanzkriterien:**
- [ ] Klick auf „Abfüllen“ zeigt Swiss Fill 2 mit Planerfüllung 78,7 % und Number of shifts = 2, SMED = aus, Increase speed = aus.
- [ ] Tabellen lassen sich nach jeder Spalte sortieren. Der Spalten-Tooltip zeigt den Spieltext.
- [ ] Das Panel ist per Escape schließbar, der Fokus kehrt zum Knoten zurück.
**Verifikation:** Komponententests für `ReportTable`. Manuell.
**Abhängigkeiten:** T13
**Dateien:** `app/components/flow/AreaPanel.vue`, `app/components/tables/ReportTable.vue`, `app/components/settings/DecisionList.vue`, `app/pages/rounds/[round]/[area].vue`
**Größe:** M

### - [ ] T16: Rundenvergleich
**Beschreibung:** `server/services/round-data/compare.ts` vergleicht zwei Runden: ROI-Differenz, Kostenposten, KPI-Änderungen und geänderte Entscheidungen (Schlüssel: Rolle + Tab + Objekt + Parameter). API und Seite `/compare`.
**Akzeptanzkriterien:**
- [ ] Runde 0 gegen eine Kopie mit drei geänderten Entscheidungen listet genau diese drei.
- [ ] Unveränderte Entscheidungen erscheinen nicht.
- [ ] Mit weniger als zwei Runden zeigt die Seite einen Hinweis.
**Verifikation:** Unit-Test für `compare` mit einem abgeleiteten Fixture. Manuell.
**Abhängigkeiten:** T10
**Dateien:** `server/services/round-data/compare.ts`, `server/api/rounds/compare.get.ts`, `app/pages/compare.vue`, `tests/unit/compare.test.ts`
**Größe:** M

### Checkpoint Phase 5
- [ ] Akzeptanzkriterien Spec 10 (ohne KI) erfüllt
- [ ] Übersicht lädt mit 5 Runden in < 1,5 s (lokal gemessen)
- [ ] Review mit euch (UX, Begriffe)

---

## Phase 6: KI-Analyse

### - [ ] T17: LlmProvider-Interface, Mock und Adapter für Claude und Gemini
**Beschreibung:** `providers/types.ts` exakt nach Spec 9. `anthropic.ts` (Tool-Use mit dem Antwortschema als Tool-Input), `gemini.ts` (`responseMimeType` + `responseSchema`), `mock.ts`, `index.ts` (Auswahl aus DB-Einstellung, sonst ENV). Keys werden nur aus `env.ts` gelesen und nie geloggt.
**Akzeptanzkriterien:**
- [ ] Vertragstests: Aufgezeichnete Antworten (Claude-Tool-Use, Gemini-JSON) ergeben `{ json, usage }` im selben Format.
- [ ] Ohne Keys liefert `index.ts` „nicht konfiguriert“ statt einer Exception beim Start.
- [ ] Kein Test ruft eine echte API auf (Netzwerk im Test gesperrt).
**Verifikation:** Unit- und Vertragstests.
**Abhängigkeiten:** T2
**Dateien:** `server/services/analysis/providers/{types,anthropic,gemini,mock,index}.ts`, `tests/unit/providers.test.ts`, `tests/fixtures/llm/*.json`
**Größe:** M

### - [ ] T18: Prompt-Aufbau und Antwortschema
**Beschreibung:** `response-schema.ts` (Zod, flach, Gemini-tauglich, mit `area`-Enum aus `areas.ts`) plus abgeleitetes JSON Schema. `prompt.ts`: System-Prompt mit TFC-Domänenwissen, kompakte Serialisierung der Runde, Zusammenfassung früherer Runden, Liste der erlaubten Entscheidungen (`editable && !locked`) mit erlaubten Werten. Konstante `PROMPT_VERSION`.
**Akzeptanzkriterien:**
- [ ] Das JSON Schema enthält kein `oneOf`, `anyOf` oder `$ref`.
- [ ] Der Prompt für das Fixture enthält alle änderbaren Entscheidungen und keine gesperrten. Die Tokenzahl wird im Test geschätzt und dokumentiert.
- [ ] Snapshot-Test des Prompts für das Fixture.
**Verifikation:** Unit-Tests.
**Abhängigkeiten:** T10, T13, T17
**Dateien:** `server/services/analysis/{prompt,response-schema}.ts`, `tests/unit/prompt.test.ts`
**Größe:** M

### - [ ] T19: Validierung der KI-Antwort gegen die Spieldaten
**Beschreibung:** `validate.ts`: Jede `change` muss auf eine existierende, änderbare Entscheidung verweisen, `from` muss dem aktuellen Wert entsprechen und `to` innerhalb von Optionen bzw. `min/max` liegen. Jede `evidence.ref` muss auflösbar sein und der Wert innerhalb von 1 % passen. Ungültiges wird markiert, nicht verworfen.
**Akzeptanzkriterien:**
- [ ] `to: 12` für „Safety stock (weeks)“ (max. 8) wird als „Prüfen: Wert außerhalb des erlaubten Bereichs“ markiert.
- [ ] Eine Änderung an „Frozen period of production“ (gesperrt) wird als ungültig markiert.
- [ ] Erfundene Evidenz wird als „nicht belegt“ markiert, korrekte als belegt.
**Verifikation:** Unit-Tests mit konstruierten Antworten gegen das Fixture.
**Abhängigkeiten:** T18
**Dateien:** `server/services/analysis/validate.ts`, `server/services/analysis/resolve-ref.ts`, `tests/unit/validate.test.ts`
**Größe:** S

### - [ ] T20: Analyse-Jobs, Caching, Retry und Tageslimit
**Beschreibung:** Tabellen `analysis_jobs` und `analyses` (Runde, Datei-Version, Prompt-Version, Anbieter, Modell, Tokens, Kosten, `recommendation_status` vorgesehen). `run.ts`: Aufruf, Zod-Prüfung, bis zu 2 Retries, Validierung, Speichern. Worker als Nitro-Plugin (A5). Ein Upload einer `played`-Runde stellt automatisch einen Job ein. API: Analyse holen, neu analysieren (Admin, optional mit anderem Anbieter), Job-Status. `ANALYSIS_MAX_RUNS_PER_DAY`.
**Akzeptanzkriterien:**
- [ ] Für das Fixture entsteht mit dem Mock eine gespeicherte Analyse. Erneutes Abrufen löst keinen Provider-Aufruf aus.
- [ ] Ein Mock mit zweimal ungültigem und dann gültigem JSON endet `done`. Dreimal ungültig endet `failed` mit Meldung.
- [ ] Mit gemockten Antworten beider Anbieter entstehen Analysen im selben Format. Das Tageslimit greift.
**Verifikation:** Integrationstests mit injiziertem Mock.
**Abhängigkeiten:** T9, T19
**Dateien:** `server/db/schema.ts`, `server/services/analysis/run.ts`, `server/plugins/analysis-worker.ts`, `server/api/analysis/*.ts`
**Größe:** M

### - [ ] T21: KI-Ergebnisse im Dashboard
**Beschreibung:** `WeaknessCard.vue` und `RecommendationCard.vue` (Wo im Spiel: Rolle › Tab › Objekt › Parameter: von → nach, Begründung, Belege mit Status, Wirkung, Risiken, Konfidenz, Hinweis „KI-Vorschlag, vor dem Umsetzen prüfen“). Ungültige Änderungen sind sichtbar markiert und nicht als umsetzbar dargestellt. Ampeln im Flussdiagramm nach höchster `severity`. Top 5 und Zusammenfassung in der Übersicht. Anzeige „Anbieter · Modell · Datum · Datei-Version“. Fortschritt laufender Jobs.
**Akzeptanzkriterien:**
- [ ] Die Analyse des Fixtures (Mock) erscheint in der Übersicht, im Flussdiagramm (gefärbte Ampeln mit Text) und im Detailpanel des jeweiligen Bereichs.
- [ ] Der ungültige Vorschlag (`to: 12`) ist sichtbar als „Prüfen“ markiert.
- [ ] Ohne konfigurierten Anbieter zeigt der Bereich „KI nicht konfiguriert“, der Rest der App funktioniert.
**Verifikation:** Komponententests. Manuell mit Mock-Daten.
**Abhängigkeiten:** T14, T15, T20
**Dateien:** `app/components/analysis/{WeaknessCard,RecommendationCard,AnalysisMeta}.vue`, `app/composables/useAnalysis.ts`, Anpassungen in `AreaNode.vue`, `index.vue`
**Größe:** M

### - [ ] T22: KI-Einstellungen (Anbieter, Modell, Verbindungstest, Verbrauch)
**Beschreibung:** Tabelle `app_settings`. API (nur Admin): Einstellungen lesen/schreiben (Keys nur als „gesetzt/nicht gesetzt“), Verbindungstest, Verbrauch der letzten Läufe. Seite `/settings/ai`.
**Akzeptanzkriterien:**
- [ ] Nach dem Umstellen auf Gemini nutzt die nächste Analyse Gemini mit dem eingetragenen Modell und zeigt „Gemini · Modellname“.
- [ ] Ein Anbieter ohne Key ist ausgegraut und per API nicht auswählbar (400).
- [ ] Kein API-Key taucht in einer API-Antwort, im HTML oder in den Logs auf (Test mit Dummy-Keys und Suche im Output).
**Verifikation:** Integrationstests. Manuell.
**Abhängigkeiten:** T20
**Dateien:** `server/db/schema.ts`, `server/api/settings/ai.{get,put}.ts`, `server/api/settings/ai-test.post.ts`, `app/pages/settings/ai.vue`
**Größe:** M

### Checkpoint Phase 6
- [ ] Alle Akzeptanzkriterien aus Spec 9 erfüllt
- [ ] **Ein echter Lauf** mit Claude und einer mit Gemini auf Runde 0 (manuell, mit euren Keys), Ergebnis gemeinsam bewerten
- [ ] Review mit euch (Prompt-Qualität, Kosten pro Lauf)

---

## Phase 7: Abschluss

### - [ ] T23: Responsivität, Barrierefreiheit und Performance
**Beschreibung:** Flussdiagramm unter 768 px vertikal anordnen, Layout ab 375 px prüfen, Fokusreihenfolge und ARIA-Labels, Ladezeit der Übersicht mit 5 Runden messen und bei Bedarf Abfragen optimieren.
**Akzeptanzkriterien:**
- [ ] Bei 375 px gibt es keinen horizontalen Scroll. Das Flussdiagramm ist vertikal.
- [ ] Alle Knoten und Karten sind per Tastatur bedienbar. Die Ampel ist ohne Farbe verständlich.
- [ ] Die Übersicht lädt mit 5 Runden in < 1,5 s.
**Verifikation:** Playwright-Test mit Viewport 375 px. Messung dokumentiert.
**Abhängigkeiten:** T21
**Dateien:** `app/components/flow/CompanyFlow.vue`, `app/layouts/default.vue`, `tests/e2e/responsive.spec.ts`
**Größe:** S

### - [ ] T24: E2E-Suite und Abnahme auf frischem Server
**Beschreibung:** Playwright: Login über Mailpit, Upload des Fixtures, Klick durch das Flussdiagramm, Allowlist, Analyse mit Mock-Provider. README mit Betriebsanleitung (Reverse Proxy, `.env`, Backup der DB). Abnahme der Erfolgskriterien aus Spec 14 auf einem frischen Server.
**Akzeptanzkriterien:**
- [ ] `pnpm test:e2e` ist grün.
- [ ] `docker compose up -d --build` auf einem frischen Server mit ausgefüllter `.env` liefert ein erreichbares `/login`.
- [ ] Alle sechs Erfolgskriterien aus Spec 14 sind abgehakt (Kriterium 3 und 4 durch euch im echten Spiel).
**Verifikation:** E2E-Lauf. Abnahmeprotokoll.
**Abhängigkeiten:** T22, T23 (und T12 für Kriterium 3)
**Dateien:** `tests/e2e/*.spec.ts`, `playwright.config.ts`, `README.md`
**Größe:** M

### Checkpoint: Fertig
- [ ] Alle Akzeptanzkriterien aus der Spec erfüllt
- [ ] Lint, Typecheck, Unit-, Integrations- und E2E-Tests grün
- [ ] Bereit für die Abnahme durch Team 6
