import { useLive } from "./live";
import { useApi } from "./useApi";

/** Angehaltene Löschungen für die gelbe Zahl in der Leiste. Der Server meldet Änderungen über `userdata`. */
export function useHalted(): number {
    const { data, reload } = useApi<{ count: number }>("/api/userdata/loeschungen/angehalten", 60_000);

    useLive("userdata", reload);

    return data?.count ?? 0;
}

/** Offene Verdachtsfälle für die gelbe Zahl am Bereich Sicherheit (W-0057). */
export function useSuspects(): number {
    const { data, reload } = useApi<{ suspects: number }>("/api/security/count", 60_000);

    useLive("security", reload);

    return data?.suspects ?? 0;
}
