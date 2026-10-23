import type { JSX } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./Pager.module.scss";

/** Zurück, „Seite 2 von 7“, Weiter. Nur da, wo es mehr als eine Seite gibt. */
export function Pager({ page, pages, onPage }: { readonly page: number; readonly pages: number; readonly onPage: (page: number) => void }): JSX.Element | null {
    if (pages <= 1) return null;

    return (
        <nav className={styles.pager} aria-label="Seiten">
            <Button size="sm" variant="ghost" icon="chevron-left" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                Zurück
            </Button>
            <span>
                Seite {page} von {pages}
            </span>
            <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
                Weiter <Icon name="chevron-right" size={16} />
            </Button>
        </nav>
    );
}
