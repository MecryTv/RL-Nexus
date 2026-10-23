/**
 * Der rechnende Teil von core/Resources.ts: ohne DOM und ohne Netz, damit ihn
 * check:dashboard prüfen kann. Was das Ganze soll, steht dort.
 */

export type Kind = "channels" | "voice" | "categories" | "roles" | "forums" | "emojis";

export const KINDS: Kind[] = ["channels", "voice", "categories", "roles", "forums", "emojis"];

/** Emojis stehen in keinem Auswahlfeld - sie haben ihren eigenen Picker, der die Liste beim Öffnen liest. */
const PICKED: Kind[] = ["channels", "voice", "categories", "roles", "forums"];

/** Steht hinter einem Eintrag, der gewählt ist, den es in Discord aber nicht mehr gibt. */
export const GONE = " (gelöscht)";

export interface IItem {
    id: string;
    name: string;
    [key: string]: unknown;
}

/** Die Listen, wie sie eine Modul-Route mitschickt: data.guild, data.resources, data.targets. */
export type Bag = Partial<Record<Kind, IItem[]>>;

/** Was die Seite schon kennt: je ID die Art und der Name, unter dem sie es zuletzt sah. */
export type Known = Map<string, { kind: Kind; name: string }>;

export interface IOptionLike {
    value: string;
    text: string;
    selected: boolean;
}

export type Step =
    | { op: "drop"; value: string }
    | { op: "text"; value: string; text: string }
    | { op: "add"; value: string; text: string; before: string | null; after: string | null };

export function isBag(value: unknown): value is Bag {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

    return KINDS.some((kind) => Array.isArray((value as Record<string, unknown>)[kind]));
}

export function learn(known: Known, bag: Bag): void {
    for (const kind of KINDS) for (const item of bag[kind] ?? []) known.set(item.id, { kind, name: item.name });
}

/** Der neue Stand ist der bekannte: Gelöschtes vergessen, alles andere merken. */
export function settle(known: Known, fresh: Bag): void {
    for (const kind of KINDS) {
        const list = fresh[kind];

        if (!list) continue;

        const ids = new Set(list.map((item) => item.id));

        for (const [id, entry] of known) if (entry.kind === kind && !ids.has(id)) known.delete(id);
    }

    learn(known, fresh);
}

/**
 * Gleicht eine Liste an Ort und Stelle ab: Gelöschtes raus, Umbenanntes mit
 * neuem Namen, Neues an die Stelle, an der Discord es führt. Neu heißt: die
 * Seite kannte es noch gar nicht. Was eine Route absichtlich weggelassen hat -
 * die Temp-Voice-Hubs etwa nehmen keine Bühnen -, kommt so nicht nachträglich
 * hinein.
 */
export function mergeList(list: IItem[], fresh: IItem[], known: Known): void {
    const now = new Map(fresh.map((item) => [item.id, item]));

    for (let index = list.length - 1; index >= 0; index--) {
        const found = now.get(list[index].id);

        if (found) Object.assign(list[index], found);
        else list.splice(index, 1);
    }

    fresh.forEach((item, position) => {
        if (known.has(item.id) || list.some((entry) => entry.id === item.id)) return;

        const next = fresh.slice(position + 1).find((entry) => list.some((own) => own.id === entry.id));

        list.splice(next ? list.findIndex((own) => own.id === next.id) : list.length, 0, { ...item });
    });
}

/**
 * Wie die Einträge einer Art in einem Feld gebaut sind - "# name", "@name",
 * "name". null, wenn sie verschieden aussehen: dann ist unklar, wie ein neuer
 * Eintrag aussehen müsste, und er kommt lieber gar nicht dazu.
 */
export function shapeOf(options: IOptionLike[], known: Known): { prefix: string; suffix: string } | null {
    let shape: { prefix: string; suffix: string } | null = null;

    for (const option of options) {
        const name = known.get(option.value)?.name ?? "";
        const at = name ? option.text.indexOf(name) : -1;

        if (at < 0) return null;

        const next = { prefix: option.text.slice(0, at), suffix: option.text.slice(at + name.length) };

        if (shape && (shape.prefix !== next.prefix || shape.suffix !== next.suffix)) return null;

        shape = next;
    }

    return shape;
}

/**
 * Was in einem Auswahlfeld zu tun ist. Welche Art es zeigt, verraten die
 * Einträge, die schon darin stehen: ein Feld ohne Kanäle bekommt auch keinen.
 * Gelöschtes fällt heraus, außer es ist gerade gewählt - dann bleibt es mit
 * "(gelöscht)" stehen, statt die Wahl still zu ändern.
 */
export function planSelect(options: IOptionLike[], known: Known, fresh: Bag): Step[] {
    const steps: Step[] = [];

    for (const kind of PICKED) {
        const list = fresh[kind];
        const mine = options.filter((option) => known.get(option.value)?.kind === kind);

        if (!list || !mine.length) continue;

        const now = new Map(list.map((item) => [item.id, item]));
        const shape = shapeOf(
            mine.filter((option) => !option.text.endsWith(GONE)),
            known
        );
        const dropped = new Set<string>();

        for (const option of mine) {
            const was = known.get(option.value)!.name;
            const found = now.get(option.value);

            if (!found) {
                if (!option.selected) {
                    steps.push({ op: "drop", value: option.value });
                    dropped.add(option.value);
                } else if (!option.text.endsWith(GONE)) {
                    steps.push({ op: "text", value: option.value, text: `${option.text}${GONE}` });
                }

                continue;
            }

            if (found.name !== was && option.text.includes(was)) steps.push({ op: "text", value: option.value, text: option.text.replace(was, found.name) });
        }

        if (!shape) continue;

        // Von hinten nach vorn: so steht der Nachfolger eines neuen Eintrags
        // schon da, auch wenn er selbst gerade erst dazukam.
        const present = new Set(options.map((option) => option.value).filter((value) => !dropped.has(value)));
        const last = mine.filter((option) => !dropped.has(option.value)).at(-1)?.value ?? null;

        for (let position = list.length - 1; position >= 0; position--) {
            const item = list[position];

            if (known.has(item.id) || present.has(item.id)) continue;

            const before = list.slice(position + 1).find((entry) => present.has(entry.id))?.id ?? null;

            steps.push({ op: "add", value: item.id, text: `${shape.prefix}${item.name}${shape.suffix}`, before, after: before ? null : last });
            present.add(item.id);
        }
    }

    return steps;
}
