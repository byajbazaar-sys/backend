import { Injectable, BadRequestException } from '@nestjs/common';
import { ResumeOCRData, ResumeAnalysisResult } from '../interfaces';
import { AIProvider } from '../types';
import { AIBase } from '../ai-base.interface';
import { ClaudeService } from './claude.service';
import { GeminiService } from './gemini.service';
import { OpenAIService } from './openai.service';
import { IAIResumeService } from '../../../application';
import { AIOptions } from '../ai.options';

@Injectable()
export class AIResumeService implements IAIResumeService {
  private geminiService: GeminiService;

  constructor(protected options: AIOptions) {
    this.geminiService = new GeminiService(options.geminiApiKey);
  }

  async analyzeResumeWithAI(resumeData: any, preferredProvider?: AIProvider): Promise<ResumeAnalysisResult> {
    const providers: AIProvider[] = preferredProvider
      ? ([preferredProvider, 'gemini', 'claude', 'openai'] as AIProvider[]).filter(
          (p, i, arr) => i === 0 || p !== arr[0],
        )
      : (['openai', 'gemini', 'claude'] as AIProvider[]);
    console.log(providers);
    for (const provider of providers) {
      try {
        const service = this.getAIService(provider);
        if (service && service.isAvailable()) {
          return await service.analyzeResume(resumeData);
        }
      } catch (error) {
        console.warn(`Failed to analyze with ${provider}:`, error);
        continue;
      }
    }

    throw new BadRequestException('No AI providers configured. Please set API keys for OpenAI, Gemini, or Claude.');
  }

  private getAIService(provider: AIProvider): AIBase | null {
    switch (provider) {
      // case 'openai':
      //   return new OpenAIService(this.options.openaiApiKey);
      case 'gemini':
        return this.geminiService;
      // case 'claude':
      //   return new ClaudeService(this.options.claudeApiKey);
      default:
        return null;
    }
  }

  async calculateRankingScore(questions: string[], answers: string[], jobDescription?: string) {
    if (!this.geminiService) {
      throw new Error('Gemini service is not available');
    }

    try {
      return await this.geminiService.calculateRankingScore(questions, answers, jobDescription);
    } catch (error) {
      console.error('Error in calculateRankingScore:', error);
      throw new Error(`Failed to calculate ranking score: ${error.message}`);
    }
  }
}
