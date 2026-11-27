import { z } from 'zod';

import {
  ITEM_STATUSES,
  MAKING_CHARGE_MODES,
  MAX_ITEM_WEIGHT_GRAMS,
  METAL_TYPES,
  METALS_WITH_PURITY,
  normalizePurity,
  roundGrams,
  titleCase,
} from './inventory-terms';
import { AiBusinessError, AiInventoryCardItem, AiPreviewChange, AiPreviewField, EAiIntent } from '../../domain';
import { AiInventoryItem, AiInventoryWriteInput, IAiInventoryGateway } from '../../ports';
import { AiReadTool, AiToolContext, AiToolOutcome, AiWriteTool } from '../ai-tool';

const grams = (what: string) =>
  z
    .number()
    .positive()
    .max(MAX_ITEM_WEIGHT_GRAMS)
    .describe(`${what} in grams. Convert other units first: 1 tola = 11.664 g, 1 kg = 1000 g, 1 mg = 0.001 g.`);
const rupees = (what: string) => z.number().min(0).max(1_000_000_000).describe(`${what} in rupees (₹).`);
const purityText = z
  .string()
  .min(1)
  .max(20)
  .describe('Purity as the shop says it: "22K", "18K", "916" for gold; "70%" (tunch), "92.5", "999" for silver.');

// ------------------------------------------------------------------ shared shapes

const cardItem = z.object({
  id: z.string().optional(),
  sku: z.string().nullable().optional(),
  itemName: z.string(),
  metalType: z.string(),
  purity: z.string().nullable().optional(),
  grossWeight: z.number().nullable().optional(),
  netWeight: z.number().nullable().optional(),
  stockQuantity: z.number().nullable().optional(),
  sellingPrice: z.number().nullable().optional(),
  status: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  huid: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
});

/** What the model and the app get to see of an item: no images, cost prices, supplier or internal ids. */
export function toCardItem(item: AiInventoryItem): AiInventoryCardItem {
  return {
    id: item.id,
    sku: item.sku ?? null,
    itemName: item.itemName,
    metalType: item.metalType,
    purity: item.purity ?? null,
    grossWeight: numberOrNull(item.grossWeight),
    netWeight: numberOrNull(item.netWeight),
    stockQuantity: numberOrNull(item.stockQuantity),
    sellingPrice: numberOrNull(item.sellingPrice),
    status: item.status ?? null,
    categoryName: item.categoryName ?? null,
    huid: item.huid ?? null,
    size: item.size ?? null,
  };
}

const numberOrNull = (value: unknown): number | null =>
  value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

const LABELS: Record<string, string> = {
  itemName: 'Name',
  metalType: 'Metal',
  purity: 'Purity',
  grossWeight: 'Gross weight (g)',
  netWeight: 'Net weight (g)',
  stoneWeight: 'Stone weight (g)',
  stockQuantity: 'Quantity',
  sellingPrice: 'Selling price (₹)',
  purchasePrice: 'Purchase price (₹)',
  makingCharges: 'Making charges',
  makingChargeMode: 'Making charge type',
  categoryName: 'Category',
  huid: 'HUID',
  size: 'Size',
  hallmarked: 'Hallmarked',
  description: 'Description',
  supplierName: 'Supplier',
  location: 'Location',
  status: 'Status',
};

function previewFields(values: Record<string, unknown>): AiPreviewField[] {
  return Object.keys(LABELS)
    .filter((key) => values[key] !== undefined && values[key] !== null && values[key] !== '')
    .map((key) => ({ key, label: LABELS[key], value: values[key] as string | number | boolean }));
}

function describeItem(item: {
  itemName?: string;
  metalType?: string;
  purity?: string | null;
  grossWeight?: number | null;
}): string {
  const metal = item.metalType ? item.metalType.charAt(0) + item.metalType.slice(1).toLowerCase() : '';
  const name = [metal, item.itemName].filter(Boolean).join(' ');
  return [name, item.grossWeight ? `${item.grossWeight} g` : null, item.purity].filter(Boolean).join(', ');
}

const compact = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;

async function resolveCategory(
  gateway: IAiInventoryGateway,
  shopId: string,
  name: string | undefined,
): Promise<{ id?: string; name?: string; warning?: string }> {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return {};
  const categories = await gateway.listCategories(shopId);
  const match =
    categories.find((c) => c.name.trim().toLowerCase() === wanted) ??
    categories.find((c) => c.name.trim().toLowerCase().replace(/s$/, '') === wanted.replace(/s$/, ''));
  if (match) return { id: match.id, name: match.name };
  return { warning: `There is no category "${name.trim()}", so the item will be saved without a category.` };
}

// ------------------------------------------------------------------ inventory.create

const createInput = z.strictObject({
  itemName: z
    .string()
    .min(1)
    .max(120)
    .describe('Item name as the shop calls it, e.g. "Payal", "Bichhiya", "Kada", "Gold Ring". Keep Hindi names.'),
  metalType: z.enum(METAL_TYPES).optional().describe('Metal. chandi/silver = SILVER, sona/gold = GOLD.'),
  purity: purityText.optional(),
  grossWeight: grams('Gross weight').optional(),
  netWeight: grams('Net weight').optional(),
  stoneWeight: grams('Stone weight').optional(),
  stockQuantity: z.number().int().min(1).max(10_000).optional().describe('Pieces in stock (default 1).'),
  sellingPrice: rupees('Selling price').optional(),
  purchasePrice: rupees('Purchase price').optional(),
  makingCharges: z
    .number()
    .min(0)
    .max(10_000_000)
    .optional()
    .describe('Making charges: rupees, or a percent when makingChargeMode is PERCENT.'),
  makingChargeMode: z.enum(MAKING_CHARGE_MODES).optional(),
  categoryName: z.string().min(1).max(80).optional().describe('Category name — only if the person named one.'),
  huid: z.string().min(1).max(50).optional().describe('Hallmark Unique ID.'),
  size: z.string().min(1).max(30).optional().describe('e.g. ring size 16, bangle 2.6, chain 18 inch.'),
  hallmarked: z.boolean().optional(),
  description: z.string().min(1).max(500).optional(),
  supplierName: z.string().min(1).max(120).optional(),
});
type CreateInput = z.infer<typeof createInput>;

const createParams = z.strictObject({
  itemName: z.string().min(1).max(255),
  metalType: z.enum(METAL_TYPES),
  purity: z.string().min(1).max(20).optional(),
  grossWeight: z.number().positive().max(MAX_ITEM_WEIGHT_GRAMS).optional(),
  netWeight: z.number().positive().max(MAX_ITEM_WEIGHT_GRAMS).optional(),
  stoneWeight: z.number().positive().max(MAX_ITEM_WEIGHT_GRAMS).optional(),
  stockQuantity: z.number().int().min(1).max(10_000),
  sellingPrice: z.number().min(0).optional(),
  purchasePrice: z.number().min(0).optional(),
  makingCharges: z.number().min(0).optional(),
  makingChargeMode: z.enum(MAKING_CHARGE_MODES).optional(),
  categoryId: z.uuid().optional(),
  huid: z.string().min(1).max(50).optional(),
  size: z.string().min(1).max(30).optional(),
  hallmarked: z.boolean().optional(),
  description: z.string().min(1).max(500).optional(),
  supplierName: z.string().min(1).max(255).optional(),
});
type CreateParams = z.infer<typeof createParams>;

export function inventoryCreateTool(gateway: IAiInventoryGateway): AiWriteTool<CreateInput, CreateParams> {
  return {
    action: 'inventory.create',
    intent: EAiIntent.Create,
    description:
      'Prepare a new inventory (stock) item for the person to confirm. Nothing is saved until they tap Confirm in the ' +
      'app. Needs the item name, metal, weight and — for gold, silver and platinum — purity; leave a field out if ' +
      'the person did not say it (the tool reports what is missing).',
    input: createInput,
    parameters: createParams,
    output: z.object({ id: z.string(), sku: z.string().nullable().optional() }),
    permission: { module: 'inventory', level: 'edit' },
    confirmation: 'required',

    async prepare(input: CreateInput, ctx: AiToolContext): Promise<AiToolOutcome> {
      const purity = normalizePurity(input.purity);
      const missing: { field: string; question: string }[] = [];
      if (!input.metalType)
        missing.push({ field: 'metalType', question: 'Which metal is it — gold, silver or another?' });
      if (input.grossWeight === undefined && input.netWeight === undefined) {
        missing.push({ field: 'grossWeight', question: 'What does it weigh, in grams?' });
      }
      if (!purity && input.metalType && METALS_WITH_PURITY.has(input.metalType)) {
        missing.push({
          field: 'purity',
          question: input.metalType === 'GOLD' ? 'What purity — 22K, 18K…?' : 'What purity (tunch) — e.g. 70%, 92.5?',
        });
      }
      if (missing.length) return { kind: 'needs_input', missing, known: compact({ ...input, purity }) };
      if (input.netWeight !== undefined && input.grossWeight !== undefined && input.netWeight > input.grossWeight) {
        return { kind: 'rejected', message: 'The net weight cannot be more than the gross weight.' };
      }

      const category = await resolveCategory(gateway, ctx.actor.shopId, input.categoryName);
      const parameters = compact<CreateParams>({
        itemName: titleCase(input.itemName),
        metalType: input.metalType,
        purity,
        grossWeight: input.grossWeight !== undefined ? roundGrams(input.grossWeight) : undefined,
        netWeight: input.netWeight !== undefined ? roundGrams(input.netWeight) : undefined,
        stoneWeight: input.stoneWeight !== undefined ? roundGrams(input.stoneWeight) : undefined,
        stockQuantity: input.stockQuantity ?? 1,
        sellingPrice: input.sellingPrice,
        purchasePrice: input.purchasePrice,
        makingCharges: input.makingCharges,
        makingChargeMode: input.makingChargeMode,
        categoryId: category.id,
        huid: input.huid?.trim().toUpperCase(),
        size: input.size?.trim(),
        hallmarked: input.hallmarked,
        description: input.description?.trim(),
        supplierName: input.supplierName?.trim(),
      });
      const shown = { ...parameters, categoryName: category.name };
      return {
        kind: 'proposal',
        parameters,
        preview: {
          entity: 'inventory',
          mode: 'create',
          title: 'New inventory item',
          summary: describeItem(parameters),
          fields: previewFields(shown),
          warnings: category.warning ? [category.warning] : [],
          item: {
            itemName: parameters.itemName,
            metalType: parameters.metalType,
            purity: parameters.purity ?? null,
            grossWeight: parameters.grossWeight ?? null,
            netWeight: parameters.netWeight ?? null,
            stockQuantity: parameters.stockQuantity,
            sellingPrice: parameters.sellingPrice ?? null,
            categoryName: category.name ?? null,
            huid: parameters.huid ?? null,
            size: parameters.size ?? null,
          },
        },
      };
    },

    async execute(parameters: CreateParams, ctx: AiToolContext) {
      const item = await gateway.create(ctx.actor.shopId, parameters as AiInventoryWriteInput);
      return {
        summary: `Saved ${describeItem(item)}${item.sku ? ` (SKU ${item.sku})` : ''}.`,
        data: { id: item.id, sku: item.sku ?? null },
        card: { type: 'inventory_item', item: toCardItem(item) },
        entityType: 'inventory_item',
        entityId: item.id,
      };
    },
  };
}

// ------------------------------------------------------------------ inventory.update

const UPDATABLE = [
  'itemName',
  'purity',
  'grossWeight',
  'netWeight',
  'stockQuantity',
  'sellingPrice',
  'status',
  'huid',
  'size',
  'location',
  'hallmarked',
] as const;
type Updatable = (typeof UPDATABLE)[number];

const changesShape = z.strictObject({
  itemName: z.string().min(1).max(120).optional(),
  purity: purityText.optional(),
  grossWeight: grams('New gross weight').optional(),
  netWeight: grams('New net weight').optional(),
  stockQuantity: z.number().int().min(0).max(10_000).optional(),
  sellingPrice: rupees('New selling price').optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  huid: z.string().min(1).max(50).optional(),
  size: z.string().min(1).max(30).optional(),
  location: z.string().min(1).max(120).optional(),
  hallmarked: z.boolean().optional(),
});

const updateInput = z.strictObject({
  itemId: z.uuid().optional().describe('The item id, when it came from an earlier result in this conversation.'),
  sku: z.string().min(1).max(30).optional().describe('The SKU / barcode, when the person gave it.'),
  itemName: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe('Words to find the item by (its name), when there is no id or SKU.'),
  metalType: z.enum(METAL_TYPES).optional().describe('Narrows the search by name.'),
  changes: changesShape.describe('Only the fields to change, with their new values.'),
});
type UpdateInput = z.infer<typeof updateInput>;

type Scalar = string | number | boolean | null;
const updateParams = z.strictObject({
  itemId: z.uuid(),
  changes: changesShape.extend({ purity: z.string().min(1).max(20).optional() }),
  /** Values at preview time: the update is refused if the item changed meanwhile. */
  expected: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
type UpdateParams = z.infer<typeof updateParams>;

function normalizeChanges(changes: UpdateInput['changes']): Partial<Record<Updatable, Scalar>> {
  const out: Partial<Record<Updatable, Scalar>> = {};
  for (const key of UPDATABLE) {
    const value = changes[key];
    if (value === undefined) continue;
    if (key === 'purity') {
      const purity = normalizePurity(value as string);
      if (purity) out.purity = purity;
    } else if (key === 'itemName') out.itemName = titleCase(value as string);
    else if (key === 'grossWeight' || key === 'netWeight') out[key] = roundGrams(value as number);
    else if (key === 'huid') out.huid = (value as string).trim().toUpperCase();
    else out[key] = typeof value === 'string' ? value.trim() : (value as Scalar);
  }
  return out;
}

const currentValue = (item: AiInventoryItem, key: Updatable): Scalar => {
  const value = (item as unknown as Record<string, unknown>)[key];
  if (value === undefined || value === null || value === '') return null;
  if (key === 'grossWeight' || key === 'netWeight' || key === 'stockQuantity' || key === 'sellingPrice') {
    return numberOrNull(value);
  }
  return value as Scalar;
};

async function findTarget(
  gateway: IAiInventoryGateway,
  shopId: string,
  input: Pick<UpdateInput, 'itemId' | 'sku' | 'itemName' | 'metalType'>,
): Promise<AiInventoryItem[] | null> {
  if (input.itemId) {
    const item = await gateway.get(shopId, input.itemId);
    return item ? [item] : [];
  }
  if (input.sku) {
    const { items } = await gateway.search(shopId, { search: input.sku, limit: 5 });
    return items.filter((i) => i.sku?.toLowerCase() === input.sku.trim().toLowerCase());
  }
  if (input.itemName) {
    const { items } = await gateway.search(shopId, { search: input.itemName, metalType: input.metalType, limit: 6 });
    return items;
  }
  return null;
}

export function inventoryUpdateTool(gateway: IAiInventoryGateway): AiWriteTool<UpdateInput, UpdateParams> {
  return {
    action: 'inventory.update',
    intent: EAiIntent.Update,
    description:
      'Prepare a change to one existing inventory item for the person to confirm (nothing changes until they tap ' +
      'Confirm). Identify the item by itemId (from an earlier result), SKU, or name; if several items match, the ' +
      'tool returns them so you can ask which one.',
    input: updateInput,
    parameters: updateParams,
    output: z.object({ id: z.string(), sku: z.string().nullable().optional() }),
    permission: { module: 'inventory', level: 'edit' },
    confirmation: 'required',

    async prepare(input: UpdateInput, ctx: AiToolContext): Promise<AiToolOutcome> {
      const changes = normalizeChanges(input.changes ?? {});
      if (!Object.keys(changes).length) {
        return {
          kind: 'needs_input',
          missing: [{ field: 'changes', question: 'What should I change on it?' }],
          known: {},
        };
      }
      const matches = await findTarget(gateway, ctx.actor.shopId, input);
      if (matches === null) {
        return {
          kind: 'needs_input',
          missing: [{ field: 'item', question: 'Which item should I change? Tell me its name or SKU.' }],
          known: { changes },
        };
      }
      if (!matches.length) {
        return { kind: 'rejected', message: 'No item in this shop matches that. Check the name or SKU.' };
      }
      if (matches.length > 1) {
        const items = matches.map(toCardItem);
        return {
          kind: 'ambiguous',
          message: `${matches.length} items match. Ask which one (by SKU or weight).`,
          candidates: items.map((i) => ({
            id: i.id,
            sku: i.sku,
            itemName: i.itemName,
            grossWeight: i.grossWeight,
            purity: i.purity,
          })),
          card: { type: 'search_results', entity: 'inventory', title: 'Which item?', total: items.length, items },
        };
      }

      const item = matches[0];
      const diff: AiPreviewChange[] = [];
      const effective: Partial<Record<Updatable, Scalar>> = {};
      const expected: Record<string, Scalar> = {};
      for (const [key, to] of Object.entries(changes) as [Updatable, Scalar][]) {
        const from = currentValue(item, key);
        if (from === to) continue;
        diff.push({ key, label: LABELS[key] ?? key, from, to });
        effective[key] = to;
        expected[key] = from;
      }
      if (!diff.length) return { kind: 'rejected', message: 'The item already has those values; nothing to change.' };
      const gross = (effective.grossWeight ?? currentValue(item, 'grossWeight')) as number | null;
      const net = (effective.netWeight ?? currentValue(item, 'netWeight')) as number | null;
      if (gross !== null && net !== null && net > gross) {
        return { kind: 'rejected', message: 'The net weight cannot be more than the gross weight.' };
      }

      const after = { ...toCardItem(item), ...effective } as AiInventoryCardItem;
      return {
        kind: 'proposal',
        parameters: { itemId: item.id, changes: effective, expected },
        preview: {
          entity: 'inventory',
          mode: 'update',
          title: `Update ${item.itemName}${item.sku ? ` (${item.sku})` : ''}`,
          summary: diff.map((d) => `${d.label}: ${d.from ?? '—'} → ${d.to ?? '—'}`).join('; '),
          fields: previewFields({
            itemName: after.itemName,
            metalType: after.metalType,
            purity: after.purity,
            grossWeight: after.grossWeight,
          }),
          changes: diff,
          item: after,
        },
      };
    },

    async execute(parameters: UpdateParams, ctx: AiToolContext) {
      const current = await gateway.get(ctx.actor.shopId, parameters.itemId);
      if (!current) throw new AiBusinessError('This item no longer exists.', 'NOT_FOUND');
      for (const [key, value] of Object.entries(parameters.expected)) {
        if (currentValue(current, key as Updatable) !== value) {
          throw new AiBusinessError(
            'The item changed after the preview. Ask again to see its latest values.',
            'CONFLICT',
          );
        }
      }
      const item = await gateway.update(
        ctx.actor.shopId,
        parameters.itemId,
        parameters.changes as AiInventoryWriteInput,
      );
      return {
        summary: `Updated ${item.itemName}${item.sku ? ` (SKU ${item.sku})` : ''}.`,
        data: { id: item.id, sku: item.sku ?? null },
        card: { type: 'inventory_item', item: toCardItem(item) },
        entityType: 'inventory_item',
        entityId: item.id,
      };
    },
  };
}

// ------------------------------------------------------------------ reads

const searchInput = z.strictObject({
  text: z.string().min(1).max(80).optional().describe('Words to match in the name, SKU or description.'),
  metalType: z.enum(METAL_TYPES).optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  purity: purityText.optional(),
  minWeight: grams('Minimum gross weight').optional(),
  maxWeight: grams('Maximum gross weight').optional(),
  categoryName: z.string().min(1).max(80).optional(),
  limit: z.number().int().min(1).max(20).optional().describe('How many items to show (default 10).'),
});
type SearchInput = z.infer<typeof searchInput>;

const searchOutput = z.object({ total: z.number(), shown: z.number(), items: z.array(cardItem) });

export function inventorySearchTool(gateway: IAiInventoryGateway): AiReadTool<SearchInput> {
  return {
    action: 'inventory.search',
    intent: EAiIntent.Search,
    description:
      "Search the shop's inventory (stock) by name, metal, purity, weight range, status or category. Returns the " +
      'matching count and up to 20 items.',
    input: searchInput,
    output: searchOutput,
    permission: { module: 'inventory', level: 'view' },
    confirmation: 'never',
    auditReads: true,

    async run(input: SearchInput, ctx: AiToolContext): Promise<AiToolOutcome> {
      const category = await resolveCategory(gateway, ctx.actor.shopId, input.categoryName);
      if (input.categoryName && !category.id) return { kind: 'rejected', message: category.warning };
      const limit = input.limit ?? 10;
      const { total, items } = await gateway.search(ctx.actor.shopId, {
        search: input.text,
        metalType: input.metalType,
        status: input.status,
        purity: normalizePurity(input.purity),
        minWeight: input.minWeight,
        maxWeight: input.maxWeight,
        categoryId: category.id,
        limit,
      });
      const cards = items.slice(0, limit).map(toCardItem);
      const title = [input.metalType && titleCase(input.metalType.toLowerCase()), input.text, 'inventory']
        .filter(Boolean)
        .join(' ');
      return {
        kind: 'result',
        data: { total, shown: cards.length, items: cards },
        card: { type: 'search_results', entity: 'inventory', title: titleCase(title), total, items: cards },
      };
    },
  };
}

const getInput = z.strictObject({
  itemId: z.uuid().optional().describe('Item id from an earlier result.'),
  sku: z.string().min(1).max(30).optional().describe('SKU / barcode.'),
});
type GetInput = z.infer<typeof getInput>;

export function inventoryGetTool(gateway: IAiInventoryGateway): AiReadTool<GetInput> {
  return {
    action: 'inventory.get',
    intent: EAiIntent.Query,
    description: 'Get one inventory item by its id (from an earlier result) or its SKU.',
    input: getInput,
    output: cardItem,
    permission: { module: 'inventory', level: 'view' },
    confirmation: 'never',
    auditReads: true,

    async run(input: GetInput, ctx: AiToolContext): Promise<AiToolOutcome> {
      if (!input.itemId && !input.sku)
        return { kind: 'needs_input', missing: [{ field: 'sku', question: 'Which item (SKU)?' }], known: {} };
      const matches = await findTarget(gateway, ctx.actor.shopId, input);
      if (!matches?.length) return { kind: 'rejected', message: 'No item in this shop has that id or SKU.' };
      const item = toCardItem(matches[0]);
      return { kind: 'result', data: item, card: { type: 'inventory_item', item } };
    },
  };
}

const summaryOutput = z.object({
  totalItems: z.number(),
  availableItems: z.number(),
  soldItems: z.number(),
  totalValuation: z.number(),
  categories: z.array(z.object({ name: z.string(), count: z.number(), value: z.number() })),
});

export function inventorySummaryTool(gateway: IAiInventoryGateway): AiReadTool<Record<string, never>> {
  return {
    action: 'inventory.summary',
    intent: EAiIntent.Report,
    description: 'Stock overview: number of items (total, available, sold), total valuation and the split by category.',
    input: z.strictObject({}),
    output: summaryOutput,
    permission: { module: 'inventory', level: 'view' },
    confirmation: 'never',
    auditReads: true,

    async run(_input: Record<string, never>, ctx: AiToolContext): Promise<AiToolOutcome> {
      const summary = await gateway.summary(ctx.actor.shopId);
      const categories = summary.categories.slice(0, 12);
      return {
        kind: 'result',
        data: { ...summary, categories },
        card: {
          type: 'report',
          title: 'Inventory summary',
          metrics: [
            { key: 'totalItems', label: 'Items', value: summary.totalItems, format: 'count' },
            { key: 'availableItems', label: 'Available', value: summary.availableItems, format: 'count' },
            { key: 'soldItems', label: 'Sold', value: summary.soldItems, format: 'count' },
            { key: 'totalValuation', label: 'Valuation', value: summary.totalValuation, format: 'currency' },
          ],
          breakdown: categories.map((c) => ({ label: c.name, count: c.count, value: c.value })),
        },
      };
    },
  };
}

export const inventoryTools = (gateway: IAiInventoryGateway) => [
  inventoryCreateTool(gateway),
  inventoryUpdateTool(gateway),
  inventorySearchTool(gateway),
  inventoryGetTool(gateway),
  inventorySummaryTool(gateway),
];
