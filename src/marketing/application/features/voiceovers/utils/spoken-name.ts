/** Devanagari (with spaces and light punctuation) only — what the Hindi voice reads reliably. */
export const isDevanagariName = (value: string): boolean => /^[ऀ-ॿ\s.\-'&]+$/.test(value) && /[ऀ-ॿ]/.test(value);

/** Messages asking the text model how a shop name is said aloud in India, written in Devanagari. */
export function spokenNamePrompt(name: string): { system: string; user: string } {
  return {
    system:
      'You transliterate Indian shop and brand names into Devanagari exactly as people in India pronounce them aloud. ' +
      'Keep English words as they sound (Jewellers → ज्वेलर्स, Gold → गोल्ड, House → हाउस), say initials letter by letter ' +
      '(P.C. → पी सी). Reply with ONLY the Devanagari name.',
    user:
      'Examples: "Shree Balaji Jewellers" → श्री बालाजी ज्वेलर्स; "Tanishq" → तनिष्क; "P.C. Chandra Jewellers" → पी सी चंद्रा ' +
      `ज्वेलर्स; "Kalyan Gold House" → कल्याण गोल्ड हाउस.\nShop name: "${name.replace(/"/g, '')}"`,
  };
}

/** The model's transliteration, cleaned, or null when it is not a plausible Devanagari name. */
export function checkSpokenName(reply: string, name: string): string | null {
  const text = String(reply ?? '')
    .split('\n')[0]
    .replace(/["“”'`*]/g, '')
    .replace(/^.*?(?:→|:)\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || !isDevanagariName(text)) return null;
  if (text.length > Math.max(12, name.length * 2.5)) return null;
  return text;
}
