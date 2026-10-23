/**
 * Prüft das Sicherheitsrelevante am Admin-Server, ohne Discord, ohne Bot und
 * ohne Datenbank. Discord und Bot werden nachgestellt.
 *
 *   npm run check
 *
 * Absichtlich ohne Test-Framework, wie die Checks im Bot. Endet mit Exit-Code
 * 1, sobald etwas nicht stimmt.
 */
import { checkAccess } from "./checks/access.check.ts";
import { checkAuth } from "./checks/auth.check.ts";
import { checkBackups } from "./checks/backups.check.ts";
import { checkBeta } from "./checks/beta.check.ts";
import { checkBot } from "./checks/bot.check.ts";
import { checkConfig } from "./checks/config.check.ts";
import { checkContact } from "./checks/contact.check.ts";
import { checkCommands } from "./checks/commands.check.ts";
import { checkContent } from "./checks/content.check.ts";
import { checkDev } from "./checks/dev.check.ts";
import { checkFormat } from "./checks/format.check.ts";
import { finish } from "./checks/harness.ts";
import { checkInput } from "./checks/input.check.ts";
import { checkLogParse } from "./checks/logparse.check.ts";
import { checkMail } from "./checks/mail.check.ts";
import { checkRoutes } from "./checks/routes.check.ts";
import { checkSession } from "./checks/session.check.ts";
import { checkShop } from "./checks/shop.check.ts";
import { checkStatus, checkStatusHistoryKept, checkStatusRoutes } from "./checks/status.check.ts";

await checkConfig();
await checkSession();
await checkAccess();
await checkAuth();
await checkBot();
await checkFormat();
await checkInput();
await checkContact();
await checkRoutes();
await checkContent();
await checkCommands();
await checkLogParse();
await checkStatus();
await checkStatusRoutes();
await checkStatusHistoryKept();
await checkDev();
await checkMail();
await checkShop();
await checkBackups();
await checkBeta();

finish();
