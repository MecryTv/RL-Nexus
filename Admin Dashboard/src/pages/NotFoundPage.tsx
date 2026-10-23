import type { JSX } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useTitle } from "../useTitle";

export function NotFoundPage(): JSX.Element {
    useTitle("Nicht gefunden");

    return (
        <>
            <PageHeader title="Diese Seite gibt es nicht" />
            <p>
                Vielleicht ist der Link alt, oder in der Adresse steckt ein Tippfehler.{" "}
                <Link to="/" className="u-link">
                    Zur Übersicht
                </Link>
            </p>
        </>
    );
}
