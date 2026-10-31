import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { LogError, SendError, WantsPage } from "./utils/errorpage";
import BotClient from "./client/BotClient";
import RouteManager from "./handler/RouteManager";
import IServer from "./interfaces/services/server/IServer";
import { AssertSecret } from "./utils/jwt";
import logger from "./utils/logger";
import { UPLOAD_TYPES } from "./constants/Gallery";
import { DASHBOARD_HOME, DASHBOARD_PATH, DEVELOPER_MODE } from "./constants/Dashboard";

import { EncodingOf, MIN_COMPRESS, Pack } from "./utils/compress";
const DEFAULT_HOST = "0.0.0.0";
const MAX_PORT = 65535;

const MAINTENANCE_JSON = '{"error":"Gerade ist Wartung. Versuch es in ein paar Minuten noch einmal."}';
// Nur Namen, wie es sie gibt: kein Weg aus public/wartung/ heraus.
const MAINTENANCE_ASSET = /^\/wartung\/([a-z0-9-]+)\.(js|webp)$/;

/**
 * Wartung lokal (Plan 23). Im Betrieb zeigt nginx auf dem Host die
 * Wartungsseite (nginx/dashboard.nexus-emb.de.conf), lokal steht keiner davor.
 * Mit --dev tut der Bot deshalb dasselbe fürs Bot-Dashboard: gleicher Schalter
 * im Ordner des lokalen Admin Dashboards, gleiche Ausnahmen, /wartung/* an der
 * Wurzel. Bei jeder Anfrage frisch geprüft, wie nginx mit -f.
 */
async function DevMaintenance(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    const flags = process.env.FLAGS_DIR ?? path.join(process.cwd(), "..", "Admin Dashboard", "data", "flags");
    const site = process.env.ADMIN_PUBLIC_DIR ?? path.join(process.cwd(), "..", "Admin Dashboard", "public");
    const url = request.url.split("?")[0];

    if (url === "/wartung/status.json") {
        const file = path.join(flags, "wartung.json");

        reply.header("Cache-Control", "no-store");

        return existsSync(file) ? reply.type("application/json; charset=utf-8").send(await readFile(file)) : reply.code(404).send({ error: "Not Found" });
    }

    const asset = MAINTENANCE_ASSET.exec(url);

    if (asset) {
        const file = path.join(site, "wartung", `${asset[1]}.${asset[2]}`);

        // Wie nginx (expires -1): nach einem Update kein altes wartung.js aus dem Cache (W-0022).
        reply.header("Cache-Control", "no-cache");

        return existsSync(file) ? reply.type(asset[2] === "js" ? "text/javascript; charset=utf-8" : "image/webp").send(await readFile(file)) : reply.code(404).send({ error: "Not Found" });
    }

    if (!existsSync(path.join(flags, "wartung-dashboard"))) return;

    // Wie nginx: Discord holt Bilder selbst, /dcapi braucht das Admin Dashboard. Dazu die eigenen Rechtstexte.
    if (/^\/(images|dcapi|wartung)\//.test(url) || url.startsWith(`${DASHBOARD_PATH}/assets/`) || url === `${DASHBOARD_PATH}/impressum` || url === `${DASHBOARD_PATH}/privacy`) return;

    reply.code(503).header("Retry-After", "300").header("Cache-Control", "no-store");

    return WantsPage(request) ? reply.type("text/html; charset=utf-8").send(await readFile(path.join(site, "wartung.html"))) : reply.type("application/json; charset=utf-8").send(MAINTENANCE_JSON);
}

export default class Server implements IServer {
    client: BotClient;

    private instance: FastifyInstance | null = null;
    private routes: RouteManager;
    private port: number;
    private host: string;

    constructor(client: BotClient) {
        this.client = client;
        this.routes = new RouteManager(client);
        this.port = client.config.SERVER_PORT;
        this.host = DEFAULT_HOST;
    }

    get Routes(): RouteManager {
        return this.routes;
    }

    get Instance(): FastifyInstance | null {
        return this.instance;
    }

    get IsRunning(): boolean {
        return this.instance !== null;
    }

    get BaseURL(): string {
        const { developerMode, config } = this.client;
        const base = developerMode ? `http://localhost:${this.port}` : config.SERVER_PUBLIC_URL;

        return base.replace(/\/+$/, "");
    }

    get Port(): number {
        return this.port;
    }

    set Port(value: number) {
        if (this.IsRunning) throw new Error("Der Port kann nicht geändert werden, während der Server läuft.");
        if (!Number.isInteger(value) || value < 1 || value > MAX_PORT) throw new Error(`Ungültiger Port: ${value}`);

        this.port = value;
    }

    get Host(): string {
        return this.host;
    }

    set Host(value: string) {
        if (this.IsRunning) throw new Error("Der Host kann nicht geändert werden, während der Server läuft.");

        const host = value.trim();
        if (!host) throw new Error("Der Host darf nicht leer sein.");

        this.host = host;
    }

    async Start(): Promise<void> {
        if (this.instance) return;

        AssertSecret(this.client.config.SERVER_JWT_SECRET);

        // Mit und ohne Schrägstrich am Ende dieselbe Route: an der Wurzel heißt
        // das Dashboard "/", im Entwicklungsmodus "/dashboard" - und ein Link auf
        // "/dashboard/" soll nicht ins Leere laufen.
        //
        // trustProxy: Vertraut wird nur einem Gegenüber aus dem eigenen Netz -
        // im Betrieb nginx auf dem Host, dessen Anfragen über Dockers
        // Portweiterleitung aus dem Docker-Netz kommen (docs/Hosting.md), dazu
        // das Admin Dashboard im selben Netz. Ohne das ist request.ip immer der
        // Proxy, und das Rate Limit zaehlt die ganze Welt in einen Topf. Den
        // Anfang von X-Forwarded-For schreibt der Aufrufer selbst: gezaehlt wird
        // die letzte Adresse, die nicht aus diesen Netzen stammt. Eine Zahl
        // (Anzahl der Proxys) nimmt Fastify seit 5.12.5 nicht mehr, sie prueft
        // nicht, wer wirklich davorsitzt. Wie im Admin Dashboard (server/app.ts).
        const instance = fastify({ logger: false, routerOptions: { ignoreTrailingSlash: true }, trustProxy: ["loopback", "uniquelocal"] });

        // Bilder kommen roh: der Browser schickt die Datei als Body, Ziel und
        // Name stehen in der Adresse. Ein Multipart-Paket waere eine Dependency
        // fuer fuenf Zeilen.
        //
        // Kein bodyLimit hier: der Parser gilt serverweit - eine Grenze hier
        // traefe jede POST-Route mit image/*-Body, nicht nur die eine, die
        // wirklich ein Bild erwartet. Ohne eigene Grenze bleibt es beim
        // Fastify-Standard von 1 MiB; die 8 MiB (MAX_IMAGE_BYTES) setzt
        // stattdessen die Galerie-Route selbst ueber IRouteOptions.bodyLimit
        // (Task 8).
        instance.addContentTypeParser(
            UPLOAD_TYPES,
            { parseAs: "buffer" },
            (_request, body, done) => done(null, body)
        );

        // Dasselbe für beliebige Dateien aus Live Tickets. Die Grenze setzt auch
        // hier die eine Route, die sie erwartet (DashboardApiLiveFile).
        instance.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) =>
            done(null, body)
        );

        // JSON-Antworten gepackt: Listen wie Transcripts oder Live Tickets sind
        // sonst ein Vielfaches groesser. Dateien und Seiten packen SendFile und
        // SendPage selbst (mit gemerkter Fassung) - die kommen hier als Buffer an.
        instance.addHook("onSend", async (request, reply, payload) => {
            if (typeof payload !== "string" || payload.length < MIN_COMPRESS || reply.hasHeader("content-encoding")) return payload;
            if (!String(reply.getHeader("content-type") ?? "").startsWith("application/json")) return payload;

            const encoding = EncodingOf(request);

            if (!encoding) return payload;

            reply.header("Content-Encoding", encoding).header("Vary", "Accept-Encoding").removeHeader("content-length");

            return Pack(payload, encoding);
        });

        await instance.register(rateLimit, {
            global: true,
            max: this.client.config.SERVER_RATE_LIMIT_MAX,
            timeWindow: this.client.config.SERVER_RATE_LIMIT_WINDOW,
        });

        if (this.routes.Size === 0) await this.routes.Load();

        // Im Betrieb übernimmt das nginx, siehe DevMaintenance.
        if (DEVELOPER_MODE) instance.addHook("onRequest", DevMaintenance);

        this.routes.Apply(instance);

        // Was keine Route trifft und was unterwegs kaputtgeht, bekommt eine
        // Seite statt rohem JSON - aber nur, wenn ein Browser fragt. Die API
        // antwortet weiter in JSON, sonst stünde ein Skript vor HTML.
        instance.setNotFoundHandler(async (request, reply) => SendError(this.client, request, reply, 404));

        instance.setErrorHandler(async (thrown, request, reply) => {
            const error = thrown instanceof Error ? thrown : new Error(String(thrown));
            const code = Number((thrown as { statusCode?: number }).statusCode ?? 500);

            // Zu viele Beta-Codes probiert: zurück auf die Sperrseite, der Satz steht dort über dem Feld.
            if (code === 429 && request.method === "POST" && request.routeOptions.url === `${DASHBOARD_PATH}/beta`) return reply.redirect(`${DASHBOARD_HOME}?beta=zuviel`, 303);

            // Serverfehler bekommen eine kurze ID: Sie steht im Log, auf der Seite und in der Meldung.
            const ref = code >= 500 ? randomBytes(4).toString("hex") : null;

            LogError(request, error, code, ref);

            return SendError(this.client, request, reply, code, error, ref);
        });

        await instance.listen({ port: this.port, host: this.host });

        this.instance = instance;

        const secured = this.routes.Routes.filter((route) => route.requiresAuth).size;

        logger.server(
            `🌐 Server läuft auf Port ${this.port} mit ${this.routes.Size} Route(n), ` +
                `davon ${secured} mit Token-Pflicht (öffentlich: ${this.BaseURL})`
        );
    }

    async Stop(): Promise<void> {
        if (!this.instance) return;

        await this.instance.close();
        this.instance = null;

        logger.server("🛑 Server gestoppt");
    }
}
