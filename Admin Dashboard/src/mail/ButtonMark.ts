import { Mark, mergeAttributes } from "@tiptap/react";

declare module "@tiptap/react" {
    interface Commands<ReturnType> {
        mailButton: {
            /** Den markierten Text zum Knopf mit dieser Adresse machen. */
            setMailButton: (href: string) => ReturnType;
            unsetMailButton: () => ReturnType;
        };
    }
}

/**
 * „Knopf“: ein Link, der in der Mail als roter Knopf erscheint.
 *
 * Im HTML ein `<a data-button>`. Der Server prüft das Attribut und gibt dem
 * Link in der Vorlage den Stil des Knopfs (server/mail/compose.ts). Vor dem
 * gewöhnlichen Link geprüft, damit ein Knopf nicht als Link zurückkommt.
 */
export const MailButton = Mark.create({
    name: "mailButton",
    priority: 1100,
    inclusive: false,
    excludes: "link",

    addAttributes() {
        return { href: { default: null } };
    },

    parseHTML() {
        return [{ tag: "a[data-button]", getAttrs: (element) => ({ href: element.getAttribute("href") }) }];
    },

    renderHTML({ HTMLAttributes }) {
        return ["a", mergeAttributes(HTMLAttributes, { "data-button": "1" }), 0];
    },

    addCommands() {
        return {
            setMailButton:
                (href) =>
                ({ commands }) =>
                    commands.setMark(this.name, { href }),
            unsetMailButton:
                () =>
                ({ commands }) =>
                    commands.unsetMark(this.name, { extendEmptyMarkRange: true }),
        };
    },
});
