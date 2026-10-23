import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StatusApp } from "./StatusApp";

/* Selbst ausgeliefert, nur die Schnitte, die vorkommen, und nur latin. */
import "@fontsource/oxanium/latin-500.css";
import "@fontsource/oxanium/latin-700.css";
import "@fontsource/rajdhani/latin-600.css";
import "./styles/main.scss";

const container = document.getElementById("root");

if (container === null) throw new Error("Kein Element mit der ID 'root' gefunden.");

createRoot(container).render(
    <StrictMode>
        <StatusApp />
    </StrictMode>
);
