import fastify, { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { LogError, SendError } from "./utils/errorpage";
import { SendPage } from "./utils/dashboard";
import { MAINTENANCE_CLOSED, MaintenancePlaceholders } from "./services/DashboardService";
import BotClient from "./client/BotClient";
import RouteManager from "./handler/RouteManager";
import IServer from "./interfaces/services/server/IServer";
import { AssertSecret } from "./utils/jwt";
import logger from "./utils/logger";
import { UPLOAD_TYPES } from "./constants/Gallery";

import { EncodingOf, MIN_COMPRESS, Pack } from "./utils/compress";
const DEFAULT_HOST = "0.0.0.0";
const MAX_PORT = 65535;

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
        // trustProxy: 1 heißt "genau ein Proxy davor" - im Betrieb nginx, siehe
        // docs/Hosting.md. Ohne das ist request.ip immer der Proxy, und das
        // Rate Limit zaehlt die ganze Welt in einen Topf. Gezaehlt wird der
        // letzte Eintrag aus X-Forwarded-For, nicht der erste: den ersten
        // schreibt der Aufrufer selbst, und der darf sich nicht aussuchen, als
        // wer er gezaehlt wird. Ohne Proxy (--dev) aendert die Option nichts.
        const instance = fastify({ logger: false, routerOptions: { ignoreTrailingSlash: true }, trustProxy: 1 });

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

        // Wartung des Bot-Dashboards (Plan 23), vor allem anderen: Der Bot liest
        // den Schalter selbst aus der Datenbank. Seiten bekommen die
        // Wartungsseite, alles andere einen Satz. Administrator und Developer
        // kommen durch, offen bleiben Anmeldung, Rechtstexte, Stil und Bilder.
        instance.addHook("onRequest", async (request, reply) => {
            const note = await this.client.dashboardService.MaintenanceFor(request);

            if (!note) return;

            reply.code(503).header("Retry-After", "300").header("Cache-Control", "no-store");

            if (request.method === "GET" && String(request.headers.accept ?? "").includes("text/html")) {
                return SendPage(this.client, reply, "wartung.html", MaintenancePlaceholders(note, new Date()));
            }

            return reply.send({ error: MAINTENANCE_CLOSED });
        });

        await instance.register(rateLimit, {
            global: true,
            max: this.client.config.SERVER_RATE_LIMIT_MAX,
            timeWindow: this.client.config.SERVER_RATE_LIMIT_WINDOW,
        });

        if (this.routes.Size === 0) await this.routes.Load();

        this.routes.Apply(instance);

        // Was keine Route trifft und was unterwegs kaputtgeht, bekommt eine
        // Seite statt rohem JSON - aber nur, wenn ein Browser fragt. Die API
        // antwortet weiter in JSON, sonst stünde ein Skript vor HTML.
        instance.setNotFoundHandler(async (request, reply) => SendError(this.client, request, reply, 404));

        instance.setErrorHandler(async (thrown, request, reply) => {
            const error = thrown instanceof Error ? thrown : new Error(String(thrown));
            const code = Number((thrown as { statusCode?: number }).statusCode ?? 500);

            LogError(request, error, code);

            // Ein Fehler im Code geht an den Guardian; seine ID steht in der Antwort und auf der Fehlerseite.
            const route = request.routeOptions?.url ?? "unbekannt";
            const errorId = code >= 500 ? await this.client.guardian.HandleServer(error.message, { route: `${request.method} ${route}`, stack: error.stack }).catch(() => null) : null;

            return SendError(this.client, request, reply, code, error, errorId);
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
