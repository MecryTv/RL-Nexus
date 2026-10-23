import { categoryOf } from "../../services/categories";
import type { ICategoryMeta, IModule, IModuleDefinition } from "../interfaces/IModule";
import { ModuleStatus } from "../enums/ModuleCategory";

/** Exportiert für das Exportskript: das Admin Dashboard zeigt dieselben Labels. */
export const STATUS_LABEL: Readonly<Record<ModuleStatus, string>> = {
    [ModuleStatus.Live]: "Verfügbar",
    [ModuleStatus.Beta]: "Beta",
    [ModuleStatus.Planned]: "Geplant",
};

/**
 * Ein Modul des Bots.
 *
 * Die Klasse hält die Definition und leitet daraus alles ab, was die Oberfläche
 * sonst an jeder Stelle neu ausrechnen müsste. Die Felder der Definition werden
 * durchgereicht statt kopiert - so gibt es keine zweite Wahrheit, die
 * auseinanderlaufen könnte.
 */
export class BotModule implements IModule {
    /** Vorberechnet, weil `matches()` bei jedem Tastendruck über alle Module läuft. */
    private readonly haystack: string;

    public constructor(private readonly definition: IModuleDefinition) {
        this.haystack = [
            definition.name,
            definition.tagline,
            definition.description,
            categoryOf(definition.category).label,
            ...definition.highlights,
            ...(definition.commands ?? []),
        ]
            .join(" ")
            .toLowerCase();
    }

    public get id(): string {
        return this.definition.id;
    }

    public get name(): string {
        return this.definition.name;
    }

    public get tagline(): string {
        return this.definition.tagline;
    }

    public get description(): string {
        return this.definition.description;
    }

    public get category(): string {
        return this.definition.category;
    }

    public get status(): ModuleStatus {
        return this.definition.status;
    }

    public get icon(): string {
        return this.definition.icon;
    }

    public get highlights(): readonly string[] {
        return this.definition.highlights;
    }

    public get commands(): readonly string[] {
        return this.definition.commands ?? [];
    }

    public get featured(): boolean {
        return this.definition.featured ?? false;
    }

    public get builtIn(): boolean {
        return this.definition.builtIn ?? false;
    }

    public get meta(): ICategoryMeta {
        return categoryOf(this.definition.category);
    }

    public get accent(): string {
        return this.meta.accent;
    }

    public get statusLabel(): string {
        return STATUS_LABEL[this.definition.status];
    }

    public get isAvailable(): boolean {
        return this.definition.status !== ModuleStatus.Planned;
    }

    public get href(): string {
        return `/module/${this.definition.id}`;
    }

    public matches(query: string): boolean {
        const needle = query.trim().toLowerCase();

        // Ein leerer Filter schließt nichts aus - sonst wäre die Liste beim
        // Öffnen des Suchfeldes plötzlich leer.
        if (needle.length === 0) return true;

        return needle.split(/\s+/).every((word) => this.haystack.includes(word));
    }
}
