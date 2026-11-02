import type { IMe } from "../../shared/api.ts";
import type { IConfig } from "../config.ts";
import type { ISearchSource } from "./run.ts";

/** Die Quellen der Suche für diese Person. */
export function searchSources(config: IConfig, me: IMe): ISearchSource[] {
    void config;
    void me;

    return [];
}
