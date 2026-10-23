/**
 * Abschnitt: RL Team-Übersicht.
 *
 * Zwei Punkte in der Leiste: die Teams selbst (Gruppen, Kader, Rechnung) und
 * die Anzeige (Kanal, Darstellung, Nachrichten). Beide hängen an derselben
 * Route und laden dieselben Daten.
 *
 * Gerechnet wird nichts hier: die MMR je Spieler und je Team kommt fertig vom
 * Bot - sonst stünden zwei Rechnungen nebeneinander, die auseinanderlaufen.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { api, button, card, channelPicker, confirmButton, el, IPerson, IRole, loading, personPicker, row, select, stat, toggle } from "../core/Ui.js";
import { bodyEditor, IBody, IEmbed } from "../layout/BodyEditor.js";
import { galleryUrl, loadGallery, pickImage } from "../layout/ImagePicker.js";
import { formatTools, IEditorContext, insertPlaceholder, IPlaceholderTree, markdown, placeholderMarks, placeholderPicker, placeholderTree, trackField } from "../layout/MessageEditor.js";
import {
    IPlaceholder,
    styleRanks,
    styleRole,
    styleRoles,
    TEAM_BOARD_PLACEHOLDERS,
    TEAM_CARD_PLACEHOLDERS,
    TEAM_IMAGES,
    TEAM_LIST_PLACEHOLDERS,
    TEAM_MEMBER_PLACEHOLDERS,
    TEAM_PLAYER_FIELDS,
} from "../constants/Placeholders.js";
import { IListTeam, ITeamListPreset, ITeamListSettings, TEAM_LIST_PRESETS, TeamListText } from "../../../constants/TeamList.js";
import { DefaultTeamOrder, IOrderFacts, ITeamOrder, OrderTeams, TEAM_ORDER_BY, TEAM_ORDER_DIRECTIONS, TEAM_ORDER_LABELS } from "../../../constants/TeamOrder.js";
import { presetBar } from "../layout/Templates.js";
import { clickSound } from "../core/Sound.js";
import { emojiNode, emojiPicker, IServerEmoji, openEmojiPicker } from "../layout/EmojiPicker.js";

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
    description: string;
    color: string | null;
    logo: string | null;
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

/** Ein eigenes Abzeichen statt des Standards - wie TeamBadge im Bot. */
type Badge = { kind: "emoji"; value: string } | { kind: "image"; value: string; emoji: string | null };

interface ISettings {
    channelId: string | null;
    layout: "cards" | "menu" | "single";
    mmr: { mode: "wtsi" | "formula"; formula: string };
    roles: { sync: boolean; positions: Record<string, string | null> };
    rankStyle: "text" | "icon" | "both";
    roleStyle: "text" | "icon" | "both";
    badges: Partial<Record<string, Badge>>;
    list: ITeamListSettings;
    order: ITeamOrder;
    board: IBody;
    team: IBody;
    messageId: string | null;
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
    /** Je Spieler mit Epic-Namen sein Schlüssel ({mecrytv.rank} …) und was der Bot einsetzen würde. */
    players: { key: string; name: string; team: string; values: Record<string, string> }[];
    /** Die Platzhalter je Aufgabe am ersten Team - Beispiel für die Vorschau der Team-Karte. */
    roleSamples: Record<string, string>;
    /** Je Rang sein Icon ("Grand Champion I" → "<:rl_gc1:…>") - für „Ränge zeigen als“ in der Vorschau. */
    rankIcons: Record<string, string>;
    /** Je Aufgabe ihr Abzeichen ("Captain" → "<:rl_role_captain:…>") - für „Aufgaben zeigen als“. */
    roleIcons: Record<string, string>;
    /** Je Aufgabe das Bild ihres Abzeichens aus der Galerie (teamicons) - für die Aufgaben im Dashboard. */
    roleImages: Record<string, string>;
    /** Alle Teams so, wie {teams} sie aufschreibt - Grundlage der Vorschau im Reiter „Teams-Liste“. */
    listTeams: IListTeam[];
    /** Die Icons des Bots, Ränge und Aufgaben - nur für die Vorschau. */
    icons: IServerEmoji[];
    rankStyles: Record<string, string>;
    /** Was dem Vergeben der Rollen im Weg steht. */
    problems: string[];
    /** Was der Bot anlegen darf. */
    bot: { roles: boolean; channels: boolean };
    memberIntent: boolean;
    defaults: { board: IBody; team: IBody };
    layouts: Record<string, string>;
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
        listTeam: number;
        listMember: number;
    };
    guild: {
        name: string;
        roles: IRole[];
        channels: { id: string; name: string }[];
        voice: { id: string; name: string }[];
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

/**
 * Die Ebenen der Teams-Liste, im Menü am Reiter. Sie bauen aufeinander auf:
 * die Zeile je Team setzt {team.members} und {team.members.staff} ein, und wie
 * jeder darin aussieht, steht eine Ebene tiefer.
 */
type ListLevel = "team" | "members" | "staff";

const LIST_LEVELS: { id: ListLevel; icon: string; label: string; key: string; hint: string; title: string; lead: string }[] = [
    {
        id: "team",
        icon: "#i-list-checks",
        label: "Team",
        key: "{teams}",
        hint: "Die Zeile je Team",
        title: "So steht ein Team in {teams}",
        lead: "Eine Vorlage für jedes Team. Zeilen, deren Platzhalter alle leer sind, fallen weg – etwa „Ligen:“ bei einem Team ohne Liga-Links.",
    },
    {
        id: "members",
        icon: "#i-users",
        label: "Spieler",
        key: "{team.members}",
        hint: "Wie jeder Spieler dasteht",
        title: "So steht ein Spieler in {team.members}",
        lead: "Eine Vorlage für jeden Spieler, gern über mehrere Zeilen. {team.members} in der Zeile je Team setzt alle untereinander ein.",
    },
    {
        id: "staff",
        icon: "#i-clipboard",
        label: "Staff",
        key: "{team.members.staff}",
        hint: "Wie Coach und Manager dastehen",
        title: "So steht der Staff in {team.members.staff}",
        lead: "Coach und Manager, jeder in eigener Zeile. {team.members.staff} in der Zeile je Team setzt sie ein.",
    },
];

/** Der Abschnitt „RL Team-Übersicht" - Gruppen, Teams, Rechnung. */
export function renderTeams(guildId: string): void {
    mount(guildId, "teams");
}

/** Der Abschnitt „Anzeige" - Kanal, Darstellung, Nachrichten. */
export function renderTeamBoard(guildId: string): void {
    mount(guildId, "board");
}

function mount(guildId: string, view: "teams" | "board"): void {
    const host = need<HTMLElement>(view === "board" ? "#teamBoardBody" : "#teamsBody");
    const note = need<HTMLElement>(view === "board" ? "#teamBoardNote" : "#teamsNote");
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/teams`, note);

    let data: IPayload | null = null;
    let openTeam: number | null = null;
    // Welcher Reiter der Anzeige offen ist - bleibt nach dem Speichern derselbe.
    let boardTab: "where" | "messages" | "list" = "where";
    // Welche Ebene der Teams-Liste offen ist - bleibt beim Wechsel der Reiter dieselbe.
    let listLevel: ListLevel = "team";

    const reload = async (): Promise<void> => {
        const answer = await call<IPayload>("");

        if (!answer) return;

        data = answer;
        paint();
    };

    /**
     * Die Vorschau zeigt Beispielwerte - echte Kader kommen erst in Discord
     * dazu. Ein eigener Zusammenhang je Nachricht: in der Uebersicht gibt es
     * kein {team.roster}, in der Karte kein {teams}.
     */
    /**
     * Die Platzhalter je Spieler, nach Teams: im zweiten Menü erst das Team, dann
     * seine Spieler mit allem, was es je Spieler gibt. So bleibt das erste Menü
     * bei den festen Platzhaltern, auch wenn der Server vierzig Spieler hat.
     */
    const playerTree = (): IPlaceholderTree["branches"] => {
        const teams = new Map<string, IPlaceholder[]>();

        for (const player of data!.players) {
            const list = teams.get(player.team) ?? [];

            for (const [field, label] of TEAM_PLAYER_FIELDS) {
                const key = field ? `${player.key}.${field}` : player.key;

                list.push({ key, label, sample: player.values[key] ?? "", group: player.name });
            }

            teams.set(player.team, list);
        }

        return [...teams].map(([label, placeholders]) => ({ label, placeholders }));
    };

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

    /** Die Teams für {teams}, Ränge, Aufgaben und Reihenfolge so, wie die Einstellungen gerade stehen. */
    const shownTeams = (look: Pick<ISettings, "rankStyle" | "roleStyle" | "badges"> & { order?: ITeamOrder }): IListTeam[] => {
        const values = (record: Record<string, string>): Record<string, string> =>
            Object.fromEntries(Object.entries(record).map(([key, value]) => [key, styled(key, value, look)]));
        // data.teams[i] und data.listTeams[i] gehören zusammen: beide kommen in derselben Folge aus der Route.
        const lists = new Map(data!.teams.map((team, index) => [team.id, data!.listTeams[index]]));

        return orderedTeams(look.order).flatMap((entry) => (lists.get(entry.id) ? [lists.get(entry.id)!] : [])).map((team) => ({
            ...team,
            values: values(team.values),
            members: team.members.map((member) => ({ role: member.role, values: values(member.values) })),
        }));
    };

    /**
     * Was der Editor anbietet. Die Team-Karte ist eine Vorlage für jedes Team:
     * dort helfen die Aufgaben-Platzhalter. Die Übersicht kennt die Spieler mit
     * Namen - aber nur, wenn alles in einer Nachricht ohne Auswahlmenü steht
     * (players), sonst kommen dieselben Spieler gleich mehrfach vor.
     */
    const context = (scope: "board" | "team", players: () => boolean = () => false, look: () => ISettings = () => data!.settings) => (): IEditorContext => {
        const fixed = scope === "board" ? TEAM_BOARD_PLACEHOLDERS : TEAM_CARD_PLACEHOLDERS;
        const tree: IPlaceholderTree | undefined =
            scope === "team"
                ? { label: "Aufgaben-Platzhalter …", back: "‹ Andere Aufgabe", branches: roles() }
                : players()
                  ? { label: "Spieler-Platzhalter …", back: "‹ Anderes Team", branches: playerTree() }
                  : undefined;

        const now = look();
        // Die Vorschau kennt die festen Beispiele und die echten Werte aus dem Menü daneben -
        // mit Rängen und Aufgaben so, wie die beiden Einstellungen gerade stehen.
        const values = Object.fromEntries(
            [...fixed, ...(tree?.branches.flatMap((branch) => branch.placeholders) ?? [])].map((entry) => [entry.key, styled(entry.key, entry.sample, now)])
        );

        // {teams} so, wie die Teams-Liste es gerade aufschreibt - aus den echten Teams, auch ungespeichert.
        if (scope === "board" && now.layout === "single" && data!.listTeams.length) values.teams = TeamListText(shownTeams(now), data!.groups, now.list);

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
       Gruppen
       ------------------------------------------------------------ */
    function groups(): HTMLElement {
        const name = el("input", "text snadd__input");
        const add = button("btn btn--primary snadd__go", icon("#i-plus"), "Gruppe anlegen");

        name.type = "text";
        name.maxLength = data!.limits.name;
        name.placeholder = "Etwa „Main“, „Academy“ oder „Div 2“";
        name.setAttribute("aria-label", "Name der neuen Gruppe");

        const create = async (): Promise<void> => {
            if (!name.value.trim()) {
                toast("info", "Ohne Namen geht nicht", "Die Gruppe steht so auch in der Übersicht.");

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
                field.setAttribute("aria-label", `Name der Gruppe ${group.name}`);
                field.addEventListener("change", () => void call("", { action: "group.save", id: group.id, group: { name: field.value } }).then(() => reload()));

                const remove = confirmButton("btn btn--quiet btn--icon is-danger", "#i-trash", "Gruppe löschen", "Wirklich löschen?", async () => {
                    if (!(await call("", { action: "group.delete", id: group.id }))) return;

                    toast("info", "Gelöscht", "Die Teams stehen jetzt ohne Gruppe da.");
                    void reload();
                });

                const count = data!.teams.filter((team) => team.groupId === group.id).length;

                return el("div", "tmgroup", field, el("span", "tmgroup__count", `${count} Team${count === 1 ? "" : "s"}`), remove);
            })
        );

        return card(
            "Gruppen",
            `Damit stehen die Teams in der Übersicht unter Überschriften. Bis zu ${data!.limits.groups} Stück – ohne Gruppe geht es auch.`,
            ...(data!.groups.length ? [list] : [el("div", "tkempty", icon("#i-folder"), el("span", "", "Noch keine Gruppe – alle Teams stehen untereinander."))]),
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

            const answer = await call("", { action: "team.save", id: team.id, team: draft });

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
                text("Beschreibung", "Ein Satz über das Team", draft.description, data!.limits.description, (value) => (draft.description = value), true),
                row(
                    "Gruppe",
                    "Unter welcher Überschrift das Team steht",
                    select(
                        [["", "— ohne Gruppe —"], ...data!.groups.map((entry): [string, string] => [String(entry.id), entry.name])],
                        draft.groupId ? String(draft.groupId) : "",
                        (value) => {
                            draft.groupId = value ? Number(value) : null;
                            touch();
                        },
                        "Gruppe des Teams"
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
                "Kategorie des Teams"
            );

            box.replaceChildren(
                draft.channels.kind === "category"
                    ? row("Kategorie", "Alles darin gehört dem Team", category)
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

        epic.type = "text";
        epic.value = player.epicName;
        epic.maxLength = 100;
        epic.placeholder = "Epic-Name für Prime";
        epic.setAttribute("aria-label", `Epic-Name von Spieler ${index + 1}`);
        epic.addEventListener("input", () => {
            player.epicName = epic.value;
            touch();
        });

        /** Holt den Epic-Namen aus der Verknüpfung - von Hand geht es weiter. */
        const adopt = async (userId: string): Promise<void> => {
            hint.textContent = "Epic-Konto wird gesucht …";

            const answer = await call<{ epicName: string | null }>("", { action: "epic", userId });

            if (!answer) return;

            if (answer.epicName) {
                player.epicName = answer.epicName;
                epic.value = answer.epicName;
                hint.textContent = `Epic-Konto übernommen: ${answer.epicName}`;
                touch();

                return;
            }

            // Der Epic-Name gehoert zum Mitglied: bleibt der alte stehen, holt
            // der Bot gleich die Raenge von jemand anderem.
            player.epicName = "";
            epic.value = "";
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
            el("div", "tmplayer__main", who, el("div", "tmplayer__line", roleSelect, name, epic), peaks, hint),
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
        // Ein Entwurf für alle drei Reiter: jeder hat seinen Speichern-Knopf, alle
        // speichern denselben Stand - wer im Reiter „Nachrichten“ schreibt, muss
        // nicht erst zurück nach vorn.
        const saves: HTMLButtonElement[] = [];
        let dirty = false;
        const touch = (): void => {
            dirty = true;

            for (const knob of saves) knob.disabled = false;
        };
        const saveAll = async (): Promise<void> => {
            for (const knob of saves) knob.disabled = true;

            if (!(await call("", { action: "settings", settings: draft }))) {
                for (const knob of saves) knob.disabled = false;

                return;
            }

            dirty = false;
            toast("info", "Gespeichert", "Mit „Übersicht senden“ geht sie raus.");
            void reload();
        };
        const saveButton = (): HTMLButtonElement => {
            const knob = button("btn btn--primary", icon("#i-check"), "Speichern");

            knob.disabled = !dirty;
            knob.addEventListener("click", () => void saveAll());
            saves.push(knob);

            return knob;
        };

        // Was gezeigt wird, haengt an der Darstellung: bei "je Team eine
        // Nachricht" gibt es keinen Kopf, bei "alles in einer" keine
        // Team-Karte. Beides immer zu zeigen waere ein Feld, das nichts tut.
        let menuOn = draft.layout === "menu";
        // Die Karte „Reihenfolge“ zeigt die Vorschau je nach Darstellung - sie zeichnet mit, wenn die wechselt.
        let orderView: { node: HTMLElement; draw: () => void } | null = null;
        const needsBoard = (): boolean => draft.layout !== "cards";
        const needsTeam = (): boolean => draft.layout !== "single";

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

        // Das Spieler-Menü gibt es nur ohne Auswahlmenü - wechselt das, baut sich der Editor neu, der Entwurf bleibt.
        const single = (): boolean => draft.layout === "single";
        const makeBoardEditor = (): ReturnType<typeof bodyEditor> =>
            bodyEditor(draft.board, {
                kinds: data!.bodyKinds,
                context: context("board", single, () => draft),
                defaultEmbed: () => structuredClone({ ...EMPTY_EMBED, title: "Unsere Teams", description: "{teams}" }),
                touch,
                title: "Die Übersicht",
                hint: single()
                    ? "{teams} setzt alle Teams ein, {teams.short} nur die Namen. Je Spieler gibt es {epicname.rank} und mehr – im Menü „Spieler-Platzhalter“."
                    : "{teams} setzt alle Teams ein, {teams.short} nur die Namen.",
                templates: "teamBoard",
            });
        let boardEditor = makeBoardEditor();
        let boardSingle = single();

        const teamEditor = bodyEditor(draft.team, {
            kinds: data!.bodyKinds,
            context: context("team", undefined, () => draft),
            defaultEmbed: () => structuredClone(EMPTY_EMBED),
            touch,
            title: "Eine Team-Karte",
            hint: "{team.roster} ist der Kader, {team.mmr} die Team-MMR. Je Aufgabe gibt es {team.captain.rank} und mehr – im Menü „Aufgaben-Platzhalter“.",
            templates: "teamCard",
        });

        const publish = button("btn btn--primary", icon("#i-message"), data!.settings.messageId || data!.teams.some((team) => team.messageId) ? "Übersicht aktualisieren" : "Übersicht senden");

        publish.addEventListener("click", async () => {
            publish.disabled = true;

            const answer = await call<{ sent: number }>("", { action: "publish" });

            publish.disabled = false;

            if (!answer) return;

            toast("info", "Steht im Kanal", `${answer.sent} Nachricht${answer.sent === 1 ? "" : "en"} geschrieben.`);
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
            cards: "Jedes Team bekommt eine eigene Nachricht. Gut zum Verlinken – einen Kopf gibt es dabei nicht.",
            menu: "Eine Nachricht mit Auswahlmenü darunter. Der Kader kommt als Antwort, die nur sieht, wer klickt.",
            single: "Eine Nachricht, in der {teams} alle Teams samt Kadern einsetzt. Bei vielen Teams wird sie lang.",
        };

        const hint = el("p", "hintline", layoutHint[draft.layout]);
        const menuRow = el("div", "tmmenu");
        const messages = el("div", "tmmsgs");

        // Das Auswahlmenue haengt der Bot an die fertige Nachricht - deshalb
        // geht es mit Karte, Embed und normalem Text gleichermassen. Ohne
        // diesen Satz sucht man die Einstellung in der Art der Nachricht.
        const messageHint: Record<string, string> = {
            cards: "Die Team-Karte geht so oft raus, wie es Teams gibt – je Team eine eigene Nachricht.",
            menu: "Der Bot hängt das Auswahlmenü unten an die Übersicht – egal ob Karte, Embed oder normale Nachricht. Die Team-Karte ist die Antwort darauf und sieht nur, wer klickt.",
            single: "Alles steht in der Übersicht: {teams} setzt die Teams samt Kadern ein.",
        };

        const note = el("p", "hintline", messageHint[draft.layout]);
        const drawMessages = (): void => {
            note.textContent = messageHint[draft.layout];
            boardEditor.node.hidden = !needsBoard();
            teamEditor.node.hidden = !needsTeam();
            messages.replaceChildren(
                note,
                ...(needsBoard() ? [boardEditor.node] : []),
                ...(needsTeam() ? [teamEditor.node] : [])
            );
        };

        /**
         * Das Auswahlmenue ist eine eigene Frage: es haengt unter der fertigen
         * Nachricht und geht deshalb mit Karte, Embed und normalem Text
         * gleichermassen. Bei "je Team eine Nachricht" faellt es weg.
         */
        const drawLayout = (): void => {
            orderView?.draw();
            const cards = draft.layout === "cards";

            if (single() !== boardSingle) {
                boardSingle = single();
                boardEditor = makeBoardEditor();
            }

            menuRow.replaceChildren(
                ...(cards
                    ? []
                    : [
                          row(
                              "Mit Auswahlmenü",
                              "Unter der Nachricht steht ein Menü mit allen Teams – wer eins wählt, bekommt dessen Karte",
                              el("label", "snitem__switch", toggle(menuOn, "Auswahlmenü anhängen", (on) => {
                                  menuOn = on;
                                  draft.layout = on ? "menu" : "single";
                                  drawLayout();
                                  touch();
                              }), el("span", "", menuOn ? "an" : "aus")),
                          ),
                      ]),
                ...(draft.layout === "menu" && data!.teams.length > data!.limits.menu
                    ? [el("div", "notice", icon("#i-warn"), el("span", "", `Ein Auswahlmenü fasst ${data!.limits.menu} Teams – die übrigen fallen weg.`))]
                    : [])
            );

            hint.textContent = layoutHint[draft.layout];
            drawMessages();
        };

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
                "Darstellung",
                "Wie die Teams im Kanal stehen",
                select(
                    [
                        ["single", "Eine Nachricht für alle Teams"],
                        ["cards", "Je Team eine eigene Nachricht"],
                    ],
                    draft.layout === "cards" ? "cards" : "single",
                    (value) => {
                        // Das Menue haengt an der einen Nachricht - bei einer
                        // Nachricht je Team gibt es nichts zum Auswaehlen.
                        draft.layout = value === "cards" ? "cards" : menuOn ? "menu" : "single";
                        drawLayout();
                        touch();
                    },
                    "Darstellung der Übersicht"
                )
            ),
            menuRow,
            hint,
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
        const BOARD_TABS: ["where" | "messages" | "list", string, string][] = [
            ["where", "#i-layout", "Kanal & Darstellung"],
            ["messages", "#i-message", "Nachrichten"],
            ["list", "#i-list-checks", "Teams-Liste"],
        ];
        const tabs = el("div", "tktabs");
        const pane = el("div", "tkpane");
        // Das Menü mit den Ebenen der Teams-Liste. Ein Popover liegt in der obersten
        // Ebene - im Reiterstreifen schnitte dessen overflow es sonst ab.
        const levels = el("div", "menu tmlevels");
        let listView: ReturnType<typeof listPane> | null = null;
        let closedAt = 0;

        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", "Bereiche der Anzeige");
        pane.id = "tmBoardPane";
        pane.setAttribute("role", "tabpanel");
        levels.id = "tmLevels";
        levels.popover = "auto";
        levels.setAttribute("role", "menu");
        levels.setAttribute("aria-label", "Ebene der Teams-Liste");

        const listTab = (): HTMLElement | null => document.getElementById("tmtab-list");

        const showLevels = (): void => {
            const anchor = listTab();

            if (!anchor) return;

            levels.replaceChildren(
                ...LIST_LEVELS.map((entry) => {
                    const item = button(`menu__item tmlevels__item${entry.id === "team" ? "" : " is-sub"}`, icon(entry.icon), el("span", "tmlevels__text", el("b", "", entry.label), el("code", "", entry.key)));

                    item.title = entry.hint;
                    item.setAttribute("role", "menuitemradio");
                    item.setAttribute("aria-checked", String(entry.id === listLevel));
                    item.addEventListener("click", () => {
                        levels.hidePopover();
                        pickLevel(entry.id, "tab");
                    });

                    return item;
                })
            );
            levels.showPopover();

            // Unter dem Reiter, linksbündig - nie aus dem Fenster.
            const box = anchor.getBoundingClientRect();
            const width = Math.min(300, window.innerWidth - 16);

            levels.style.width = `${width}px`;
            levels.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`;
            levels.style.top = `${box.bottom + 6}px`;
            anchor.setAttribute("aria-expanded", "true");
            levels.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
        };

        // Der Klick auf den Reiter schließt das offene Menü schon beim Drücken (daneben
        // geklickt) - derselbe Klick darf es danach nicht gleich wieder öffnen.
        levels.addEventListener("beforetoggle", (event) => {
            if ((event as Event & { newState?: string }).newState === "closed") closedAt = performance.now();
        });
        levels.addEventListener("toggle", (event) => {
            if ((event as Event & { newState?: string }).newState !== "closed") return;

            listTab()?.setAttribute("aria-expanded", "false");

            // Escape oder Klick daneben: der Fokus gehört zurück an den Reiter.
            if (document.activeElement === document.body || levels.contains(document.activeElement)) listTab()?.focus();
        });
        levels.addEventListener("keydown", (event) => {
            const items = [...levels.querySelectorAll<HTMLElement>(".tmlevels__item")];
            const at = items.indexOf(document.activeElement as HTMLElement);
            const next = event.key === "ArrowDown" ? at + 1 : event.key === "ArrowUp" ? at - 1 : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;

            if (next === null) return;

            event.preventDefault();
            items[(next + items.length) % items.length]?.focus();
        });
        // Mit Tab aus dem Menü heraus: dann ist es zu.
        levels.addEventListener("focusout", (event) => {
            if (!levels.contains(event.relatedTarget as Node | null) && levels.matches(":popover-open")) levels.hidePopover();
        });

        const paintTabs = (focus: boolean): void => {
            tabs.replaceChildren(
                ...BOARD_TABS.map(([id, symbol, label]) => {
                    const sub = LIST_LEVELS.find((entry) => entry.id === listLevel);
                    // Steht man tiefer als die Team-Zeile, sagt es der Reiter: „Teams-Liste · Spieler“.
                    const text = id === "list" && sub && listLevel !== "team" ? `${label} · ${sub.label}` : label;
                    const knob = button("tktab", icon(symbol), el("span", "", text));

                    knob.id = `tmtab-${id}`;
                    knob.tabIndex = id === boardTab ? 0 : -1;
                    knob.setAttribute("role", "tab");
                    knob.setAttribute("aria-selected", String(id === boardTab));
                    knob.setAttribute("aria-controls", pane.id);

                    if (id !== "list") {
                        knob.addEventListener("click", () => open(id));

                        return knob;
                    }

                    // Die Teams-Liste ist ein Reiter mit Menü: ein Klick öffnet sie samt ihren Ebenen.
                    knob.classList.add("tktab--menu");
                    knob.append(icon("#i-chevron"));
                    knob.setAttribute("aria-haspopup", "menu");
                    knob.setAttribute("aria-expanded", "false");
                    knob.addEventListener("click", () => {
                        if (levels.matches(":popover-open")) {
                            levels.hidePopover();

                            return;
                        }

                        if (performance.now() - closedAt < 300) return;

                        if (boardTab !== "list") open("list");

                        showLevels();
                    });
                    knob.addEventListener("keydown", (event) => {
                        if (event.key !== "ArrowDown" || boardTab !== "list") return;

                        event.preventDefault();
                        showLevels();
                    });

                    return knob;
                })
            );

            if (focus) document.getElementById(`tmtab-${boardTab}`)?.focus();
        };

        const open = (next: typeof boardTab): void => {
            // paintTabs baut die Knöpfe neu - wer auf einem Reiter stand, steht danach auf dem neuen.
            const focused = tabs.contains(document.activeElement);

            if (next !== boardTab) clickSound("primary");

            // Was in der Teams-Liste geändert wurde, steht gleich in der Vorschau der Übersicht.
            if (next === "messages") boardEditor.refresh();

            boardTab = next;
            paintTabs(focused);
            pane.setAttribute("aria-labelledby", `tmtab-${boardTab}`);
            // Die Editoren bleiben dieselben Knoten - ein Wechsel des Reiters verliert nichts.
            // Die Teams-Liste baut sich neu: sie zeigt dann gleich, was in den anderen Reitern steht.
            listView = boardTab === "list" ? listPane(draft, touch, saveButton, (id) => pickLevel(id, "field")) : null;
            orderView = boardTab === "where" ? orderPane(draft, touch, saveButton) : null;
            pane.replaceChildren(...(boardTab === "where" ? [where, orderView!.node] : boardTab === "messages" ? [texts] : listView!.nodes));
        };

        /** Eine Ebene der Teams-Liste zeigen. focus: aus dem Menü zurück an den Reiter, aus der Seite ins Feld. */
        const pickLevel = (id: ListLevel, focus: "tab" | "field"): void => {
            if (id !== listLevel) clickSound("primary");

            listLevel = id;

            if (boardTab !== "list" || !listView) {
                open("list");
            } else {
                paintTabs(false);
            }

            listView!.level(id);

            if (focus === "tab") listTab()?.focus();
            else listView!.focus();
        };

        tabs.addEventListener("keydown", (event) => {
            const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;

            if (!step) return;

            event.preventDefault();

            const index = BOARD_TABS.findIndex(([id]) => id === boardTab);

            open(BOARD_TABS[(index + step + BOARD_TABS.length) % BOARD_TABS.length][0]);
        });

        open(boardTab);

        return [tabs, levels, pane];
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
        const groupName = (team: ITeam): string => data!.groups.find((group) => group.id === team.groupId)?.name ?? "Ohne Gruppe";
        const byId = (id: number): ITeam | undefined => data!.teams.find((team) => team.id === id);
        const context: IEditorContext = {
            guildId,
            values: {},
            roles: new Map(data!.guild.roles.map((role) => [role.id, role.name])),
            channels: new Map(data!.guild.channels.map((channel) => [channel.id, channel.name])),
            emojis: data!.guild.emojis,
            previewEmojis: [...data!.icons, ...badgePreviews(draft)],
            onChange: () => undefined,
        };

        /** Eine Zeile mit Pfeilen: move(-1) einen Platz höher, move(1) einen tiefer. */
        const arrows = (index: number, total: number, move: (step: -1 | 1) => void): HTMLButtonElement[] => {
            const up = button("mcdur__chip tmorder__arrow", "↑");
            const down = button("mcdur__chip tmorder__arrow", "↓");

            up.setAttribute("aria-label", "Einen Platz höher");
            down.setAttribute("aria-label", "Einen Platz tiefer");
            up.disabled = index === 0;
            down.disabled = index === total - 1;
            up.addEventListener("click", () => move(-1));
            down.addEventListener("click", () => move(1));

            return [up, down];
        };
        const swap = (list: number[], index: number, step: -1 | 1): void => {
            [list[index], list[index + step]] = [list[index + step], list[index]];
        };
        const change = (focus?: string): void => {
            touch();
            draw();

            if (focus) settingsBox.querySelector<HTMLElement>(focus)?.focus();
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
                    ...arrows(index, order.pinned.length, (step) => {
                        swap(order.pinned, index, step);
                        change();
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
                                ...arrows(index, shown.length, (step) => {
                                    const ids = shown.map((entry) => entry.id);

                                    swap(ids, index, step);
                                    order.custom = ids;
                                    change();
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

            // Rechts: so, wie die gewählte Darstellung es ordnet. Die Liste mit Gruppen wie {teams}, Karten und Menü flach.
            if (!data!.teams.length) preview.replaceChildren(el("p", "hintline", "Noch keine Teams."));
            else if (draft.layout === "single") preview.replaceChildren(markdown(TeamListText(shownTeams(draft), data!.groups, draft.list), context));
            else {
                preview.replaceChildren(
                    el(
                        "ol",
                        "tmorder__flat",
                        ...orderedTeams(order).map((team) =>
                            el("li", "", el("b", "", team.name), el("span", "tmorder__meta", [team.tag, team.mmr === null ? "" : `${team.mmr} MMR`].filter(Boolean).join(" · ")))
                        )
                    )
                );
            }
        };

        draw();

        const node = card(
            "Reihenfolge",
            "Gilt für die ganze Übersicht: für Karten, Menü und Liste. In der Liste mit Gruppen sortiert jede Gruppe für sich.",
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

    /**
     * Der Reiter „Teams-Liste“: wie {teams} jedes Team aufschreibt, in drei
     * Ebenen, die aufeinander aufbauen - die Zeile je Team setzt mit
     * {team.members} die Spieler ein und mit {team.members.staff} den Staff, und
     * wie jeder von ihnen aussieht, steht eine Ebene tiefer. Die Ebenen teilen
     * sich Vorlagen, Vorschau und Speichern; ein Wechsel tauscht nur den Editor,
     * Entwürfe und „Zurück“ bleiben. Die Vorschau baut die Liste mit derselben
     * Funktion wie der Bot (constants/TeamList.ts), aus den echten Teams und dem
     * ungespeicherten Entwurf.
     */
    function listPane(draft: ISettings, touch: () => void, saveButton: () => HTMLButtonElement, go: (id: ListLevel) => void): { nodes: HTMLElement[]; level: (id: ListLevel) => void; focus: () => void } {
        const list = draft.list;
        const preview = el("div", "tkprev");
        const shown: IEditorContext = {
            guildId,
            values: {},
            roles: new Map(data!.guild.roles.map((role) => [role.id, role.name])),
            channels: new Map(data!.guild.channels.map((channel) => [channel.id, channel.name])),
            emojis: data!.guild.emojis,
            previewEmojis: [...data!.icons, ...badgePreviews(draft)],
            onChange: () => undefined,
        };
        const paintPreview = (): void => {
            preview.replaceChildren(markdown(TeamListText(shownTeams(draft), data!.groups, list), shown));
        };
        const change = (): void => {
            touch();
            paintPreview();
        };

        /** Ein Vorlagen-Feld mit allem drum herum: Platzhalter-Menüs, Emojis, Formatieren, farbige Platzhalter. */
        const field = (label: string, value: string, max: number, onInput: (value: string) => void, menus: (insert: (value: string) => void) => HTMLElement[]): { box: HTMLElement; area: HTMLTextAreaElement } => {
            const area = el("textarea", "text tkarea tmlist__area");
            const insert = (text: string): void => {
                insertPlaceholder(text, box);
            };

            area.rows = 4;
            area.value = value;
            area.maxLength = max;
            area.setAttribute("aria-label", label);
            trackField(area);
            area.addEventListener("input", () => {
                onInput(area.value);
                change();
            });

            // Vorn die Icons des Bots (Rang-Icons, Abzeichen), dahinter die des Servers.
            const box: HTMLElement = el(
                "div",
                "tmlist__field",
                el(
                    "div",
                    "tktools",
                    ...menus(insert),
                    emojiPicker({
                        value: null,
                        emojis: [...data!.icons, ...data!.guild.emojis],
                        label: "Emoji einfügen",
                        insert: true,
                        onPick: (picked) => {
                            if (picked) insert(picked);
                        },
                    }),
                    formatTools(area)
                ),
                placeholderMarks(area)
            );

            return { box, area };
        };

        const block = (label: string, hint: string, ...controls: HTMLElement[]): HTMLElement =>
            el("div", "tmlist__block", el("b", "tmlist__label", label), el("p", "hintline", hint), ...controls);

        /* --- Ebene „Team“: die Zeile je Team --- */
        const team = field("Zeile je Team", list.team, data!.limits.listTeam, (value) => (list.team = value), (insert) => [
            placeholderPicker(TEAM_LIST_PLACEHOLDERS, insert),
            placeholderTree({ label: "Aufgaben-Platzhalter …", back: "‹ Andere Aufgabe", branches: roles() }, insert),
        ]);
        const down = (id: ListLevel, label: string): HTMLButtonElement => {
            const link = button("tmlist__down", el("span", "", label), icon("#i-chevron"));

            link.addEventListener("click", () => go(id));

            return link;
        };

        team.area.rows = 5;

        /* --- Ebene „Spieler“: jeder Spieler in {team.members} --- */
        const member = field("So steht ein Spieler in {team.members}", list.member, data!.limits.listMember, (value) => (list.member = value), (insert) => [
            placeholderPicker(TEAM_MEMBER_PLACEHOLDERS, insert),
        ]);
        const chipFor = new Map<string, HTMLButtonElement>();
        const chips = el(
            "div",
            "mcdur",
            ...Object.entries(data!.roles).map(([role, label]) => {
                // Das Abzeichen vor dem Namen - Schmuck, der Name sagt schon alles.
                const chip = button("mcdur__chip tmchip", badgeFace(role, draft), label);

                chipFor.set(role, chip);
                chip.setAttribute("aria-pressed", String(list.roles.includes(role)));
                chip.addEventListener("click", () => {
                    list.roles = list.roles.includes(role) ? list.roles.filter((entry) => entry !== role) : [...list.roles, role];
                    chip.setAttribute("aria-pressed", String(list.roles.includes(role)));
                    change();
                });

                return chip;
            })
        );

        /* --- Ebene „Staff“: Coach und Manager in {team.members.staff} --- */
        const staff = field("So steht jemand vom Staff in {team.members.staff}", list.staff, data!.limits.listMember, (value) => (list.staff = value), (insert) => [
            placeholderPicker(TEAM_MEMBER_PLACEHOLDERS, insert),
        ]);

        const mains: Record<ListLevel, HTMLElement> = {
            team: el(
                "div",
                "sneditor__main",
                block(
                    "Zeile je Team",
                    "Fett, Links und -# für kleine Schrift wie in Discord. {team.members} setzt die Spieler ein, {team.members.staff} Coach und Manager – jeden in eigener Zeile. Was in der Zeile davor steht, etwa -#, steht vor jeder ihrer Zeilen.",
                    team.box,
                    el("div", "tmlist__next", el("span", "", "Wie sie dastehen:"), down("members", "Spieler"), down("staff", "Staff"))
                )
            ),
            members: el(
                "div",
                "sneditor__main",
                block("Ein Spieler", "Jede Zeile gilt für jeden Spieler – etwa „{spieler.role.icon} {spieler}“ und darunter „-# {spieler.rank.icon} `{spieler.mmr}`“. Zeilen, deren Platzhalter alle leer sind, fallen weg.", member.box),
                block("Wer in {team.members} steht", "Die Aufgaben, die mitkommen. Coach und Manager stehen in {team.members.staff}.", chips)
            ),
            staff: el(
                "div",
                "sneditor__main",
                block("Coach und Manager", "Etwa „{spieler.role.icon} {spieler}“ – Rang und Tracker haben sie meist nicht, darum eine eigene Vorlage.", staff.box)
            ),
        };
        const areas: Record<ListLevel, HTMLTextAreaElement> = { team: team.area, members: member.area, staff: staff.area };

        // Eine Vorlage setzt alle Ebenen auf einmal; „Zurück“ holt den Stand davor. Gespeichert wird mit Speichern.
        const show = (): void => {
            for (const [role, chip] of chipFor) chip.setAttribute("aria-pressed", String(list.roles.includes(role)));

            // Über input: jedes Feld meldet sich selbst, die Marker und die Vorschau gehen mit.
            for (const [area, value] of [
                [team.area, list.team],
                [member.area, list.member],
                [staff.area, list.staff],
            ] as const) {
                area.value = value;
                area.dispatchEvent(new Event("input"));
            }
        };
        const presets = presetBar<ITeamListSettings, ITeamListPreset>(TEAM_LIST_PRESETS, {
            take: () => structuredClone(list),
            put: (state) => {
                Object.assign(list, state);
                show();
            },
            apply: (preset) => {
                Object.assign(list, structuredClone(preset.list));
                show();
            },
        });

        // Wo {teams} gerade gar nicht in voller Länge steht, sagt es die Seite gleich oben.
        const scope =
            draft.layout === "menu"
                ? "Mit Auswahlmenü setzt {teams} nur die Kopfzeile je Team ein. Diese Liste gilt bei „Eine Nachricht für alle Teams“ ohne Auswahlmenü."
                : draft.layout === "cards"
                  ? "Bei „Je Team eine eigene Nachricht“ gibt es keine Übersicht und damit kein {teams}. Die Liste gilt, sobald du auf eine Nachricht für alle Teams stellst."
                  : null;

        const path = el("nav", "tmpath");
        const title = el("h3", "tkcard__title");
        const lead = el("p", "tkcard__lead");
        const editor = el("div", "sneditor");
        const side = el("aside", "sneditor__side", el("div", "tkside__head", el("span", "tkside__live", "Live-Vorschau")), preview);

        path.setAttribute("aria-label", "Ebene");

        const level = (id: ListLevel): void => {
            const { label, key, title: heading, lead: intro } = LIST_LEVELS.find((entry) => entry.id === id)!;

            title.textContent = heading;
            lead.textContent = intro;
            editor.replaceChildren(mains[id], side);

            // Der Pfad zurück: {teams} › {team.members} - auf der obersten Ebene gibt es keinen.
            const up = button("tmpath__up", "{teams}");

            up.addEventListener("click", () => go("team"));
            path.hidden = id === "team";
            path.replaceChildren(up, el("span", "tmpath__sep", "›"), el("span", "tmpath__here", key));
            path.querySelector(".tmpath__here")?.setAttribute("aria-current", "page");
            path.title = `Teams-Liste › ${label}`;
        };

        paintPreview();
        level(listLevel);

        return {
            nodes: [
                el(
                    "section",
                    "tkcard",
                    path,
                    title,
                    lead,
                    ...(scope ? [el("div", "notice", icon("#i-info"), el("span", "", scope))] : []),
                    presets,
                    editor,
                    el("div", "mcsave lvsave", saveButton())
                ),
            ],
            level,
            focus: () => areas[listLevel].focus(),
        };
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
