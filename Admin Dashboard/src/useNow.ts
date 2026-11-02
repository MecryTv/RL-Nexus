import { useEffect, useState } from "react";

/** Die aktuelle Zeit, neu alle `interval` Millisekunden. Für Countdowns. */
export function useNow(interval: number): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), interval);

        return () => window.clearInterval(timer);
    }, [interval]);

    return now;
}
