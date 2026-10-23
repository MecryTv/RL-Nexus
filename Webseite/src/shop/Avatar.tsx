import type { JSX } from "react";
import type { IShopMe } from "./types.ts";
import styles from "../pages/PricingPage.module.scss";

/** Avatar von Discord, sonst der Anfangsbuchstabe auf dem Verlauf der Marke. */
export function Avatar({ me, size = 32 }: { readonly me: IShopMe; readonly size?: number }): JSX.Element {
    return me.avatar ? (
        <img className={styles.avatar} src={me.avatar} alt="" width={size} height={size} />
    ) : (
        <span className={styles.avatar} style={{ width: size, height: size }} aria-hidden="true">
            {me.name.slice(0, 1).toUpperCase()}
        </span>
    );
}
