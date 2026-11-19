import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { IPrimeProfile } from "../../interfaces/services/prime/IPrimeService";
import { RankMessage } from "../../builder/RankView";
import { LINK_COOLDOWN_DEV } from "../../constants/Database";
import { PRIME_ACCESS_TEXT } from "../../constants/Prime";
import { PrimeError } from "../../services/PrimeService";
import { EpicLinkURL, EpicLoginReady } from "../../utils/epicLogin";
import { EpicAdopt } from "../../utils/epic";
import { CurrentLinkMode, ModuleValue } from "../../utils/moduleFlags";
import { AskLine, IsServerAdmin } from "../../builder/LimitReply";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import { LinkUsable } from "../../models/PlayerAccount";
import logger from "../../utils/logger";

const MAX_NAME = 64;

/** Im Entwicklungsmodus zehn Sekunden statt der vollen Frist - sonst nicht testbar. */
/** W-0133: Sperrfrist und Korrektur-Fenster kommen aus dem Admin (für alle). */
function switchDays(): number {
    return ModuleValue("rl-tracking", "switchDays", null);
}

function fixMs(): number {
    return ModuleValue("rl-tracking", "fixMinutes", null) * 60_000;
}

function cooldownOf(client: BotClient): number {
    return client.developerMode ? LINK_COOLDOWN_DEV : switchDays() * 86_400_000;
}

/** "in 12 Tagen", "in 3 Stunden" - grob reicht, es geht um die Größenordnung. */
function waitLabel(ms: number): string {
    const days = Math.ceil(ms / 86_400_000);

    if (days > 1) return `${days} Tagen`;

    const hours = Math.ceil(ms / 3_600_000);

    if (hours > 1) return `${hours} Stunden`;

    return `${Math.max(1, Math.ceil(ms / 60_000))} Minuten`;
}

/**
 * Rang-Karte als Discord-Command.
 *
 *   /rank link           Knopf zum Epic-Login, verbindet das Epic-Konto (W-0125)
 *   /rank unlink         trennt es wieder
 *   /rank me             die eigene Karte, über die Verknüpfung
 *   /rank search <name>  die Karte zu einem beliebigen Epic-Namen
 *
 * Nichts davon hängt an einer Guild: die Verknüpfung steht unter der Discord-ID
 * allein (player_accounts hat keine guild_id), und der Befehl ist global
 * registriert. Er funktioniert damit auf jedem Server, auf dem der Bot ist.
 *
 * Gerendert wird mit @napi-rs/canvas (siehe builder/RankCard.ts). Das dauert je
 * nach Bildern eine knappe Sekunde, deshalb wird jede Antwort vorher verzögert -
 * ohne das läuft die Interaktion in Discords Drei-Sekunden-Fenster.
 */
export default class Rank extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "rank",
            description: "Rocket-League-Ränge als Karte: eigene, fremde oder Konto verknüpfen",
            category: Category.User,
            cooldown: 10,
            developerOnly: false,
            module: "rl-tracking",
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addSubcommand((sub) =>
                sub
                    .setName("link")
                    .setDescription("Verbindet dein Epic-Konto mit Discord")
                    // W-0131: Ob der Name zählt, stellt das Admin Dashboard ein (Bot → Module → RL Tracking).
                    .addStringOption((option) =>
                        option.setName("epicname").setDescription("Dein Epic-Name, falls Verbinden per Name erlaubt ist").setRequired(false).setMaxLength(MAX_NAME)
                    )
            )
            .addSubcommand((sub) =>
                sub
                    .setName("unlink")
                    .setDescription("Trennt dein Epic-Konto wieder, frühestens nach der Sperrfrist")
            )
            .addSubcommand((sub) => sub.setName("me").setDescription("Zeigt deine eigenen Ränge"))
            .addSubcommand((sub) =>
                sub
                    .setName("search")
                    .setDescription("Zeigt die Ränge zu einem Epic-Namen")
                    .addStringOption((option) =>
                        option
                            .setName("epicname")
                            .setDescription("Der Epic-Games-Name, genau wie im Spiel geschrieben")
                            .setRequired(true)
                            .setMaxLength(MAX_NAME)
                    )
            );
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!this.client.primeService.IsConfigured) {
            await interaction.reply({
                content: "Das Rang-Tracking ist auf diesem Server nicht eingerichtet.",
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        switch (interaction.options.getSubcommand()) {
            case "link":
                return this.Link(interaction);
            case "unlink":
                return this.Unlink(interaction);
            case "me":
                return this.Me(interaction);
            default:
                return this.Search(interaction);
        }
    }

    /**
     * Holt ein Profil und übersetzt jeden Ausfall in einen Satz, den der Nutzer
     * versteht. null heißt: es wurde bereits geantwortet.
     */
    private async Fetch(interaction: ChatInputCommandInteraction, name: string): Promise<IPrimeProfile | null> {
        let profile: IPrimeProfile | null;

        try {
            profile = await this.client.primeService.Profile(name);
        } catch (error) {
            const prime = error instanceof PrimeError ? error : null;

            // W-0145: Ein abgelaufener oder falscher Schlüssel ist kein Ausfall von Rocket League.
            // Im Log steht er schon als Fehler (PrimeService, einmal je Stunde) - nicht noch je Aufruf.
            const locked = prime?.type === "Access";

            if (!locked) logger.warn(`🎮 Prime: ${prime ? `${prime.type} ${prime.message}` : String(error)}`);

            await interaction.editReply({ content: locked ? PRIME_ACCESS_TEXT : "Rocket League antwortet gerade nicht. Versuch es später noch einmal." });

            return null;
        }

        if (!profile) {
            await interaction.editReply({
                content: `Den Epic-Namen **${name}** gibt es nicht. Prüf die Schreibweise, sie muss genau wie im Spiel sein.`,
            });

            return null;
        }

        return profile;
    }

    /**
     * Zeichnet Seite 1 (Ranked) und hängt sie an die Antwort. Darunter der Knopf
     * zu den Extra-Modi und der Tracker - siehe builder/RankView.ts.
     */
    private async Send(
        interaction: ChatInputCommandInteraction,
        profile: IPrimeProfile,
        discordName: string | null,
        avatarURL: string | null
    ): Promise<void> {
        const started = Date.now();
        const message = await RankMessage({ profile, discordName, avatarURL, page: "ranked" }, interaction.user.id);

        logger.info(`🖼️  Rang-Karte für ${profile.name} in ${Date.now() - started} ms`);

        await interaction.editReply(message);
    }

    /* ------------------------------------------------------------------
       /rank link
       ------------------------------------------------------------------ */
    /**
     * W-0125: Verbunden wird nur noch über den Epic-Login. Ein getippter Name
     * bewies nichts - jeder konnte sich so das Konto eines anderen holen, samt
     * dessen Rang-Rollen. Der Befehl schickt deshalb nur einen Knopf; was danach
     * passiert, steht in routes/EpicCallback.ts.
     */
    private async Link(interaction: ChatInputCommandInteraction): Promise<void> {
        // W-0131: Die Verknüpfungsart kommt aus dem Admin Dashboard.
        const typed = (interaction.options.getString("epicname") ?? "").trim();
        const mode = CurrentLinkMode(interaction.guildId);

        if (mode === "name" && !typed) {
            await interaction.reply({ content: "Gib deinen Epic-Namen an: `/rank link epicname:<Name>`, genau wie im Spiel geschrieben.", flags: MessageFlags.Ephemeral });

            return;
        }

        if (typed && mode !== "login") return this.LinkByName(interaction, typed, mode === "both");

        const ignored = typed ? "Der Name ist nicht nötig, die Anmeldung läuft über Epic.\n" : "";

        if (!EpicLoginReady(this.client)) {
            await interaction.reply({
                content: "Das Verbinden über Epic Games ist auf diesem Bot noch nicht eingerichtet. Ränge ansehen geht trotzdem mit `/rank search`.",
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        if (!this.client.databaseService.Ready) {
            await interaction.reply({
                content: "Ohne Datenbank lässt sich nichts verknüpfen, denn die Verknüpfung steht dort.",
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        // Nur der Nutzer selbst soll den Knopf sehen: er verbindet sein Discord-Konto.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const userId = interaction.user.id;
        const current = await this.client.accounts.On(userId, "epic");
        const cooldown = await this.client.accounts.Cooldown(userId, "epic", cooldownOf(this.client), fixMs());

        // Neu verbinden mit demselben Konto ginge zwar auch in der Frist, aber das
        // ändert nichts. Gesperrt wird hier, damit niemand umsonst zu Epic läuft.
        if (current && !cooldown.open) {
            await interaction.editReply({
                content:
                    `Verbunden ist **${current.display_name ?? current.account_id}**. ` +
                    `Wechseln geht nur alle ${switchDays()} Tage, wieder möglich in **${waitLabel(cooldown.waitMs)}**.`,
            });

            return;
        }

        // Ist schon ein Konto verbunden, soll es ein anderes werden: Epic fragt dann neu
        // nach der Anmeldung, statt still das schon angemeldete (falsche) Konto zu nehmen.
        // Der Kanal geht mit: „Zurück zu Discord“ auf der Seite danach führt genau hierher.
        const url = EpicLinkURL(this.client, userId, Date.now(), !!current, `${interaction.guildId ?? "@me"}/${interaction.channelId}`);

        const name = current ? `**${current.display_name ?? current.account_id}**` : "";
        const intro = !current
            ? "Melde dich bei Epic Games an. Danach gehört dein Epic-Konto zu diesem Discord-Konto, und niemand sonst kann es verbinden."
            : cooldown.fixUntil
              ? `Verbunden ist gerade ${name}. Falsches Konto? Bis <t:${Math.floor(cooldown.fixUntil / 1000)}:t> kannst du ohne Wartezeit ein anderes verbinden, Epic fragt dafür neu nach der Anmeldung.`
              : `Verbunden ist gerade ${name}. Mit dem Knopf verbindest du ein anderes Epic-Konto, Epic fragt dafür neu nach der Anmeldung.`;

        // W-0133, Entwurf M: Karte mit Titel und Knopf, darunter klein Gültigkeit und die Art.
        const card = new ComponentV2Builder({ accentColor: 0xff1e2d })
            .text("### 🔗 Epic-Konto verbinden")
            .text(ignored + intro)
            .buttons({ url, label: current ? "Anderes Epic-Konto verbinden" : "Mit Epic Games anmelden", emoji: "🔐" })
            .separator()
            .subtext(`Der Knopf gilt ${ModuleValue("rl-tracking", "linkMinutes", null)} Minuten und nur für dich. Gib ihn nicht weiter.`);

        if (interaction.guildId) {
            const ask = AskLine({ module: "rl-tracking", key: "linkMode", guildId: interaction.guildId, admin: IsServerAdmin(interaction.member) });

            card.subtext(ask.text);
            if (ask.button) card.buttons(ask.button);
        }

        await interaction.editReply({ components: [card.build()], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    }

    /**
     * W-0131: Verbinden per Name, wie vor W-0125 - nur wenn das Admin Dashboard
     * es erlaubt (Nur Epic-Name oder Beides). Die Verknüpfung ist unbestätigt
     * (verified 0): bei Beides gibt es dafür keine Rang-Rollen, und wer sich
     * später per Epic anmeldet, übernimmt das Konto (routes/EpicCallback.ts).
     */
    private async LinkByName(interaction: ChatInputCommandInteraction, name: string, both: boolean): Promise<void> {
        if (!this.client.databaseService.Ready) {
            await interaction.reply({ content: "Ohne Datenbank lässt sich nichts verknüpfen, denn die Verknüpfung steht dort.", flags: MessageFlags.Ephemeral });

            return;
        }

        // Nur der Nutzer selbst soll sehen, welches Konto er verbindet.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const userId = interaction.user.id;
        const current = await this.client.accounts.On(userId, "epic");
        const cooldown = await this.client.accounts.Cooldown(userId, "epic", cooldownOf(this.client), fixMs());

        // Erst prüfen, dann verknüpfen: einen Namen, den es nicht gibt, speichert der Bot gar nicht erst.
        const profile = await this.Fetch(interaction, name);

        if (!profile) return;

        // Dasselbe Konto noch einmal ist keine Änderung - das darf die Sperre nicht treffen.
        // Verglichen wird die Konto-ID: Ein Name kann inzwischen einem anderen Spieler gehören (Review W-0131).
        const same = current?.account_id === profile.accountId;

        if (!cooldown.open && !same) {
            await interaction.editReply({ content: `Dein Epic-Konto lässt sich nur alle ${switchDays()} Tage wechseln. Wieder möglich in **${waitLabel(cooldown.waitMs)}**.` });

            return;
        }

        // Korrektur im Fenster nach dem Verbinden: die Frist zählt weiter ab dem ersten Verbinden, wie beim Login.
        const keepChangedAt = current && !same && cooldown.fixUntil !== null ? new Date(current.changed_at) : undefined;

        const owner = await this.client.accounts.Owner("epic", profile.accountId);
        const taken = "Dieses Epic-Konto ist schon mit einem anderen Discord-Konto verbunden. Ein Epic-Konto gehört genau einem Discord-Konto.";

        if (owner && owner !== userId) return void (await interaction.editReply({ content: taken }));

        try {
            await EpicAdopt(this.client, userId, { accountId: profile.accountId, displayName: profile.name }, keepChangedAt, false);
        } catch (error) {
            if ((error as { code?: string } | null)?.code !== "ER_DUP_ENTRY") throw error;

            return void (await interaction.editReply({ content: taken }));
        }

        logger.user(`🎮 Epic verknüpft (Name): ${userId} → ${profile.name} (${profile.accountId})`);

        await interaction.editReply({
            content:
                `**${profile.name}** ist jetzt mit deinem Discord-Konto verbunden. Mit \`/rank me\` siehst du deine Karte.` +
                (both ? "\nRang-Rollen gibt es erst mit Epic-Anmeldung: `/rank link` ohne Namen." : "") +
                (same || !current ? "" : `\nEin Wechsel ist erst in ${switchDays()} Tagen wieder möglich.`),
        });
    }

    /* ------------------------------------------------------------------
       /rank unlink
       ------------------------------------------------------------------ */
    /**
     * Trennt die Verknüpfung wieder.
     *
     * Dieselbe Frist wie beim Wechseln, und das ist kein Zufall: Cooldown()
     * rechnet gegen changed_at in der Zeile, und Unlink() löscht genau diese
     * Zeile. Ohne die Sperre hier wäre trennen und neu verbinden ein Weg, die
     * Wartezeit einfach zu überspringen.
     */
    private async Unlink(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!this.client.databaseService.Ready) {
            await interaction.reply({
                content: "Ohne Datenbank gibt es nichts zu trennen, denn die Verknüpfung steht dort.",
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const userId = interaction.user.id;
        const current = await this.client.accounts.On(userId, "epic");

        if (!current) {
            await interaction.editReply({ content: "Du hast gar kein Epic-Konto verbunden." });

            return;
        }

        const cooldown = await this.client.accounts.Cooldown(userId, "epic", cooldownOf(this.client));

        if (!cooldown.open) {
            await interaction.editReply({
                content:
                    `**${current.display_name ?? current.account_id}** ist noch gesperrt. ` +
                    `Trennen geht wieder in **${waitLabel(cooldown.waitMs)}**.
` +
                    `Die Frist gilt auch fürs Trennen, sonst ließe sie sich mit einem Zwischenschritt umgehen.`,
            });

            return;
        }

        await this.client.accounts.Unlink(userId, "epic");
        // Review W-0125: mit dem Konto gehen seine Ränge und die Rang-Rollen auf allen Servern.
        await this.client.ranks.Clear(userId);
        void this.client.rankRoleService.Strip(userId).catch(() => 0);

        logger.user(`🎮 Epic getrennt: ${userId} (war ${current.display_name ?? current.account_id})`);

        await interaction.editReply({
            content:
                `**${current.display_name ?? current.account_id}** ist nicht mehr mit deinem Discord-Konto verbunden. ` +
                `Mit \`/rank link\` verbindest du ein anderes.`,
        });
    }

    /* ------------------------------------------------------------------
       /rank me
       ------------------------------------------------------------------ */
    private async Me(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!this.client.databaseService.Ready) {
            await interaction.reply({
                content: "Ohne Datenbank kenne ich keine Verknüpfungen. Nimm so lange `/rank search`.",
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        const account = await this.client.accounts.Linked(interaction.user.id, "epic", "card", interaction.guildId);

        if (!account) {
            await interaction.reply({
                content: "Du hast noch kein Epic-Konto verbunden. Mach das einmal mit `/rank link`.",
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        await interaction.deferReply();

        // Über die Konto-ID statt über den Namen: ein Spieler kann sich im Spiel
        // umbenennen, die ID bleibt.
        const profile = await this.Fetch(interaction, account.account_id);

        if (!profile) return;

        // W-0131 (Review): Per Name verbunden zeigt die Karte niemanden als Besitzer, außer bei „Nur Epic-Name“.
        const owner = LinkUsable(account, "trusted", interaction.guildId);

        await this.Send(
            interaction,
            profile,
            owner ? interaction.user.username : null,
            owner ? interaction.user.displayAvatarURL({ extension: "png", size: 256 }) : null
        );

        // Mit Rank Roles: die Rang-Rollen zum eben gezeigten Rang. Neu dazu sieht nur, wer fragt.
        if (!interaction.inCachedGuild()) return;

        const result = await this.client.rankRoleService.AfterRankMe(interaction.member, profile).catch(() => null);

        if (result && "notice" in result) {
            await interaction.followUp({ content: `🎖️ ${result.notice}`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).catch(() => undefined);

            return;
        }

        if (result?.added.length) {
            await interaction
                .followUp({ content: `🎖️ Neu dazu: ${result.added.map((id) => `<@&${id}>`).join(", ")}`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })
                .catch(() => undefined);
        }
    }

    /* ------------------------------------------------------------------
       /rank search
       ------------------------------------------------------------------ */
    private async Search(interaction: ChatInputCommandInteraction): Promise<void> {
        const name = (interaction.options.getString("epicname", true) ?? "").trim();

        if (!name) {
            await interaction.reply({ content: "Kein gültiger Epic-Name.", flags: MessageFlags.Ephemeral });

            return;
        }

        await interaction.deferReply();

        const profile = await this.Fetch(interaction, name);

        if (!profile) return;

        // Steht hinter dem Epic-Konto ein Discord-Nutzer, der es hier verknüpft
        // hat, wird sein Name mitgezeigt - sonst bleibt die Karte anonym.
        const owner = this.client.databaseService.Ready
            ? await this.client.accounts.TrustedOwner("epic", profile.accountId, interaction.guildId)
            : null;

        const member = owner ? await this.client.users.fetch(owner).catch(() => null) : null;

        await this.Send(
            interaction,
            profile,
            member?.username ?? null,
            member?.displayAvatarURL({ extension: "png", size: 256 }) ?? null
        );
    }
}
