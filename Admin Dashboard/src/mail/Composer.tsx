import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useId, useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from "react";
import type { IMailAccount } from "../../shared/api";
import { MAIL_LIMITS } from "../../shared/limits";
import { api } from "../api/client";
import { displayName, formatSize } from "../api/mail";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { Segmented } from "../components/Segmented";
import { useToast } from "../toast/context";
import { MailButton } from "./ButtonMark";
import { draftFor, quoteFor, REPLY_TITLES, sentAt, type IDraftStart, type ReplyKind } from "./draft";
import { MailPreview } from "./MailPreview";
import styles from "./mail.module.scss";

const SAFE_URL = /^(https?:\/\/|mailto:)\S+$/i;

type LinkMode = "link" | "button";

function Tool({
    label,
    shortcut,
    active,
    disabled,
    onClick,
    children,
}: {
    readonly label: string;
    readonly shortcut?: string;
    readonly active?: boolean;
    readonly disabled?: boolean;
    readonly onClick: () => void;
    readonly children: JSX.Element | string;
}): JSX.Element {
    return (
        <button
            type="button"
            className={styles.tool}
            aria-label={label}
            title={shortcut ? `${label} (${shortcut})` : label}
            aria-pressed={active === undefined ? undefined : active}
            disabled={disabled}
            // Die Auswahl im Editor bleibt stehen, wenn ein Knopf gedrückt wird.
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function Toolbar({ editor, onLink, onAttach }: { readonly editor: Editor; readonly onLink: (mode: LinkMode) => void; readonly onAttach: () => void }): JSX.Element {
    const state = useEditorState({
        editor,
        selector: ({ editor: current }) => ({
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            underline: current.isActive("underline"),
            strike: current.isActive("strike"),
            h2: current.isActive("heading", { level: 2 }),
            h3: current.isActive("heading", { level: 3 }),
            bullet: current.isActive("bulletList"),
            ordered: current.isActive("orderedList"),
            quote: current.isActive("blockquote"),
            link: current.isActive("link"),
            button: current.isActive("mailButton"),
            undo: current.can().undo(),
            redo: current.can().redo(),
        }),
    });
    const chain = () => editor.chain().focus();

    return (
        <div className={styles.toolbar} role="toolbar" aria-label="Text gestalten">
            <Tool label="Fett" shortcut="Strg+B" active={state.bold} onClick={() => chain().toggleBold().run()}>
                <b>B</b>
            </Tool>
            <Tool label="Kursiv" shortcut="Strg+I" active={state.italic} onClick={() => chain().toggleItalic().run()}>
                <i>I</i>
            </Tool>
            <Tool label="Unterstrichen" shortcut="Strg+U" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
                <u>U</u>
            </Tool>
            <Tool label="Durchgestrichen" shortcut="Strg+Umschalt+S" active={state.strike} onClick={() => chain().toggleStrike().run()}>
                <s>S</s>
            </Tool>
            <span className={styles.toolSep} aria-hidden="true" />
            <Tool label="Überschrift" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
                H2
            </Tool>
            <Tool label="Zwischenüberschrift" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
                H3
            </Tool>
            <Tool label="Liste" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>
                <Icon name="list" size={18} />
            </Tool>
            <Tool label="Nummerierte Liste" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>
                <Icon name="list-ordered" size={18} />
            </Tool>
            <Tool label="Zitat" active={state.quote} onClick={() => chain().toggleBlockquote().run()}>
                <Icon name="quote" size={18} />
            </Tool>
            <span className={styles.toolSep} aria-hidden="true" />
            <Tool label="Link" shortcut="Strg+K" active={state.link} onClick={() => onLink("link")}>
                <Icon name="link" size={18} />
            </Tool>
            <Tool label="Knopf" active={state.button} onClick={() => onLink("button")}>
                <Icon name="button-shape" size={18} />
            </Tool>
            <Tool label="Linie" onClick={() => chain().setHorizontalRule().run()}>
                <Icon name="minus" size={18} />
            </Tool>
            <span className={styles.toolSep} aria-hidden="true" />
            <Tool label="Rückgängig" shortcut="Strg+Z" disabled={!state.undo} onClick={() => chain().undo().run()}>
                <Icon name="undo" size={18} />
            </Tool>
            <Tool label="Wiederholen" shortcut="Strg+Y" disabled={!state.redo} onClick={() => chain().redo().run()}>
                <Icon name="redo" size={18} />
            </Tool>
            <span className={styles.toolSep} aria-hidden="true" />
            <Tool label="Anhang" onClick={onAttach}>
                <Icon name="paperclip" size={18} />
            </Tool>
        </div>
    );
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

const KIND_OPTIONS = [
    { value: "reply", label: "Antworten" },
    { value: "all", label: "Allen antworten" },
    { value: "forward", label: "Weiterleiten" },
] as const;

const PANES = [
    { value: "schreiben", label: "Schreiben" },
    { value: "vorschau", label: "Vorschau" },
] as const;

/**
 * Eine Mail schreiben, in einem großen Fenster über dem Postfach: links die
 * Felder und der Editor, rechts die Vorschau. Von einer Mail aus geöffnet,
 * wechselt es zwischen Antworten, Allen antworten und Weiterleiten, ohne dass
 * der Text verloren geht.
 *
 * Verschickt wird erst auf Knopfdruck (oder Strg+Enter). Der Server prüft das
 * HTML noch einmal, setzt es in die Vorlage mit Name, Rang und Avatar, hängt
 * das Zitat und weitergeleitete Anhänge an und legt die Mail in „Gesendet“ ab.
 */
export function Composer({
    accounts,
    start,
    onSent,
    onClose,
}: {
    readonly accounts: readonly IMailAccount[];
    readonly start: IDraftStart;
    readonly onSent: () => void;
    readonly onClose: () => void;
}): JSX.Element {
    const notify = useToast();
    const id = useId();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const source = start.source;
    const own = accounts.map((account) => account.address.toLowerCase());
    const [kind, setKind] = useState<ReplyKind>(start.kind ?? "reply");
    const [pane, setPane] = useState<"schreiben" | "vorschau">("schreiben");
    const [from, setFrom] = useState<number | null>(start.from ?? accounts[0]?.id ?? null);
    const [to, setTo] = useState(start.to);
    const [cc, setCc] = useState(start.cc);
    const [bcc, setBcc] = useState("");
    const [showCopies, setShowCopies] = useState(start.cc !== "");
    const [subject, setSubject] = useState(start.subject);
    const [bodyHtml, setBodyHtml] = useState(start.html);
    const [plain, setPlain] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [forwardParts, setForwardParts] = useState<readonly number[]>(source?.message.attachments.map((entry) => entry.index) ?? []);
    const [linkMode, setLinkMode] = useState<LinkMode | null>(null);
    const [linkValue, setLinkValue] = useState("https://");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [discarding, setDiscarding] = useState(false);

    // Bezüge und Zitat hängen an der Art: Weitergeleitet wird ohne In-Reply-To.
    const current = source === null ? start : draftFor(kind, source, own);
    const quote = source === null ? "" : quoteFor(kind, source.message);
    const forwarding = source !== null && kind === "forward";
    const forwardFiles = forwarding ? source.message.attachments.filter((entry) => forwardParts.includes(entry.index)) : [];

    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();
    }, []);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
                code: false,
                codeBlock: false,
                link: { openOnClick: false, autolink: true, defaultProtocol: "https", protocols: ["mailto"] },
            }),
            MailButton,
        ],
        content: start.html,
        onUpdate: ({ editor: changed }) => setBodyHtml(changed.getHTML()),
        editorProps: {
            attributes: { "aria-label": "Text der Mail", "aria-multiline": "true", role: "textbox" },
            handleKeyDown: (_view, event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                    event.preventDefault();
                    openLink("link");
                    return true;
                }

                return false;
            },
        },
    });

    const size = files.reduce((sum, file) => sum + file.size, 0) + forwardFiles.reduce((sum, entry) => sum + entry.size, 0);
    const count = files.length + forwardFiles.length;

    function switchKind(next: ReplyKind): void {
        if (source === null) return;

        const fresh = draftFor(next, source, own);
        setKind(next);
        setTo(fresh.to);
        setCc(fresh.cc);
        setShowCopies(fresh.cc !== "");
        setSubject(fresh.subject);
    }

    function openLink(mode: LinkMode): void {
        const currentHref = editor?.getAttributes(mode === "link" ? "link" : "mailButton").href as string | undefined;

        setLinkValue(currentHref ?? "https://");
        setLinkMode(mode);
    }

    function applyLink(): void {
        if (!editor || linkMode === null) return;

        const href = linkValue.trim();
        if (!SAFE_URL.test(href)) {
            setError("Der Link braucht https://, http:// oder mailto: am Anfang.");
            return;
        }

        const chain = editor.chain().focus();

        if (editor.state.selection.empty) {
            // Ohne Auswahl kommt ein Text dazu, der schon verlinkt ist.
            const text = linkMode === "button" ? "Öffnen" : href.replace(/^mailto:/i, "");
            chain.insertContent({ type: "text", text, marks: [{ type: linkMode === "link" ? "link" : "mailButton", attrs: { href } }] }).run();
        } else if (linkMode === "link") {
            chain.extendMarkRange("link").setLink({ href }).run();
        } else {
            chain.unsetLink().setMailButton(href).run();
        }

        setLinkMode(null);
        setError(null);
    }

    function removeLink(): void {
        if (!editor) return;

        if (linkMode === "button") editor.chain().focus().unsetMailButton().run();
        else editor.chain().focus().extendMarkRange("link").unsetLink().run();

        setLinkMode(null);
    }

    function addFiles(list: FileList | null): void {
        if (!list) return;

        const next = [...files, ...list];
        const total = next.reduce((sum, file) => sum + file.size, 0) + forwardFiles.reduce((sum, entry) => sum + entry.size, 0);

        if (next.length + forwardFiles.length > MAIL_LIMITS.files) setError(`Höchstens ${MAIL_LIMITS.files} Anhänge.`);
        else if (total > MAIL_LIMITS.bytes) setError("Die Anhänge wären zusammen größer als 20 MB.");
        else {
            setFiles(next);
            setError(null);
        }

        if (fileInput.current) fileInput.current.value = "";
    }

    const dirty = (): boolean => files.length > 0 || to !== start.to || subject !== start.subject || cc !== start.cc || bcc !== "" || (bodyHtml !== start.html && bodyHtml !== "<p></p>");

    function close(): void {
        if (dirty()) setDiscarding(true);
        else onClose();
    }

    async function send(event?: FormEvent): Promise<void> {
        event?.preventDefault();
        if (!editor || busy) return;

        if (from === null) return setError("Es gibt noch kein Postfach, aus dem die Mail gehen könnte.");
        if (to.trim() === "") return setError("Trag ein, an wen die Mail geht.");
        if (subject.trim() === "") return setError("Der Betreff fehlt.");
        if (editor.getText().trim() === "") return setError("Die Mail ist noch leer.");

        const form = new FormData();
        form.set("from", String(from));
        form.set("to", to);
        form.set("cc", showCopies ? cc : "");
        form.set("bcc", showCopies ? bcc : "");
        form.set("subject", subject);
        form.set("html", editor.getHTML());
        form.set("plain", plain ? "1" : "");
        if (quote !== "") form.set("quote", quote);
        if (current.inReplyTo) form.set("inReplyTo", current.inReplyTo);
        if (current.references.length > 0) form.set("references", current.references.join(" "));
        if (current.answer) {
            form.set("answerFolder", current.answer.folder);
            form.set("answerUid", String(current.answer.uid));
        }
        if (forwarding && forwardFiles.length > 0) {
            form.set("forwardAccount", String(source.account.id));
            form.set("forwardFolder", source.message.folder);
            form.set("forwardUid", String(source.message.uid));
            form.set("forwardParts", forwardFiles.map((entry) => entry.index).join(","));
        }
        for (const file of files) form.append("files", file, file.name);

        setBusy(true);
        setError(null);

        try {
            await api("/api/mail/send", { method: "POST", body: form });
            notify("Mail verschickt");
            onSent();
        } catch (failure) {
            setError(messageOf(failure));
        } finally {
            setBusy(false);
        }
    }

    function shortcut(event: KeyboardEvent<HTMLFormElement>): void {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void send();
    }

    const title = source === null ? start.title : REPLY_TITLES[kind];

    return (
        <dialog
            ref={dialogRef}
            className={styles.window}
            aria-labelledby={`${id}-title`}
            // Escape regelt das Fenster selbst. Über cancel ginge es schief: Chrome fasst die per Escape geöffnete
            // Rückfrage mit dem Fenster zu einer Gruppe zusammen und schließt dann mit einem Escape beide. Ein
            // abgefangenes keydown löst gar keine Schließ-Anfrage aus.
            onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                if (discarding) setDiscarding(false);
                else close();
            }}
            // Für andere Schließ-Anfragen (etwa die Zurück-Geste). React reicht cancel und close der Rückfrage bis
            // hierher durch, nur die eigenen zählen.
            onCancel={(event) => {
                if (event.target !== event.currentTarget) return;
                event.preventDefault();
                close();
            }}
            // Chrome schließt nach wiederholtem Escape auch gegen preventDefault. Dann das Fenster wieder öffnen und
            // wie beim Schließen fragen, statt den Entwurf unsichtbar und die Seite gesperrt stehen zu lassen. Die
            // Rückfrage kommt danach neu: Sonst läge das wieder geöffnete Fenster über ihr.
            onClose={(event) => {
                if (event.target !== event.currentTarget || event.currentTarget.open) return;
                event.currentTarget.showModal();
                setDiscarding(false);
                window.setTimeout(close, 0);
            }}
        >
            <form className={styles.windowForm} onSubmit={(event) => void send(event)} onKeyDown={shortcut}>
                <header className={styles.windowHead}>
                    <h2 id={`${id}-title`} className={source === null ? styles.windowTitle : "u-sr"}>
                        {title}
                    </h2>
                    {source !== null && <Segmented name={`${id}-art`} legend="Art der Antwort" options={KIND_OPTIONS} value={kind} onChange={switchKind} />}
                    <button type="button" className={styles.windowClose} onClick={close}>
                        <Icon name="close" />
                        <span className="u-sr">Fenster schließen</span>
                    </button>
                </header>

                <div className={styles.windowPanes}>
                    <Segmented name={`${id}-ansicht`} legend="Ansicht" options={PANES} value={pane} onChange={setPane} />
                </div>

                <div className={styles.windowBody} data-pane={pane}>
                    <div className={styles.windowWrite}>
                        <div className={styles.fields}>
                            <div className={styles.fieldRow}>
                                <label htmlFor={`${id}-from`}>Von</label>
                                <select id={`${id}-from`} value={from ?? ""} onChange={(event) => setFrom(Number(event.target.value))}>
                                    {accounts.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {account.label} · {account.address}
                                        </option>
                                    ))}
                                </select>
                                <span />
                            </div>
                            <div className={styles.fieldRow}>
                                <label htmlFor={`${id}-to`}>An</label>
                                <input id={`${id}-to`} value={to} onChange={(event) => setTo(event.target.value)} placeholder="name@beispiel.de, weitere mit Komma" autoComplete="off" />
                                <div className={styles.toggleLinks}>
                                    {!showCopies && (
                                        <button type="button" onClick={() => setShowCopies(true)}>
                                            Cc/Bcc
                                        </button>
                                    )}
                                </div>
                            </div>
                            {showCopies && (
                                <>
                                    <div className={styles.fieldRow}>
                                        <label htmlFor={`${id}-cc`}>Cc</label>
                                        <input id={`${id}-cc`} value={cc} onChange={(event) => setCc(event.target.value)} autoComplete="off" />
                                        <span />
                                    </div>
                                    <div className={styles.fieldRow}>
                                        <label htmlFor={`${id}-bcc`}>Bcc</label>
                                        <input id={`${id}-bcc`} value={bcc} onChange={(event) => setBcc(event.target.value)} autoComplete="off" />
                                        <span />
                                    </div>
                                </>
                            )}
                            <div className={styles.fieldRow}>
                                <label htmlFor={`${id}-subject`}>Betreff</label>
                                <input id={`${id}-subject`} value={subject} maxLength={MAIL_LIMITS.subject} onChange={(event) => setSubject(event.target.value)} />
                                <span />
                            </div>
                        </div>

                        {editor && (
                            <div>
                                <Toolbar editor={editor} onLink={openLink} onAttach={() => fileInput.current?.click()} />
                                {linkMode !== null && (
                                    <div className={styles.linkBar}>
                                        <input
                                            aria-label={linkMode === "link" ? "Adresse des Links" : "Adresse des Knopfs"}
                                            value={linkValue}
                                            onChange={(event) => setLinkValue(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    applyLink();
                                                }
                                                if (event.key === "Escape") {
                                                    event.stopPropagation();
                                                    setLinkMode(null);
                                                }
                                            }}
                                            autoFocus
                                        />
                                        <Button size="sm" variant="primary" onClick={applyLink}>
                                            {linkMode === "link" ? "Link setzen" : "Knopf setzen"}
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={removeLink}>
                                            Entfernen
                                        </Button>
                                    </div>
                                )}
                                <div className={styles.editor} onClick={() => editor.commands.focus()}>
                                    <EditorContent editor={editor} />
                                </div>
                            </div>
                        )}

                        {source !== null && (
                            <details className={styles.original}>
                                <summary>
                                    ··· Ursprüngliche Mail von {displayName(source.message.from)}, {sentAt(source.message)}
                                </summary>
                                <div className={styles.originalText}>{source.message.text || "(ohne Text)"}</div>
                            </details>
                        )}

                        {forwarding && source.message.attachments.length > 0 && (
                            <fieldset className={styles.forwardFiles}>
                                <legend>Anhänge der ursprünglichen Mail</legend>
                                {source.message.attachments.map((entry) => (
                                    <label key={entry.index} className={styles.check}>
                                        <input
                                            type="checkbox"
                                            checked={forwardParts.includes(entry.index)}
                                            onChange={(event) => setForwardParts(event.target.checked ? [...forwardParts, entry.index] : forwardParts.filter((part) => part !== entry.index))}
                                        />
                                        <span>{entry.filename}</span>
                                        <small>{formatSize(entry.size)}</small>
                                    </label>
                                ))}
                            </fieldset>
                        )}

                        <input ref={fileInput} type="file" multiple hidden onChange={(event) => addFiles(event.target.files)} />

                        {files.length > 0 && (
                            <ul className={styles.files} aria-label="Anhänge">
                                {files.map((file, index) => (
                                    <li key={`${file.name}-${index}`} className={styles.file}>
                                        <Icon name="paperclip" size={16} />
                                        <span>{file.name}</span>
                                        <small>{formatSize(file.size)}</small>
                                        <button type="button" aria-label={`${file.name} entfernen`} onClick={() => setFiles(files.filter((_, other) => other !== index))}>
                                            <Icon name="close" size={16} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {error && (
                            <p className={styles.error} role="alert">
                                {error}
                            </p>
                        )}
                    </div>

                    <MailPreview input={{ from, subject, html: bodyHtml, quote, plain, reply: source !== null && kind !== "forward" }} />
                </div>

                <footer className={styles.windowFoot}>
                    <label className={styles.check}>
                        <input type="checkbox" checked={plain} onChange={(event) => setPlain(event.target.checked)} />
                        Vorlage weglassen
                    </label>
                    <span className={styles.hint}>
                        {count > 0 ? `${count} ${count === 1 ? "Anhang" : "Anhänge"}, ${formatSize(size)} von 20 MB · ` : ""}
                        {plain ? "Nur der Text, ohne Logo und Signatur." : "Mit Logo, deinem Namen, Rang und Avatar."}
                    </span>
                    <Button type="submit" variant="primary" icon="send" busy={busy} disabled={accounts.length === 0}>
                        Senden
                    </Button>
                </footer>
            </form>

            <ConfirmDialog
                open={discarding}
                title="Entwurf verwerfen?"
                confirmLabel="Verwerfen"
                tone="danger"
                onConfirm={() => {
                    setDiscarding(false);
                    onClose();
                }}
                onCancel={() => setDiscarding(false)}
            >
                <p>Was du geschrieben hast, wird nicht gespeichert.</p>
            </ConfirmDialog>
        </dialog>
    );
}
