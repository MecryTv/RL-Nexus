import { lazy, Suspense, useEffect, useRef, type ComponentProps, type JSX } from "react";
import { Loading } from "../components/Status";
import styles from "./mail.module.scss";

/**
 * Der Editor kommt erst, wenn jemand schreibt. TipTap mit ProseMirror ist
 * größer als das ganze übrige Postfach, und zum Lesen braucht es ihn nicht.
 */
const Composer = lazy(async () => ({ default: (await import("./Composer")).Composer }));

/** Solange der Editor lädt, steht das Fenster schon da. */
function LoadingWindow(): JSX.Element {
    const ref = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = ref.current;
        if (dialog && !dialog.open) dialog.showModal();
    }, []);

    return (
        <dialog ref={ref} className={styles.window} aria-label="Editor wird geladen">
            <Loading label="Editor wird geladen" />
        </dialog>
    );
}

export function LazyComposer(props: ComponentProps<typeof Composer>): JSX.Element {
    return (
        <Suspense fallback={<LoadingWindow />}>
            <Composer {...props} />
        </Suspense>
    );
}
