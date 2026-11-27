import type { AiKnowledgeCollection } from '../../ai.config';

export interface AiSeedDocument {
  collection: AiKnowledgeCollection;
  docKey: string;
  title: string;
  language: 'en' | 'hi' | 'hinglish' | 'mixed';
  tags: string[];
  text: string;
}

/**
 * Shared knowledge every shop gets (scope 'global'): jewellery terms in English / Hindi / Hinglish, trade basics,
 * how the assistant works, and example commands. No shop data ever goes here.
 */
export const SEED_KNOWLEDGE: AiSeedDocument[] = [
  {
    collection: 'bb_product_knowledge',
    docKey: 'glossary-ornaments',
    title: 'Ornament names (Hindi / Hinglish → English)',
    language: 'mixed',
    tags: ['glossary', 'ornaments'],
    text: [
      'Payal (पायल), pajeb, pazeb: anklet, usually silver, worn in pairs. Toda: heavy anklet.',
      'Bichhiya (बिछिया), bichua, bichiya: toe ring, usually silver, worn by married women in pairs.',
      'Kada (कड़ा): thick rigid bangle or bracelet, gold or silver. Kangan, chudi (चूड़ी), choodi: bangle.',
      'Anguthi (अंगूठी), angoothi: finger ring. Chhalla: plain band ring.',
      'Jhumka (झुमका), jhumki: bell-shaped drop earrings. Bali (बाली): hoop earring. Tops, studs: stud earrings. Kaan ki baali: earring.',
      'Nath (नथ), nathni, laung, nose pin: nose ring / nose stud.',
      'Haar (हार): necklace. Rani haar: long necklace. Chain (चेन): chain. Pendant, locket: pendant.',
      'Mangalsutra (मंगलसूत्र): black-bead necklace with a gold pendant, worn by married women.',
      'Maang tikka (मांग टीका): forehead ornament on the hair parting. Kamarbandh, kardhani (करधनी): waist chain.',
      'Bajuband: armlet. Hathphool: hand ornament joining rings to a bracelet.',
    ].join('\n'),
  },
  {
    collection: 'bb_product_knowledge',
    docKey: 'glossary-metals',
    title: 'Metals and stones (Hindi / Hinglish → English)',
    language: 'mixed',
    tags: ['glossary', 'metals'],
    text: [
      'Sona (सोना), gold: GOLD. Chandi (चांदी), chaandi, silver: SILVER. Platinum: PLATINUM.',
      'Heera (हीरा): diamond. Moti (मोती): pearl. Panna: emerald. Manik: ruby. Neelam: blue sapphire. Pukhraj: yellow sapphire.',
      'Kundan, polki, meenakari: traditional gold-setting and enamel styles. Oxidised: blackened silver finish.',
    ].join('\n'),
  },
  {
    collection: 'bb_business_knowledge',
    docKey: 'purity',
    title: 'Purity: karat, fineness and tunch',
    language: 'en',
    tags: ['purity', 'gold', 'silver'],
    text: [
      'Gold purity is written in karat (K) or fineness (parts per thousand): 24K = 999 (99.9%), 22K = 916 (91.6%), 18K = 750 (75%), 14K = 585 (58.5%).',
      'Silver purity: 999 is fine silver; 925 or 92.5 is sterling silver (92.5% silver). In many Indian markets silver ornaments are sold by tunch, the silver percentage, for example 70% or 80% tunch.',
      'Higher purity means more pure metal per gram, so a higher value; jewellery gold is usually 22K or 18K because pure gold is soft.',
    ].join('\n'),
  },
  {
    collection: 'bb_business_knowledge',
    docKey: 'hallmarking',
    title: 'Hallmarking and HUID',
    language: 'en',
    tags: ['hallmark', 'huid', 'bis'],
    text: [
      'In India gold jewellery is hallmarked by BIS (Bureau of Indian Standards). The hallmark shows the BIS logo, the purity (for example 22K916) and a 6-character HUID (Hallmark Unique Identification) code.',
      'The HUID identifies one piece; customers can verify it in the BIS CARE app. Shops record the HUID on the item.',
    ].join('\n'),
  },
  {
    collection: 'bb_business_knowledge',
    docKey: 'weights-and-charges',
    title: 'Weights, making charges and wastage',
    language: 'en',
    tags: ['weight', 'making charges', 'tola'],
    text: [
      'Weights are in grams. 1 tola = 11.664 g; 1 kg = 1000 g. Gross weight is the whole piece including stones; net weight is the metal only (gross minus stone weight).',
      'Making charges are the labour cost: a fixed amount, a percentage of the metal value, per piece, or per gram. Wastage is an extra percentage of metal weight some shops charge.',
      'Girvi is pledging ornaments for a loan; byaj is the interest charged on it.',
      'Making charges in ByajBazaar can be FIXED (rupees for the piece), PERCENT (of the metal value), PER_PC (rupees per piece) or PER_GRAM (rupees per gram).',
    ].join('\n'),
  },
  {
    collection: 'bb_business_knowledge',
    docKey: 'fine-weight-and-price',
    title: 'Fine weight and item price',
    language: 'en',
    tags: ['fine weight', 'rate', 'price', 'calculation'],
    text: [
      'Fine weight (pure metal) = net weight × purity. Example: 10 g of 22K (91.6%) gold has 9.16 g fine gold; 100 g of 70% tunch silver has 70 g fine silver.',
      'Metal value = net weight × the rate per gram for that purity (or fine weight × the 24K / 999 rate). Item price = metal value + making charges + stone value, then GST (3% on jewellery in India, 5% on making charges billed separately as job work).',
      "Today's gold and silver rates are on the Metal rates screen; the Item rate calculator works out a price from weight, purity, rate and making charges.",
    ].join('\n'),
  },
  {
    collection: 'bb_business_knowledge',
    docKey: 'loan-terms',
    title: 'Gold and silver loans (girvi) — common terms',
    language: 'mixed',
    tags: ['loan', 'girvi', 'byaj', 'interest'],
    text: [
      'Girvi (गिरवी): ornaments pledged as security for a loan. The shop keeps the items until the loan is closed.',
      'Byaj (ब्याज): interest. Shops often say the rate per hundred per month: "2 rupaye saikda" = ₹2 per ₹100 per month = 2% a month = 24% a year.',
      "Simple interest is on the principal only; compound interest adds unpaid interest to the principal at each period. Part payments reduce the principal or the interest due, depending on the shop's practice.",
      'Dues are loans with interest or principal outstanding. Closing a loan (chhudana / chudwana) means the customer pays everything and takes the ornaments back. Renewing means paying the interest and starting a new period.',
      "In ByajBazaar loans are made from the customer's page (Customers → the customer → Add loan); the Dues screen lists what is pending and the Loans screen lists all loans.",
    ].join('\n'),
  },
  {
    collection: 'bb_help_documents',
    docKey: 'assistant-basics',
    title: 'How ByajBazaar AI works',
    language: 'en',
    tags: ['help', 'assistant'],
    text: [
      'ByajBazaar AI understands English, Hindi and Hinglish. Ask it to add or update stock, find items, show a stock summary, explain jewellery terms, or open any screen of the app.',
      'When the assistant prepares a change (for example a new item), the app shows a preview card marked "Preview · not saved yet". Nothing is saved until you tap Confirm; Cancel discards it. Typing "yes" or "haan" does not save. A preview expires after 15 minutes; ask again to get a fresh one.',
      'The assistant can only do what your role in the shop allows; staff with view-only access can search but not change stock. If the owner changes your role, the new access applies even to previews made before.',
      'Besides stock, the assistant can find and add customers, show loans and dues, prepare a new loan, record an interest or principal payment, add money to a deposit, and give a business overview. Bills, orders, closing a loan and refunds are done on their screens; the assistant opens the right one. Press Ctrl+K (⌘K on Mac) or the ✨ button on any screen to ask.',
      'Before a payment or deposit is saved, the assistant checks whether the same amount was already recorded recently and warns you; a payment is also refused if the loan changed after the preview (for example someone else recorded it first).',
      'The assistant has a daily message limit per person; the shop owner can see usage. Conversations you do not use for 90 days are deleted, and you can delete one any time.',
    ].join('\n'),
  },
  {
    collection: 'bb_help_documents',
    docKey: 'inventory-help',
    title: 'Adding and updating stock',
    language: 'en',
    tags: ['help', 'inventory'],
    text: [
      'To add an item say its name, metal, weight and purity, for example "Add silver payal 5 gram 70%". Optional: price, quantity, HUID, size, category.',
      'To change an item say which item and what to change, for example "Update payal weight to 7 grams". If several items match, the assistant asks which one.',
      'Every saved item gets a SKU and barcode automatically. Barcode labels are printed from Inventory → Labels.',
      'Status values: AVAILABLE, SOLD, RESERVED, DAMAGED, IN_REPAIR. A sold item stays in the records for reports.',
    ].join('\n'),
  },
  {
    collection: 'bb_help_documents',
    docKey: 'app-screens',
    title: 'Where things are in ByajBazaar',
    language: 'en',
    tags: ['help', 'navigation', 'screens'],
    text: [
      'Dashboard: the day at a glance. Inventory: stock, add item, categories, barcode labels, online catalogue and inventory reports.',
      "Customers: customer records, documents and their loans; a new loan is added from the customer's page. Loans: all loans. Dues: pending interest and principal.",
      'Deposits: customer deposits, new deposit and deposit reports. Billing (POS): make a sale bill. Bills: past bills. Orders: custom orders from customers.',
      "Inbox: WhatsApp messages. Marketing: posters, videos and Magic Try-On. Metal rates: today's gold and silver rates. Item rate calculator: price of a piece.",
      'Account: shop and profile settings; Team: invite members and set their access (owner or managers). Plan & billing: subscription.',
    ].join('\n'),
  },
  {
    collection: 'bb_ai_examples',
    docKey: 'command-examples',
    title: 'Example commands',
    language: 'hinglish',
    tags: ['examples'],
    text: [
      '"Create silver payal 5 gram 70% purity" → prepare a new inventory item: Payal, SILVER, 5 g, 70%.',
      '"Ek chandi ki bichhiya add karo" → new item Bichhiya, SILVER; ask for weight and purity.',
      '"Find my silver inventory" / "chandi ka stock dikhao" → search inventory, metal SILVER.',
      '"Update payal weight to 7 grams" → find the item named Payal, prepare the change gross weight → 7 g.',
      '"Kitna stock hai" / "stock summary" → inventory summary.',
      '"Dues kahan dekhu" → open the Dues screen.',
      '"22K gold ring 4.2 gm 28000 ka" → new item Gold Ring, GOLD, 4.2 g, 22K, selling price ₹28,000.',
      '"चांदी की पायल 25 ग्राम 80 टंच जोड़ो" → new item Payal, SILVER, 25 g, 80%.',
      '"SKU BB1024 ka price 5500 kar do" → find the item by SKU BB1024, prepare the change selling price → ₹5,500.',
      '"sold items dikhao" → search inventory, status SOLD.',
      '"Ramesh ki payal 20 gram girvi 15000 2 rupaye saikda 12 mahine" → prepare a new loan for Ramesh: Payal 20 g, ₹15,000, 2% a month, 12 months.',
      '"Ramesh ne 1500 byaj diya cash" → prepare an interest payment of ₹1,500 (cash) on Ramesh\'s open loan.',
      '"Sunita ke deposit me 5000 UPI jama" → prepare a ₹5,000 UPI deposit for Sunita.',
      '"kiska baaki hai" → list unpaid dues. "total kitna paisa bahar hai" → business overview.',
      '"916 ka matlab?" → explain: 916 = 22K gold, 91.6% pure.',
    ].join('\n'),
  },
];
