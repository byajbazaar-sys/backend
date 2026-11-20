const UNITS = [
  'शून्य',
  'एक',
  'दो',
  'तीन',
  'चार',
  'पाँच',
  'छह',
  'सात',
  'आठ',
  'नौ',
  'दस',
  'ग्यारह',
  'बारह',
  'तेरह',
  'चौदह',
  'पंद्रह',
  'सोलह',
  'सत्रह',
  'अठारह',
  'उन्नीस',
  'बीस',
  'इक्कीस',
  'बाईस',
  'तेईस',
  'चौबीस',
  'पच्चीस',
  'छब्बीस',
  'सत्ताईस',
  'अट्ठाईस',
  'उनतीस',
  'तीस',
  'इकतीस',
  'बत्तीस',
  'तैंतीस',
  'चौंतीस',
  'पैंतीस',
  'छत्तीस',
  'सैंतीस',
  'अड़तीस',
  'उनतालीस',
  'चालीस',
  'इकतालीस',
  'बयालीस',
  'तैंतालीस',
  'चवालीस',
  'पैंतालीस',
  'छियालीस',
  'सैंतालीस',
  'अड़तालीस',
  'उनचास',
  'पचास',
  'इक्यावन',
  'बावन',
  'तिरेपन',
  'चौवन',
  'पचपन',
  'छप्पन',
  'सत्तावन',
  'अट्ठावन',
  'उनसठ',
  'साठ',
  'इकसठ',
  'बासठ',
  'तिरेसठ',
  'चौंसठ',
  'पैंसठ',
  'छियासठ',
  'सड़सठ',
  'अड़सठ',
  'उनहत्तर',
  'सत्तर',
  'इकहत्तर',
  'बहत्तर',
  'तिहत्तर',
  'चौहत्तर',
  'पचहत्तर',
  'छिहत्तर',
  'सतहत्तर',
  'अठहत्तर',
  'उनासी',
  'अस्सी',
  'इक्यासी',
  'बयासी',
  'तिरासी',
  'चौरासी',
  'पचासी',
  'छियासी',
  'सत्तासी',
  'अट्ठासी',
  'नवासी',
  'नब्बे',
  'इक्यानवे',
  'बानवे',
  'तिरानवे',
  'चौरानवे',
  'पचानवे',
  'छियानवे',
  'सत्तानवे',
  'अट्ठानवे',
  'निन्यानवे',
];

/** 0-9999 in Hindi words ("बाईस", "एक सौ पाँच"); larger numbers stay as digits. */
export function hindiNumber(n: number): string {
  const value = Math.round(n);
  if (value < 0 || value > 9999) return String(value);
  if (value < 100) return UNITS[value];
  const parts: string[] = [];
  const thousands = Math.floor(value / 1000);
  const hundreds = Math.floor((value % 1000) / 100);
  const rest = value % 100;
  if (thousands) parts.push(`${UNITS[thousands]} हज़ार`);
  if (hundreds) parts.push(`${UNITS[hundreds]} सौ`);
  if (rest) parts.push(UNITS[rest]);
  return parts.join(' ');
}

/**
 * A weight in grams as it is said aloud: "एक ग्राम", "डेढ़ ग्राम", "ढाई ग्राम", "साढ़े चार ग्राम", "सवा तीन ग्राम",
 * "पौने दो ग्राम", otherwise "तीन दशमलव चार दो ग्राम" (`point` = "पॉइंट" for Hinglish).
 */
export function hindiGrams(grams: number, point = 'दशमलव'): string {
  const w = Math.round(grams * 100) / 100;
  const whole = Math.floor(w);
  const frac = Math.round((w - whole) * 100);
  let said: string;
  if (frac === 0) said = hindiNumber(whole);
  else if (frac === 50)
    said = whole === 0 ? 'आधा' : whole === 1 ? 'डेढ़' : whole === 2 ? 'ढाई' : `साढ़े ${hindiNumber(whole)}`;
  else if (frac === 25 && whole >= 1) said = `सवा ${hindiNumber(whole)}`;
  else if (frac === 75) said = whole === 0 ? 'पौन' : `पौने ${hindiNumber(whole + 1)}`;
  else {
    const digits = String(frac).padStart(2, '0').replace(/0$/, '');
    said = `${hindiNumber(whole)} ${point} ${[...digits].map((d) => UNITS[Number(d)]).join(' ')}`;
  }
  return `${said} ग्राम`;
}
