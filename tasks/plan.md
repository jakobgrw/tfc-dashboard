# Implementierungsplan: TFC Insight

> Grundlage: `tfc_SPEC.md` (Entwurf vom 26.11.2026) · Plan-Stand: 26.11.2026 · Status: **zur Prüfung**
> Aufgabenliste mit Akzeptanzkriterien: [`tasks/todo.md`](todo.md)

## Überblick

Eine passwortgeschützte Nuxt-4-App (Docker Compose mit Postgres) für Team 6. Sie liest TFC-Rundendateien (Rohformat aus Claude Desktop oder JSON v1 aus einem lokalen Skript), zeigt das Unternehmen als klickbares Flussdiagramm mit Berichten, KPIs und Finanzen und lässt Claude oder Gemini Schwachstellen und konkrete Einstellungsänderungen vorschlagen. Die Vorschläge werden maschinell gegen die Spieldaten geprüft.

Das Repo enthält bisher nur `tfc_SPEC.md` und `tfc_round0.json`. Es gibt noch keinen Code.

## Befund zum vorhandenen Fixture (wichtig)

`tfc_round0.json` ist **nicht** im Format v1 aus Spec 8.2. Es ist ein Rohdump mit den Schlüsseln:

| Schlüssel | Inhalt | Lücke gegenüber v1 |
|---|---|---|
| `fin` | 66 Zeilen `[level, label, current, previous, diff]` als Strings | keine `key`/`parentKey`, die müssen aus Level und Label abgeleitet werden |
| `rep` | 10 Berichte, Zeilen als String-Arrays, Gruppenzeilen (`["DC Netherlands"]`) | **`sales_customerproduct`/`sales_productcustomer`: Hierarchie verloren.** Erst stehen die 3 Kunden, dann 15 Produktzeilen ohne Kundenbezug |
| `dash` | 4 KPI-Dashboards `{t, f, e, d:[[round, entityId, value]]}` | Entity-IDs ohne Namen, keine `kpiNumber` |
| `dec0` / `dec1` | Entscheidungen je Rolle (Decision-Log Runde 0) bzw. je Seite der laufenden Runde | **keine Entity-IDs** (`data-entity-id` fehlt), Grenzen nur über Tooltips |
| `tips` | 32 Tooltip-Texte | – |

Folgen:
1. Das Spec-Akzeptanzkriterium „Fixture wird ohne Fehler akzeptiert“ setzt ein v1-Fixture voraus, das es noch nicht gibt.
2. Für die Parsertests des lokalen Skripts (Spec 8.1/12) fehlen die rohen HTML-Antworten des Spiels (`tests/fixtures/tfc-html/`).
3. Die Kunde-je-Zeile-Prüfung (± 3 Stück) lässt sich mit diesem Dump nicht sicher erfüllen.

**Herkunft der Daten (Antwort des Teams, 26.11.2026):** Die Rundendaten werden entweder von einem **lokal ausgeführten Skript** aus der Spiel-Website gezogen oder von **Claude Desktop** ausgelesen. `tfc_round0.json` stammt aus Claude Desktop.

**Lösung (Architekturentscheidung A1, überarbeitet):** Zwei Dateiformate, eine Umwandlung:
- **Rohformat `tfc-raw`:** Das Format, das Claude Desktop heute liefert (`fin`, `rep`, `dash`, `dec0`, `dec1`, `tips`). Es bekommt ein eigenes Zod-Schema, ergänzt um optionale Felder für Entity-IDs und Hierarchie.
- **Format v1:** Bleibt das interne Speicher- und Analyseformat aus Spec 8.2.
- **normalize:** Rohformat → v1, reiner Code in `shared/`. Er läuft **auf dem Server beim Upload**. Die App nimmt also beide Formate an. Fehlende Infos (IDs, Kunde→Produkt) landen in `warnings[]`, statt den Upload abzulehnen.
- **Konsolen-Skript** (Q7: läuft in der Browser-Konsole des eingeloggten Spiel-Tabs, ersetzt das Bookmarklet aus Spec 8.3): liest die HTML-Seiten des Spiels per `fetch` und lädt direkt eine v1-Datei herunter. Ein zweiter Modus sichert die rohen HTML-Seiten (Format wie `tests/fixtures/tfc-html/round-0-1.json.gz`).
- **Anleitung für Claude Desktop:** Die App liefert einen festen Prompt, damit Claude Desktop das Rohformat immer gleich erzeugt, inklusive der bisher fehlenden IDs (`data-entity-id`) und der Kunde→Produkt-Zuordnung.

So funktioniert der Upload schon mit dem vorhandenen Dump, und die Datenqualität steigt, sobald Skript oder Prompt mehr liefern. Das ist eine Erweiterung der Spec (8.2 kennt nur v1) und sollte dort nachgetragen werden.

## Architekturentscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| A1 | Upload nimmt Rohformat (Claude Desktop) und v1 an. `normalize` (rein, in `shared/`) wandelt Roh → v1 auf dem Server. Das lokale Skript trennt `extract` (DOM) und `normalize` | Der vorhandene Dump ist sofort nutzbar. Normalize ist ohne Browser zu 90 % abdeckbar. Bei einer neuen Spielversion ändert sich nur `extract` |
| A2 | `shared/round-schema.ts` (Zod) ist die einzige Quelle. Das JSON Schema wird daraus generiert (`zod`-eigenes `toJSONSchema`, keine neue Abhängigkeit) | Spec 8.2. Upload, lokales Skript und Typen bleiben synchron |
| A3 | Sessions und Tokens selbst gebaut (Hash in DB, signiertes Cookie über h3) statt einer Auth-Bibliothek | Spec verlangt Hash-Speicherung und sofortiges Aussperren. Keine neue Abhängigkeit |
| A4 | Rate Limits in Postgres (Zähltabelle mit Zeitfenster), nicht im Speicher | Übersteht Neustarts. Eine Instanz reicht, Redis wäre eine neue Abhängigkeit |
| A5 | Analyse-Jobs: DB-Tabelle plus In-Process-Worker (Nitro-Plugin pollt `queued`) | Keine Queue-Abhängigkeit. Bei 5 Nutzern und ≤ 10 Läufen/Tag genügt das. Hängende `running`-Jobs werden beim Start auf `failed` gesetzt |
| A6 | `LlmProvider` per Factory injiziert, in Tests immer der Mock | Spec 12: kein echter KI-Aufruf in Tests |
| A7 | Dashboard (ohne KI) vor der Analyse bauen, entgegen der Reihenfolge der Capability Map | Vertikale Slices: Die Analyse braucht eine Oberfläche, und „ohne Analyse graue Knoten“ ist ohnehin Pflicht. Die Abhängigkeit Dashboard → Analyse bleibt einseitig (optionaler Datensatz) |
| A8 | Zuordnung Bereich ↔ Berichte/KPIs/Entscheidungen/Finanzen zentral in `shared/areas.ts` | Flussdiagramm, Detailpanel und Analyse (Feld `area`) nutzen dieselbe Definition |
| A9 | Spec-Datei bleibt `tfc_SPEC.md`. Das Fixture wird nach `tests/fixtures/raw/round-0.raw.json` verschoben, das v1-Fixture entsteht als `tests/fixtures/round-0.json` | Konsistent mit Spec 6, ohne Datenverlust |

## Abhängigkeitsgraph

```
T1 Scaffold + env ──► T2 Compose/DB/Migrationen
                         │
            ┌────────────┼─────────────────────────────┐
            ▼            ▼                             ▼
      T3 Login-Anfrage   T7 Schema v1 + Zahl-Parser    (shared/areas.ts in T13)
            │            │
      T4 Verify+Session  T8 normalize(raw→v1) ──► Fixture round-0.json
            │            │                 │
      T5 Rate Limits     │                 └──► T12 Konsolen-Skript (HTML-Fixtures vorhanden)
            │            │                            │
      T6 Allowlist-UI    ▼                       T11 Claude-Desktop-Prompt + Seite (nach T9)
            │       T9 Upload + Versionen (requireAdmin aus T4)
            │            │
            │       T10 Normalisierte Tabellen + Repository
            │            │
            │       ┌────┴─────────────┬──────────────┐
            │       ▼                  ▼              ▼
            │   T13 Flussdiagramm   T14 Übersicht   T16 Rundenvergleich
            │       │                  │
            │   T15 Detailpanel/Vollansicht
            │       │
            │   T17 LlmProvider + Mock + Anthropic/Gemini-Adapter
            │       │
            │   T18 Prompt + Antwortschema
            │       │
            │   T19 Validierung der KI-Antwort
            │       │
            │   T20 Jobs, Caching, Tageslimit, Auto-Start
            │       │
            │   T21 KI im Dashboard (Ampeln, Karten, Top 5)
            │       │
            └──►T22 KI-Einstellungen (Anbieter, Modell, Test, Verbrauch)
                    │
                T23 Responsiv/A11y/Performance ──► T24 E2E + Produktions-Abnahme
```

## Phasen (Index, Details in `todo.md`)

| Phase | Tasks | Ergebnis |
|---|---|---|
| 1 Fundament | T1–T2 | App startet lokal und per Compose, DB migriert |
| 2 Auth | T3–T6 | Login per Link/Code, Admin, Allowlist, Rate Limits |
| 3 Rundendaten | T7–T10 | v1-Schema, Fixture, Upload mit Versionen, abfragbare Daten |
| 4 Export aus dem Spiel | T11–T12 | Claude-Desktop-Prompt und Konsolen-Skript für den Spiel-Tab |
| 5 Dashboard | T13–T16 | Übersicht, Flussdiagramm, Detailansichten, Vergleich, alles ohne KI |
| 6 KI-Analyse | T17–T22 | Analyse mit Claude/Gemini, Validierung, Anzeige, Einstellungen |
| 7 Abschluss | T23–T24 | NFRs, E2E, Abnahme der Erfolgskriterien aus Spec 14 |

Nach jeder Phase gibt es einen Checkpoint mit Review durch euch.

**Parallelisierbar:** Phase 4 (Export aus dem Spiel) läuft unabhängig von Phase 5 und 6, sobald T8 fertig ist. T16 (Vergleich) ist unabhängig von T13–T15. T17 (Provider) kann parallel zu Phase 5 starten.

## Risiken und Gegenmaßnahmen

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| Der Claude-Desktop-Dump hat keine IDs und keine Kunde→Produkt-Hierarchie | **Hoch**: Werte lassen sich KPIs und Objekten nicht sicher zuordnen | A1. Upload nimmt den Dump trotzdem an und warnt. Claude-Desktop-Prompt (T11) fordert IDs und Hierarchie an. Das Konsolen-Skript liest beides direkt aus dem HTML |
| Spiel-HTML ändert sich (neue Version, Markup) | Mittel | `extract` bricht nie ab, schreibt `warnings[]`. Parsertests gegen gespeicherte HTML-Dateien |
| CSP des Spiels blockiert ein Skript im Spiel-Tab | Niedrig | Code wird in die Konsole eingefügt, nicht nachgeladen. Ein einziges Bundle ohne externe Skripte. Früh im echten Spiel testen (Checkpoint 4) |
| KI liefert ungültige Änderungen oder erfundene Belege | Hoch für den Nutzen | Strikte Validierung (T19), Markierung statt Verwerfen, sichtbarer Hinweis |
| Gemini-Schema unterstützt nicht alle JSON-Schema-Konstrukte | Mittel | Antwortschema flach halten (keine `oneOf`/`$ref`). Vertragstest für beide Adapter mit demselben Schema |
| Prompt zu groß (alle Berichte + Entscheidungen + Historie) | Mittel: Kosten, Kontextgrenze | Kompakte Serialisierung (Tabellen als CSV-artige Blöcke). Tokens im Test messen, bei Bedarf Historie verdichten |
| Claude Desktop liefert das Rohformat nicht jedes Mal gleich | Mittel | Fester Prompt (T11), strenges Rohformat-Schema mit klaren Fehlermeldungen beim Upload |
| Verfügbarkeit und Namen der Modelle ändern sich | Niedrig | Modell nur über ENV und Admin-UI, nie im Code hart verdrahtet |
| SMTP-Zustellung (Spam, Port) in Produktion | Mittel | Mailpit im Dev. „Verbindung testen“ ist optional. Code-Login als Fallback zum Link |

## Offene Fragen (brauchen eure Antwort)

| # | Frage | Vorschlag bis zur Klärung |
|---|---|---|
| ~~Q1~~ | ~~HTML-Antworten des Spiels?~~ | **Geklärt:** Export vom 26.11.2026 liegt anonymisiert in `tests/fixtures/tfc-html/round-0-1.json.gz` (49 Seiten: alle Berichte, KPI-Dashboards, Finanzen und Decision-Logs für Runde 0 und 1 (offen), die 11 Entscheidungsseiten, 157 Tooltips). Enthält `data-entity-id`. Die Kunde→Produkt-Zuordnung ergibt sich aus der Zeilenfolge (Kunde als `<th>`, Produkte eingerückt darunter) |
| ~~Q2~~ | ~~Woher stammt `tfc_round0.json`?~~ | **Geklärt:** aus Claude Desktop. Künftig per lokalem Skript oder Claude Desktop (A1) |
| Q3 | Die Spec nennt `SPEC.md`, die Datei heißt `tfc_SPEC.md`. Umbenennen? | Name so lassen (A9) |
| ~~Q4~~ | ~~Runden −2 und −1?~~ | **Geklärt:** nur Verlauf. Sie erscheinen als Verlaufspunkte in KPIs und Finanzen, nie als eigene Runde. Das Schema erlaubt `round ≥ -2` nur für Verlaufspunkte |
| ~~Q7~~ | ~~Form des lokalen Skripts?~~ | **Geklärt:** (a) Skript im eingeloggten Spiel-Tab, ausgeführt über die Browser-Konsole |
| ~~Q5~~ | ~~66 oder 65 Finanzzeilen?~~ | **Geklärt:** 65 Datenzeilen, die Kopfzeile „Round“ wird zu `columns` |
| Q6 | `ANALYSIS_MAX_RUNS_PER_DAY` steht nicht in `.env.example` (Spec 5). Aufnehmen? | Ja, als optionale Variable |
