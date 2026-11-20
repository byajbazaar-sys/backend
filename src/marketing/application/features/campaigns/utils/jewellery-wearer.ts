/** Who a piece is made for, when its own name says so; anything else is left to the image analyst (it sees the photo). */
export type JewelleryWearer = 'male' | 'female';

const MALE = /\b(gents?|gent'?s|men'?s?|male|boys?|groom|sherwani)\b/i;
// Words that only women's pieces carry in Indian jewellery, besides the plain ones.
const FEMALE =
  /\b(ladies|lady|women'?s?|female|girls?|bridal|bride|mangalsutra|mangal ?sutra|nath|nose ?(?:ring|pin)|maang ?tikka|tikka|jhumk\w*|payal|anklets?|toe ?rings?|bichhiya|kamarbandh|choker|nosepin)\b/i;

export function jewelleryWearer(...texts: (string | null | undefined)[]): JewelleryWearer | undefined {
  const text = texts.filter(Boolean).join(' ');
  const male = MALE.test(text);
  const female = FEMALE.test(text);
  if (male === female) return undefined; // neither, or both ("couple rings"): the analyst decides from the photo
  return male ? 'male' : 'female';
}
