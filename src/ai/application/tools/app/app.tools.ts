import { z } from 'zod';

import { actorCan, EAiIntent } from '../../domain';
import { AiReadTool, AiToolContext, AiToolOutcome } from '../ai-tool';

/** Screens the assistant can send the person to (and the module each needs). Anything else is not a destination. */
export const APP_DESTINATIONS = {
  dashboard: { path: '/dashboard', label: 'Dashboard', module: null },
  inventory: { path: '/inventory', label: 'Inventory', module: 'inventory' },
  inventory_add: { path: '/inventory/add', label: 'Add inventory item', module: 'inventory' },
  inventory_categories: { path: '/inventory/categories', label: 'Inventory categories', module: 'inventory' },
  inventory_labels: { path: '/inventory/labels', label: 'Barcode labels', module: 'inventory' },
  inventory_catalog: { path: '/inventory/catalog', label: 'Online catalogue', module: 'catalog' },
  inventory_reports: { path: '/inventory/reports', label: 'Inventory reports', module: 'reports' },
  customers: { path: '/customers', label: 'Customers', module: 'customers' },
  loans: { path: '/loans', label: 'Loans', module: 'loans' },
  dues: { path: '/dues', label: 'Dues', module: 'loans' },
  deposits: { path: '/deposits', label: 'Deposits', module: 'loans' },
  new_deposit: { path: '/deposits/new', label: 'New deposit', module: 'loans' },
  deposit_reports: { path: '/deposits/reports', label: 'Deposit reports', module: 'reports' },
  orders: { path: '/orders', label: 'Orders', module: 'billing' },
  new_order: { path: '/orders/new', label: 'New order', module: 'billing' },
  billing: { path: '/pos', label: 'Billing (POS)', module: 'billing' },
  bills: { path: '/bills', label: 'Bills', module: 'billing' },
  inbox: { path: '/inbox', label: 'Inbox', module: 'whatsapp' },
  marketing: { path: '/marketing', label: 'Marketing', module: 'marketing' },
  try_on: { path: '/try-on', label: 'Magic Try-On', module: 'marketing' },
  metal_rates: { path: '/rates', label: 'Metal rates', module: null },
  rate_calculator: { path: '/item-rate-calculator', label: 'Item rate calculator', module: null },
  team: { path: '/account/team', label: 'Team members', module: 'team' },
  account: { path: '/account', label: 'Account & shop settings', module: null },
  subscription: { path: '/subscription', label: 'Plan & billing', module: null },
} as const satisfies Record<string, { path: string; label: string; module: string | null }>;
type Destination = keyof typeof APP_DESTINATIONS;

const navigateInput = z.strictObject({
  destination: z.enum(Object.keys(APP_DESTINATIONS) as [Destination, ...Destination[]]).describe('The screen to open.'),
});

export function appNavigateTool(): AiReadTool<z.infer<typeof navigateInput>> {
  return {
    action: 'app.navigate',
    intent: EAiIntent.Navigate,
    description:
      'Offer a button that opens a screen of the app (e.g. "open loans", "dues kahan dekhu", "naya loan", "team add karna hai"). Use it for anything you cannot do yourself: customers, loans, payments, deposits, bills, orders, labels, team.',
    input: navigateInput,
    output: z.object({ path: z.string(), label: z.string() }),
    permission: { module: null, level: 'view' },
    confirmation: 'never',

    run(input: z.infer<typeof navigateInput>, ctx: AiToolContext): Promise<AiToolOutcome> {
      const target: { path: string; label: string; module: string | null } = APP_DESTINATIONS[input.destination];
      if (target.module && !actorCan(ctx.actor, target.module, 'view')) {
        return Promise.resolve({ kind: 'rejected', message: 'The person does not have access to that screen.' });
      }
      return Promise.resolve({
        kind: 'result',
        data: { path: target.path, label: target.label },
        card: { type: 'navigation', label: target.label, path: target.path },
      });
    },
  };
}
