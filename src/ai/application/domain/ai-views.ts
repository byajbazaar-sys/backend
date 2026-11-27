import { EAiActionStatus, EAiIntent } from './ai-enums';

/**
 * Typed response contract of the assistant API. The apps render these as cards — never as HTML — and every value
 * is plain data the server produced or validated.
 */

/** An inventory item as the assistant shows it (a subset of the item: no images, cost prices or internal ids). */
export interface AiInventoryCardItem {
  id?: string;
  sku?: string | null;
  itemName: string;
  metalType: string;
  purity?: string | null;
  grossWeight?: number | null;
  netWeight?: number | null;
  stockQuantity?: number | null;
  sellingPrice?: number | null;
  status?: string | null;
  categoryName?: string | null;
  huid?: string | null;
  size?: string | null;
}

export interface AiPreviewField {
  key: string;
  label: string;
  value: string | number | boolean | null;
}

export interface AiPreviewChange {
  key: string;
  label: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
}

/** What a write action will do, shown before the person confirms it. */
export interface AiActionPreview {
  entity: 'inventory' | 'customer' | 'loan' | 'payment' | 'deposit';
  mode: 'create' | 'update' | 'delete';
  title: string;
  summary: string;
  fields: AiPreviewField[];
  changes?: AiPreviewChange[];
  warnings?: string[];
  /** For inventory previews: the item as it will be saved. */
  item?: AiInventoryCardItem;
}

/** One row of a customers / loans / dues / deposits / payments list. `path` is an in-app link. */
export interface AiRecordRow {
  id: string;
  title: string;
  subtitle?: string | null;
  amount?: number | null;
  amountLabel?: string | null;
  status?: string | null;
  path?: string | null;
}

export type AiRecordEntity = 'customer' | 'loan' | 'due' | 'deposit' | 'payment';

export type AiCard =
  | { type: 'inventory_item'; item: AiInventoryCardItem }
  | { type: 'records'; entity: AiRecordEntity; title: string; total: number; rows: AiRecordRow[]; morePath?: string }
  | {
      type: 'search_results';
      entity: 'inventory';
      title: string;
      total: number;
      items: AiInventoryCardItem[];
    }
  | {
      type: 'report';
      title: string;
      metrics: { key: string; label: string; value: number; format: 'count' | 'currency' | 'weight' }[];
      breakdown?: { label: string; count: number; value?: number }[];
    }
  | { type: 'navigation'; label: string; path: string; description?: string }
  | { type: 'knowledge'; title: string; snippets: { title: string; text: string }[] };

/** A write action as the apps see it: proposed (awaiting confirmation) or already decided. */
export interface AiActionView {
  id: string;
  action: string;
  intent: EAiIntent;
  status: EAiActionStatus;
  preview: AiActionPreview;
  /** Send this back with the confirmation: it binds the approval to this exact payload. */
  payloadHash: string;
  expiresAt: string;
  createdAt: string;
  result?: { summary: string; card?: AiCard } | null;
  error?: string | null;
}

export interface AiChatResponse {
  conversationId: string;
  turnIndex: number;
  intent: EAiIntent;
  message: { text: string };
  cards: AiCard[];
  actions: AiActionView[];
  /** True when this is the stored answer to a retried message (nothing ran twice). */
  replayed: boolean;
}

export interface AiConversationSummaryView {
  id: string;
  title: string | null;
  turnCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface AiConversationTurnView {
  turnIndex: number;
  user: { text: string; createdAt: string };
  assistant: { text: string; intent: EAiIntent; cards: AiCard[]; actions: AiActionView[] } | null;
  events: { text: string; createdAt: string }[];
}

export interface AiConversationView extends AiConversationSummaryView {
  turns: AiConversationTurnView[];
}
