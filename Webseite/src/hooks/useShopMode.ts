import { useEffect, useState } from "react";
import type { ShopMode } from "../services/navigation.ts";
import { loadState } from "../shop/api.ts";

// Einmal je Seitenaufruf gefragt und geteilt: Kopf und Fuß brauchen es beide.
let asked: Promise<ShopMode | null> | null = null;
// Die Antwort, sobald sie da ist: Wer später gezeichnet wird, fängt gleich damit an, statt kurz bei "loading".
let known: ShopMode | null | "loading" = "loading";

/** Free, Paid oder Beta Access laut Shop. "loading", bis er geantwortet hat; null, wenn er nicht antwortet. */
export function useShopMode(): ShopMode | null | "loading" {
    const [mode, setMode] = useState<ShopMode | null | "loading">(() => known);

    useEffect(() => {
        let live = true;
        asked ??= loadState().then(
            (state) => (known = state.mode ?? null),
            () => (known = null)
        );
        void asked.then((value) => {
            if (live) setMode(value);
        });

        return () => {
            live = false;
        };
    }, []);

    return mode;
}
