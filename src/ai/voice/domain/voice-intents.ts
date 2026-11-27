/**
 * Spoken "confirm" / "cancel" for an open preview. Deliberately narrow: short utterances (≤ 6 words) that contain
 * an explicit keyword — a bare "haan" or "yes" is not enough, background chatter must never save anything — and
 * a negation turns "save mat karo" into a cancel. Money previews are never confirmed by voice (see
 * VOICE_CONFIRMABLE_ACTIONS); cancelling by voice is always allowed.
 */

export type VoiceIntent = 'confirm' | 'cancel' | null;

const CONFIRM_WORDS = new Set(['confirm', 'confirmed', 'save', 'कन्फर्म', 'सेव', 'पक्का', 'pakka']);
const CANCEL_WORDS = new Set(['cancel', 'radd', 'रद्द', 'कैंसल', 'discard']);
const NEGATIONS = new Set(['nahi', 'nahin', 'mat', 'not', "don't", 'dont', 'no', 'नहीं', 'मत', 'na']);
const CANCEL_PHRASES = [/\brehne do\b/, /रहने दो/, /\bmat karo\b/, /मत करो/, /\bnahi chahiye\b/, /नहीं चाहिए/];

export function voiceIntentOf(text: string): VoiceIntent {
  const clean = (text ?? '')
    .toLowerCase()
    .replace(/[.,!?।"'“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  const words = clean.split(' ');
  if (words.length > 6) return null;
  if (words.some((w) => CANCEL_WORDS.has(w)) || CANCEL_PHRASES.some((p) => p.test(clean))) return 'cancel';
  if (words.some((w) => CONFIRM_WORDS.has(w))) {
    return words.some((w) => NEGATIONS.has(w)) ? 'cancel' : 'confirm';
  }
  return null;
}
