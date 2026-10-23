/**
 * Malt die Abzeichen der Aufgaben neu: aus den Lucide-SVGs in teamicons/ je ein
 * PNG in der Farbe der Aufgabe (RoleBadge). Die PNGs zeigt die Galerie, und
 * daraus macht der Bot seine Emojis.
 *
 * Aufruf: npm run icons:teams
 * Danach die alten App-Emojis (rl_role_*) im Discord Developer Portal löschen -
 * der Bot legt sie beim nächsten Start aus den neuen PNGs an.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ROLE_ORDER } from "../constants/Teams";
import { ROLE_ICON_FILES, ROLE_ICON_ROOT, RoleBadge } from "../services/RankIconService";

async function main(): Promise<void> {
    for (const role of ROLE_ORDER) {
        const file = path.join(ROLE_ICON_ROOT, `${ROLE_ICON_FILES[role]}.png`);

        await writeFile(file, await RoleBadge(role));
        console.log(`  ${path.basename(file)}`);
    }

    process.exit(0);
}

void main();
