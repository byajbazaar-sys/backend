import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { IAIResumeService } from '../../../application';
import { AIProvider } from '../types';
import { AIBase } from '../ai-base.interface';
import { GeminiService } from './gemini.service';

@Injectable()
export class AIResumeService implements IAIResumeService {
  constructor(
    private readonly gemini: GeminiService,
    @InjectPinoLogger(AIResumeService.name) private readonly logger: PinoLogger,
  ) {}

  async analyzeResumeWithAI(resumeData: any, preferredProvider?: AIProvider): Promise<any> {
    const providers: AIProvider[] = preferredProvider
      ? ([preferredProvider, 'gemini', 'claude', 'openai'] as AIProvider[]).filter(
          (p, i, arr) => i === 0 || p !== arr[0],
        )
      : (['openai', 'gemini', 'claude'] as AIProvider[]);

    for (const provider of providers) {
      try {
        const service = this.getAIService(provider);
        if (service?.isAvailable()) {
          return await service.analyzeResume(resumeData);
        }
      } catch {
        continue;
      }
    }

    throw new BadRequestException(
      'No AI providers configured. Please set API keys for OpenAI, Gemini, or Claude.',
    );
  }

  async calculateRankingScore(questions: string[], answers: string[], jobDescription?: string) {
    if (!this.gemini.isAvailable()) {
      throw new Error('Gemini service is not available');
    }
    return this.gemini.calculateRankingScore(questions, answers, jobDescription);
  }

  private getAIService(provider: AIProvider): AIBase | null {
    if (provider === 'gemini') return this.gemini;
    return null;
  }
}
