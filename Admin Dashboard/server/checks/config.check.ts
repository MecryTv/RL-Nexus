import assert from "node:assert/strict";
import { loadConfig } from "../config.ts";
import { ENV, check, section } from "./harness.ts";

export async function checkConfig(): Promise<void> {
    section("Konfiguration");

    await check("Fehlende Pflichtvariable nennt ihren Namen", () => {
        const required = [
            "CLIENT_ID",
            "CLIENT_SECRET",
            "CLIENT_TOKEN",
            "SERVER_JWT_SECRET",
            "ADMIN_GUILD_ID",
            "ADMIN_ROLE_ID",
            "DEVELOPER_ROLE_ID",
            "ADMIN_PUBLIC_URL",
        ];

        for (const name of required) {
            const env: Record<string, string> = { ...ENV };
            delete env[name];
            assert.throws(() => loadConfig(env, []), new RegExp(name));
        }
    });

    await check("Zu kurzes Secret wird abgelehnt", () => {
        assert.throws(() => loadConfig({ ...ENV, SERVER_JWT_SECRET: "zu-kurz" }, []), /SERVER_JWT_SECRET/);
    });

    await check("Rollen-IDs müssen Discord-IDs sein", () => {
        assert.throws(() => loadConfig({ ...ENV, ADMIN_ROLE_ID: "admin" }, []), /ADMIN_ROLE_ID/);
    });

    await check("Ohne Datenbank-Angaben läuft der Server ohne Datenbank", () => {
        assert.equal(loadConfig(ENV, []).database, null);

        const database = loadConfig({ ...ENV, DATABASE_HOST: "localhost", DATABASE_NAME: "rlnexus", DATABASE_USER: "rlnexus" }, []).database;
        assert.equal(database?.port, 3306);
    });

    await check("Secure-Cookies nur bei https, Adressen ohne Schrägstrich am Ende", () => {
        assert.equal(loadConfig(ENV, []).secureCookies, true);

        const local = loadConfig({ ...ENV, ADMIN_PUBLIC_URL: "http://localhost:5174/" }, []);
        assert.equal(local.secureCookies, false);
        assert.equal(local.publicUrl, "http://localhost:5174");
    });

    await check("DEV_USER_IDs nimmt nur echte IDs", () => {
        const ids = loadConfig({ ...ENV, DEV_USER_IDs: "123456789012345678, kaputt ,234567890123456789" }, []).devUserIds;
        assert.deepEqual(ids, ["123456789012345678", "234567890123456789"]);
    });

    await check("Mit --dev zählt die Dev-Application, sonst die produktive", () => {
        const both = {
            ...ENV,
            DEV_CLIENT_ID: "222222222222222222",
            DEV_CLIENT_SECRET: "dev-client-secret",
            DEV_CLIENT_TOKEN: "dev-bot-token",
        };

        const live = loadConfig(both, []);
        assert.deepEqual([live.developerMode, live.clientId, live.clientSecret, live.botToken], [false, ENV.CLIENT_ID, ENV.CLIENT_SECRET, ENV.CLIENT_TOKEN]);

        const dev = loadConfig(both, ["--dev"]);
        assert.deepEqual([dev.developerMode, dev.clientId, dev.clientSecret, dev.botToken], [true, "222222222222222222", "dev-client-secret", "dev-bot-token"]);

        // Mit --dev zählen Server und Rollen des Dev Servers, ohne Eintrag die bekannten IDs.
        assert.deepEqual([dev.guildId, dev.adminRoleId, dev.developerRoleId], ["1162553851187040326", "1162556186462261248", "1286386691925344390"]);
        assert.deepEqual([live.guildId, live.adminRoleId, live.developerRoleId], [ENV.ADMIN_GUILD_ID, ENV.ADMIN_ROLE_ID, ENV.DEVELOPER_ROLE_ID]);

        const own = loadConfig({ ...both, DEV_ADMIN_GUILD_ID: "777777777777777777", DEV_ADMIN_ROLE_ID: "777777777777777778", DEV_DEVELOPER_ROLE_ID: "777777777777777779" }, ["--dev"]);
        assert.deepEqual([own.guildId, own.adminRoleId, own.developerRoleId], ["777777777777777777", "777777777777777778", "777777777777777779"]);
        assert.throws(() => loadConfig({ ...both, DEV_ADMIN_ROLE_ID: "kaputt" }, ["--dev"]), /DEV_ADMIN_ROLE_ID ist keine Discord-ID/);
    });

    await check("Statuskanäle: im Dev-Modus #moderator-only auf dem Dev Server, sonst STATUS_CHANNEL_ID", () => {
        const both = {
            ...ENV,
            DEV_CLIENT_ID: "222222222222222222",
            DEV_CLIENT_SECRET: "dev-client-secret",
            DEV_CLIENT_TOKEN: "dev-bot-token",
            STATUS_CHANNEL_ID: "333333333333333333",
        };

        assert.deepEqual(loadConfig(both, []).statusChannelIds, ["333333333333333333"]);
        assert.deepEqual(loadConfig(ENV, []).statusChannelIds, []);
        assert.deepEqual(loadConfig(both, ["--dev"]).statusChannelIds, ["1211378072549326860"]);
        assert.deepEqual(loadConfig({ ...both, DEV_STATUS_CHANNEL_IDS: "444444444444444444, kaputt ,555555555555555555" }, ["--dev"]).statusChannelIds, ["444444444444444444", "555555555555555555"]);
    });

    await check("Vorschau der Webseite: sonst WEBSITE_PUBLIC_URL, im Dev-Modus die lokale Webseite", () => {
        const dev = { ...ENV, DEV_CLIENT_ID: "222222222222222222", DEV_CLIENT_SECRET: "dev", DEV_CLIENT_TOKEN: "dev", WEBSITE_PUBLIC_URL: "https://nexus.example.test" };

        assert.equal(loadConfig(dev, []).previewUrl, "https://nexus.example.test/vorschau");
        assert.equal(loadConfig(dev, ["--dev"]).previewUrl, "http://localhost:5173/vorschau");
        assert.equal(loadConfig({ ...dev, DEV_WEBSITE_PUBLIC_URL: "http://127.0.0.1:4173" }, ["--dev"]).previewUrl, "http://127.0.0.1:4173/vorschau");
    });

    await check("Kontakt-Webhook: im Dev-Modus nur DEV_CONTACT_WEBHOOK_URL, nie der echte Kanal", () => {
        const dev = { ...ENV, DEV_CLIENT_ID: "222222222222222222", DEV_CLIENT_SECRET: "dev", DEV_CLIENT_TOKEN: "dev", CONTACT_WEBHOOK_URL: "https://discord.test/api/webhooks/1/live" };

        assert.equal(loadConfig(dev, []).contactWebhook, "https://discord.test/api/webhooks/1/live");
        assert.equal(loadConfig(dev, ["--dev"]).contactWebhook, null);
        assert.equal(loadConfig({ ...dev, DEV_CONTACT_WEBHOOK_URL: "https://discord.test/api/webhooks/2/dev" }, ["--dev"]).contactWebhook, "https://discord.test/api/webhooks/2/dev");
        assert.equal(loadConfig({ ...dev, CONTACT_WEBHOOK_URL: "http://discord.test/hook" }, []).contactWebhook, null);
    });

    await check("Ohne Dev-Werte nennt --dev genau die fehlende Variable", () => {
        for (const name of ["DEV_CLIENT_ID", "DEV_CLIENT_SECRET", "DEV_CLIENT_TOKEN"]) {
            const env: Record<string, string> = {
                ...ENV,
                DEV_CLIENT_ID: "222222222222222222",
                DEV_CLIENT_SECRET: "dev-client-secret",
                DEV_CLIENT_TOKEN: "dev-bot-token",
            };

            delete env[name];
            assert.throws(() => loadConfig(env, ["--dev"]), new RegExp(name), name);
        }
    });
}
