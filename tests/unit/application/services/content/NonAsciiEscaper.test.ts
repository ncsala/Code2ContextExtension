import { NonAsciiEscaper } from "../../../../../src/application/services/content/NonAsciiEscaper";
import { simulateRdpClipboard } from "../../../../helpers/rdpClipboard";

const ASCII_ONLY = /^[\t\n\r\x20-\x7E]*$/;

/** PRNG determinístico (mulberry32) para que el fuzz sea reproducible */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("NonAsciiEscaper", () => {
  const escaper = new NonAsciiEscaper();

  test.each([
    ["accents and ñ", 'const año = "Contraseña inválida";'],
    ["typographic punctuation", "“quotes” — dashes… ‘single’"],
    ["emoji and other scripts", "😀 漢字 Ωmega"],
    ["control chars and BOM", "﻿start\u0000nul\u0007bell"],
    ["text that already looks like a token", "[[U+0041]] [[[U+00E9]] [[U+"],
    ["plain ASCII code", "if (a >= b) { return [x, y]; }\n\tdone();\r\n"],
  ])("round-trips %s exactly and escapes to ASCII only", (_label, text) => {
    const escaped = escaper.escape(text);

    expect(escaped).toMatch(ASCII_ONLY);
    expect(escaper.unescape(escaped)).toBe(text);
  });

  test("leaves plain ASCII untouched", () => {
    const code = "const x = [1, 2]; // ok\n";

    expect(escaper.escape(code)).toBe(code);
  });

  test("escapes using the documented [[U+XXXX]] format", () => {
    expect(escaper.escape("año 😀")).toBe("a[[U+00F1]]o [[U+1F600]]");
  });

  test("only decodes tokens that escape() could have produced", () => {
    // Un salto de línea o un código fuera de rango escrito a mano queda literal
    expect(escaper.unescape("a[[U+000A]]b [[U+110000]]")).toBe(
      "a[[U+000A]]b [[U+110000]]"
    );
  });

  test("round-trips 20,000 adversarial random strings", () => {
    const random = seededRandom(2026);
    const alphabet = ["[", "]", "U", "+", "0", "A", "F", "é", "ñ", "😀", " ", "\n", "\u0000", "﻿"];
    for (let n = 0; n < 20_000; n++) {
      const length = Math.floor(random() * 30);
      const text = Array.from(
        { length },
        () => alphabet[Math.floor(random() * alphabet.length)]
      ).join("");
      expect(escaper.unescape(escaper.escape(text))).toBe(text);
    }
  });

  describe("real RDP clipboard corruption (Windows → Linux)", () => {
    // Casos reales reportados: original → lo que llegó pegado en Linux
    const reportedCases: Array<[string, string]> = [
      ["# Auditoría de columnas", "# Auditor\\Uffffffffde columnas"],
      ["Fecha de revisión: 2026-08-13", "Fecha de revisi\\Uffffffff2026-08-13"],
      ["| Órdenes | `INTSDR.TCV_ORDEN` |", "| \\Uffffffffdenes | `INTSDR.TCV_ORDEN` |"],
      ["- la última inspección de datos", "- la \\Uffffffffa inspecci\\Uffffffffe datos"],
      ["| I - Nº de Anomalía | 1598221 |", "| I - N\\Uffffffff de Anomal\\Uffffffff| 1598221 |"],
    ];

    test.each(reportedCases)("the simulator reproduces: %s", (original, observed) => {
      expect(simulateRdpClipboard(original)).toBe(observed);
    });

    test.each(reportedCases)("escaped text survives the transport: %s", (original) => {
      const transported = simulateRdpClipboard(escaper.escape(original));

      expect(escaper.unescape(transported)).toBe(original);
    });
  });
});
