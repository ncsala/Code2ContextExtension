/**
 * Simula el portapapeles RDP Windows → Linux observado en la práctica:
 * Windows entrega el texto como bytes Windows-1252 y el lado Linux los decodifica
 * como UTF-8 de forma permisiva. Cada byte >= 0x80 se toma como inicio de secuencia,
 * se "come" los bytes que su prefijo indica (sean ASCII o no) y se escribe el literal
 * "\Uffffffff". Reproduce exactamente las corrupciones reales reportadas.
 */
export function simulateRdpClipboard(text: string): string {
  const bytes = Buffer.from(text, "latin1");
  let output = "";
  for (let i = 0; i < bytes.length; ) {
    if (bytes[i] < 0x80) {
      output += String.fromCharCode(bytes[i]);
      i++;
    } else {
      output += "\\Uffffffff";
      i += utf8SequenceLength(bytes[i]);
    }
  }
  return output;
}

function utf8SequenceLength(leadByte: number): number {
  if (leadByte >= 0xfc) return 6;
  if (leadByte >= 0xf8) return 5;
  if (leadByte >= 0xf0) return 4;
  if (leadByte >= 0xe0) return 3;
  if (leadByte >= 0xc0) return 2;
  return 1;
}
