import { BotModule } from "../domain/models/BotModule";
import { ModuleStatus, STATUS_RANK } from "../domain/enums/ModuleCategory";
import { allCategories, categoryOf } from "./categories";
import type { ICategoryMeta, IModuleDefinition } from "../domain/interfaces/IModule";

/** Ein Filter, wie ihn die Modul-Seite stellt. Alle Felder optional. */
export interface IModuleQuery {
    readonly search?: string;
    /** `null` heißt "alle Kategorien". */
    readonly category?: string | null;
    readonly onlyAvailable?: boolean;
}

/** Eine Kategorie samt ihrer Module - für die gruppierte Ansicht. */
export interface IModuleGroup {
    readonly meta: ICategoryMeta;
    readonly modules: readonly BotModule[];
}

/**
 * Alle Module an einer Stelle.
 *
 * Die Registry baut die Modelle einmal und beantwortet danach jede Frage der
 * Oberfläche: filtern, gruppieren, zählen, einzeln nachschlagen. Die Seiten
 * bekommen dadurch nie ein rohes Array zu sehen und müssen nirgends selbst
 * sortieren - sonst stünde dieselbe Sortierlogik in vier Komponenten.
 */
export class ModuleRegistry {
    private readonly modules: readonly BotModule[];
    private readonly byId: ReadonlyMap<string, BotModule>;

    public constructor(definitions: readonly IModuleDefinition[]) {
        this.modules = definitions.map((definition) => new BotModule(definition)).sort(ModuleRegistry.compare);
        this.byId = new Map(this.modules.map((module) => [module.id, module]));
    }

    /** Fertiges vor Beta vor Geplantem, innerhalb dessen alphabetisch. */
    private static compare(a: BotModule, b: BotModule): number {
        const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];

        return rank !== 0 ? rank : a.name.localeCompare(b.name, "de");
    }

    public get all(): readonly BotModule[] {
        return this.modules;
    }

    public get total(): number {
        return this.modules.length;
    }

    /** Wie viele Module heute schon benutzbar sind. */
    public get availableCount(): number {
        return this.modules.filter((module) => module.isAvailable).length;
    }

    /** Wie viele Slash-Commands insgesamt dazugehören. */
    public get commandCount(): number {
        return this.modules.reduce((sum, module) => sum + module.commands.length, 0);
    }

    /** Die Module der Startseite. */
    public get featured(): readonly BotModule[] {
        return this.modules.filter((module) => module.featured);
    }

    public find(id: string | undefined): BotModule | null {
        return (id !== undefined && this.byId.get(id)) || null;
    }

    public filter(query: IModuleQuery): readonly BotModule[] {
        const { search = "", category = null, onlyAvailable = false } = query;

        return this.modules.filter(
            (module) =>
                (category === null || module.category === category) &&
                (!onlyAvailable || module.isAvailable) &&
                module.matches(search)
        );
    }

    /** Dieselben Module, nach Kategorie gebündelt. Leere Kategorien fallen raus. */
    public group(modules: readonly BotModule[] = this.modules): readonly IModuleGroup[] {
        // Unbekannte Kategorien (alte modules.json) hinten dran, damit kein Modul verschwindet.
        const known = allCategories().map((meta) => meta.id);
        const ids = [...known, ...new Set(modules.map((module) => module.category).filter((id) => !known.includes(id)))];

        return ids
            .map((id) => ({
                meta: categoryOf(id),
                modules: modules.filter((module) => module.category === id),
            }))
            .filter((group) => group.modules.length > 0);
    }

    /** Wie viele Module je Kategorie - für die Zahlen an den Filterknöpfen. */
    public countByCategory(): ReadonlyMap<string, number> {
        const counts = new Map<string, number>();

        for (const module of this.modules) counts.set(module.category, (counts.get(module.category) ?? 0) + 1);

        return counts;
    }

    /** Verwandte Module - dieselbe Kategorie, ohne das Modul selbst. */
    public related(module: BotModule, limit = 3): readonly BotModule[] {
        return this.modules.filter((other) => other.category === module.category && other.id !== module.id).slice(0, limit);
    }

    /** Ob überhaupt etwas Geplantes dabei ist - sonst braucht die Legende keinen Eintrag. */
    public get hasPlanned(): boolean {
        return this.modules.some((module) => module.status === ModuleStatus.Planned);
    }
}
