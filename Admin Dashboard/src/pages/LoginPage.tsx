import type { JSX } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import type { DenyReason } from "../../shared/api";
import logo from "../assets/logo.webp";
import { LinkButton } from "../components/Button";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Panel";
import { useSession } from "../session/context";
import { useTitle } from "../useTitle";
import styles from "./LoginPage.module.scss";

const REASONS: Readonly<Record<DenyReason, { readonly title: string; readonly text: string }>> = {
    mfa: {
        title: "Zwei-Faktor fehlt",
        text: "An deinem Discord-Konto ist keine Zwei-Faktor-Authentifizierung aktiv. Schalte sie in Discord unter Einstellungen › Mein Account ein und melde dich danach noch einmal an.",
    },
    server: {
        title: "Nicht auf dem Server",
        text: "Mit diesem Discord-Konto bist du nicht auf dem Server von RL Nexus. Das Admin Dashboard ist nur für das Team dort.",
    },
    rolle: {
        title: "Keine Berechtigung",
        text: "Dir fehlt auf dem Server von RL Nexus die Admin- oder die Developer-Rolle.",
    },
    abgebrochen: {
        title: "Anmeldung abgebrochen",
        text: "Du hast die Anmeldung bei Discord abgebrochen. Versuch es noch einmal, wenn du so weit bist.",
    },
    fehler: {
        title: "Anmeldung hat nicht geklappt",
        text: "Discord hat nicht wie erwartet geantwortet. Versuch es in ein paar Sekunden noch einmal.",
    },
};

function isReason(value: string | null): value is DenyReason {
    return value !== null && Object.hasOwn(REASONS, value);
}

/** Nur eigene Pfade als Rückweg, wie safeReturn() im Server. */
function safePath(value: string | null): string {
    return value !== null && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

export function LoginPage(): JSX.Element {
    useTitle("Anmelden");

    const [params] = useSearchParams();
    const { state } = useSession();
    const reason = params.get("grund");
    const target = safePath(params.get("return"));
    const denied = isReason(reason) ? REASONS[reason] : null;

    if (state.status === "signed-in") return <Navigate to={target} replace />;

    return (
        <main className={styles.page}>
            <Panel cut="lg" className={styles.card}>
                <img src={logo} alt="" width={72} height={72} className={styles.logo} />
                <h1 className={styles.title}>
                    RL Nexus <span>Admin</span>
                </h1>
                <p className={styles.lead}>
                    Für Admins und Developer des RL-Nexus-Servers. Angemeldet wird mit Discord, an deinem Konto muss Zwei-Faktor aktiv sein.
                </p>

                {denied && (
                    <div className={styles.denied} role="alert">
                        <Icon name="alert" size={18} />
                        <div>
                            <p className={styles.deniedTitle}>{denied.title}</p>
                            <p>{denied.text}</p>
                        </div>
                    </div>
                )}

                <LinkButton variant="primary" icon="discord" href={`/api/auth/login?return=${encodeURIComponent(target)}`}>
                    Mit Discord anmelden
                </LinkButton>
            </Panel>
        </main>
    );
}
