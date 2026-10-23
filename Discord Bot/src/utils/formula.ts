/**
 * Ein winziger Rechner für die eigene Team-Rechnung.
 *
 * Erlaubt sind Zahlen, Platzhalter in geschweiften Klammern, die vier
 * Grundrechenarten, ^, Klammern und eine Handvoll Funktionen. Mehr nicht:
 * die Formel kommt aus dem Dashboard, und `eval` auf fremdem Text wäre eine
 * offene Tür in den Bot.
 *
 * Geparst wird von Hand (rekursiver Abstieg) - das ist weniger Code als jede
 * Bibliothek und tut genau das, was hier gebraucht wird.
 */

export class FormulaError extends Error {}

type Fn = (...args: number[]) => number;

const FUNCTIONS: Record<string, { fn: Fn; args: number }> = {
    sqrt: { fn: (value) => Math.sqrt(Math.max(value, 0)), args: 1 },
    abs: { fn: Math.abs, args: 1 },
    round: { fn: Math.round, args: 1 },
    floor: { fn: Math.floor, args: 1 },
    ceil: { fn: Math.ceil, args: 1 },
    min: { fn: Math.min, args: 2 },
    max: { fn: Math.max, args: 2 },
};

type Token = { kind: "number"; value: number } | { kind: "name"; value: string } | { kind: "key"; value: string } | { kind: "op"; value: string };

function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;

    while (index < input.length) {
        const char = input[index];

        if (/\s/.test(char)) {
            index++;

            continue;
        }

        if (char === "{") {
            const end = input.indexOf("}", index);

            if (end < 0) throw new FormulaError("Eine geschweifte Klammer ist nicht geschlossen.");

            tokens.push({ kind: "key", value: input.slice(index + 1, end).trim() });
            index = end + 1;

            continue;
        }

        if (/[0-9.]/.test(char)) {
            const match = /^[0-9]*\.?[0-9]+/.exec(input.slice(index));

            if (!match) throw new FormulaError(`Das ist keine Zahl: ${input.slice(index, index + 8)}`);

            tokens.push({ kind: "number", value: Number(match[0]) });
            index += match[0].length;

            continue;
        }

        if (/[a-zA-Z]/.test(char)) {
            const match = /^[a-zA-Z]+/.exec(input.slice(index))!;

            tokens.push({ kind: "name", value: match[0].toLowerCase() });
            index += match[0].length;

            continue;
        }

        if ("+-*/^(),".includes(char)) {
            tokens.push({ kind: "op", value: char });
            index++;

            continue;
        }

        throw new FormulaError(`Damit kann ich nichts anfangen: ${char}`);
    }

    return tokens;
}

/**
 * Rechnet die Formel aus. Unbekannte Platzhalter sind ein Fehler - stillschweigend
 * mit 0 weiterzurechnen würde eine falsche Zahl liefern, die niemand bemerkt.
 */
export function Evaluate(formula: string, values: Record<string, number>): number {
    const tokens = tokenize(formula);
    let at = 0;

    const peek = (): Token | undefined => tokens[at];
    const eat = (value: string): boolean => {
        const token = peek();

        if (token?.kind === "op" && token.value === value) {
            at++;

            return true;
        }

        return false;
    };

    function primary(): number {
        const token = peek();

        if (!token) throw new FormulaError("Die Formel hört mitten drin auf.");

        if (token.kind === "op" && token.value === "-") {
            at++;

            return -primary();
        }

        if (token.kind === "op" && token.value === "+") {
            at++;

            return primary();
        }

        if (token.kind === "number") {
            at++;

            return token.value;
        }

        if (token.kind === "key") {
            at++;

            if (!(token.value in values)) throw new FormulaError(`Unbekannter Platzhalter: {${token.value}}`);

            return values[token.value];
        }

        if (token.kind === "name") {
            const entry = FUNCTIONS[token.value];

            if (!entry) throw new FormulaError(`Unbekannte Funktion: ${token.value}`);

            at++;

            if (!eat("(")) throw new FormulaError(`Nach ${token.value} fehlt die Klammer.`);

            const args = [sum()];

            while (eat(",")) args.push(sum());

            if (!eat(")")) throw new FormulaError(`Bei ${token.value} fehlt die schließende Klammer.`);
            if (args.length !== entry.args) throw new FormulaError(`${token.value} braucht ${entry.args} Werte, nicht ${args.length}.`);

            return entry.fn(...args);
        }

        if (eat("(")) {
            const value = sum();

            if (!eat(")")) throw new FormulaError("Eine Klammer ist nicht geschlossen.");

            return value;
        }

        throw new FormulaError("Die Formel geht so nicht auf.");
    }

    function power(): number {
        const base = primary();

        // Rechts-assoziativ: 2^3^2 ist 2^(3^2).
        return eat("^") ? Math.pow(base, power()) : base;
    }

    function product(): number {
        let value = power();

        for (;;) {
            if (eat("*")) value *= power();
            else if (eat("/")) {
                const divisor = power();

                if (divisor === 0) throw new FormulaError("Durch null teilen geht nicht.");

                value /= divisor;
            } else return value;
        }
    }

    function sum(): number {
        let value = product();

        for (;;) {
            if (eat("+")) value += product();
            else if (eat("-")) value -= product();
            else return value;
        }
    }

    const result = sum();

    if (at < tokens.length) throw new FormulaError("Hinter der Formel steht noch etwas.");
    if (!Number.isFinite(result)) throw new FormulaError("Dabei kommt keine Zahl heraus.");

    return result;
}

/** Prüft eine Formel, ohne sie anzuwenden. Gibt den Grund zurück, sonst null. */
export function CheckFormula(formula: string, keys: readonly string[]): string | null {
    const values = Object.fromEntries(keys.map((key) => [key, 1]));

    try {
        Evaluate(formula, values);

        return null;
    } catch (error) {
        return error instanceof FormulaError ? error.message : "Die Formel geht nicht auf.";
    }
}
