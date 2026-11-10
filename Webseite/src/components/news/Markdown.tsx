import type { JSX } from "react";
import { Link } from "react-router-dom";
import { type IMdInline, parseMarkdown } from "../../services/markdown";

function Inline({ parts }: { readonly parts: readonly IMdInline[] }): JSX.Element {
    return (
        <>
            {parts.map((part, index) => {
                switch (part.kind) {
                    case "strong":
                        return <strong key={index}>{part.text}</strong>;
                    case "em":
                        return <em key={index}>{part.text}</em>;
                    case "br":
                        return <br key={index} />;
                    case "link":
                        // Eigene Seiten im Router, fremde in neuem Tab. Der Parser lässt nur https:// und /pfad durch.
                        return part.href.startsWith("/") ? (
                            <Link key={index} to={part.href}>
                                {part.text}
                            </Link>
                        ) : (
                            <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">
                                {part.text}
                            </a>
                        );
                    default:
                        return part.text;
                }
            })}
        </>
    );
}

/** W-0062: Markdown-Teilmenge als React-Elemente. Nie HTML aus dem Text. */
export function Markdown({ md, className }: { readonly md: string; readonly className?: string }): JSX.Element {
    return (
        <div className={className}>
            {parseMarkdown(md).map((block, index) => {
                if (block.kind === "p") {
                    return (
                        <p key={index}>
                            <Inline parts={block.inline} />
                        </p>
                    );
                }

                const List = block.kind;

                return (
                    <List key={index}>
                        {block.items.map((item, at) => (
                            <li key={at}>
                                <Inline parts={item} />
                            </li>
                        ))}
                    </List>
                );
            })}
        </div>
    );
}
