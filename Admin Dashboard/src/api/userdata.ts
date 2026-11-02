import { useLive } from "./live";
import { useApi } from "./useApi";

/** Angehaltene Löschungen für die gelbe Zahl in der Leiste. Der Server meldet Änderungen über `userdata`. */
export function useHalted(): number {
    const { data, reload } = useApi<{ count: number }>("/api/userdata/loeschungen/angehalten", 60_000);

    useLive("userdata", reload);

    return data?.count ?? 0;
}
