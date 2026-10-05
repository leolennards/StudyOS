import { describe, expect, it } from "vitest";
import { splitMath } from "./math-text";

describe("splitMath", () => {
  it("finds inline and block maths", () => {
    expect(splitMath("Energy $E = mc^2$ and $$\\int_0^1 x\\,dx$$ done")).toEqual([
      { kind: "text", value: "Energy " },
      { kind: "inline", value: "E = mc^2" },
      { kind: "text", value: " and " },
      { kind: "block", value: "\\int_0^1 x\\,dx" },
      { kind: "text", value: " done" },
    ]);
  });

  it("leaves prices and lone dollar signs as text", () => {
    expect(splitMath("It costs $5 and $10.")).toEqual([{ kind: "text", value: "It costs $5 and $10." }]);
    expect(splitMath("A $ sign")).toEqual([{ kind: "text", value: "A $ sign" }]);
    expect(splitMath("Unclosed $x")).toEqual([{ kind: "text", value: "Unclosed $x" }]);
  });

  it("treats \\$ as a literal dollar", () => {
    expect(splitMath("Pay \\$3 now")).toEqual([{ kind: "text", value: "Pay $3 now" }]);
  });

  it("does not let inline maths run across lines", () => {
    expect(splitMath("$a\nb$")).toEqual([{ kind: "text", value: "$a\nb$" }]);
  });
});
