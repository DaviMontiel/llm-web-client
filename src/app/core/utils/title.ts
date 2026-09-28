/**
 * Genera un título corto a partir del primer mensaje, sin llamar a ningún LLM.
 * Elimina bloques de código, markdown y saludos, y recorta a ~6 palabras.
 */
export function generateLocalTitle(text: string, fallback: string, maxLength = 48): string {
  const cleaned = text
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#>*_~[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(hola|hey|buenas|hello|hi|por favor|please)[,!.\s]+/i, '')
    .trim();
  if (!cleaned) return fallback;
  const firstSentence = cleaned.split(/(?<=[.?!])\s/)[0] ?? cleaned;
  const words = firstSentence.split(' ').slice(0, 8).join(' ');
  let title = words.length > maxLength ? `${words.slice(0, maxLength - 1).trimEnd()}…` : words;
  title = title.replace(/[.,;:]+$/, '');
  return title.charAt(0).toUpperCase() + title.slice(1);
}
