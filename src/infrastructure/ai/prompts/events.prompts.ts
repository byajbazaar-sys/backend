import type { DiscoveredEvent } from '../interfaces/i-events-discovery.service';

export function buildBasicEventsPrompt(state: string): string {
  return `
Find upcoming jewellery events.

Location:
${state}, India

Search:
upcoming jewellery exhibition

Return ONLY JSON.

{
"events":[
{
"name":"",
"startDate":"",
"endDate":"",
"city":"",
"state":"",
"venue":"",
"organizer":"",
"category":"",
"website":"",
"registrationUrl":"",
"sourceUrl":"",
"description":"",
"slug":"",
"visitorEntryFee":"",
"stallFee":"",
"contactEmail":"",
"contactPhone":"",
"tags":[]
}
]
}

Rules:
- Future events only
- Verified events only
- Prefer official sources
- Maximum 8 events
- No markdown
- No explanation
- Unknown values empty
`.trim();
}

export function buildEnrichEventsPrompt(events: DiscoveredEvent[]): string {
  return `
Complete missing details for these jewellery events.

Input JSON:
${JSON.stringify({ events })}

Return ONLY JSON.

{
"events":[
{
"name":"",
"description":"",
"slug":"",
"visitorEntryFee":"",
"stallFee":"",
"contactEmail":"",
"contactPhone":"",
"tags":[]
}
]
}

Rules:
- Do not invent data
- Keep existing event names unchanged
- Empty string if unknown
- Maximum 6 tags
`.trim();
}
