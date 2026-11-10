import { useEffect, useState } from "react";
import type { IBotShowcase } from "../../shared/servers";
import { api } from "../api/client";
import type { IContactInfo } from "./ContactField";

const SNOWFLAKE = /^\d{17,20}$/;

/** Was GET /api/partners/contact/:userId über einen Ansprechpartner weiß. null ohne gültige ID oder solange es lädt. */
export function useContact(userId: string | null): IContactInfo | null {
    const [state, setState] = useState<{ readonly id: string; readonly info: IContactInfo | null } | null>(null);
    const valid = userId !== null && SNOWFLAKE.test(userId);

    useEffect(() => {
        if (!valid) return;

        const controller = new AbortController();

        api<IContactInfo>(`/api/partners/contact/${userId}`, { signal: controller.signal }).then(
            (info) => setState({ id: userId, info }),
            () => {
                if (!controller.signal.aborted) setState({ id: userId, info: null });
            }
        );

        return () => controller.abort();
    }, [userId, valid]);

    return valid && state?.id === userId ? state.info : null;
}

/** Live-Zahlen des verknüpften Servers für die Vorschau (W-0062 Teil 2, Task 5). */
export function useShowcase(guildId: string | null): IBotShowcase | null {
    const [state, setState] = useState<{ readonly id: string; readonly showcase: IBotShowcase | null } | null>(null);

    useEffect(() => {
        if (!guildId) return;

        const controller = new AbortController();

        api<IBotShowcase | null>(`/api/partners/showcase/${guildId}`, { signal: controller.signal }).then(
            (showcase) => setState({ id: guildId, showcase }),
            () => {
                if (!controller.signal.aborted) setState({ id: guildId, showcase: null });
            }
        );

        return () => controller.abort();
    }, [guildId]);

    return guildId && state?.id === guildId ? state.showcase : null;
}
