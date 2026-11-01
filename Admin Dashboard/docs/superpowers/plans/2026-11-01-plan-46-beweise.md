# Beweise Implementation Plan (Plan 46, W-0014 Teil 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beweise gleich beim Bestrafen, per Rechtsklick und per Nachrichtenlink; Beweis-Pflicht je Strafe; Log-Karte und Beweis-Ansicht gezeichnet; Kapitel in /hilfe.

**Architecture:** Daten und Regeln im `ModerationService` (neue Beweis-Art „message“, Pflicht als reine Funktion), Befehle reichen Beweise durch, ein Rechtsklick-Befehl und zwei Event-Klassen für Knöpfe, Menüs und Fenster. Die Bilder zeichnet derselbe Zeichner wie /hilfe (`builder/HelpImage.ts`, um zwei Blockarten erweitert).

**Tech Stack:** TypeScript, discord.js v14 Components V2, `@napi-rs/canvas`, MariaDB über die vorhandenen Models, Prüfungen in `src/scripts/Check*.ts`.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-01-beweise-design.md`

## Global Constraints

- Nur das Moderations-Team (`ModerationService.CanView`) sieht und ändert Beweise und Notizen; alle anderen: „Das sieht nur das Moderations-Team.“
- Bilder PNG, JPG, GIF, WebP bis 8 MB, Links nur https, höchstens 20 Beweise je Fall (`MAX_EVIDENCE`).
- Nachrichtenlinks nur von diesem Server (`discord.com/channels/<guildId>/<kanal>/<nachricht>`, auch `ptb.`/`canary.`).
- Ablehnungstext Pflicht: „Auf diesem Server braucht <ein Bann|ein Kick|ein Timeout ab <Dauer>|eine Verwarnung> einen Beweis. Häng ein Bild an, gib einen Link an oder sichere die Nachricht per Rechtsklick › Apps › „Als Beweis sichern“.“
- Antworten ohne Pings (`allowedMentions: { parse: [] }`), ephemeral wo nur der Klickende sieht.
- Texte Deutsch, du-Form, keine Gedankenstriche als Stilmittel.

## Review Focus

1. Nachrichtenlink auf einen anderen Server oder einen Kanal ohne Leserecht: freundliche Ablehnung, kein Absturz. Test in Task 1.
2. Strafe gelingt, Beweis nicht (zu groß, Link kaputt): Strafe bleibt, Antwort nennt das Problem. Test in Task 2.
3. Knöpfe der Log-Karte von jemandem außerhalb des Teams: abgelehnt, nichts gezeigt. Test in Task 4.
4. Fall mit 20 Beweisen und Rechtsklick: Ablehnung „Mehr als 20 …“. Test in Task 1.
5. Log-Karte nach Neustart des Bots: Knöpfe gehen weiter (Ziel steckt in der ID). Test in Task 4.

---

### Task 1: Beweis-Art Nachricht, Pflicht, Nachrichtenlink

**Files:** Modify `interfaces/services/moderation/IModeration.ts`, `constants/Moderation.ts`, `services/ModerationService.ts`, `scripts/CheckModeration.ts`.

**Interfaces (Produces):**
- `IModEvidence.kind: "image" | "link" | "message"`; neu `message?: { authorId: string; authorName: string; channelId: string; channelName: string; content: string; sentAt: number }` (value = Sprunglink).
- `IModConfig.proof: { ban: boolean; kick: boolean; timeoutFrom: number | null; warn: boolean }` (Sekunden; Standard alles aus/null). `PROOF_TIMEOUT_CHOICES = [null, 3600, 86400, 604800]`.
- `ProofNeeded(config: IModConfig, request: Pick<IModRequest, "action" | "duration">): string | null` (Ablehnungstext oder null).
- `ParseMessageLink(text: string, guildId: string): { channelId: string; messageId: string } | null`.
- `IModProof = { image?: { url: string; size: number; contentType: string | null; name: string }; link?: string; message?: Message }`.
- `ModerationService.AddMessage(guild, author: IModActor, number, message: Message): Promise<IModCase>` (Text bis 2000, Bilder als Bild-Beweise über `AddImage`).
- `ModerationService.AddProof(guild, author, number, proof: IModProof): Promise<{ entry: IModCase; problems: string[] }>`.
- `ModerationService.ActWithProof(guild, actor, request, source, proof?: IModProof): Promise<{ entry: IModCase; problems: string[] }>` (prüft `ProofNeeded` gegen „gibt es einen Beweis“, dann `Act`, dann `AddProof`). `Act` bleibt.

- [ ] Tests (rein): `ProofNeeded` für jede Strafe und Timeout unter/über der Grenze, alles aus → null; `ParseMessageLink` mit fremdem Server → null, mit `canary.` → ok, Unsinn → null; `CleanConfig` übernimmt `proof`, ungültige Dauer → null.
- [ ] Tests (Datenbank): `AddMessage` mit gebauter Fake-Nachricht ergibt Beweis „message“ mit Verfasser, Kanal, Text; 20 Beweise → Fehler „Mehr als 20“; `AddProof` mit Link auf fremden Server → Problem, kein Wurf.
- [ ] Rot, umsetzen, grün, Commit `feat(W-0014): Beweise – Nachricht als Beweis und Beweis-Pflicht`.

### Task 2: Felder an den Strafen, /fall beweis, /hilfe-Kapitel

**Files:** Modify `commands/moderation/{Warn,Timeout,Kick,Ban,Case}.ts`, `utils/modcommand.ts` (`RunAction` nimmt Beweis), `builder/ModerationView.ts` (`DoneView` mit Problemen), `constants/Help.ts` (`IHelpText.evidence?: true`), `builder/HelpView.ts` (Kapitel), `constants/HelpCatalog.ts`, `scripts/CheckHelp.ts`, `scripts/CheckModeration.ts`.

- [ ] Tests: Katalog grün mit den neuen Feldern; Seite von `/warn` hat Blöcke „Beweise anhängen“ mit drei Schritten; `DoneView` mit Problem enthält dessen Text.
- [ ] Rot, umsetzen, grün, Commit `feat(W-0014): Beweise – Felder an den Strafen und Kapitel in der Hilfe`.

### Task 3: Rechtsklick „Als Beweis sichern“

**Files:** Modify `structures/Command.ts` (`ExecuteMessage`), `events/client/CommandHandler.ts`, `services/help/HelpModel.ts` + `HelpView.ts` (Rechtsklick auf Nachricht statt Person); Create `commands/moderation/SaveEvidence.ts`, `events/moderation/EvidenceMenu.ts` (IDs `mbw:fall:<nachricht>`, `mbw:warn:<nachricht>`, Fenster `mbw:grund:<nachricht>`); Modify `constants/HelpCatalog.ts`, Checks.

- [ ] Tests: Katalog mit „Als Beweis sichern“ grün, Hilfe sagt „Rechtsklick auf die Nachricht“; IDs bauen und lesen; Menü listet höchstens 25 Fälle des Verfassers, neueste zuerst.
- [ ] Rot, umsetzen, grün, Commit `feat(W-0014): Beweise – Rechtsklick „Als Beweis sichern“`.

### Task 4: Log-Karte als Akte und Beweis-Ansicht, gezeichnet

**Files:** Modify `builder/HelpImage.ts` (Blockarten `caseHead` {emoji, title, sub, by, avatar?: Buffer} und `evidence` {items: {thumb?: Buffer; title; sub; quote?: boolean}[]}); Create `builder/ModerationCard.ts` (`CaseCard(entry, extra): Promise<{ components; files }>`, `EvidenceView(entry, index, me): Promise<…>`); Modify `services/ModerationService.ts` (`Finish`, `UpdateLog` nutzen `CaseCard`), Create `events/moderation/CaseButtons.ts` (`mf:ev:<nr>:<i>`, `mf:fall:<nr>`, `mf:notiz:<nr>` + Fenster); Checks.

- [ ] Tests: Karte hat Bild, Knöpfe „Alle N ansehen“ (nur mit Beweisen), „Fall“, „Notiz“, Dashboard-Link; Zählung „3. Fall in 30 Tagen“; Ansicht blättert, Menü höchstens 25; Klick ohne Team-Recht → Ablehnung.
- [ ] Rot, umsetzen, grün, Commit `feat(W-0014): Beweise – Log-Karte und Beweis-Ansicht als Bild`.

### Task 5: Dashboard

**Files:** Modify `routes/DashboardApiModeration.ts` (`act` nimmt `proofLink`, Einstellungen `proof`), `dashboard/client/pages/GuildModeration.ts` (Einstellungen „Beweise“, Feld „Beweis-Link“ in „Neue Aktion“, Beweis „message“ wie Link), Build.

- [ ] Tests: Route `act` mit Pflicht und ohne Link → 400 mit Text; mit Link → Fall mit Beweis; Einstellungen speichern `proof`.
- [ ] Rot, umsetzen, grün, `npm run build:dashboard`, Commit `feat(W-0014): Beweise – Pflicht und Beweis-Link im Dashboard`.

### Task 6: Doku und Dev Server

- [ ] `docs/Moderation.md`, `docu.html` (Beweise), `docs/Help.md` falls nötig.
- [ ] Dev Server, Kategorie Claude, Moderation kurz an: `/warn` mit Bild an einem Bot-Konto, Rechtsklick auf eine eigene Testnachricht in #claude-tests, Log-Karte ansehen, „Alle ansehen“, „Notiz“. Danach Modul wieder wie vorher.
- [ ] Commit `docs(W-0014): Beweise`.
