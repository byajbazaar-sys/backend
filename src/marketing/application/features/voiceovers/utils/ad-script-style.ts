/**
 * Script languages: English, Hindi (shuddh, Devanagari) and Hinglish — Hindi with everyday English words
 * ("गोल्ड रिंग", "वेट"), also written in Devanagari so the Hindi voice reads it naturally.
 */
export const AD_SCRIPT_STYLES = ['en', 'hi', 'hinglish'] as const;

export type AdScriptStyle = (typeof AD_SCRIPT_STYLES)[number];
