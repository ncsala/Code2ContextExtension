/**
 * Escapa los caracteres no ASCII como `[[U+XXXX]]` (código Unicode en hex) para que
 * el texto sobreviva a portapapeles que solo transportan ASCII (p. ej. RDP Windows → Linux).
 * Es reversible: `unescape(escape(texto)) === texto` para cualquier texto.
 */

/** ASCII imprimible + tab/LF/CR: lo único que viaja sin escapar */
const SAFE_CHAR = /^[\t\n\r\x20-\x7E]$/u;
/**
 * Lo que se escapa: todo carácter no seguro y el "[" que iniciaría un `[[U+` literal
 * del texto original (así un token escrito a mano nunca se confunde con uno generado).
 */
const ESCAPE_PATTERN = /[^\t\n\r\x20-\x7E]|\[(?=\[U\+)/gu;
const TOKEN_PATTERN = /\[\[U\+([0-9A-F]{4,6})\]\]/g;
const OPENING_BRACKET = 0x5b;
const MAX_CODE_POINT = 0x10ffff;

export class NonAsciiEscaper {
  escape(text: string): string {
    return text.replace(ESCAPE_PATTERN, (char) => toToken(char.codePointAt(0)!));
  }

  /** Solo decodifica lo que `escape` pudo generar; cualquier otro token queda literal */
  unescape(text: string): string {
    return text.replace(TOKEN_PATTERN, (token, hex: string) => {
      const codePoint = parseInt(hex, 16);
      return isProducibleByEscape(codePoint)
        ? String.fromCodePoint(codePoint)
        : token;
    });
  }
}

function toToken(codePoint: number): string {
  return `[[U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}]]`;
}

function isProducibleByEscape(codePoint: number): boolean {
  if (codePoint > MAX_CODE_POINT) return false;
  return (
    codePoint === OPENING_BRACKET ||
    !SAFE_CHAR.test(String.fromCodePoint(codePoint))
  );
}
