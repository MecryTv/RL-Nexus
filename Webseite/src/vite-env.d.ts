/// <reference types="vite/client" />

/**
 * Die eigenen Umgebungsvariablen.
 *
 * Ohne diese Deklaration wäre `import.meta.env.VITE_CONTACT_ENDPOINT` vom Typ
 * `any` - und ein Tippfehler im Namen fiele erst auf, wenn das Formular ins
 * Leere sendet.
 */
interface ImportMetaEnv {
    /**
     * Wohin das Kontaktformular sendet.
     *
     * Im Betrieb `/api/contact`, nginx reicht das an den Admin-Server weiter.
     * Leer oder nicht gesetzt heißt: das Mailprogramm des Besuchers wird mit
     * fertigem Text geöffnet.
     */
    readonly VITE_CONTACT_ENDPOINT?: string;
    /**
     * Wer der Seite /vorschau Entwürfe schicken darf: die Adresse des Admin
     * Dashboards. Ohne Angabe https://admin.nexus-emb.de, beim Entwicklungsserver
     * http://localhost:5174.
     */
    readonly VITE_ADMIN_ORIGIN?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
