/**
 * Special days and seasons a jewellery shop's Instagram can mention. A caption names one only when the post goes out
 * on it or in the days leading up to it.
 *
 * Lunar festivals move every year: their dates are listed per year below (2027 from hindupad.com and kundligpt.com,
 * which agree). Add the next year's dates before it starts — without them, only fixed-date days, the Sunday-based
 * days and the wedding season are found.
 */
export interface Occasion {
  name: string;
  /** How a jeweller usually speaks about it (passed to the caption model). */
  angle: string;
  kind: 'festival' | 'day' | 'season';
  /** YYYY-MM-DD for days and festivals. */
  date?: string;
}

interface DatedOccasion {
  name: string;
  angle: string;
  kind: 'festival' | 'day';
  /** How many days before it a post may already mention it. */
  leadDays: number;
}

const GOLD_BUYING = 'an auspicious day to buy gold and jewellery';

/** Lunar festivals by year (YYYY-MM-DD). */
const LUNAR: Record<number, (DatedOccasion & { date: string })[]> = {
  2027: [
    {
      date: '2027-01-15',
      name: 'Makar Sankranti',
      angle: 'harvest festival, fresh beginnings',
      kind: 'festival',
      leadDays: 3,
    },
    { date: '2027-01-15', name: 'Pongal', angle: 'harvest festival, prosperity', kind: 'festival', leadDays: 3 },
    {
      date: '2027-02-11',
      name: 'Vasant Panchami',
      angle: 'spring, yellow and gold, new beginnings',
      kind: 'festival',
      leadDays: 3,
    },
    { date: '2027-03-06', name: 'Maha Shivratri', angle: 'devotion and blessings', kind: 'festival', leadDays: 2 },
    { date: '2027-03-22', name: 'Holi', angle: 'festival of colours, celebration', kind: 'festival', leadDays: 5 },
    { date: '2027-04-07', name: 'Gudi Padwa', angle: `new year, ${GOLD_BUYING}`, kind: 'festival', leadDays: 5 },
    { date: '2027-04-07', name: 'Ugadi', angle: `new year, ${GOLD_BUYING}`, kind: 'festival', leadDays: 5 },
    { date: '2027-04-15', name: 'Ram Navami', angle: 'devotion and blessings', kind: 'festival', leadDays: 2 },
    {
      date: '2027-05-09',
      name: 'Akshaya Tritiya',
      angle: 'the most auspicious day of the year to buy gold — wealth that never diminishes',
      kind: 'festival',
      leadDays: 10,
    },
    {
      date: '2027-08-17',
      name: 'Raksha Bandhan',
      angle: 'gifts for sisters, the bond of siblings',
      kind: 'festival',
      leadDays: 7,
    },
    { date: '2027-08-25', name: 'Janmashtami', angle: 'celebration and blessings', kind: 'festival', leadDays: 3 },
    {
      date: '2027-09-04',
      name: 'Ganesh Chaturthi',
      angle: 'auspicious beginnings, blessings of Ganpati',
      kind: 'festival',
      leadDays: 5,
    },
    {
      date: '2027-09-30',
      name: 'Navratri',
      angle: 'nine nights of celebration, festive looks',
      kind: 'festival',
      leadDays: 5,
    },
    { date: '2027-10-09', name: 'Dussehra', angle: `victory of good, ${GOLD_BUYING}`, kind: 'festival', leadDays: 5 },
    {
      date: '2027-10-18',
      name: 'Karwa Chauth',
      angle: 'love and the bond of marriage, gifts for her',
      kind: 'festival',
      leadDays: 7,
    },
    {
      date: '2027-10-27',
      name: 'Dhanteras',
      angle: `the festival of wealth, ${GOLD_BUYING}`,
      kind: 'festival',
      leadDays: 10,
    },
    {
      date: '2027-10-29',
      name: 'Diwali',
      angle: 'festival of lights, prosperity and Lakshmi',
      kind: 'festival',
      leadDays: 7,
    },
    { date: '2027-10-31', name: 'Bhai Dooj', angle: 'gifts for siblings', kind: 'festival', leadDays: 2 },
    {
      date: '2027-11-04',
      name: 'Chhath Puja',
      angle: 'devotion, gratitude and blessings',
      kind: 'festival',
      leadDays: 2,
    },
  ],
};

/** Same date every year: [month (1-12), day]. */
const FIXED: (DatedOccasion & { month: number; day: number })[] = [
  { month: 1, day: 1, name: 'New Year', angle: 'a sparkling new beginning', kind: 'day', leadDays: 3 },
  { month: 1, day: 13, name: 'Lohri', angle: 'harvest festival, celebration', kind: 'festival', leadDays: 2 },
  { month: 1, day: 26, name: 'Republic Day', angle: 'pride and celebration', kind: 'day', leadDays: 1 },
  { month: 2, day: 14, name: "Valentine's Day", angle: 'love, the perfect gift', kind: 'day', leadDays: 7 },
  { month: 3, day: 8, name: "International Women's Day", angle: 'celebrating her', kind: 'day', leadDays: 2 },
  { month: 8, day: 15, name: 'Independence Day', angle: 'pride and celebration', kind: 'day', leadDays: 1 },
  { month: 12, day: 25, name: 'Christmas', angle: 'gifts and celebration', kind: 'day', leadDays: 5 },
  { month: 12, day: 31, name: "New Year's Eve", angle: 'party-ready sparkle', kind: 'day', leadDays: 2 },
];

/** The nth Sunday of a month (1-based). */
function nthSunday(year: number, month: number, n: number): Date {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (7 - first.getUTCDay()) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7));
}

function sundayDays(year: number): (DatedOccasion & { date: string })[] {
  return [
    { date: iso(nthSunday(year, 5, 2)), name: "Mother's Day", angle: 'a gift for mom', kind: 'day', leadDays: 7 },
    {
      date: iso(nthSunday(year, 6, 3)),
      name: "Father's Day",
      angle: 'gifts from the family',
      kind: 'day',
      leadDays: 4,
    },
    { date: iso(nthSunday(year, 8, 1)), name: 'Friendship Day', angle: 'gifts for friends', kind: 'day', leadDays: 3 },
  ];
}

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** The calendar date in India (posts are scheduled in IST). */
function indiaDay(at: Date): Date {
  const ist = new Date(at.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/**
 * Occasions for a post going out at `at`: days that fall on it or within their lead-up (nearest first), then the
 * season. Empty when nothing applies.
 */
export function occasionsFor(at: Date): Occasion[] {
  const day = indiaDay(at);
  const year = day.getUTCFullYear();
  const dated = [year, year + 1].flatMap((y) => [
    ...(LUNAR[y] ?? []),
    ...sundayDays(y),
    ...FIXED.map((f) => ({ ...f, date: `${y}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}` })),
  ]);

  const upcoming = dated
    .map((o) => ({ o, daysAway: Math.round((Date.parse(`${o.date}T00:00:00Z`) - day.getTime()) / 86_400_000) }))
    .filter(({ o, daysAway }) => daysAway >= 0 && daysAway <= o.leadDays)
    .sort((a, b) => a.daysAway - b.daysAway || (a.o.kind === 'festival' ? -1 : 1));

  const found: Occasion[] = upcoming.map(({ o, daysAway }) => ({
    name: o.name,
    angle: daysAway === 0 ? `today — ${o.angle}` : `in ${daysAway} day${daysAway === 1 ? '' : 's'} — ${o.angle}`,
    kind: o.kind,
    date: o.date,
  }));

  // Wedding season: the winter muhurats (mid-November to February).
  const month = day.getUTCMonth() + 1;
  if (month === 12 || month === 1 || month === 2 || (month === 11 && day.getUTCDate() >= 15)) {
    found.push({
      name: 'Wedding season',
      angle: 'shaadi season — bridal and wedding-guest jewellery',
      kind: 'season',
    });
  }
  return found;
}
