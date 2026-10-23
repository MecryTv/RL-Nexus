import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { Options } from "nodemailer/lib/mailer/index.js";
import type { IMailConfig } from "../config.ts";
import { loginOf, type IMailAccountRow } from "./accounts.ts";
import { smtpTransport } from "./connect.ts";
import { appendSent } from "./mailbox.ts";

/**
 * Eine Mail aus einem Postfach verschicken.
 *
 * Erst wird sie einmal fertig zusammengesetzt, dann gehen genau diese Bytes
 * per SMTP hinaus und per IMAP in „Gesendet“. So steht im Ordner, was
 * wirklich ankam. Bcc steht nur im Umschlag, nicht in der Mail selbst.
 */
export async function sendFrom(mail: IMailConfig, row: IMailAccountRow, options: Options, recipients: readonly string[]): Promise<void> {
    const login = loginOf(mail, row);
    const raw = await new MailComposer(options).compile().build();

    const transport = smtpTransport(login);

    try {
        await transport.sendMail({ envelope: { from: row.address, to: [...recipients] }, raw });
    } finally {
        transport.close();
    }

    // Die Mail ist raus. Klappt das Ablegen nicht, soll das Senden trotzdem als
    // gelungen gelten, sonst schickt jemand sie ein zweites Mal.
    try {
        await appendSent(mail, row, raw);
    } catch (error) {
        console.error(`📬 Verschickt, aber nicht in „Gesendet“ abgelegt (${row.address}): ${error instanceof Error ? error.message : String(error)}`);
    }
}
