/**
 * Abschnitt: RL Team-Übersicht.
 *
 * Zwei Punkte in der Leiste: die Teams selbst (Kategorien, Kader, Rechnung) und
 * die Anzeige (Kanal, Darstellung, Nachrichten). Beide hängen an derselben
 * Route und laden dieselben Daten.
 *
 * Gerechnet wird nichts hier: die MMR je Spieler und je Team kommt fertig vom
 * Bot - sonst stünden zwei Rechnungen nebeneinander, die auseinanderlaufen.
 */

import { BASE } from "../core/Base.js";
import { icon, link, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { api, button, card, channelPicker, confirmButton, el, IPerson, IRole, loading, personPicker, row, select, stat, toggle } from "../core/Ui.js";
import { bodyEditor, IBody, IEmbed } from "../layout/BodyEditor.js";
import { ICardColumns, ICardDesign, teamCardEditor } from "../layout/TeamCardEditor.js";
import { galleryUrl, loadGallery, pickImage } from "../layout/ImagePicker.js";
import { IEditorContext, IPlaceholderTree, markdown, placeholderPicker } from "../layout/MessageEditor.js";
import {
    IPlaceholder,
    styleRanks,
    styleRole,
    styleRoles,
    TEAM_BOARD_PLACEHOLDERS,
    TEAM_CARD_PLACEHOLDERS,
    TEAM_IMAGES,
    TEAM_PLAYER_FIELDS,
} from "../constants/Placeholders.js";
import { DefaultTeamOrder, IOrderFacts, ITeamOrder, OrderTeams, TEAM_ORDER_BY, TEAM_ORDER_DIRECTIONS, TEAM_ORDER_LABELS } from "../../../constants/TeamOrder.js";
import { TrackerURL } from "../../../constants/Prime.js";
import { clickSound } from "../core/Sound.js";
import { emojiNode, IServerEmoji, openEmojiPicker } from "../layout/EmojiPicker.js";

type Slot = "1v1" | "2v2" | "3v3";

interface IPlayer {
    id: string;
    discordId: string | null;
    name: string;
    epicName: string;
    role: string;
    peaks: Record<Slot, number | null>;
}

interface ISnapshot {
    name: string | null;
    platform: string | null;
    mmr: Record<Slot, number | null>;
    tier: number | null;
    tierName: string | null;
    divisionName: string | null;
    at: number;
    error: string | null;
}

interface IChannels {
    kind: "category" | "channels";
    categoryId: string | null;
    textIds: string[];
    voiceIds: string[];
}

interface ITeam {
    id: number;
    groupId: number | null;
    name: string;
    tag: string;
    /** Wo das Team spielt, etwa "EU" (Plan 26). */
    region?: string;
    description: string;
    color: string | null;
    logo: string | null;
    /** Eigener Hintergrund der gezeichneten Karte (Plan 30). */
    background?: string | null;
    roleId: string | null;
    channels: IChannels;
    /** Was der Bot für das Team angelegt hat - nur das bietet das Löschen zum Mitlöschen an. */
    created: { roleId: string | null; categoryId: string | null; textIds: string[]; voiceIds: string[] };
    links: { label: string; url: string }[];
    players: IPlayer[];
    position: number;
    messageId: string | null;
    createdAt: number;
    mmr: number | null;
    fetchedAt: number;
    values: Record<string, number | null>;
    snapshots: Record<string, ISnapshot | null>;
}

interface IGroup {
    id: number;
    name: string;
    position: number;
}

/** Kategorien als Entwurf - wie ICategoryDraft im Bot (TeamService.ts). Negative ID: neu. */
interface ICategoryDraft {
    categories: { id: number; name: string }[];
    teams: Record<string, number | null>;
}

/** Ein eigenes Abzeichen statt des Standards - wie TeamBadge im Bot. */
type Badge = { kind: "emoji"; value: string } | { kind: "image"; value: string; emoji: string | null };

interface ISettings {
    channelId: string | null;
    layout: "hub" | "cards";
    mmr: { mode: "wtsi" | "formula"; formula: string };
    roles: { sync: boolean; positions: Record<string, string | null> };
    rankStyle: "text" | "icon" | "both";
    roleStyle: "text" | "icon" | "both";
    badges: Partial<Record<string, Badge>>;
    /** Die alte Teams-Liste - nur noch gespeichert, das Dashboard zeigt sie nicht mehr (Plan 27). */
    list: unknown;
    order: ITeamOrder;
    board: IBody;
    team: IBody;
    messageId: string | null;
    /** Aussehen der gezeichneten Karte im Hub (Plan 27). */
    card: ICardDesign;
    cardColumns: ICardColumns;
    hubRows: number;
    hubThumbnail: string | null;
    hubImage: string | null;
    hubButton: { on: boolean; to: "apply" | "web" | "channel"; url: string | null; channelId: string | null; label: string };
    hubLine: string;
    moreIds: string[];
}

/** Wer spielt - dieselbe Liste wie PLAYING_ROLES im Bot (constants/Teams.ts, wird nicht ins Dashboard gebündelt). */
const PLAYING = ["captain", "cocaptain", "player", "sub", "trial"];

/** Was die Reihenfolge von einem Team braucht - dieselben Regeln wie ViewFacts im Bot (TeamService.ts). */
function clientFacts(team: ITeam): IOrderFacts {
    return {
        id: team.id,
        name: team.name,
        position: team.position,
        createdAt: team.createdAt,
        mmr: team.mmr,
        players: team.players.filter((player) => PLAYING.includes(player.role)).length,
        league: team.links?.[0]?.label ?? null,
    };
}

interface IPayload {
    settings: ISettings;
    groups: IGroup[];
    teams: ITeam[];
    prime: boolean;
    /** Die Platzhalter je Aufgabe am ersten Team - Beispiel für die Vorschau der Team-Karte. */
    roleSamples: Record<string, string>;
    /** Je Rang sein Icon ("Grand Champion I" → "<:rl_gc1:…>") - für „Ränge zeigen als“ in der Vorschau. */
    rankIcons: Record<string, string>;
    /** Je Aufgabe ihr Abzeichen ("Captain" → "<:rl_role_captain:…>") - für „Aufgaben zeigen als“. */
    roleIcons: Record<string, string>;
    /** Je Aufgabe das Bild ihres Abzeichens aus der Galerie (teamicons) - für die Aufgaben im Dashboard. */
    roleImages: Record<string, string>;
    /** Die Icons des Bots, Ränge und Aufgaben - nur für die Vorschau. */
    icons: IServerEmoji[];
    rankStyles: Record<string, string>;
    /** Was dem Vergeben der Rollen im Weg steht. */
    problems: string[];
    /** Was der Bot anlegen darf. */
    bot: { roles: boolean; channels: boolean };
    memberIntent: boolean;
    defaults: { board: IBody; team: IBody; hubLine: string };
    layouts: Record<string, string>;
    /** Wohin der Knopf unter dem Menü im Hub führen kann. */
    hubButtonLabels: Record<string, string>;
    /** Ist das Apply System an? Nur dann zeigt der Hub „Bei uns bewerben“. */
    apply: boolean;
    modes: Record<string, string>;
    roles: Record<string, string>;
    playlists: Slot[];
    formula: { keys: string[]; hints: Record<string, string>; presets: { name: string; formula: string; hint: string }[] };
    bodyKinds: Record<string, string>;
    limits: {
        groups: number;
        teams: number;
        players: number;
        name: number;
        tag: number;
        description: number;
        formula: number;
        menu: number;
        links: number;
        linkLabel: number;
    };
    guild: {
        name: string;
        /** Das Server-Icon für die Vorschau von {guild.icon}. */
        icon: string | null;
        roles: IRole[];
        channels: { id: string; name: string }[];
        voice: { id: string; name: string }[];
        /** Foren - nur für den Knopf im Hub (W-0026). */
        forums: { id: string; name: string }[];
        categories: { id: string; name: string }[];
        emojis: IServerEmoji[];
    };
}

const EMPTY_EMBED: IEmbed = {
    title: "{team.name}",
    description: "{team.roster}",
    color: "#ff1e2d",
    url: null,
    image: null,
    thumbnail: null,
    author: null,
    footer: null,
    timestamp: false,
    fields: [],
};

/** "vor 5 Minuten" - dieselbe Sprache wie überall sonst. */
const AGO = new Intl.RelativeTimeFormat("de", { numeric: "auto" });

function ago(at: number): string {
    if (!at) return "noch nie";

    const minutes = Math.round((at - Date.now()) / 60_000);

    return Math.abs(minutes) < 60 ? AGO.format(minutes, "minute") : AGO.format(Math.round(minutes / 60), "hour");
}

/** Der Abschnitt „RL Team-Übersicht" - Kategorien, Teams, Rechnung. */
export function renderTeams(guildId: string): void {
    mount(guildId, "teams");
}

/** Der Abschnitt „Anzeige" - Kanal, Darstellung, Nachrichten. */
export function renderTeamBoard(guildId: string): void {
    mount(guildId, "board");
}

/** Was Teams oder Kategorien ändert - danach lädt der andere Abschnitt nach (siehe mount). */
const TEAM_WRITES = new Set(["settings", "categories.save", "group.create", "group.save", "group.delete", "team.create", "team.save", "team.delete", "team.setup"]);
const TEAMS_CHANGED = "rlnexus:teams-changed";

function mount(guildId: string, view: "teams" | "board"): void {
    const host = need<HTMLElement>(view === "board" ? "#teamBoardBody" : "#teamsBody");
    const note = need<HTMLElement>(view === "board" ? "#teamBoardNote" : "#teamsNote");
    const request = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/teams`, note);
    // Teams-Seite und Anzeige laufen nebeneinander, jede mit eigenem Stand. Speichert die eine, sagt sie es der anderen.
    const call = async <T,>(query: string, body?: Record<string, unknown>): Promise<T | null> => {
        const answer = await request<T>(query, body);

        if (answer && body && TEAM_WRITES.has(String(body.action))) window.dispatchEvent(new CustomEvent(TEAMS_CHANGED, { detail: view }));

        return answer;
    };
    // Ob gerade etwas Ungespeichertes offen ist - dann lädt dieser Abschnitt nicht von selbst nach.
    let unsaved = (): boolean => (view === "teams" ? openTeam !== null : false);

    let data: IPayload | null = null;
    let openTeam: number | null = null;
    // Welcher Reiter der Anzeige offen ist - bleibt nach dem Speichern derselbe.
    let boardTab: "where" | "messages" | "list" = "where";
    // Welches Team im Karten-Editor dran ist - bleibt nach dem Speichern dasselbe.
    let cardTeam: number | null = null;

    const reload = async (): Promise<void> => {
        const answer = await call<IPayload>("");

        if (!answer) return;

        data = answer;
        paint();
    };

    // Hat der andere Abschnitt gespeichert, gilt dessen Stand - sonst überschriebe ein Speichern hier, was dort geändert wurde.
    window.addEventListener(TEAMS_CHANGED, (event) => {
        if ((event as CustomEvent<string>).detail === view || !data || unsaved()) return;

        void reload();
    });

    /**
     * Die Vorschau zeigt Beispielwerte - echte Kader kommen erst in Discord
     * dazu. Ein eigener Zusammenhang je Nachricht: in der Uebersicht gibt es
     * kein {team.roster}, in der Karte kein {teams}.
     */
    /**
     * Die Platzhalter je Aufgabe für die Team-Karte: {team.captain.rank} und so
     * weiter. Sie gelten für das Team, dessen Karte gerade gebaut wird - die
     * Vorschau zeigt sie am ersten Team.
     */
    const roles = (): IPlaceholderTree["branches"] =>
        Object.entries(data!.roles).map(([role, label]) => ({
            label,
            placeholders: TEAM_PLAYER_FIELDS.flatMap(([field, name]): IPlaceholder[] => {
                const key = field ? `team.${role}.${field}` : `team.${role}`;
                const entry = { key, label: name, sample: data!.roleSamples[key] ?? "—" };

                if (field) return [entry];

                // Gleich hinter den Spielern das Abzeichen der Aufgabe - das gibt es auch ohne Team.
                return [entry, { key: `${key}.icon`, label: "Abzeichen der Aufgabe", sample: data!.roleSamples[`${key}.icon`] ?? label }];
            }),
        }));

    /**
     * Ein eigenes Bild-Abzeichen steht in der Vorschau als Emoji mit dem Bild aus
     * der Galerie - das echte Emoji macht der Bot erst beim Speichern daraus. Die
     * ID ist erfunden, nur 17 Ziffern lang wie eine echte.
     */
    const previewId = (index: number): string => `9${String(index).padStart(16, "0")}`;

    /** Je Aufgabe ihr Abzeichen, wie es gerade steht: eigenes Emoji, eigenes Bild oder der Standard des Bots. */
    const badgeIcons = (look: Pick<ISettings, "badges">): Record<string, string> =>
        Object.fromEntries(
            Object.entries(data!.roles).flatMap(([role, label], index): [string, string][] => {
                const own = look.badges?.[role];
                const icon =
                    own?.kind === "emoji"
                        ? own.value
                        : own?.kind === "image" && galleryUrl(guildId, own.value)
                          ? `<:abzeichen_${role}:${previewId(index)}>`
                          : data!.roleIcons[label];

                return icon ? [[label, icon]] : [];
            })
        );

    /** Die Bilder zu den eigenen Bild-Abzeichen, damit die Vorschau sie zeigen kann. */
    const badgePreviews = (look: Pick<ISettings, "badges">): IServerEmoji[] =>
        Object.keys(data!.roles).flatMap((role, index) => {
            const own = look.badges?.[role];
            const url = own?.kind === "image" ? galleryUrl(guildId, own.value) : null;

            return url ? [{ id: previewId(index), name: `abzeichen_${role}`, animated: false, url }] : [];
        });

    /** Das Abzeichen einer Aufgabe zum Anschauen: eigenes Emoji, eigenes Bild oder der Standard aus der Galerie. */
    const badgeFace = (role: string, look: Pick<ISettings, "badges">): Node => {
        const own = look.badges?.[role];

        if (own?.kind === "emoji") return emojiNode(own.value, [...data!.guild.emojis, ...data!.icons], "tmchip__icon");

        const image = el("img", "tmchip__icon");

        image.src = (own?.kind === "image" ? galleryUrl(guildId, own.value) : null) ?? data!.roleImages?.[role] ?? "";
        image.alt = "";
        image.decoding = "async";

        return image;
    };

    /**
     * Ein Wert der Vorschau so, wie „Ränge zeigen als“, „Aufgaben zeigen als“ und
     * die Abzeichen gerade stehen - auch ungespeichert. Der Bot schickt Ränge und
     * Aufgaben ausgeschrieben; ein .icon-Platzhalter steht immer als Icon da.
     */
    const styled = (key: string, value: string, look: Pick<ISettings, "rankStyle" | "roleStyle" | "badges">): string => {
        const always = key.endsWith(".icon");
        const roles = always ? "icon" : look.roleStyle;
        const icons = badgeIcons(look);
        // Die Aufgabe allein ({spieler.role}, {team.captain.icon}) - in Aufstellung und Kader steht sie fett vor den Spielern.
        const alone = key.startsWith("spieler.role") || /^team\.[a-z]+\.icon$/.test(key);
        const text = alone ? styleRole(value, roles, icons) : styleRoles(value, roles, icons);

        return styleRanks(text, always ? "icon" : look.rankStyle, data!.rankIcons);
    };

    /** Die Teams in der Reihenfolge, wie die Karte „Reihenfolge“ gerade steht - mit derselben Funktion wie der Bot. */
    const orderedTeams = (order: ITeamOrder | undefined): ITeam[] => OrderTeams(data!.teams, clientFacts, order ?? DefaultTeamOrder());

    /**
     * Was der Editor anbietet. Die Team-Karte ist eine Vorlage für jedes Team:
     * dort helfen die Aufgaben-Platzhalter. Der Kopf des Hubs kennt die festen.
     */
    const context = (scope: "board" | "team", look: () => ISettings = () => data!.settings) => (): IEditorContext => {
        const fixed = scope === "board" ? TEAM_BOARD_PLACEHOLDERS : TEAM_CARD_PLACEHOLDERS;
        const tree: IPlaceholderTree | undefined = scope === "team" ? { label: "Aufgaben-Platzhalter …", back: "‹ Andere Aufgabe", branches: roles() } : undefined;

        const now = look();
        // Die Vorschau kennt die festen Beispiele und die echten Werte aus dem Menü daneben -
        // mit Rängen und Aufgaben so, wie die beiden Einstellungen gerade stehen.
        const values = Object.fromEntries(
            [...fixed, ...(tree?.branches.flatMap((branch) => branch.placeholders) ?? [])].map((entry) => [entry.key, styled(entry.key, entry.sample, now)])
        );

        // Im Team-Hub stehen die Teams unter dem Kopf - {teams} bleibt dort leer, wie beim Bot.
        if (scope === "board") {
            values.teams = "";
            values["teams.short"] = "";
        }

        return {
            guildId,
            values,
            roles: new Map(data!.guild.roles.map((role) => [role.id, role.name])),
            channels: new Map(data!.guild.channels.map((channel) => [channel.id, channel.name])),
            emojis: data!.guild.emojis,
            previewEmojis: [...data!.icons, ...badgePreviews(now)],
            placeholders: fixed,
            tree,
            imagePlaceholders: TEAM_IMAGES,
            onChange: () => undefined,
        };
    };

    const channelOptions = (empty: string): [string, string][] => [["", empty], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])];
    // Wohin der Knopf im Hub springen darf: wie LINKABLE_CHANNELS im Bot, also auch Foren und Sprachkanäle (W-0026).
    const linkOptions = (empty: string): [string, string][] => [
        ...channelOptions(empty),
        ...data!.guild.forums.map((entry): [string, string] => [entry.id, `💬 ${entry.name}`]),
        ...data!.guild.voice.map((entry): [string, string] => [entry.id, `🔊 ${entry.name}`]),
    ];
    const roleOptions = (): [string, string][] => [["", "— keine —"], ...data!.guild.roles.map((role): [string, string] => [role.id, `@${role.name}`])];

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        const players = data!.teams.reduce((sum, team) => sum + team.players.length, 0);
        const ranked = data!.teams.filter((team) => team.mmr !== null).length;

        return el(
            "div",
            "tkhead snhead",
            stat("#i-shield-users", "Teams", `${data!.teams.length} / ${data!.limits.teams}`),
            stat("#i-users", "Spieler", String(players)),
            stat("#i-chart-up", "Mit MMR", `${ranked} / ${data!.teams.length}`, ranked ? "is-ok" : "")
        );
    }

    /* ------------------------------------------------------------
       Kategorien
       ------------------------------------------------------------ */
    function groups(): HTMLElement {
        const name = el("input", "text snadd__input");
        const add = button("btn btn--primary snadd__go", icon("#i-plus"), "Kategorie anlegen");

        name.type = "text";
        name.maxLength = data!.limits.name;
        name.placeholder = "Etwa „Main“, „Academy“ oder „Div 2“";
        name.setAttribute("aria-label", "Name der neuen Kategorie");

        const create = async (): Promise<void> => {
            if (!name.value.trim()) {
                toast("info", "Ohne Namen geht nicht", "Die Kategorie steht so als Überschrift im Hub.");

                return;
            }

            add.disabled = true;

            const answer = await call("", { action: "group.create", group: { name: name.value.trim() } });

            add.disabled = false;

            if (!answer) return;

            name.value = "";
            void reload();
        };

        add.addEventListener("click", () => void create());
        name.addEventListener("keydown", (event) => {
            if (event.key === "Enter") void create();
        });

        const list = el(
            "div",
            "tmgroups",
            ...data!.groups.map((group) => {
                const field = el("input", "text tmgroup__name");

                field.type = "text";
                field.value = group.name;
                field.maxLength = data!.limits.name;
                field.setAttribute("aria-label", `Name der Kategorie ${group.name}`);
                field.addEventListener("change", () => void call("", { action: "group.save", id: group.id, group: { name: field.value } }).then(() => reload()));

                const remove = confirmButton("btn btn--quiet btn--icon is-danger", "#i-trash", "Kategorie löschen", "Wirklich löschen?", async () => {
                    if (!(await call("", { action: "group.delete", id: group.id }))) return;

                    toast("info", "Gelöscht", "Die Teams stehen jetzt ohne Kategorie da.");
                    void reload();
                });

                const count = data!.teams.filter((team) => team.groupId === group.id).length;

                return el("div", "tmgroup", field, el("span", "tmgroup__count", `${count} Team${count === 1 ? "" : "s"}`), remove);
            })
        );

        return card(
            "Kategorien",
            `Damit stehen die Teams im Hub unter Überschriften. Bis zu ${data!.limits.groups} Stück – ohne Kategorie geht es auch. Anlegen und zuordnen geht auch direkt im Hub unter Anzeige › Nachrichten.`,
            ...(data!.groups.length ? [list] : [el("div", "tkempty", icon("#i-folder"), el("span", "", "Noch keine Kategorie – alle Teams stehen untereinander."))]),
            el("div", "snadd__row", icon("#i-folder"), name, add)
        );
    }

    /* ------------------------------------------------------------
       Teams
       ------------------------------------------------------------ */
    function teamList(): HTMLElement[] {
        const name = el("input", "text snadd__input");
        const add = button("btn btn--primary snadd__go", icon("#i-plus"), "Team anlegen");

        name.type = "text";
        name.maxLength = data!.limits.name;
        name.placeholder = "Name des Teams";
        name.setAttribute("aria-label", "Name des neuen Teams");

        const create = async (): Promise<void> => {
            if (!name.value.trim()) {
                toast("info", "Ohne Namen geht nicht", "Der Name steht auf der Karte im Kanal.");

                return;
            }

            add.disabled = true;

            const answer = await call<{ team: ITeam }>("", { action: "team.create", team: { name: name.value.trim() } });

            add.disabled = false;

            if (!answer) return;

            openTeam = answer.team.id;
            name.value = "";
            toast("info", "Angelegt", "Jetzt den Kader eintragen – gespeichert wird mit Speichern.");
            void reload();
        };

        add.addEventListener("click", () => void create());
        name.addEventListener("keydown", (event) => {
            if (event.key === "Enter") void create();
        });

        return [
            card("Neues Team", `Bis zu ${data!.limits.teams} je Server.`, el("div", "snadd__row", icon("#i-shield-users"), name, add)),
            ...(data!.teams.length ? data!.teams.map(teamCard) : [el("div", "tkempty", icon("#i-shield-users"), el("span", "", "Noch kein Team."))]),
        ];
    }

    function teamCard(team: ITeam): HTMLElement {
        const draft = structuredClone(team);
        const isOpen = openTeam === team.id;
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const setup = teamSetup(team, draft, () => !save.disabled);
        const touch = (): void => {
            save.disabled = false;
            setup.draw();
        };

        save.disabled = true;

        const open = button("btn btn--quiet snitem__edit", icon(isOpen ? "#i-up" : "#i-sliders"), isOpen ? "Zuklappen" : "Bearbeiten");

        open.addEventListener("click", () => {
            openTeam = isOpen ? null : team.id;
            paint();
        });

        const crest = el("span", "snitem__face");

        if (team.color) crest.style.color = team.color;

        crest.append(icon("#i-shield-users"));

        const group = data!.groups.find((entry) => entry.id === team.groupId);
        const box = el(
            "div",
            `snitem${isOpen ? " is-open" : ""}`,
            el(
                "div",
                "snitem__head",
                crest,
                el(
                    "div",
                    "snitem__name",
                    el("b", "", `${team.name}${team.tag ? ` · ${team.tag}` : ""}`),
                    el("span", "", `${team.players.length} im Kader · MMR ${team.mmr ?? "—"}${group ? ` · ${group.name}` : ""}`)
                ),
                el("span", `tmmmr${team.mmr ? "" : " is-empty"}`, team.mmr ? String(team.mmr) : "—"),
                open
            )
        );

        if (!isOpen) return box;

        const text = (label: string, hint: string, value: string, max: number, onChange: (value: string) => void, area = false): HTMLElement => {
            const field = area ? el("textarea", "text tkarea") : el("input", "text");

            if (area) (field as HTMLTextAreaElement).rows = 3;
            else (field as HTMLInputElement).type = "text";

            (field as HTMLInputElement).value = value;
            (field as HTMLInputElement).maxLength = max;
            field.setAttribute("aria-label", label);
            field.addEventListener("input", () => {
                onChange((field as HTMLInputElement).value);
                touch();
            });

            return row(label, hint, field);
        };

        /* --- Der Kader --- */
        const roster = el("div", "tmplayers");
        const drawRoster = (): void => {
            roster.replaceChildren(
                ...draft.players.map((player, index) => playerRow(team, draft, player, index, touch, drawRoster)),
                addPlayer(draft, touch, drawRoster)
            );
        };

        drawRoster();

        save.addEventListener("click", async () => {
            save.disabled = true;

            // Nur was hier geändert wurde - sonst überschriebe ein älterer Stand, was etwa der Karten-Editor gespeichert hat.
            const changed = Object.fromEntries(Object.entries(draft).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify((team as unknown as Record<string, unknown>)[key])));
            const answer = await call("", { action: "team.save", id: team.id, team: changed });

            if (!answer) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", "Steht die Übersicht im Kanal, zieht sie sich nach.");
            void reload();
        });

        const remove = removeTeam(team);

        /* --- Das Logo --- */
        const logo = el("div", "tmlogo");
        const drawLogo = (): void => {
            const url = draft.logo ? galleryUrl(guildId, draft.logo) : null;
            const pick = button("btn btn--quiet", icon("#i-image"), draft.logo ? "Anderes Bild" : "Bild wählen");

            pick.addEventListener("click", async () => {
                const chosen = await pickImage(guildId, [], ["gallery", "upload", "link"]);

                if (chosen === null) return;

                draft.logo = chosen || null;
                touch();
                drawLogo();
            });

            const drop = button("btn btn--quiet btn--icon", icon("#i-x"));

            drop.title = "Bild entfernen";
            drop.hidden = !draft.logo;
            drop.addEventListener("click", () => {
                draft.logo = null;
                touch();
                drawLogo();
            });

            const thumb = el("span", "tmlogo__thumb");

            if (url) thumb.style.backgroundImage = `url("${url.replace(/["\\]/g, "")}")`;
            else thumb.append(icon("#i-image"));

            logo.replaceChildren(thumb, pick, drop);
        };

        drawLogo();

        const color = el("input", "text tmcolor");

        color.type = "color";
        color.value = draft.color ?? "#ff1e2d";
        color.setAttribute("aria-label", "Farbe der Karte");
        color.addEventListener("input", () => {
            draft.color = color.value;
            touch();
        });

        box.append(
            el(
                "div",
                "snitem__body",
                text("Name", "So steht er auf der Karte", draft.name, data!.limits.name, (value) => (draft.name = value)),
                text("Kürzel", "Zwei bis vier Zeichen, etwa VYX", draft.tag, data!.limits.tag, (value) => (draft.tag = value.toUpperCase())),
                text("Region", "Wo das Team spielt, etwa EU – steht auf der gezeichneten Karte", draft.region ?? "", 16, (value) => (draft.region = value)),
                text("Beschreibung", "Ein Satz über das Team", draft.description, data!.limits.description, (value) => (draft.description = value), true),
                row(
                    "Kategorie",
                    "Unter welcher Überschrift das Team steht",
                    select(
                        [["", "— ohne Kategorie —"], ...data!.groups.map((entry): [string, string] => [String(entry.id), entry.name])],
                        draft.groupId ? String(draft.groupId) : "",
                        (value) => {
                            draft.groupId = value ? Number(value) : null;
                            touch();
                        },
                        "Kategorie im Hub"
                    )
                ),
                row("Farbe", "Der Rand der Karte im Kanal", color),
                row("Logo", "Aus der Galerie oder als Link", logo),
                row(
                    "Rolle",
                    data!.settings.roles.sync ? "Bekommt jeder im Kader, in der Karte steht sie als {team.role}" : "Steht in der Karte als {team.role}",
                    select(roleOptions(), draft.roleId ?? "", (value) => {
                        draft.roleId = value || null;
                        touch();
                    }, "Rolle des Teams")
                ),
                ...teamChannels(draft, touch),
                setup.node,
                ...alignRights(team),
                teamLinks(draft, touch),
                el("h4", "srhead", `Kader (${draft.players.length} / ${data!.limits.players})`),
                el("p", "hintline", "Von Hand kommt nur der Peak. Name, aktuelle MMR und Rang holt der Bot über den Epic-Namen aus Prime."),
                roster,
                el("div", "mcsave", save, remove.knob),
                ...(remove.ask ? [remove.ask] : [])
            )
        );

        return box;
    }

    /**
     * In Discord anlegen, was dem Team fehlt. Angeboten wird nur, was es noch
     * nicht gibt; der Bot nimmt Vorhandenes mit dem Namen des Teams, statt ein
     * zweites anzulegen. Ein ungespeicherter Stand geht mit - sonst hieße die
     * neue Rolle noch wie vor dem Umbenennen.
     */
    function teamSetup(team: ITeam, draft: ITeam, dirty: () => boolean): { node: HTMLElement; draw: () => void } {
        const pick = { role: true, category: true, text: true, voice: true, closed: true };
        const box = el("div", "tmsetup");
        const node = row("In Discord anlegen", "Gibt es etwas schon mit dem Namen des Teams, nimmt der Bot das", box);

        const draw = (): void => {
            const has = (list: { id: string }[], ids: (string | null)[]): boolean => ids.some((id) => list.some((entry) => entry.id === id));
            const missing = {
                role: !has(data!.guild.roles, [draft.roleId]),
                category: !has(data!.guild.categories, [draft.channels.categoryId]),
                text: !has(data!.guild.channels, draft.channels.textIds),
                voice: !has(data!.guild.voice, draft.channels.voiceIds),
            };
            const rooms = missing.category || missing.text || missing.voice;

            node.hidden = !missing.role && !rooms;

            if (node.hidden) return;

            const want = {
                role: missing.role && pick.role && data!.bot.roles,
                category: missing.category && pick.category && data!.bot.channels,
                text: missing.text && pick.text && data!.bot.channels,
                voice: missing.voice && pick.voice && data!.bot.channels,
            };
            // Privat geht nur mit Team-Rolle: der vorhandenen oder der, die gleich mit entsteht.
            const canClose = !missing.role || want.role;
            const closed = canClose && pick.closed;

            const chip = (key: "role" | "category" | "text" | "voice", label: string, allowed: boolean): HTMLButtonElement => {
                const knob = button("mcdur__chip", label);

                knob.disabled = !allowed;
                knob.setAttribute("aria-pressed", String(allowed && pick[key]));
                knob.addEventListener("click", () => {
                    pick[key] = !pick[key];
                    draw();
                    box.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
                });
                knob.dataset.key = key;

                return knob;
            };

            const go = button("btn btn--quiet", icon("#i-plus"), "Anlegen");

            go.disabled = !(want.role || want.category || want.text || want.voice);
            go.addEventListener("click", async () => {
                go.disabled = true;

                const answer = await call<{ made: string[]; found: string[] }>("", {
                    action: "team.setup",
                    id: team.id,
                    ...(dirty() ? { team: draft } : {}),
                    setup: { ...want, private: closed && (want.category || want.text || want.voice) },
                });

                go.disabled = false;

                if (!answer) return;

                const said = [answer.made.length ? `Neu: ${answer.made.join(", ")}` : "", answer.found.length ? `Schon da, jetzt verknüpft: ${answer.found.join(", ")}` : ""];

                toast("info", answer.made.length ? "Angelegt" : "Verknüpft", said.filter(Boolean).join(" · ") || "Es fehlte nichts.");
                void reload();
            });

            const lacking = [missing.role && !data!.bot.roles ? "„Rollen verwalten“" : "", rooms && !data!.bot.channels ? "„Kanäle verwalten“" : ""].filter(Boolean);
            const privacy = toggle(closed, "Text nur fürs Team, Voice für alle sichtbar, rein nur das Team", (on) => {
                pick.closed = on;
                draw();
            });

            privacy.disabled = !canClose;

            box.replaceChildren(
                el(
                    "div",
                    "mcdur",
                    ...(missing.role ? [chip("role", "Rolle", data!.bot.roles)] : []),
                    ...(missing.category ? [chip("category", "Kategorie", data!.bot.channels)] : []),
                    ...(missing.text ? [chip("text", "Textkanal", data!.bot.channels)] : []),
                    ...(missing.voice ? [chip("voice", "Sprachkanal", data!.bot.channels)] : [])
                ),
                ...(lacking.length ? [el("p", "hintline is-warn", `Dem Bot fehlt ${lacking.join(" und ")}.`)] : []),
                el(
                    "div",
                    "tmsetup__foot",
                    ...(rooms
                        ? [el("label", "snitem__switch", privacy, el("span", "", canClose ? "Text nur fürs Team, Voice für alle sichtbar, rein nur das Team" : "Ohne Team-Rolle sieht die Kanäle jeder"))]
                        : []),
                    go
                )
            );
        };

        draw();

        return { node, draw };
    }

    /**
     * Löschen. Hat der Bot für das Team etwas angelegt, das es noch gibt, fragt
     * er, ob das mitgehen soll. Was schon vorher da war, bietet er gar nicht an.
     */
    function removeTeam(team: ITeam): { knob: HTMLButtonElement; ask: HTMLElement | null } {
        const done = (extra: string): void => {
            openTeam = null;
            toast("info", "Gelöscht", `Das Team und seine Karte im Kanal sind weg.${extra}`);
            void reload();
        };

        const role = data!.guild.roles.find((entry) => entry.id === team.created.roleId) ?? null;
        const rooms = [
            ...data!.guild.channels.filter((entry) => team.created.textIds.includes(entry.id)).map((entry) => `#${entry.name}`),
            ...data!.guild.voice.filter((entry) => team.created.voiceIds.includes(entry.id)).map((entry) => `🔊 ${entry.name}`),
            ...data!.guild.categories.filter((entry) => entry.id === team.created.categoryId).map((entry) => `Kategorie ${entry.name}`),
        ];

        if (!role && !rooms.length) {
            const knob = confirmButton("btn btn--quiet btn--icon is-danger", "#i-trash", "Team löschen", "Wirklich löschen?", async () => {
                if (await call("", { action: "team.delete", id: team.id })) done("");
            });

            return { knob, ask: null };
        }

        const cleanup = { role: false, channels: false };
        const knob = button("btn btn--quiet btn--icon is-danger", icon("#i-trash"), "Team löschen");
        const back = button("btn btn--quiet", "Abbrechen");
        const go = button("btn btn--quiet is-danger", icon("#i-trash"), "Endgültig löschen");
        const ask = el("div", "tmremove");
        const chip = (key: "role" | "channels", label: string): HTMLButtonElement => {
            const toggleChip = button("mcdur__chip", label);

            toggleChip.setAttribute("aria-pressed", "false");
            toggleChip.addEventListener("click", () => {
                cleanup[key] = !cleanup[key];
                toggleChip.setAttribute("aria-pressed", String(cleanup[key]));
            });

            return toggleChip;
        };

        ask.hidden = true;
        ask.append(
            el("p", "tmremove__lead", el("b", "", `${team.name} löschen?`), " Die Karte im Kanal geht mit. Soll auch weg, was der Bot für das Team angelegt hat?"),
            el("div", "mcdur", ...(role ? [chip("role", `Rolle @${role.name}`)] : []), ...(rooms.length ? [chip("channels", `Kanäle (${rooms.length})`)] : [])),
            ...(rooms.length
                ? [el("p", "hintline", `${rooms.join(" · ")}${team.created.categoryId ? " – die Kategorie nur, wenn danach nichts mehr darin steht." : ""}`)]
                : []),
            el("div", "mcsave", back, go)
        );

        knob.setAttribute("aria-expanded", "false");
        knob.addEventListener("click", () => {
            ask.hidden = !ask.hidden;
            knob.setAttribute("aria-expanded", String(!ask.hidden));

            if (!ask.hidden) back.focus();
        });
        back.addEventListener("click", () => {
            ask.hidden = true;
            knob.setAttribute("aria-expanded", "false");
            knob.focus();
        });
        go.addEventListener("click", async () => {
            go.disabled = true;

            const answer = await call("", { action: "team.delete", id: team.id, cleanup });

            go.disabled = false;

            if (answer) done(cleanup.role || cleanup.channels ? " Was du dazu gewählt hast, auch." : "");
        });

        return { knob, ask };
    }

    /** Welche Peaks die eingestellte Rechnung überhaupt anfasst. */
    function neededPeaks(): Slot[] {
        const mmr = data!.settings.mmr;

        // WTSI rechnet mit 2v2 und 3v3; eine eigene Formel mit dem, was darin steht.
        if (mmr.mode === "wtsi") return ["2v2", "3v3"];

        return data!.playlists.filter((slot) => mmr.formula.includes(`{peak${slot[0]}s}`));
    }

    /**
     * Wo ein Team zu Hause ist: entweder eine ganze Kategorie - dann gehoert
     * alles darin dazu - oder einzeln ausgesuchte Text- und Sprachkanaele.
     * Beides bleibt gespeichert, ein Wechsel wirft also nichts weg.
     */
    function teamChannels(draft: ITeam, touch: () => void): HTMLElement[] {
        const box = el("div", "tmchannels");
        const draw = (): void => {
            const category = select(
                [["", "— keine Kategorie —"], ...data!.guild.categories.map((entry): [string, string] => [entry.id, entry.name])],
                draft.channels.categoryId ?? "",
                (value) => {
                    draft.channels.categoryId = value || null;
                    touch();
                },
                "Discord-Kategorie des Teams"
            );

            box.replaceChildren(
                draft.channels.kind === "category"
                    ? row("Discord-Kategorie", "Alles darin gehört dem Team", category)
                    : el(
                          "div",
                          "tmchannels__lists",
                          row(
                              "Textkanäle",
                              "Stehen in der Karte als {team.channels}",
                              channelPicker(data!.guild.channels, draft.channels.textIds, (ids) => {
                                  draft.channels.textIds = ids;
                                  touch();
                              }, 10, "Textkanal")
                          ),
                          row(
                              "Sprachkanäle",
                              "Stehen in der Karte als {team.voice}",
                              channelPicker(data!.guild.voice, draft.channels.voiceIds, (ids) => {
                                  draft.channels.voiceIds = ids;
                                  touch();
                              }, 10, "Sprachkanal")
                          )
                      )
            );
        };

        draw();

        return [
            row(
                "Kanäle des Teams",
                "Eine ganze Kategorie oder einzeln ausgesuchte Kanäle",
                select(
                    [
                        ["category", "Ganze Kategorie"],
                        ["channels", "Einzelne Kanäle"],
                    ],
                    draft.channels.kind,
                    (value) => {
                        draft.channels.kind = value as IChannels["kind"];
                        touch();
                        draw();
                    },
                    "Art der Kanalwahl"
                )
            ),
            box,
        ];
    }

    /**
     * „Rechte angleichen“: nur da, wenn das Team eine Rolle hat und der Bot für
     * es noch Kanäle angelegt hat, die es gibt. Von Hand verknüpfte fasst es nicht an.
     */
    function alignRights(team: ITeam): HTMLElement[] {
        const exists = (list: { id: string }[], ids: string[]): boolean => ids.some((id) => list.some((entry) => entry.id === id));

        if (!team.roleId || !exists(data!.guild.roles, [team.roleId]) || !(exists(data!.guild.channels, team.created.textIds) || exists(data!.guild.voice, team.created.voiceIds))) return [];

        const go = button("btn btn--quiet", icon("#i-shield-check"), "Rechte angleichen");

        go.addEventListener("click", async () => {
            go.disabled = true;

            const answer = await call<{ aligned: string[]; skipped: number; failed: string[] }>("", { action: "team.permissions", id: team.id });

            go.disabled = false;

            if (!answer) return;

            const gone = answer.skipped ? `, ${answer.skipped} ${answer.skipped === 1 ? "Kanal gibt" : "Kanäle gibt"} es nicht mehr` : "";
            const refused = answer.failed?.length ? ` Discord hat ${answer.failed.join(", ")} abgelehnt, dort fehlen dem Bot Rechte.` : "";

            toast("info", refused ? "Teilweise angeglichen" : "Angeglichen", `${answer.aligned.join(", ") || "Kein Kanal"}${gone}.${refused}`);
        });

        return [row("Rechte angleichen", "Bringt die Kanäle, die der Bot für das Team angelegt hat, auf: Text nur fürs Team, Voice für alle sichtbar, rein nur das Team", go)];
    }

    /**
     * Ligen und Turniere: Name und Adresse je Link. In der Nachricht stehen sie
     * mit {team.leagues} als Links hintereinander.
     */
    function teamLinks(draft: ITeam, touch: () => void): HTMLElement {
        draft.links ??= [];

        const list = el("div", "tmlinks");
        const draw = (): void => {
            const rows = draft.links.map((link, index) => {
                const label = el("input", "text tmlinks__label");
                const address = el("input", "text");
                const remove = button("btn btn--quiet btn--icon", icon("#i-x"));

                label.type = "text";
                label.value = link.label;
                label.maxLength = data!.limits.linkLabel;
                label.placeholder = "Name, etwa RLCS Quali";
                label.setAttribute("aria-label", `Name von Liga-Link ${index + 1}`);
                label.addEventListener("input", () => {
                    link.label = label.value;
                    touch();
                });

                address.type = "url";
                address.value = link.url;
                address.placeholder = "https://…";
                address.setAttribute("aria-label", `Adresse von Liga-Link ${index + 1}`);
                address.addEventListener("input", () => {
                    link.url = address.value.trim();
                    address.classList.toggle("is-bad", Boolean(link.url) && !link.url.startsWith("https://"));
                    touch();
                });

                remove.title = "Link entfernen";
                remove.setAttribute("aria-label", `Liga-Link ${index + 1} entfernen`);
                remove.addEventListener("click", () => {
                    draft.links.splice(index, 1);
                    touch();
                    draw();
                });

                return el("div", "tmlinks__row", label, address, remove);
            });

            const add = button("btn btn--quiet", icon("#i-plus"), "Liga-Link hinzufügen");

            add.disabled = draft.links.length >= data!.limits.links;
            add.addEventListener("click", () => {
                draft.links.push({ label: "", url: "" });
                touch();
                draw();
                list.querySelector<HTMLInputElement>(".tmlinks__row:last-of-type .tmlinks__label")?.focus();
            });

            list.replaceChildren(...rows, add);
        };

        draw();

        return row("Ligen", `Bis zu ${data!.limits.links} Links, in der Nachricht als {team.leagues}`, list);
    }

    function playerRow(team: ITeam, draft: ITeam, player: IPlayer, index: number, touch: () => void, redraw: () => void): HTMLElement {
        const snapshot = team.snapshots[player.id] ?? null;
        const value = team.values[player.id] ?? null;
        const wanted = neededPeaks();

        const name = el("input", "text");
        const epic = el("input", "text");
        const hint = el("p", "tmplayer__facts");

        name.type = "text";
        name.value = player.name;
        name.maxLength = data!.limits.name;
        name.placeholder = snapshot?.name ?? "Anzeigename (freiwillig)";
        name.setAttribute("aria-label", `Anzeigename von Spieler ${index + 1}`);
        name.addEventListener("input", () => {
            player.name = name.value;
            touch();
        });

        // W-0035: der Weg zum Profil bei RL Tracker Network, er folgt dem Tippen. Steht in der Zeile der Peaks, rechts unter dem Epic-Namen - eine eigene Zeile ließe eine Lücke.
        const tracker = link("btn btn--quiet tmtracker", "RL Tracker Network", "#", true);
        const drawTracker = (): void => {
            const epicName = player.epicName.trim();

            tracker.hidden = !epicName;
            tracker.href = epicName ? TrackerURL(epicName) : "#";
            tracker.setAttribute("aria-label", `Profil von ${epicName || "Spieler"} bei RL Tracker Network öffnen`);
        };

        tracker.append(icon("#i-external"));

        epic.type = "text";
        epic.value = player.epicName;
        epic.maxLength = 100;
        epic.placeholder = "Epic Games Account";
        epic.setAttribute("aria-label", `Epic-Name von Spieler ${index + 1}`);
        epic.addEventListener("input", () => {
            player.epicName = epic.value;
            drawTracker();
            touch();
        });
        drawTracker();

        /** Holt den Epic-Namen aus der Verknüpfung - von Hand geht es weiter. */
        const adopt = async (userId: string): Promise<void> => {
            hint.textContent = "Epic-Konto wird gesucht …";

            const answer = await call<{ epicName: string | null }>("", { action: "epic", userId });

            if (!answer) return;

            if (answer.epicName) {
                player.epicName = answer.epicName;
                epic.value = answer.epicName;
                drawTracker();
                hint.textContent = `Epic-Konto übernommen: ${answer.epicName}`;
                touch();

                return;
            }

            // Der Epic-Name gehoert zum Mitglied: bleibt der alte stehen, holt
            // der Bot gleich die Raenge von jemand anderem.
            player.epicName = "";
            epic.value = "";
            drawTracker();
            touch();
            hint.textContent = "Kein Epic-Konto verknüpft – trag den Namen selbst ein (/rank link verbindet es).";
        };

        /* --- Das Mitglied. Wer sein Epic-Konto verbunden hat, bringt den Namen mit. --- */
        const who = el("div", "tmplayer__who");
        const drawWho = (): void => {
            who.replaceChildren(
                personPicker(
                    call,
                    player.discordId ? { id: player.discordId, name: player.name || snapshot?.name || player.epicName || player.discordId, avatar: "" } : null,
                    (person: IPerson | null) => {
                        if (!person) {
                            player.discordId = null;
                            touch();
                            drawWho();

                            return;
                        }

                        player.discordId = person.id;
                        player.name = person.name;
                        name.value = person.name;
                        touch();
                        drawWho();
                        void adopt(person.id);
                    },
                    "Mitglied suchen: Name oder ID …"
                )
            );
        };

        drawWho();

        const roleSelect = select(
            Object.entries(data!.roles).map(([id, label]): [string, string] => [id, label]),
            player.role,
            (chosen) => {
                player.role = chosen;
                touch();
            },
            `Aufgabe von Spieler ${index + 1}`
        );

        /* --- Die Peaks: nur die, mit denen gerechnet wird --- */
        const peaks = wanted.length
            ? el(
                  "div",
                  "tmpeaks",
                  el("span", "tmpeaks__label", "Peak von Hand"),
                  ...wanted.map((slot) => {
                      const field = el("input", "text tmpeak");

                      field.type = "number";
                      field.min = "0";
                      field.max = "3000";
                      field.value = player.peaks[slot] === null ? "" : String(player.peaks[slot]);
                      field.placeholder = String(snapshot?.mmr[slot] ?? "");
                      field.setAttribute("aria-label", `Peak ${slot} von Spieler ${index + 1}`);
                      field.addEventListener("input", () => {
                          const number = Number(field.value);

                          player.peaks[slot] = field.value.trim() && Number.isFinite(number) && number > 0 ? Math.round(number) : null;
                          touch();
                      });

                      return el("label", "tmpeak__box", el("span", "tmpeak__label", slot), field);
                  })
              )
            : el("p", "tmplayer__facts", "Diese Rechnung nimmt nur die aktuellen Werte – einen Peak brauchst du nicht.");

        /* --- Was Prime zuletzt hergab --- */
        const facts: string[] = [];

        if (snapshot?.error) facts.push(snapshot.error);
        else if (snapshot) {
            // Prime liefert die Division als römische Zahl - ohne "Div" läse sich das als "Champion III II".
            if (snapshot.tierName) facts.push(snapshot.divisionName && snapshot.tier !== 22 ? `${snapshot.tierName} Div ${snapshot.divisionName}` : snapshot.tierName);

            const live = data!.playlists.map((slot) => (snapshot.mmr[slot] ? `${slot} ${snapshot.mmr[slot]}` : null)).filter(Boolean);

            if (live.length) facts.push(live.join(" · "));

            facts.push(`Stand ${ago(snapshot.at)}`);
        } else if (player.epicName) facts.push("noch nicht geholt");

        hint.textContent = `${value ? `Wert ${value}` : "kein Wert"}${facts.length ? ` · ${facts.join(" · ")}` : ""}`;

        const up = button("btn btn--quiet btn--icon", icon("#i-up"));
        const remove = button("btn btn--quiet btn--icon", icon("#i-x"));

        up.title = "Nach oben";
        up.setAttribute("aria-label", `Spieler ${index + 1} nach oben`);
        up.disabled = index === 0;
        up.addEventListener("click", () => {
            draft.players.splice(index - 1, 0, ...draft.players.splice(index, 1));
            touch();
            redraw();
        });

        remove.title = "Aus dem Kader nehmen";
        remove.setAttribute("aria-label", `Spieler ${index + 1} entfernen`);
        remove.addEventListener("click", () => {
            draft.players.splice(index, 1);
            touch();
            redraw();
        });

        return el(
            "div",
            `tmplayer${snapshot?.error ? " is-problem" : ""}`,
            el("span", "tmplayer__no", String(index + 1)),
            el("div", "tmplayer__main", who, el("div", "tmplayer__line", roleSelect, name, el("div", "tmepic", epic)), el("div", "tmpeakrow", peaks, tracker), hint),
            el("div", "tmplayer__side", up, remove)
        );
    }

    function addPlayer(draft: ITeam, touch: () => void, redraw: () => void): HTMLElement {
        const add = button("btn btn--quiet", icon("#i-plus"), "Spieler hinzufügen");

        add.disabled = draft.players.length >= data!.limits.players;
        add.addEventListener("click", () => {
            const taken = new Set(draft.players.map((player) => player.id));
            let id = `p${draft.players.length + 1}`;

            for (let index = 1; taken.has(id); index++) id = `p${draft.players.length + index + 1}`;

            draft.players.push({ id, discordId: null, name: "", epicName: "", role: "player", peaks: { "1v1": null, "2v2": null, "3v3": null } });
            touch();
            redraw();
        });

        return el("div", "tmplayer tmplayer--add", add);
    }

    /* ------------------------------------------------------------
       Rollen im Kader
       ------------------------------------------------------------ */
    function roleCard(): HTMLElement {
        const draft = structuredClone(data!.settings);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            save.disabled = false;
        };

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            if (!(await call("", { action: "settings", settings: draft }))) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", draft.roles.sync ? "Die Rollen gehen gleich an die Kader." : "Der Bot vergibt keine Rollen mehr – wer eine hat, behält sie.");
            void reload();
        });

        const state = el("span", "", draft.roles.sync ? "an" : "aus");
        const sync = confirmButton("btn btn--quiet", "#i-refresh", "Jetzt abgleichen", "Wirklich abgleichen?", async () => {
            const answer = await call<{ members: number }>("", { action: "roles.sync" });

            if (!answer) return;

            toast(
                "info",
                answer.members ? "Abgleich läuft" : "Alles stimmt",
                answer.members ? `${answer.members} Mitglied${answer.members === 1 ? "" : "er"} – das dauert einen Moment.` : "Jeder im Kader hat seine Rollen."
            );
        });

        sync.disabled = !data!.settings.roles.sync;

        const positions = el(
            "div",
            "tmroles",
            ...Object.entries(data!.roles).map(([key, label]) =>
                el(
                    "label",
                    "tmroles__item",
                    el("span", "tmroles__label", label),
                    select(roleOptions(), draft.roles.positions[key] ?? "", (value) => {
                        draft.roles.positions[key] = value || null;
                        touch();
                    }, `Rolle für ${label}`)
                )
            )
        );

        return card(
            "Rollen im Kader",
            "Wer mit Discord-Konto im Kader steht, bekommt die Rolle seines Teams und die seiner Aufgabe. Geht er aus dem Kader, nimmt der Bot sie wieder.",
            row(
                "Rollen vergeben",
                "Aus: der Bot vergibt nichts, und wer eine Rolle hat, behält sie",
                el("label", "snitem__switch", toggle(draft.roles.sync, "Rollen vergeben", (on) => {
                    draft.roles.sync = on;
                    state.textContent = on ? "an" : "aus";
                    touch();
                }), state)
            ),
            ...data!.problems.map((text) => el("div", "notice", icon("#i-warn"), el("span", "", text))),
            el("h4", "srhead", "Rolle je Aufgabe"),
            el("p", "hintline", "Gilt in allen Teams: Wer irgendwo Captain ist, bekommt die Captain-Rolle. Die Rolle eines Teams stellst du am Team ein."),
            positions,
            el(
                "p",
                "hintline",
                `„Jetzt abgleichen“ geht alle Kader durch: Wem eine Rolle fehlt, der bekommt sie. Wer eine dieser Rollen hat und in keinem Kader steht, verliert sie.${data!.memberIntent ? "" : " Das Members-Intent ist aus – der Bot sieht dabei nur Mitglieder, die er gerade kennt."}`
            ),
            el("div", "mcsave lvsave", save, sync)
        );
    }

    /* ------------------------------------------------------------
       Die Rechnung
       ------------------------------------------------------------ */
    function formula(): HTMLElement {
        const draft = structuredClone(data!.settings);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            save.disabled = false;
        };

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            if (!(await call("", { action: "settings", settings: draft }))) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", "Die Werte sind neu gerechnet.");
            void reload();
        });

        const own = el("div", "tmformula");
        const field = el("input", "text tmformula__input");

        field.type = "text";
        field.value = draft.mmr.formula;
        field.maxLength = data!.limits.formula;
        field.placeholder = "{peak3s} * 0.7 + {current3s} * 0.3";
        field.setAttribute("aria-label", "Eigene Rechnung");
        field.addEventListener("input", () => {
            draft.mmr.formula = field.value;
            touch();
        });

        const keys = el(
            "div",
            "tmkeys",
            ...data!.formula.keys.map((key) => {
                const chip = button("tmkey", el("code", "", `{${key}}`), el("span", "", data!.formula.hints[key] ?? ""));

                chip.title = `{${key}} einfügen`;
                chip.addEventListener("click", () => {
                    const at = field.selectionStart ?? field.value.length;

                    field.value = `${field.value.slice(0, at)}{${key}}${field.value.slice(field.selectionEnd ?? at)}`;
                    draft.mmr.formula = field.value;
                    field.focus();
                    touch();
                });

                return chip;
            })
        );

        const presets = el(
            "div",
            "tmpresets",
            ...data!.formula.presets.map((preset) => {
                const pick = button("tmpreset", el("b", "", preset.name), el("code", "", preset.formula), el("span", "", preset.hint));

                pick.addEventListener("click", () => {
                    field.value = preset.formula;
                    draft.mmr.formula = preset.formula;
                    touch();
                });

                return pick;
            })
        );

        const drawOwn = (): void => {
            own.hidden = draft.mmr.mode !== "formula";
        };

        drawOwn();
        own.append(
            row("Rechnung", `Platzhalter in geschweiften Klammern, dazu + - * / ^ ( ) und sqrt, min, max, abs, round`, field),
            el("p", "hintline", "Gerechnet wird je Spieler; daraus entsteht die Team-MMR."),
            keys,
            el("h4", "srhead", "Fertige Rechnungen"),
            presets
        );

        return card(
            "Wie die Team-MMR entsteht",
            "WTSI gewichtet 2v2 und 3v3 nach dem Peak des Spielers und dämpft eine Pechsträhne. Wer es anders will, schreibt seine eigene Rechnung.",
            row(
                "Grundlage",
                "Gilt für alle Teams",
                select(
                    Object.entries(data!.modes).map(([id, label]): [string, string] => [id, label]),
                    draft.mmr.mode,
                    (value) => {
                        draft.mmr.mode = value as ISettings["mmr"]["mode"];
                        drawOwn();
                        touch();
                    },
                    "Grundlage der Team-MMR"
                )
            ),
            own,
            el("p", "hintline", "Die Team-MMR ist der Durchschnitt aus Captain, Co-Captain, Stamm und Ersatz. Trial, Coach und Manager zählen nicht mit."),
            el("div", "mcsave lvsave", save)
        );
    }

    /* ------------------------------------------------------------
       Die Anzeige im Kanal
       ------------------------------------------------------------ */
    function board(): HTMLElement[] {
        const draft = structuredClone(data!.settings);
        // Kategorien als Entwurf (Plan 27): wie Kopf und Karte erst mit „Speichern“ gesichert. Eine negative ID ist neu.
        const categories: ICategoryDraft = {
            categories: [...data!.groups].sort((a, b) => a.position - b.position).map((group) => ({ id: group.id, name: group.name })),
            teams: Object.fromEntries(data!.teams.map((team) => [String(team.id), team.groupId])),
        };
        const categoriesAtStart = JSON.stringify(categories);
        const startTeams = { ...categories.teams };
        const startIds = categories.categories.map((entry) => entry.id);
        /**
         * Was an den Bot geht: die Kategorien, die ausdrücklich gelöschten und nur
         * die geänderten Zuordnungen. Was dieser Entwurf nicht kennt (inzwischen auf
         * der Teams-Seite angelegt oder umgehängt), lässt der Bot, wie es ist.
         */
        const categoryDraft = (): ICategoryDraft & { removed: number[] } => ({
            categories: categories.categories,
            removed: startIds.filter((id) => !categories.categories.some((entry) => entry.id === id)),
            teams: Object.fromEntries(Object.entries(categories.teams).filter(([team, id]) => startTeams[team] !== id)),
        });
        let nextCategory = -1;
        // Ein Entwurf für alle Reiter: jeder hat seinen Speichern-Knopf, alle speichern denselben Stand.
        const saves: HTMLButtonElement[] = [];
        let dirty = false;
        let cardEditor: ReturnType<typeof teamCardEditor> | null = null;

        // Offener Entwurf in der Anzeige: dann lädt sie nicht nach, wenn die Teams-Seite speichert.
        unsaved = () => dirty;
        const touch = (): void => {
            dirty = true;

            for (const knob of saves) knob.disabled = false;
        };
        const categoriesChanged = (): boolean => JSON.stringify(categories) !== categoriesAtStart;

        /**
         * Speichert alles der Reihe nach: die Einstellungen, dann die Kategorien
         * (nur wenn sie sich geändert haben), dann das Team aus dem Karten-Editor.
         * Neu geladen wird erst danach - sonst ginge ein Teil des Entwurfs verloren.
         */
        const persist = async (): Promise<boolean> => {
            for (const knob of saves) knob.disabled = true;

            const fail = (): false => {
                for (const knob of saves) knob.disabled = false;

                return false;
            };

            if (!(await call("", { action: "settings", settings: draft }))) return fail();

            const moved = categoriesChanged();
            const team = cardEditor?.teamDraft() ?? null;

            // Folgt noch ein Team, schickt dessen Speichern den Hub - sonst ginge er zweimal raus (W-0026).
            if (moved && !(await call("", { action: "categories.save", categories: categoryDraft(), publish: !team }))) return fail();

            if (team && !(await call("", { action: "team.save", id: team.id, team: team.changes }))) return fail();

            cardEditor?.saved();
            dirty = false;
            toast("info", "Gespeichert", data!.settings.messageId && (moved || team) ? "Der Hub im Kanal zieht gleich nach." : "Mit „Übersicht senden“ geht sie raus.");

            return true;
        };
        const saveAll = async (): Promise<void> => {
            if (await persist()) void reload();
        };
        const saveButton = (): HTMLButtonElement => {
            const knob = button("btn btn--primary", icon("#i-check"), "Speichern");

            knob.disabled = !dirty;
            knob.addEventListener("click", () => void saveAll());
            saves.push(knob);

            return knob;
        };

        // Die Karte „Reihenfolge“ zeichnet mit, wenn die Darstellung wechselt.
        let orderView: { node: HTMLElement; draw: () => void } | null = null;
        const hub = (): boolean => draft.layout === "hub";

        /* --- Die Abzeichen je Aufgabe: Standard aus teamicons, ein Emoji oder ein Bild aus der Galerie --- */
        const badges = el("div", "tmbadges");
        const setBadge = (role: string, badge: Badge | null): void => {
            const next = { ...draft.badges };

            if (badge) next[role] = badge;
            else delete next[role];

            draft.badges = next;
            touch();
            paintBadges();
            // Gleich sehen, wie es aussieht - gespeichert wird mit Speichern.
            boardEditor.refresh();
            teamEditor.refresh();
            badges.querySelector<HTMLElement>(`[data-role="${role}"]`)?.focus();
        };
        const paintBadges = (): void => {
            badges.replaceChildren(
                ...Object.entries(data!.roles).map(([role, label]) => {
                    const own = draft.badges?.[role];
                    const chip = button(`mcdur__chip tmchip tmbadge${own ? " is-own" : ""}`, badgeFace(role, draft), label);
                    const state = own ? (own.kind === "emoji" ? "eigenes Emoji" : "eigenes Bild") : "Standard";

                    chip.dataset.role = role;
                    chip.title = `${label}: ${state} – ändern`;
                    chip.setAttribute("aria-label", `Abzeichen für ${label}: ${state} – ändern`);
                    chip.setAttribute("aria-haspopup", "dialog");
                    chip.addEventListener("click", () =>
                        openEmojiPicker(chip, {
                            value: own?.kind === "emoji" ? own.value : null,
                            emojis: [...data!.guild.emojis, ...data!.icons],
                            label: `Abzeichen für ${label}`,
                            none: "Standard",
                            extra: [
                                {
                                    label: "Bild aus der Galerie …",
                                    icon: "#i-image",
                                    run: () =>
                                        void pickImage(guildId, [], ["gallery", "upload"]).then((picked) => {
                                            if (picked) setBadge(role, { kind: "image", value: picked, emoji: null });
                                            else chip.focus();
                                        }),
                                },
                            ],
                            onPick: (value) => setBadge(role, value ? { kind: "emoji", value } : null),
                        })
                    );

                    return chip;
                })
            );
        };

        // Der Kopf des Hubs ist immer eine Karte (Components V2). board.kind bleibt dabei, wie es ist.
        const hubBody = {
            get kind(): string {
                return "v2";
            },
            set kind(_value: string) {},
            get content(): string {
                return draft.board.content;
            },
            set content(value: string) {
                draft.board.content = value;
            },
            get embed(): IBody["embed"] {
                return draft.board.embed;
            },
            set embed(value: IBody["embed"]) {
                draft.board.embed = value;
            },
            get doc(): IBody["doc"] {
                return draft.board.doc;
            },
            set doc(value: IBody["doc"]) {
                draft.board.doc = value;
            },
        } as IBody;
        // Die Live-Vorschau zeigt unter dem Kopf, was der Bot darunter setzt - gefüllt von previewChannel().
        const hubLive = el("div", "tmhub tmhub--live");
        const makeBoardEditor = (): ReturnType<typeof bodyEditor> =>
            bodyEditor(hubBody, {
                pageSave: () => saves[0] ?? null,
                kinds: { v2: data!.bodyKinds.v2 ?? "Karte" },
                context: context("board", () => draft),
                defaultEmbed: () => structuredClone({ ...EMPTY_EMBED, title: "Unsere Teams", description: "" }),
                touch: () => {
                    touch();
                    // Ein längerer Kopf kann den Hub auf zwei Nachrichten verteilen - der Bot packt neu.
                    previewChannel();
                },
                extras: () => hubLive,
                title: "Der Kopf des Hubs",
                hint: "Banner, Überschrift und Text über den Teams. Die Teams setzt der Bot selbst darunter, nach Kategorien.",
                templates: "teamBoard",
            });
        let boardEditor = makeBoardEditor();

        const teamEditor = bodyEditor(draft.team, {
            pageSave: () => saves[0] ?? null,
            kinds: data!.bodyKinds,
            context: context("team", () => draft),
            defaultEmbed: () => structuredClone(EMPTY_EMBED),
            touch,
            title: "Die Nachricht je Team",
            hint: "{team.roster} ist der Kader, {team.mmr} die Team-MMR. Je Aufgabe gibt es {team.captain.rank} und mehr – im Menü „Aufgaben-Platzhalter“.",
            templates: "teamCard",
        });

        const publish = button("btn btn--primary", icon("#i-message"), data!.settings.messageId || data!.teams.some((team) => team.messageId) ? "Übersicht aktualisieren" : "Übersicht senden");

        publish.addEventListener("click", async () => {
            publish.disabled = true;

            // Gesendet wird, was gespeichert ist, danach lädt die Seite neu - also erst alles speichern, dann senden.
            if (dirty && !(await persist())) {
                publish.disabled = false;

                return;
            }

            const answer = await call<{ sent: number; failed?: number }>("", { action: "publish" });

            publish.disabled = false;

            if (!answer) return;

            const missing = answer.failed ? ` ${answer.failed} kam${answer.failed === 1 ? "" : "en"} nicht durch – darf der Bot im Kanal schreiben?` : "";

            toast("info", answer.failed ? "Nicht alles steht im Kanal" : "Steht im Kanal", `${answer.sent} Nachricht${answer.sent === 1 ? "" : "en"} geschrieben.${missing}`);
            void reload();
        });

        const recall = confirmButton("btn btn--quiet", "#i-x", "Einsammeln", "Wirklich alles löschen?", async () => {
            if (!(await call("", { action: "recall" }))) return;

            toast("info", "Eingesammelt", "Die Nachrichten sind weg, die Teams bleiben.");
            void reload();
        });

        const sync = button("btn btn--quiet", icon("#i-refresh"), "Prime jetzt abfragen");

        sync.disabled = !data!.prime;
        sync.addEventListener("click", async () => {
            sync.disabled = true;

            const answer = await call("", { action: "sync" });

            sync.disabled = false;

            if (!answer) return;

            toast("info", "Geholt", "Die Ränge sind auf dem neuesten Stand.");
            void reload();
        });

        const layoutHint: Record<string, string> = {
            hub: "Eine Nachricht: oben dein Kopf, darunter Kennzahlen, die Teams nach Kategorien und ein Menü. Wer ein Team wählt, bekommt die gezeichnete Team-Karte – nur für sich.",
            cards: "Je Team eine eigene Nachricht, untereinander im Kanal. Wie sie aussieht, stellst du unter „Nachrichten“ im Editor ein.",
        };
        const messageHint: Record<string, string> = {
            hub: "Oben der Kopf des Hubs, darunter Kategorien, Menü und Knopf. Ganz unten die Team-Karte, die bekommt, wer im Menü ein Team wählt.",
            cards: "Die Nachricht geht so oft raus, wie es Teams gibt – je Team eine eigene.",
        };

        const hint = el("p", "hintline", layoutHint[draft.layout]);
        const menuRow = el("div", "tmmenu");
        const messages = el("div", "tmmsgs");
        const note = el("p", "hintline", messageHint[draft.layout]);
        const bar = (title: string): HTMLElement => el("div", "sneditor__bar", el("h4", "sneditor__title", title));

        /* --- Thumbnail und großes Bild im Kopf (Plan 27) --- */
        const hubPictures = el("div", "tmhubpics");
        /** Wie ein Bild in der Vorschau aussieht: Galerie, Link oder das Server-Icon. */
        const imageOf = (source: string | null): string | null =>
            !source ? null : source === "{guild.icon}" ? data!.guild.icon : source.startsWith("{") ? null : galleryUrl(guildId, source);
        const pictureRow = (key: "hubThumbnail" | "hubImage", label: string, hint: string): HTMLElement => {
            const current = draft[key];
            const url = imageOf(current);
            const choose = button("btn btn--quiet", icon("#i-image"), current ? "Bild tauschen" : "Bild wählen");
            const parts: HTMLElement[] = [];

            choose.setAttribute("aria-label", `${label}: ${current ? "Bild tauschen" : "Bild wählen"}`);
            choose.addEventListener("click", () =>
                void pickImage(guildId, ["{guild.icon}"], ["gallery", "upload", "url"]).then((picked) => {
                    if (!picked) return;

                    draft[key] = picked;
                    touch();
                    paintPictures();
                    previewChannel();
                })
            );

            if (url) {
                const image = el("img", key === "hubImage" ? "tmpick__img is-wide" : "tmpick__img");

                image.src = url;
                image.alt = "";
                parts.push(image);
            } else if (current === "{guild.icon}") {
                parts.push(el("span", "tmpick__name", "Server-Icon"));
            }

            parts.push(choose);

            if (current) {
                const remove = button("iconbtn is-danger", icon("#i-trash"));

                remove.title = `${label} entfernen`;
                remove.setAttribute("aria-label", `${label} entfernen`);
                remove.addEventListener("click", () => {
                    draft[key] = null;
                    touch();
                    paintPictures();
                    previewChannel();
                });
                parts.push(remove);
            }

            return row(label, hint, el("div", "tmpick", ...parts));
        };
        const paintPictures = (): void => {
            // Wie HubDoc im Bot: der erste Baustein mit Text - Trenner und Bilder davor zählen nicht (W-0026).
            const first = draft.board.doc.blocks.find((block) => block.type === "text" || block.type === "section");

            hubPictures.replaceChildren(
                pictureRow("hubThumbnail", "Thumbnail", "Klein, oben rechts neben der ersten Textzeile. Aus der Galerie, hochgeladen oder das Server-Icon"),
                ...(draft.hubThumbnail && first?.type !== "text" ? [el("div", "notice", icon("#i-info"), el("span", "", "Das Thumbnail braucht einen Text-Baustein, vor dem kein Abschnitt mit eigenem Bild steht."))] : []),
                pictureRow("hubImage", "Großes Bild", "Breit, unter dem Text und über den Teams")
            );
        };

        /* --- Kategorien und Zuordnung als Entwurf (Plan 27) --- */
        const categoryBox = el("div", "");
        const assignBox = el("div", "tmassign");
        const changeCategories = (): void => {
            touch();
            paintAssign();
            previewChannel();
            cardEditor?.redraw();
        };
        const newCategory = el("input", "text snadd__input");
        const addCategory = button("btn btn--primary snadd__go", icon("#i-plus"), "Kategorie anlegen");
        const createCategory = (): void => {
            const name = newCategory.value.trim();

            if (!name) {
                toast("info", "Ohne Namen geht nicht", "Die Kategorie steht so als Überschrift im Hub.");
                newCategory.focus();

                return;
            }

            if (categories.categories.length >= data!.limits.groups) {
                toast("info", "Mehr geht nicht", `Bis zu ${data!.limits.groups} Kategorien.`);

                return;
            }

            categories.categories.push({ id: nextCategory--, name: name.slice(0, data!.limits.name) });
            newCategory.value = "";
            paintCategories();
            changeCategories();
            newCategory.focus();
        };

        newCategory.type = "text";
        newCategory.maxLength = data!.limits.name;
        newCategory.placeholder = "Etwa „Main“, „Academy“ oder „Div 2“";
        newCategory.setAttribute("aria-label", "Name der neuen Kategorie");
        newCategory.addEventListener("keydown", (event) => {
            if (event.key === "Enter") createCategory();
        });
        addCategory.addEventListener("click", createCategory);

        const paintCategories = (): void => {
            const count = (id: number): number => Object.values(categories.teams).filter((entry) => entry === id).length;
            const list = categories.categories.map((entry, index) => {
                const field = el("input", "text tmgroup__name");
                const knob = (symbol: string, label: string, run: () => void, disabled = false): HTMLButtonElement => {
                    const control = button(symbol === "#i-trash" ? "iconbtn is-danger" : "iconbtn", icon(symbol));

                    control.title = label;
                    control.setAttribute("aria-label", `${label}: ${entry.name || "Kategorie ohne Namen"}`);
                    control.disabled = disabled;
                    control.addEventListener("click", run);

                    return control;
                };
                const move = (step: number): void => {
                    categories.categories.splice(index + step, 0, categories.categories.splice(index, 1)[0]!);
                    paintCategories();
                    changeCategories();
                    categoryBox.querySelectorAll<HTMLButtonElement>(".tmgroup")[index + step]?.querySelector<HTMLButtonElement>(step < 0 ? "[data-up]" : "[data-down]")?.focus();
                };
                const up = knob("#i-up", "Nach oben", () => move(-1), index === 0);
                const down = knob("#i-down", "Nach unten", () => move(1), index === categories.categories.length - 1);
                const remove = knob("#i-trash", "Kategorie löschen", () => {
                    categories.categories.splice(index, 1);

                    for (const [team, id] of Object.entries(categories.teams)) if (id === entry.id) categories.teams[team] = null;

                    paintCategories();
                    changeCategories();
                });
                const n = count(entry.id);

                up.dataset.up = "";
                down.dataset.down = "";
                field.type = "text";
                field.value = entry.name;
                field.maxLength = data!.limits.name;
                field.setAttribute("aria-label", `Name der Kategorie ${entry.name}`);
                field.addEventListener("input", () => {
                    entry.name = field.value;
                    changeCategories();
                });

                return el("div", "tmgroup", field, el("span", "tmgroup__count", `${n} Team${n === 1 ? "" : "s"}`), up, down, remove);
            });

            categoryBox.replaceChildren(
                list.length ? el("div", "tmgroups", ...list) : el("div", "tkempty", icon("#i-folder"), el("span", "", "Noch keine Kategorie – alle Teams stehen ohne Überschrift untereinander.")),
                el("div", "snadd__row", icon("#i-folder"), newCategory, addCategory)
            );
        };

        const paintAssign = (): void => {
            const options: [string, string][] = [["", "— ohne Kategorie —"], ...categories.categories.map((entry): [string, string] => [String(entry.id), entry.name || "(ohne Namen)"])];

            assignBox.replaceChildren(
                ...(data!.teams.length
                    ? orderedTeams(draft.order).map((team) =>
                          row(
                              team.name,
                              `${team.players.filter((player) => PLAYING.includes(player.role)).length} Spieler · ${team.mmr === null ? "noch keine" : team.mmr} MMR`,
                              select(
                                  options,
                                  String(categories.teams[String(team.id)] ?? ""),
                                  (value) => {
                                      categories.teams[String(team.id)] = value ? Number(value) : null;
                                      paintCategories();
                                      changeCategories();
                                  },
                                  `Kategorie von ${team.name}`
                              )
                          )
                      )
                    : [el("p", "hintline", "Noch keine Teams.")])
            );
        };

        /* --- Menü und Knopf (Plan 27) --- */
        const buttonBox = el("div", "");
        const validUrl = (value: string | null): boolean => Boolean(value && value.startsWith("https://") && URL.canParse(value));
        const paintButton = (): void => {
            const now = draft.hubButton;
            const state = el("span", "", now.on ? "an" : "aus");
            const parts: HTMLElement[] = [
                row(
                    "Knopf unter dem Menü",
                    "Etwa „Bei uns bewerben“",
                    el("label", "snitem__switch", toggle(now.on, "Knopf unter dem Menü", (on) => {
                        draft.hubButton = { ...draft.hubButton, on };
                        touch();
                        paintButton();
                        previewChannel();
                    }), state)
                ),
            ];

            if (now.on) {
                const url = el("input", "text");
                const label = el("input", "text");

                url.type = "url";
                url.value = now.url ?? "";
                url.placeholder = "https://nexus-emb.de/bewerben";
                url.addEventListener("input", () => {
                    draft.hubButton = { ...draft.hubButton, url: url.value.trim() || null };
                    touch();
                    previewChannel();
                });
                url.addEventListener("change", paintButton);
                label.type = "text";
                label.maxLength = 80;
                label.value = now.label;
                label.addEventListener("input", () => {
                    draft.hubButton = { ...draft.hubButton, label: label.value };
                    touch();
                    previewChannel();
                });

                const missing =
                    now.to === "apply" && !data!.apply
                        ? "Das Apply System ist aus – so steht kein Knopf da."
                        : now.to === "web" && !validUrl(now.url)
                          ? "Ohne Adresse steht kein Knopf da."
                          : now.to === "channel" && !linkOptions("").some(([id]) => id !== "" && id === now.channelId)
                            ? "Ohne Kanal steht kein Knopf da. Ist er gelöscht, wähl einen anderen."
                            : null;
                const targetHint: Record<string, string> = {
                    apply: "Derselbe Weg wie /bewerben",
                    web: "Discord fragt beim Klick kurz nach, ob die Seite geöffnet werden soll",
                    channel: "Ein Klick springt direkt in den Kanal",
                };

                parts.push(
                    row(
                        "Der Knopf führt zu",
                        targetHint[now.to] ?? "",
                        select(Object.entries(data!.hubButtonLabels), now.to, (value) => {
                            draft.hubButton = { ...draft.hubButton, to: value as ISettings["hubButton"]["to"] };
                            touch();
                            paintButton();
                            previewChannel();
                        }, "Wohin der Knopf führt")
                    ),
                    ...(now.to === "web" ? [row("Adresse", "Beginnt mit https://", url)] : []),
                    ...(now.to === "channel"
                        ? [
                              row(
                                  "Kanal",
                                  "Wer ihn nicht sehen darf, landet nirgends",
                                  select(linkOptions("— Kanal wählen —"), now.channelId ?? "", (value) => {
                                      draft.hubButton = { ...draft.hubButton, channelId: value || null };
                                      touch();
                                      paintButton();
                                      previewChannel();
                                  }, "Kanal für den Knopf")
                              ),
                          ]
                        : []),
                    row("Text auf dem Knopf", "Bis zu 80 Zeichen", label),
                    ...(missing ? [el("div", "notice", icon("#i-info"), el("span", "", missing))] : [])
                );
            }

            buttonBox.replaceChildren(
                el("p", "hintline", "Unter den Teams steht ein Menü mit allen Teams, die Kategorie steht beim Team mit dabei. Ab 26 Teams kommt ein zweites Menü dazu – mehr Einträge lässt Discord in einem Menü nicht zu."),
                ...parts
            );
        };

        /* --- Vorschau des Hubs: der Bot packt wie beim Senden, auch ungespeichert --- */
        const hubPreview = el("div", "tmhub");
        // Reiter „Zeile im Hub“: so steht jedes Team als Zeile da.
        const hubListPreview = el("div", "tmhub");
        let hubTimer = 0;
        let hubTicket = 0;
        let beforeHub: IBody["doc"] | null = null;
        // Die Vorlage, wie sie beim Umstellen eingesetzt wurde - nur unverändert kommt beim Zurückwechseln der alte Kopf wieder.
        let hubHead = "";
        // Die Reiter entstehen erst nach dem ersten drawLayout() - bis dahin nichts neu beschriften.
        let tabsReady = false;

        const HUB_HEAD = (): IBody["doc"] => ({ ...structuredClone(data!.defaults.board.doc), accent: draft.board.doc.accent ?? "#00afff" });

        /** Was der Bot gepackt hat, zum Lesen: Texte, Menüs, Knopf, Bilder als Platz. */
        type HubPart =
            | { type: "text"; text: string }
            | { type: "menu"; label: string; options?: { label: string; description?: string }[] }
            | { type: "button"; label: string; link?: boolean }
            | { type: "image" };
        type HubMessage = { chars: number; components: number; parts: HubPart[]; rest: HubPart[] };

        /** Das Menü wie in Discord: ein Klick klappt die Einträge auf - Team, darunter Kürzel, Kategorie und MMR. */
        const menuPart = (label: string, options: { label: string; description?: string }[]): HTMLElement => {
            const menu = el(
                "details",
                "tmhub__menu",
                el("summary", "", el("span", "", label), icon("#i-chevron")),
                el("div", "tmhub__options", ...options.map((option) => el("div", "tmhub__option", el("b", "", option.label), ...(option.description ? [el("small", "", option.description)] : []))))
            );

            return menu;
        };

        const drawParts = (parts: HubPart[]): HTMLElement[] => {
            const look = context("board", () => draft)();

            return parts.map((part) =>
                part.type === "text"
                    ? el("div", "tmhub__text", markdown(part.text, look))
                    : part.type === "menu"
                      ? menuPart(part.label, part.options ?? [])
                      : part.type === "button"
                        ? el("span", part.link ? "tmhub__button is-link" : "tmhub__button", part.label, ...(part.link ? [icon("#i-external")] : []))
                        : el("div", "tmhub__image", "Bild aus dem Kopf")
            );
        };

        const drawHub = (messages: HubMessage[]): void => {
            const split = messages.length > 1 ? [el("p", "hintline", `Geht in ${messages.length} Nachrichten raus, getrennt zwischen zwei Kategorien.`)] : [];

            hubPreview.replaceChildren(
                el("span", "tmhub__label", "So steht der Hub im Kanal"),
                ...messages.map((message, index) =>
                    el("div", "tmhub__msg", ...(messages.length > 1 ? [el("span", "tmhub__count", `Nachricht ${index + 1} von ${messages.length}`)] : []), ...drawParts(message.parts))
                ),
                ...split
            );

            hubListPreview.replaceChildren(
                el("span", "tmhub__label", "So steht es im Kanal"),
                el("div", "tmhub__msg", ...drawParts(messages.flatMap((message, index) => (index === 0 ? message.rest : message.parts)).filter((part) => part.type === "text")))
            );

            // Live-Vorschau unter dem Kopf: das große Bild, dann der Rest der ersten Nachricht, dann die weiteren.
            // Das Thumbnail steht oben rechts im Rahmen, neben der ersten Textzeile - wie in Discord.
            const banner = imageOf(draft.hubImage);
            const thumb = imageOf(draft.hubThumbnail);
            const frame = hubLive.parentElement;
            const picture = (url: string, className: string): HTMLImageElement => {
                const image = el("img", className);

                image.src = url;
                image.alt = "";

                return image;
            };

            hubLive.replaceChildren(
                ...(banner ? [picture(banner, "tmhub__banner")] : []),
                ...drawParts(messages[0]?.rest ?? []),
                ...messages.slice(1).map((message, index) => el("div", "tmhub__msg", el("span", "tmhub__count", `Nachricht ${index + 2} von ${messages.length}`), ...drawParts(message.parts))),
                ...split
            );
            frame?.querySelector(":scope > .tmhub__thumb")?.remove();
            frame?.classList.toggle("has-thumb", Boolean(thumb && draft.board.doc.blocks[0]?.type === "text"));

            if (thumb && frame && draft.board.doc.blocks[0]?.type === "text") frame.prepend(picture(thumb, "tmhub__thumb"));
        };

        const previewChannel = (): void => {
            window.clearTimeout(hubTimer);
            // Was jetzt noch unterwegs ist, gilt nicht mehr - auch wenn gleich gar nicht neu gefragt wird.
            hubTicket++;
            hubPreview.replaceChildren();

            if (!hub() || !data!.teams.length) return;

            paintPictures();
            hubTimer = window.setTimeout(async () => {
                const mine = hubTicket;
                const answer = await call<{ messages: HubMessage[] }>("", { action: "hub.preview", settings: draft, categories: categoryDraft() });

                if (answer && mine === hubTicket) drawHub(answer.messages);
            }, 400);
        };

        /* --- Reiter „Zeile im Hub“: die Zeile je Team --- */
        const lineInput = el("input", "text");

        lineInput.type = "text";
        lineInput.maxLength = 300;
        lineInput.value = draft.hubLine;
        lineInput.setAttribute("aria-label", "Zeile je Team im Hub");
        lineInput.addEventListener("input", () => {
            draft.hubLine = lineInput.value;
            touch();
            previewChannel();
        });

        // Platzhalter der Team-Karte, die in eine Zeile passen - Kader, Aufstellung und Staff wären mehrzeilig.
        const linePick = placeholderPicker(
            TEAM_CARD_PLACEHOLDERS.filter((entry) => !/lineup|roster|staff|logo|channels/.test(entry.key)),
            (value) => {
                const at = lineInput.selectionStart ?? lineInput.value.length;

                lineInput.value = `${lineInput.value.slice(0, at)}${value}${lineInput.value.slice(lineInput.selectionEnd ?? at)}`;
                lineInput.dispatchEvent(new Event("input"));
                lineInput.focus();
            }
        );
        const lineReset = button("btn btn--quiet", "Vorgabe");

        lineReset.addEventListener("click", () => {
            lineInput.value = data!.defaults.hubLine;
            lineInput.dispatchEvent(new Event("input"));
        });

        const hubLineCard = card(
            "Zeile je Team im Hub",
            "Im Team-Hub steht jedes Team als eine Zeile unter seiner Kategorie. Hier stellst du ein, was darin steht – mit den Platzhaltern der Team-Karte. Wie viele Teams je Kategorie dastehen, steht unter „Kanal & Darstellung“.",
            row("Zeile je Team", "Etwa {team.rank.icon}, {team.name}, {team.tag}, {team.players}, {team.mmr}. Ohne Kürzel fallen die Backticks weg", lineInput),
            el("div", "tmline", linePick, lineReset),
            hubListPreview,
            el("div", "mcsave lvsave", saveButton())
        );

        const rows = el("input", "text gwnum");

        rows.type = "number";
        rows.min = "1";
        rows.max = "10";
        rows.step = "1";
        rows.value = String(draft.hubRows);
        rows.setAttribute("aria-label", "Zeilen je Kategorie");
        rows.addEventListener("change", () => {
            draft.hubRows = Math.min(10, Math.max(1, Math.round(Number(rows.value)) || 3));
            rows.value = String(draft.hubRows);
            touch();
            previewChannel();
        });

        /* --- Der Karten-Editor (Plan 27, layout/TeamCardEditor.ts) --- */
        cardEditor = teamCardEditor({
            guildId,
            teams: () =>
                orderedTeams(draft.order).map((team) => ({
                    id: team.id,
                    name: team.name,
                    logo: team.logo,
                    background: team.background ?? null,
                    description: team.description,
                    region: team.region ?? "",
                    links: team.links,
                })),
            draft,
            // Was das Bild nicht zeigen kann (mehrzeilig, Kanäle, Icons, Bilder), steht gar nicht erst zur Wahl.
            placeholders: TEAM_CARD_PLACEHOLDERS.filter((entry) => !/lineup|roster|staff|logo|channel|icon/.test(entry.key)),
            limits: { description: data!.limits.description, links: data!.limits.links, linkLabel: data!.limits.linkLabel },
            chosen: cardTeam,
            onChoose: (id) => {
                cardTeam = id;
            },
            touch,
            pageSave: () => saves[0] ?? null,
            preview: async (id, team) => (await call<{ image: string }>("", { action: "card.preview", id, settings: draft, team, categories: categoryDraft() }))?.image ?? null,
            save: async () => {
                const ok = await persist();

                if (ok) void reload();

                return ok;
            },
        });

        const hubArea = el(
            "div",
            "sneditor",
            el(
                "div",
                "sneditor__main",
                bar("Kategorien"),
                el("p", "hintline", "Die Teams stehen im Hub unter diesen Überschriften. Es sind dieselben wie unter RL Team-Übersicht › Teams. Ohne Kategorie stehen alle Teams ohne Überschrift untereinander."),
                categoryBox,
                bar("Teams zuordnen"),
                assignBox,
                bar("Menü und Knopf"),
                buttonBox
            ),
            el("aside", "sneditor__side", el("div", "tkside__head", el("span", "tkside__live", "Live-Vorschau")), hubPreview)
        );
        const cardArea = el(
            "div",
            "tmdrawn",
            bar("Eine Team-Karte"),
            el("p", "hintline", "Die zeichnet der Bot. So bekommt sie, wer im Menü ein Team wählt – nur für sich."),
            cardEditor.node
        );

        const drawMessages = (): void => {
            note.textContent = messageHint[draft.layout];
            messages.replaceChildren(note, ...(hub() ? [boardEditor.node, el("div", "", bar("Thumbnail und großes Bild"), hubPictures), hubArea, cardArea] : [teamEditor.node]));
        };

        /** „Im Kanal“: Team-Hub oder alle Teams einzeln. Darunter, was zur Wahl gehört. */
        const drawLayout = (): void => {
            orderView?.draw();
            menuRow.replaceChildren(
                ...(hub()
                    ? [
                          row("Zeilen je Kategorie", "So viele Teams stehen je Kategorie als Zeile da, danach „… und N weitere“. Das Menü zeigt immer alle", rows),
                          ...(beforeHub
                              ? [
                                    el(
                                        "div",
                                        "notice",
                                        icon("#i-info"),
                                        el("span", "", "Im Kopf stand {teams}. Im Hub bliebe das leer, deshalb steht jetzt die Vorlage „Team-Hub“ darin."),
                                        (() => {
                                            const back = button("btn btn--quiet", "Alten Kopf zurück");

                                            back.addEventListener("click", () => {
                                                if (beforeHub) draft.board.doc = beforeHub;

                                                beforeHub = null;
                                                boardEditor = makeBoardEditor();
                                                touch();
                                                drawLayout();
                                            });

                                            return back;
                                        })()
                                    ),
                                ]
                              : []),
                      ]
                    : [])
            );

            hint.textContent = layoutHint[draft.layout];
            drawMessages();
            previewChannel();

            // Bei „Alle Teams einzeln“ gibt es den Reiter „Zeile im Hub“ nicht.
            if (!hub() && boardTab === "list") boardTab = "where";

            if (tabsReady) paintTabs(false);
        };

        paintPictures();
        paintCategories();
        paintAssign();
        paintButton();
        drawLayout();

        const where = card(
            "Wo die Übersicht steht",
            "Der Bot schreibt sie selbst und zieht sie nach, sobald sich an einem Team etwas ändert.",
            row(
                "Kanal",
                "Dort landen die Nachrichten",
                select(channelOptions("— kein Kanal —"), draft.channelId ?? "", (value) => {
                    draft.channelId = value || null;
                    touch();
                }, "Kanal für die Übersicht")
            ),
            row(
                "Im Kanal",
                "Was dauerhaft im Kanal steht",
                select(
                    Object.entries(data!.layouts),
                    draft.layout,
                    (value) => {
                        const next: ISettings["layout"] = value === "cards" ? "cards" : "hub";

                        // Steht {teams} im Kopf, bliebe der Kopf im Hub leer: dann die Vorlage „Team-Hub“, zurück geht es mit einem Knopf.
                        if (next === "hub" && draft.layout !== "hub" && /\{teams(\.short)?\}/i.test(JSON.stringify(draft.board.doc))) {
                            beforeHub = structuredClone(draft.board.doc);
                            draft.board.doc = HUB_HEAD();
                            hubHead = JSON.stringify(draft.board.doc);
                            boardEditor = makeBoardEditor();
                        } else if (next !== "hub" && draft.layout === "hub") {
                            // Weg vom Hub: was das Umstellen geändert hat, kommt zurück - außer es wurde seitdem selbst geändert.
                            if (beforeHub && JSON.stringify(draft.board.doc) === hubHead) draft.board.doc = beforeHub;

                            beforeHub = null;
                            boardEditor = makeBoardEditor();
                        }

                        draft.layout = next;
                        drawLayout();
                        touch();
                    },
                    "Was im Kanal steht"
                )
            ),
            hint,
            menuRow,
            row(
                "Ränge zeigen als",
                Object.keys(data!.rankIcons).length
                    ? "Gilt für {team.lineup}, {team.roster}, {team.rank} und {epicname.rank}. Was auf .rank.icon endet, ist immer das Icon"
                    : "Gilt für {team.lineup}, {team.roster}, {team.rank} und {epicname.rank}. Die Icons legt der Bot beim Start an – bis dahin steht der Text da",
                select(
                    Object.entries(data!.rankStyles).map(([id, label]): [string, string] => [id, label]),
                    draft.rankStyle,
                    (value) => {
                        draft.rankStyle = value as ISettings["rankStyle"];
                        touch();
                        // Gleich sehen, wie es aussieht - gespeichert wird mit Speichern.
                        boardEditor.refresh();
                        teamEditor.refresh();
                    },
                    "Wie Ränge in den Nachrichten stehen"
                )
            ),
            row(
                "Aufgaben zeigen als",
                Object.keys(data!.roleIcons).length
                    ? "Gilt für {team.lineup}, {team.roster}, {team.staff} und {spieler.role}. {spieler.role.icon} ist immer das Abzeichen"
                    : "Gilt für {team.lineup}, {team.roster}, {team.staff} und {spieler.role}. Die Abzeichen legt der Bot beim Start an – bis dahin steht der Text da",
                select(
                    Object.entries(data!.rankStyles).map(([id, label]): [string, string] => [id, label]),
                    draft.roleStyle,
                    (value) => {
                        draft.roleStyle = value as ISettings["roleStyle"];
                        touch();
                        boardEditor.refresh();
                        teamEditor.refresh();
                    },
                    "Wie Aufgaben in den Nachrichten stehen"
                )
            ),
            row("Abzeichen", "Klick ändert: ein Emoji, ein Bild aus der Galerie oder zurück zum Standard. Ein Bild macht der Bot beim Speichern zu seinem Emoji", badges),
            el("div", "mcsave lvsave", saveButton(), publish, recall, sync)
        );
        paintBadges();

        const texts = card(
            "Die Nachrichten",
            "Selbst gebaut – mit Platzhaltern, Vorlagen und Live-Vorschau. Gezeigt wird nur, was die gewählte Darstellung braucht.",
            messages,
            el("div", "mcsave lvsave", saveButton())
        );

        /* --- Die Reiter: gebaut wie bei der Moderation --- */
        const boardTabs = (): ["where" | "messages" | "list", string, string][] => [
            ["where", "#i-layout", "Kanal & Darstellung"],
            ["messages", "#i-message", "Nachrichten"],
            ...(hub() ? [["list", "#i-list-checks", "Zeile im Hub"] as ["list", string, string]] : []),
        ];
        const tabs = el("div", "tktabs");
        const pane = el("div", "tkpane");

        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", "Bereiche der Anzeige");
        pane.id = "tmBoardPane";
        pane.setAttribute("role", "tabpanel");

        const paintTabs = (focus: boolean): void => {
            tabsReady = true;
            tabs.replaceChildren(
                ...boardTabs().map(([id, symbol, label]) => {
                    const knob = button("tktab", icon(symbol), el("span", "", label));

                    knob.id = `tmtab-${id}`;
                    knob.tabIndex = id === boardTab ? 0 : -1;
                    knob.setAttribute("role", "tab");
                    knob.setAttribute("aria-selected", String(id === boardTab));
                    knob.setAttribute("aria-controls", pane.id);
                    knob.addEventListener("click", () => open(id));

                    return knob;
                })
            );

            if (focus) document.getElementById(`tmtab-${boardTab}`)?.focus();
        };

        const open = (next: typeof boardTab): void => {
            // paintTabs baut die Knöpfe neu - wer auf einem Reiter stand, steht danach auf dem neuen.
            const focused = tabs.contains(document.activeElement);

            if (next !== boardTab) clickSound("primary");

            if (next === "messages") boardEditor.refresh();

            boardTab = next === "list" && !hub() ? "where" : next;
            paintTabs(focused);
            pane.setAttribute("aria-labelledby", `tmtab-${boardTab}`);
            // Die Editoren bleiben dieselben Knoten - ein Wechsel des Reiters verliert nichts.
            orderView = boardTab === "where" ? orderPane(draft, touch, saveButton) : null;
            pane.replaceChildren(...(boardTab === "where" ? [where, orderView!.node] : boardTab === "messages" ? [texts] : [hubLineCard]));

            if (boardTab !== "where") previewChannel();
        };

        tabs.addEventListener("keydown", (event) => {
            const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;

            if (!step) return;

            event.preventDefault();

            const list = boardTabs();
            const index = list.findIndex(([id]) => id === boardTab);

            open(list[(index + step + list.length) % list.length]![0]);
        });

        open(boardTab);

        return [tabs, pane];
    }

    /**
     * Die Karte „Reihenfolge“ im Reiter „Kanal & Darstellung“ (Entwurf
     * team-reihenfolge-v2): links „Immer oben“, die Sortierung samt Richtung
     * oder die eigene Reihenfolge, rechts, wie es in Discord steht. Geordnet wird
     * mit OrderTeams wie im Bot, gespeichert mit den übrigen Einstellungen.
     */
    function orderPane(draft: ISettings, touch: () => void, saveButton: () => HTMLButtonElement): { node: HTMLElement; draw: () => void } {
        draft.order ??= DefaultTeamOrder();

        const order = draft.order;
        const settingsBox = el("div", "tmorder__set");
        const preview = el("div", "tmorder__preview");
        const groupName = (team: ITeam): string => data!.groups.find((group) => group.id === team.groupId)?.name ?? "Ohne Kategorie";
        const byId = (id: number): ITeam | undefined => data!.teams.find((team) => team.id === id);
        /**
         * Eine Zeile mit Pfeilen: move(-1) einen Platz höher, move(1) einen tiefer. key: Liste und Team,
         * etwa "pin-12" - nach dem Neuzeichnen bekommt derselbe Pfeil den Fokus zurück (W-0025).
         */
        const arrows = (key: string, index: number, total: number, move: (step: -1 | 1, ...focus: string[]) => void): HTMLButtonElement[] => {
            const up = button("mcdur__chip tmorder__arrow", "↑");
            const down = button("mcdur__chip tmorder__arrow", "↓");
            const own = (direction: "up" | "down"): string => `[data-arrow="${key}:${direction}"]`;

            up.dataset.arrow = `${key}:up`;
            down.dataset.arrow = `${key}:down`;
            up.setAttribute("aria-label", "Einen Platz höher");
            down.setAttribute("aria-label", "Einen Platz tiefer");
            up.disabled = index === 0;
            down.disabled = index === total - 1;
            up.addEventListener("click", () => move(-1, own("up"), own("down")));
            down.addEventListener("click", () => move(1, own("down"), own("up")));

            return [up, down];
        };
        const swap = (list: number[], index: number, step: -1 | 1): void => {
            [list[index], list[index + step]] = [list[index + step], list[index]];
        };
        // focus: Kandidaten der Reihe nach - der erste, der da und nicht ausgegraut ist, bekommt den Fokus.
        const change = (...focus: string[]): void => {
            touch();
            draw();

            focus
                .map((selector) => settingsBox.querySelector<HTMLButtonElement>(selector))
                .find((knob) => knob && !knob.disabled)
                ?.focus();
        };

        const draw = (): void => {
            // Gelöschte Teams fallen weg, wie im Bot.
            order.pinned = order.pinned.filter((id) => byId(id));

            const pinnedRows = order.pinned.map((id, index) => {
                const team = byId(id)!;
                const remove = button("mcdur__chip tmorder__arrow", "✕");

                remove.setAttribute("aria-label", `${team.name} nicht mehr anheften`);
                remove.addEventListener("click", () => {
                    order.pinned.splice(index, 1);
                    change(".tmorder__add");
                });

                return el(
                    "div",
                    "tmorder__row is-pinned",
                    el("span", "tmorder__pos", String(index + 1)),
                    el("b", "", `📌 ${team.name}`),
                    el("span", "tmorder__meta", groupName(team)),
                    ...arrows(`pin-${team.id}`, index, order.pinned.length, (step, ...focus) => {
                        swap(order.pinned, index, step);
                        change(...focus);
                    }),
                    remove
                );
            });

            const rest = data!.teams.filter((team) => !order.pinned.includes(team.id));
            const add = select(
                [["", "+ Team anheften …"], ...rest.map((team): [string, string] => [String(team.id), team.name])],
                "",
                (value) => {
                    if (!value) return;

                    order.pinned.push(Number(value));
                    change(".tmorder__add");
                },
                "Team anheften"
            );

            add.classList.add("tmorder__add");
            add.disabled = !rest.length;

            const sorts = el(
                "div",
                "mcdur",
                ...TEAM_ORDER_BY.map((by) => {
                    const knob = button("mcdur__chip", TEAM_ORDER_LABELS[by]);

                    knob.setAttribute("aria-pressed", String(order.by === by));
                    knob.addEventListener("click", () => {
                        order.by = by;

                        if (by !== "custom") order.direction = TEAM_ORDER_DIRECTIONS[by].first;

                        change(`[data-by="${by}"]`);
                    });
                    knob.dataset.by = by;

                    return knob;
                })
            );

            const parts: HTMLElement[] = [
                el("p", "tmorder__label", "Immer oben"),
                ...(pinnedRows.length ? [el("div", "tmorder__rows", ...pinnedRows)] : []),
                add,
                el("p", "hintline", "Platz 1 steht ganz oben, dann Platz 2 und so weiter, egal wie der Rest sortiert ist."),
                el("p", "tmorder__label", "Danach sortiert nach"),
                sorts,
            ];

            if (order.by === "custom") {
                // Die eigene Reihenfolge zeigt, was gerade gilt. Beim ersten Verschieben wird genau das gespeichert.
                const shown = orderedTeams(order).filter((team) => !order.pinned.includes(team.id));

                parts.push(
                    el("p", "tmorder__label", "Eigene Reihenfolge"),
                    el(
                        "div",
                        "tmorder__rows",
                        ...shown.map((team, index) =>
                            el(
                                "div",
                                "tmorder__row",
                                el("span", "tmorder__pos is-quiet", String(index + 1)),
                                el("b", "", team.name),
                                el("span", "tmorder__meta", groupName(team)),
                                ...arrows(`custom-${team.id}`, index, shown.length, (step, ...focus) => {
                                    const ids = shown.map((entry) => entry.id);

                                    swap(ids, index, step);
                                    order.custom = ids;
                                    change(...focus);
                                })
                            )
                        )
                    ),
                    el("p", "hintline", "Neue Teams kommen ans Ende.")
                );
            } else {
                const directions = TEAM_ORDER_DIRECTIONS[order.by];

                parts.push(
                    el("p", "tmorder__label", "Richtung"),
                    el(
                        "div",
                        "mcdur",
                        ...(["first", "second"] as const).map((which) => {
                            const direction = which === "first" ? directions.first : directions.first === "asc" ? "desc" : "asc";
                            const knob = button("mcdur__chip", directions.labels[direction]);

                            knob.setAttribute("aria-pressed", String(order.direction === direction));
                            knob.addEventListener("click", () => {
                                order.direction = direction;
                                change(`[data-direction="${direction}"]`);
                            });
                            knob.dataset.direction = direction;

                            return knob;
                        })
                    )
                );
            }

            settingsBox.replaceChildren(...parts);

            // Rechts: so, wie Hub-Menü und Karten es ordnen.
            const line = (team: ITeam): HTMLElement =>
                el("li", "", el("b", "", team.name), el("span", "tmorder__meta", [team.tag, team.mmr === null ? "" : `${team.mmr} MMR`].filter(Boolean).join(" · ")));

            if (!data!.teams.length) preview.replaceChildren(el("p", "hintline", "Noch keine Teams."));
            else if (draft.layout !== "hub" || !data!.groups.length) preview.replaceChildren(el("ol", "tmorder__flat", ...orderedTeams(order).map(line)));
            else {
                // Im Hub sortiert jede Kategorie für sich, Teams ohne Kategorie zuletzt - wie HubSections im Bot (W-0026).
                const ordered = orderedTeams(order);
                const sections = [
                    ...[...data!.groups].sort((a, b) => a.position - b.position).map((group) => ({ name: group.name, teams: ordered.filter((team) => team.groupId === group.id) })),
                    { name: "Ohne Kategorie", teams: ordered.filter((team) => !data!.groups.some((group) => group.id === team.groupId)) },
                ].filter((section) => section.teams.length);

                preview.replaceChildren(...sections.flatMap((section) => [el("p", "tmorder__label", section.name), el("ol", "tmorder__flat", ...section.teams.map(line))]));
            }
        };

        draw();

        const node = card(
            "Reihenfolge",
            "Gilt für die ganze Übersicht: für das Menü im Hub und die Karten. Im Hub sortiert jede Kategorie für sich.",
            el(
                "div",
                "tmorder",
                settingsBox,
                el(
                    "div",
                    "tmorder__side",
                    el("p", "tmorder__label", "So steht es in Discord"),
                    preview,
                    el("p", "hintline", "📌 Angeheftete Teams stehen ganz oben. In Discord steht kein Zeichen davor.")
                )
            ),
            el("div", "mcsave lvsave", saveButton())
        );

        return { node, draw };
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    function paint(): void {
        if (!data) return;

        host.replaceChildren(head(), ...(view === "board" ? board() : [groups(), ...teamList(), roleCard(), formula()]));
    }

    loading(host, 3);

    void loadGallery(guildId).catch(() => undefined);
    void reload();
}
