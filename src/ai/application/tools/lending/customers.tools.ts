import { z } from 'zod';

import {
  compact,
  customerForModel,
  customerName,
  customerRow,
  normalizePhone,
  paths,
  recordsCard,
} from './lending-shared';
import { EAiIntent } from '../../domain';
import { IAiCustomersGateway } from '../../ports';
import { AiReadTool, AiToolContext, AiToolOutcome, AiWriteTool } from '../ai-tool';
import { titleCase } from '../inventory/inventory-terms';

// ------------------------------------------------------------------ customers.search

const searchInput = z.strictObject({
  text: z.string().min(1).max(80).optional().describe('Name or phone to look for. Leave out to list recent customers.'),
  limit: z.number().int().min(1).max(20).optional().describe('How many to show (default 10).'),
});
type SearchInput = z.infer<typeof searchInput>;

export function customersSearchTool(gateway: IAiCustomersGateway): AiReadTool<SearchInput> {
  return {
    action: 'customers.search',
    intent: EAiIntent.Search,
    description: 'Find customers of this shop by name or phone, or list recent ones.',
    input: searchInput,
    output: z.object({ total: z.number(), customers: z.array(z.object({ id: z.string() }).loose()) }),
    permission: { module: 'customers', level: 'view' },
    confirmation: 'never',

    async run(input: SearchInput, ctx: AiToolContext): Promise<AiToolOutcome> {
      const text = input.text?.trim();
      const { total, items } = await gateway.search(ctx.actor.shopId, normalizePhone(text) ?? text, input.limit ?? 10);
      return {
        kind: 'result',
        data: { total, customers: items.map(customerForModel) },
        card: recordsCard(
          'customer',
          text ? `Customers matching "${text}"` : 'Customers',
          total,
          items.map(customerRow),
          '/customers',
        ),
      };
    },
  };
}

// ------------------------------------------------------------------ customers.create

const createInput = z.strictObject({
  name: z.string().min(1).max(120).optional().describe('Full name as the person said it, e.g. "Ramesh Kumar".'),
  phone: z.string().min(6).max(20).optional().describe('Mobile number.'),
  alternativePhone: z.string().min(6).max(20).optional(),
  location: z.string().min(1).max(120).optional().describe('Village / area / city.'),
  email: z.email().optional(),
});
type CreateInput = z.infer<typeof createInput>;

const createParams = z.strictObject({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  phone: z
    .string()
    .regex(/^\d{10}$/)
    .optional(),
  alternativePhone: z
    .string()
    .regex(/^\d{10}$/)
    .optional(),
  location: z.string().min(1).max(120).optional(),
  email: z.email().optional(),
});
type CreateParams = z.infer<typeof createParams>;

export function customersCreateTool(gateway: IAiCustomersGateway): AiWriteTool<CreateInput, CreateParams> {
  return {
    action: 'customers.create',
    intent: EAiIntent.Create,
    description:
      'Prepare a new customer for the person to confirm (nothing is saved until they tap Confirm). Needs the full ' +
      'name (first name and surname); phone and location are optional but useful.',
    input: createInput,
    parameters: createParams,
    output: z.object({ id: z.string() }),
    permission: { module: 'customers', level: 'edit' },
    confirmation: 'required',

    async prepare(input: CreateInput, ctx: AiToolContext): Promise<AiToolOutcome> {
      const words = (input.name ?? '').trim().split(/\s+/).filter(Boolean).map(titleCase);
      const missing: { field: string; question: string }[] = [];
      if (!words.length) missing.push({ field: 'name', question: "What is the customer's full name?" });
      else if (words.length === 1) missing.push({ field: 'name', question: `What is ${words[0]}'s surname?` });
      if (missing.length) return { kind: 'needs_input', missing, known: compact({ ...input }) };

      const phone = input.phone ? normalizePhone(input.phone) : undefined;
      if (input.phone && !phone) return { kind: 'rejected', message: 'The phone number should be a 10-digit mobile.' };
      const alternativePhone = input.alternativePhone ? normalizePhone(input.alternativePhone) : undefined;
      if (input.alternativePhone && !alternativePhone) {
        return { kind: 'rejected', message: 'The second phone number should be a 10-digit mobile.' };
      }

      const parameters = compact<CreateParams>({
        firstName: words[0],
        lastName: words.slice(1).join(' '),
        phone: phone ?? undefined,
        alternativePhone: alternativePhone ?? undefined,
        location: input.location?.trim(),
        email: input.email?.trim().toLowerCase(),
      });

      // Same phone or same name already in the shop: shown on the preview so nobody is added twice by mistake.
      const warnings: string[] = [];
      const matches = new Map<string, string>();
      for (const probe of [phone, customerName(parameters)].filter(Boolean)) {
        for (const c of (await gateway.search(ctx.actor.shopId, probe, 3)).items) {
          if (
            (phone && normalizePhone(c.phone ?? '') === phone) ||
            customerName(c).toLowerCase() === probe.toLowerCase()
          ) {
            matches.set(c.id, `${customerName(c)}${c.phone ? ` (${c.phone})` : ''}`);
          }
        }
      }
      if (matches.size)
        warnings.push(`Already in your customers: ${[...matches.values()].join(', ')}. Check before saving.`);

      return {
        kind: 'proposal',
        parameters,
        preview: {
          entity: 'customer',
          mode: 'create',
          title: 'New customer',
          summary: `${customerName(parameters)}${parameters.phone ? `, ${parameters.phone}` : ''}`,
          fields: [
            { key: 'name', label: 'Name', value: customerName(parameters) },
            { key: 'phone', label: 'Phone', value: parameters.phone ?? null },
            ...(parameters.alternativePhone
              ? [{ key: 'alternativePhone', label: 'Other phone', value: parameters.alternativePhone }]
              : []),
            { key: 'location', label: 'Location', value: parameters.location ?? null },
            ...(parameters.email ? [{ key: 'email', label: 'Email', value: parameters.email }] : []),
          ],
          warnings,
        },
      };
    },

    async execute(parameters: CreateParams, ctx: AiToolContext) {
      const customer = await gateway.create(ctx.actor.shopId, parameters);
      return {
        summary: `Saved customer ${customerName(customer)}.`,
        data: { id: customer.id },
        card: recordsCard('customer', 'Customer', 1, [{ ...customerRow(customer), path: paths.customer(customer.id) }]),
        entityType: 'customer',
        entityId: customer.id,
      };
    },
  };
}

export const customersTools = (gateway: IAiCustomersGateway) => [
  customersSearchTool(gateway),
  customersCreateTool(gateway),
];
