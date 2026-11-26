# Implementierungsplan: TFC Insight

> Grundlage: `tfc_SPEC.md` (Entwurf vom 26.11.2026) · Plan-Stand: 26.11.2026 · Status: **zur Prüfung**
> Aufgabenliste mit Akzeptanzkriterien: [`tasks/todo.md`](todo.md)

## Überblick

Eine passwortgeschützte Nuxt-4-App (Docker Compose mit Postgres) für Team 6. Sie liest TFC-Rundendateien (JSON v1, erzeugt per Bookmarklet), zeigt das Unternehmen als klickbares Flussdiagramm mit Berichten, KPIs und Finanzen und lässt Claude oder Gemini Schwachstellen und konkrete Einstellungsänderungen vorschlagen. Die Vorschläge werden maschinell gegen die Spieldaten geprüft.

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
2. Für die Bookmarklet-Parsertests (Spec 8.1/12) fehlen die rohen HTML-Antworten des Spiels (`tests/fixtures/tfc-html/`).
3. Die Kunde-je-Zeile-Prüfung (± 3 Stück) lässt sich mit diesem Dump nicht sicher erfüllen.

**Vorgeschlagene Lösung (Architekturentscheidung A1):** Das Bookmarklet bekommt zwei Stufen:
- **extract:** HTML → Rohstruktur (wie dieser Dump, aber erweitert um Entity-IDs und Zeilen-CSS-Klassen),
- **normalize:** Rohstruktur → v1.

`normalize` ist reiner Code in `shared/`. Er wird mit dem vorhandenen Dump getestet und erzeugt daraus das erste v1-Fixture. Fehlende Infos landen in `warnings[]`. Den vollständigen Weg mit IDs und Hierarchie testen wir erst, wenn echte HTML-Fixtures vorliegen (siehe offene Frage Q1).

## Architekturentscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| A1 | Bookmarklet trennt `extract` (DOM) und `normalize` (rein) | Das vorhandene Fixture wird testbar. Normalize ist ohne Browser zu 90 % abdeckbar. Bei einer neuen Spielversion ändert sich nur `extract` |
| A2 | `shared/round-schema.ts` (Zod) ist die einzige Quelle. Das JSON Schema wird daraus generiert (`zod`-eigenes `toJSONSchema`, keine neue Abhängigkeit) | Spec 8.2. Upload, Bookmarklet und Typen bleiben synchron |
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
      T5 Rate Limits     │                 └──► T11 Bookmarklet extract (braucht HTML-Fixtures, Q1)
            │            │                            │
      T6 Allowlist-UI    ▼                       T12 Bookmarklet-Runtime + Seite
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
| 4 Bookmarklet | T11–T12 | Export aus dem Spiel (**blockiert durch Q1**) |
| 5 Dashboard | T13–T16 | Übersicht, Flussdiagramm, Detailansichten, Vergleich, alles ohne KI |
| 6 KI-Analyse | T17–T22 | Analyse mit Claude/Gemini, Validierung, Anzeige, Einstellungen |
| 7 Abschluss | T23–T24 | NFRs, E2E, Abnahme der Erfolgskriterien aus Spec 14 |

Nach jeder Phase gibt es einen Checkpoint mit Review durch euch.

**Parallelisierbar:** Phase 4 (Bookmarklet) läuft unabhängig von Phase 5 und 6, sobald T8 fertig ist und die HTML-Fixtures da sind. T16 (Vergleich) ist unabhängig von T13–T15. T17 (Provider) kann parallel zu Phase 5 starten.

## Risiken und Gegenmaßnahmen

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| HTML-Fixtures des Spiels fehlen. Der Rohdump hat keine IDs und keine Kunde→Produkt-Hierarchie | **Hoch**: Bookmarklet-Akzeptanzkriterien sind nicht prüfbar | A1. Normalize zuerst mit Dump. HTML-Fixtures früh beschaffen (Q1). Bookmarklet-Phase bis dahin zurückstellen |
| Spiel-HTML ändert sich (neue Version, Markup) | Mittel | `extract` bricht nie ab, schreibt `warnings[]`. Parsertests gegen gespeicherte HTML-Dateien |
| CSP des Spiels blockiert das Bookmarklet | Mittel | Selbständiges Bundle ohne externe Skripte, Konsolen-Fallback (Spec 8.3). Früh im echten Spiel testen (Checkpoint 4) |
| KI liefert ungültige Änderungen oder erfundene Belege | Hoch für den Nutzen | Strikte Validierung (T19), Markierung statt Verwerfen, sichtbarer Hinweis |
| Gemini-Schema unterstützt nicht alle JSON-Schema-Konstrukte | Mittel | Antwortschema flach halten (keine `oneOf`/`$ref`). Vertragstest für beide Adapter mit demselben Schema |
| Prompt zu groß (alle Berichte + Entscheidungen + Historie) | Mittel: Kosten, Kontextgrenze | Kompakte Serialisierung (Tabellen als CSV-artige Blöcke). Tokens im Test messen, bei Bedarf Historie verdichten |
| Verfügbarkeit und Namen der Modelle ändern sich | Niedrig | Modell nur über ENV und Admin-UI, nie im Code hart verdrahtet |
| SMTP-Zustellung (Spam, Port) in Produktion | Mittel | Mailpit im Dev. „Verbindung testen“ ist optional. Code-Login als Fallback zum Link |

## Offene Fragen (brauchen eure Antwort)

| # | Frage | Vorschlag bis zur Klärung |
|---|---|---|
| **Q1** | Könnt ihr die **rohen HTML-Antworten des Spiels** für Runde 0 speichern (alle Endpunkte aus Spec 8.1, inkl. aufgeklappter `sales_customerproduct`-Tabelle mit CSS-Klassen und den Entscheidungsseiten mit `data-entity-id`)? Ohne sie lässt sich der Bookmarklet-Parser nicht gegen echte Daten testen. | Ich kann ein kleines Konsolen-Skript liefern, das alle Antworten als ZIP/JSON herunterlädt. Ihr führt es im eingeloggten Spiel aus. Bis dahin ist Phase 4 zurückgestellt |
| Q2 | Ist der Rohdump `tfc_round0.json` von euch per Hand oder Skript erzeugt worden? Gibt es dieses Skript noch? | Falls ja, wird es die Grundlage für `extract` |
| Q3 | Die Spec nennt `SPEC.md`, die Datei heißt `tfc_SPEC.md`. Umbenennen? | Name so lassen (A9) |
| Q4 | Wie sollen die Runden **−2 und −1** behandelt werden, die in den KPI-Verläufen und Finanzen (`previous`) vorkommen? Als eigene Runden im Vergleich/Verlauf oder nur als Historie innerhalb von Runde 0? | Nur als Verlaufspunkte, keine eigenen Rundendatensätze. Das Schema erlaubt `round ≥ -2` für KPI-Punkte |
| Q5 | Spec 8.4: „Daten 10 Berichte, Finanzen (66 Zeilen)“. Der Dump hat 66 Zeilen **inklusive** Kopfzeile „Round“. Zählt die Kopfzeile mit? | Kopfzeile wird zu `columns`, es bleiben 65 Datenzeilen. Das Akzeptanzkriterium wird entsprechend angepasst |
| Q6 | `ANALYSIS_MAX_RUNS_PER_DAY` steht nicht in `.env.example` (Spec 5). Aufnehmen? | Ja, als optionale Variable |
