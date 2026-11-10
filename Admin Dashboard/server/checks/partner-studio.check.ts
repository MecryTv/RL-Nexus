import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkEntryInput, SECTIONS_FOR, type IEntry, type IEntryInput, type ISection } from "../../shared/partners.ts";
import { addSection, newEntry, roleNotice, sectionAction, switchKind, templateSections } from "../../src/partners/draft.ts";
import { partnerMessage, type IPartnerContext } from "../../src/partners/preview.ts";
import { check, section } from "./harness.ts";

const WEBSITE_CONTENT = path.join(import.meta.dirname, "..", "..", "..", "Webseite", "src", "services", "Content.ts");

/** Die Prüfer der Webseite, wenn der Ordner daneben liegt (im Docker-Image des Admins nicht). */
export async function websiteValidators(): Promise<{ isPartnerPreview(data: unknown): boolean; isNewsPreview(data: unknown): boolean } | null> {
    if (!existsSync(WEBSITE_CONTENT)) return null;

    return (await import(pathToFileURL(WEBSITE_CONTENT).href)) as { isPartnerPreview(data: unknown): boolean; isNewsPreview(data: unknown): boolean };
}

const saved = (input: IEntryInput, extra: Partial<IEntry> = {}): IEntry => ({
    ...input,
    id: 7,
    slug: "apex-vortex",
    position: 0,
    createdName: "Check",
    createdAt: "2026-11-10T10:00:00.000Z",
    updatedAt: "2026-11-10T10:00:00.000Z",
    role: null,
    groupGranted: false,
    ...extra,
});

/** W-0062 Teil 2: Entwürfe, Vorlagen und Vorschau des Partner-Studios. */
export async function checkPartnerStudio(): Promise<void> {
    section("Partner-Studio (W-0062 Teil 2)");

    await check("Entwurf: neuer Partner ist unsichtbar, hat die Standard-Abschnitte und ist speicherbar", () => {
        const entry = newEntry("partner", "Apex Vortex", { partnerType: "organisation" });

        assert.equal(entry.visible, false);
        assert.deepEqual(entry.sections.map((item) => item.type), SECTIONS_FOR.partner);
        assert.ok("input" in checkEntryInput(entry), JSON.stringify(checkEntryInput(entry)));
    });

    await check("Entwurf: neuer Unterstützer ist speicherbar, Leiste höchstens 60 Zeichen", () => {
        const entry = newEntry("supporter", "Ein sehr langer Name für einen Unterstützer, der nicht in die Leiste passt", { supporterType: "firma", visible: true });
        const checked = checkEntryInput(entry);

        assert.ok("input" in checked, JSON.stringify(checked));
        assert.ok(entry.stripText!.length <= 60);
        assert.equal(entry.visible, true);
        assert.deepEqual(entry.sections.map((item) => item.type), SECTIONS_FOR.supporter);
    });

    await check("Entwurf: Wechsel der Art behält Name, Logo und Texte", () => {
        const partner: IEntryInput = {
            ...newEntry("partner", "Apex Vortex", { partnerType: "organisation", contactId: "100000000000000001", access: "free" }),
            logo: "/content/media/abcdef0123456789.webp",
            sections: [{ type: "about", visible: true, text: "Seit 2023 dabei." }, { type: "teams", visible: true }],
        };
        const sponsor = switchKind(partner, "sponsor");

        assert.equal(sponsor.name, "Apex Vortex");
        assert.equal(sponsor.logo, partner.logo);
        assert.equal(sponsor.sections.find((item) => item.type === "about")?.text, "Seit 2023 dabei.");
        assert.ok(!sponsor.sections.some((item) => item.type === "teams"));
        assert.ok("input" in checkEntryInput(sponsor), JSON.stringify(checkEntryInput(sponsor)));

        const supporter = switchKind(partner, "supporter");

        assert.equal(supporter.contactId, null);
        assert.equal(supporter.access, null);
        assert.ok(supporter.stripText);
        assert.ok("input" in checkEntryInput(supporter), JSON.stringify(checkEntryInput(supporter)));
    });

    await check("Entwurf: Vorlagen passen zur Art", () => {
        for (const [kind, template] of [["partner", "organisation"], ["partner", "creator"], ["partner", "liga"], ["partner", "community"], ["sponsor", "firma"], ["supporter", "firma"], ["supporter", "creator"], ["supporter", "community"]] as const) {
            const entry = { ...newEntry(kind, "Vorlage", { partnerType: "organisation", tier: "sponsor", supporterType: "firma" }), sections: templateSections(kind, template) };

            assert.ok("input" in checkEntryInput(entry), `${kind}/${template}: ${JSON.stringify(checkEntryInput(entry))}`);
        }
    });

    await check("Entwurf: Abschnitte verschieben, ausblenden, dazunehmen", () => {
        const sections: ISection[] = [{ type: "about", visible: true }, { type: "facts", visible: true }, { type: "news", visible: true }];

        assert.deepEqual(sectionAction(sections, 1, "hoch").map((item) => item.type), ["facts", "about", "news"]);
        assert.deepEqual(sectionAction(sections, 1, "runter").map((item) => item.type), ["about", "news", "facts"]);
        assert.deepEqual(sectionAction(sections, 99, "hoch"), sections);
        assert.equal(sectionAction(sections, 0, "aus")[0]!.visible, false);
        assert.equal(sectionAction(sectionAction(sections, 0, "aus"), 0, "aus")[0]!.visible, true);
        assert.equal(addSection(addSection(sections, "partner", "gallery"), "partner", "gallery").filter((item) => item.type === "gallery").length, 2);
        assert.deepEqual(addSection(sections, "partner", "teams"), sections);
        assert.deepEqual(addSection(sections, "supporter", "gallery"), sections);
    });

    await check("Entwurf: Folgen für Gruppe und @Partner werden vorher genannt", () => {
        const before = saved(newEntry("partner", "Apex Vortex", { partnerType: "organisation", contactId: "100000000000000001", access: "free" }), { groupGranted: true });

        assert.match(roleNotice(before, { ...before, kind: "supporter" }, "partner") ?? "", /Gruppe Partner.*@Partner|@Partner.*Gruppe Partner/s);
        assert.match(roleNotice(before, "loeschen", "administrator") ?? "", /behält/);
        assert.match(roleNotice(before, { ...before, contactId: "100000000000000002" }, "partner") ?? "", /@Partner/);
        assert.equal(roleNotice(before, { ...before, name: "Neu" }, "partner"), null);
        assert.equal(roleNotice(saved(newEntry("partner", "Ohne Kontakt", { partnerType: "organisation" })), "loeschen", null), null);
    });

    await check("Vorschau: Entwurf mit ausgeblendetem Abschnitt, neue Adresse aus dem Namen", async () => {
        const input: IEntryInput = {
            ...newEntry("partner", "Grüne Löwen", { partnerType: "community" }),
            sections: [{ type: "about", visible: true, text: "Hallo" }, { type: "facts", visible: false, items: [{ label: "Region", value: "Nord" }] }],
        };
        const context: IPartnerContext = { id: null, slug: null, entries: [], posts: [], showcase: null, now: new Date("2026-11-10T12:00:00Z") };
        const message = partnerMessage(input, context, "gross", "abschnitt:1");

        assert.equal(message.type, "rlnexus:vorschau-partner");
        assert.equal(message.entry.slug, "gruene-loewen");
        assert.equal(message.entry.sections.length, 2);
        assert.equal(message.entry.sections[1]!.visible, false);
        assert.equal(message.live, null);

        const withLive = partnerMessage({ ...input, guildId: "300000000000000001", showTeams: false }, { ...context, showcase: { members: 10, online: 2, modules: ["teams"], teams: [{ name: "A", group: null, mmr: 1, rank: null, players: 3 }] } }, "karte", null);

        assert.deepEqual(withLive.live, { members: 10, online: 2, modules: ["teams"], teams: [] });

        const website = await websiteValidators();

        if (!website) {
            console.log("        (Webseite nicht daneben: Prüfung gegen isPartnerPreview übersprungen)");
            return;
        }

        assert.ok(website.isPartnerPreview(message), "isPartnerPreview");
        assert.ok(website.isPartnerPreview(withLive), "isPartnerPreview mit Live-Zahlen");
    });
}
