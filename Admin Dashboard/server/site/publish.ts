import type { IConfig } from "../config.ts";

/** Was publishSite neu schreibt (W-0062). */
export type SitePart = "partners" | "news" | "changelog" | "live";

/** Baut die Inhalte der Webseite neu. Wird in Task 7 des Plans gefüllt. */
export async function publishSite(_config: IConfig, _parts: readonly SitePart[]): Promise<void> {}
