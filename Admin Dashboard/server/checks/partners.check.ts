import assert from "node:assert/strict";
import { checkPostInput, type IPostInput } from "../../shared/news.ts";
import { checkEntryInput, slugify, type IEntryInput } from "../../shared/partners.ts";
import { check, section } from "./harness.ts";

/** Ein gültiger Partner, von dem jede Prüfung eine Stelle ändert. */
const PARTNER: IEntryInput = {
    kind: "partner",
    name: "Apex Vortex Esports",
    partnerType: "organisation",
    tier: null,
    supporterType: null,
    subtitle: "Organisation",
    shortText: "Drei Teams von Diamant bis SSL, alles auf RL Nexus.",
    stripText: null,
    color: "blue",
    logo: null,
    banner: null,
    since: "2026-06-01",
    endsOn: null,
    hideAfterEnd: false,
    links: { website: "https://apexvortex.gg" },
    sections: [{ type: "about", visible: true, text: "Seit 2024 dabei." }],
    contactId: null,
    access: null,
    guildId: null,
    showTeams: false,
    visible: true,
    onHome: false,
    tournamentIds: [],
};

const SUPPORTER: IEntryInput = {
    ...PARTNER,
    kind: "supporter",
    name: "Clipbase",
    partnerType: null,
    supporterType: "firma",
    subtitle: "Clip-Tool",
    stripText: "Clips für alle Cup-Finals",
    sections: [{ type: "help", visible: true, items: [{ label: "Clips aller Cup-Finals" }] }],
};

const POST: IPostInput = {
    kind: "beitrag",
    category: "update",
    title: "Team-Hub 2.0",
    summary: "Kategorien, Rang-Karten und ein neues Menü.",
    cover: null,
    blocks: [{ type: "text", md: "Der Team-Hub ist neu.", size: "normal", width: "text" }],
    entryId: null,
    event: null,
    status: "draft",
    publishAt: null,
    pinned: "none",
    announce: false,
};

function entryProblem(change: Record<string, unknown>, base: IEntryInput = PARTNER): string | null {
    const result = checkEntryInput({ ...base, ...change });

    return "problem" in result ? result.problem : null;
}

function postProblem(change: Record<string, unknown>): string | null {
    const result = checkPostInput({ ...POST, ...change });

    return "problem" in result ? result.problem : null;
}

const fiveItems = [1, 2, 3, 4, 5].map((n) => ({ label: `Zahl ${n}`, value: String(n) }));

/** W-0062: Regeln für Partner, Sponsoren, Unterstützer und News. Ohne Datenbank. */
export async function checkPartners(): Promise<void> {
    section("Partner und News (W-0062)");

    await check("Eintrag: gültiger Partner und Unterstützer gehen durch", () => {
        assert.equal(entryProblem({}), null);
        assert.equal(entryProblem({}, SUPPORTER), null);
    });
    await check("Eintrag: javascript-Link wird abgelehnt", () => {
        assert.match(entryProblem({ links: { website: "javascript:alert(1)" } }) ?? "", /https/);
    });
    await check("Eintrag: Abschnitt passt nicht zur Art", () => {
        assert.notEqual(entryProblem({ sections: [{ type: "teams", visible: true }] }, SUPPORTER), null);
    });
    await check("Eintrag: höchstens vier Kennzahlen", () => {
        assert.notEqual(entryProblem({ sections: [{ type: "stats", visible: true, items: fiveItems }] }), null);
    });
    await check("Eintrag: Unterstützer braucht einen Text für die Leiste", () => {
        assert.notEqual(entryProblem({ stripText: null }, SUPPORTER), null);
    });
    await check("Eintrag: Unterstützer hat keinen Ansprechpartner", () => {
        const result = checkEntryInput({ ...SUPPORTER, contactId: "1162553851187040326", access: "free" });

        assert.ok("input" in result);
        assert.equal(result.input.contactId, null);
        assert.equal(result.input.access, null);
    });
    await check("Adresse: Umlaute und Kollision", () => {
        assert.equal(slugify("Grüne Löwen e.V.", new Set()), "gruene-loewen-e-v");
        assert.equal(slugify("Apex Vortex", new Set(["apex-vortex"])), "apex-vortex-2");
        assert.equal(slugify("Apex Vortex", new Set(["apex-vortex", "apex-vortex-2"])), "apex-vortex-3");
    });
    await check("News: gültiger Beitrag geht durch", () => {
        assert.equal(postProblem({}), null);
    });
    await check("News: Termin ohne Datum wird abgelehnt", () => {
        assert.notEqual(postProblem({ kind: "termin", event: null }), null);
    });
    await check("News: Video nur YouTube oder Twitch", () => {
        assert.notEqual(postProblem({ blocks: [{ type: "video", url: "https://example.com/x.mp4" }] }), null);
        assert.equal(postProblem({ blocks: [{ type: "video", url: "https://www.youtube.com/watch?v=abc123" }] }), null);
    });
    await check("News: geplant braucht Zeitpunkt", () => {
        assert.notEqual(postProblem({ status: "scheduled", publishAt: null }), null);
    });
    await check("News: Knopf nur mit https-Link", () => {
        assert.notEqual(postProblem({ blocks: [{ type: "button", label: "Los", url: "javascript:void(0)" }] }), null);
    });
}
