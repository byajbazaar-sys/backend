import { z } from 'zod';

import type { AiKnowledgeCollection } from '../../../ai.config';
import { EAiIntent } from '../../domain';
import type { AiKnowledgeService } from '../../services/ai-knowledge.service';
import { AiReadTool, AiToolContext, AiToolOutcome } from '../ai-tool';

const TOPICS: Record<string, AiKnowledgeCollection[]> = {
  product: ['bb_product_knowledge'],
  business: ['bb_business_knowledge'],
  help: ['bb_help_documents', 'bb_ai_examples'],
};

const input = z.strictObject({
  query: z.string().min(2).max(200).describe('What to look up, in the words the person used.'),
  topic: z
    .enum(['product', 'business', 'help'])
    .optional()
    .describe(
      'product = ornament / metal names; business = purity, hallmarking, weights, charges; help = using the app.',
    ),
});

export function knowledgeSearchTool(knowledge: AiKnowledgeService): AiReadTool<z.infer<typeof input>> {
  return {
    action: 'knowledge.search',
    intent: EAiIntent.Explain,
    description:
      'Look up jewellery knowledge (Hindi / Hinglish ornament names, metals, purity, hallmarking, weights, charges) ' +
      'and how to use ByajBazaar. Not for shop data such as stock, customers or dues — use the other tools for that.',
    input,
    output: z.object({ snippets: z.array(z.object({ title: z.string(), text: z.string(), score: z.number() })) }),
    permission: { module: null, level: 'view' },
    confirmation: 'never',
    available: () => knowledge.available,

    async run(args, ctx: AiToolContext): Promise<AiToolOutcome> {
      const hits = await knowledge.search(ctx.actor, args.query, args.topic ? TOPICS[args.topic] : undefined);
      return {
        kind: 'result',
        data: {
          snippets: hits.map((hit) => ({
            title: hit.chunk.title,
            text: hit.chunk.text,
            score: Math.round(hit.score * 100) / 100,
          })),
        },
      };
    },
  };
}
