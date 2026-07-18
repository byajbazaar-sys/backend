import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  GEMINI_EVENTS_MODEL,
  GEMINI_TRYON_FALLBACK_MODEL,
  GEMINI_TRYON_MODEL,
  GEMINI_TRYON_TIMEOUT_MS,
} from '../ai.constants';
import { AIBase } from '../ai-base.interface';
import { AIOptions } from '../ai.options';
import { ResumeAnalysisResult } from '../interfaces';
import type {
  AiImageInput,
  JewelleryTryOnRequest,
  OutfitRecolorRequest,
} from '../interfaces/ai-media.types';
import type {
  DiscoveredEvent,
  DiscoveredEventsPayload,
  GeneratedAiImage,
  IEventsDiscoveryService,
  ITryOnAiService,
} from '../../../application';
import { buildBasicEventsPrompt, buildEnrichEventsPrompt } from '../prompts/events.prompts';
import {
  buildFullTryOnPrompt,
  buildOutfitRecolorPrompt,
} from '../prompts/try-on.prompts';
import { extractJsonObject } from '../utils/ai-response.util';
import { buildTryOnImageSequence } from '../utils/try-on-images.util';
import { stripDataUrl, toGeneratedImage, withTimeout } from '../utils/image.util';

type GoogleGenAICtor = new (opts: { apiKey: string }) => {
  models: { generateContent: (args: Record<string, unknown>) => Promise<unknown> };
};

type GeminiGenClient = {
  models: { generateContent: (args: Record<string, unknown>) => Promise<unknown> };
};

type GeminiPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

@Injectable()
export class GeminiService implements ITryOnAiService, IEventsDiscoveryService, AIBase {
  private resumeClient: GoogleGenerativeAI | null = null;
  private genClients: GeminiGenClient[] = [];
  private keyPointer = 0;
  private keyInitPromise: Promise<void> | null = null;

  constructor(
    private readonly options: AIOptions,
    @InjectPinoLogger(GeminiService.name) private readonly logger: PinoLogger,
  ) {
    const resumeKey = options.geminiApiKey || options.geminiApiKeys[0];
    if (resumeKey) {
      this.resumeClient = new GoogleGenerativeAI(resumeKey);
    }
  }

  getProvider(): string {
    return 'gemini';
  }

  isAvailable(): boolean {
    return !!this.resumeClient || this.options.geminiApiKeys.length > 0 || !!this.options.geminiApiKey;
  }

  // --- Key pool (@google/genai) ---

  private async ensureGenClients(): Promise<void> {
    if (this.genClients.length) return;
    if (this.keyInitPromise) return this.keyInitPromise;

    this.keyInitPromise = (async () => {
      const keys = this.options.geminiApiKeys.length
        ? this.options.geminiApiKeys
        : this.options.geminiApiKey
          ? [this.options.geminiApiKey]
          : [];
      if (!keys.length) {
        this.logger.warn('No Gemini API keys configured');
        return;
      }
      const mod = (await import('@google/genai')) as unknown as { GoogleGenAI: GoogleGenAICtor };
      this.genClients = keys.map((apiKey) => new mod.GoogleGenAI({ apiKey }));
      this.logger.info({ keyCount: keys.length }, 'Gemini gen clients ready');
    })();

    await this.keyInitPromise;
  }

  private getGenClient(): GeminiGenClient {
    if (!this.genClients.length) {
      throw new Error('No Gemini API keys configured (GEMINI_API_KEYS)');
    }
    const client = this.genClients[this.keyPointer];
    this.keyPointer = (this.keyPointer + 1) % this.genClients.length;
    return client;
  }

  private rotateKey(): void {
    if (!this.genClients.length) return;
    this.keyPointer = (this.keyPointer + 1) % this.genClients.length;
    this.logger.warn({ pointer: this.keyPointer }, 'Rotated Gemini API key');
  }

  private shouldRotateKey(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('401') ||
      msg.includes('403') ||
      msg.toLowerCase().includes('quota') ||
      msg.toLowerCase().includes('rate limit')
    );
  }

  // --- Try-on ---

  async generateJewelleryTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage> {
    const prompt = buildFullTryOnPrompt('jewellery', request);
    const images = buildTryOnImageSequence(request.personImage, request.jewelleryItems);
    this.logger.info({ jewelleryCount: request.jewelleryItems.length }, 'Gemini jewellery try-on');
    return this.generateImage([...images, prompt]);
  }

  async generateOutfitTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage> {
    const prompt = buildFullTryOnPrompt('outfit', request);
    const images = buildTryOnImageSequence(request.personImage, request.jewelleryItems);
    this.logger.info({ outfit: request.outfit, occasion: request.occasion }, 'Gemini outfit try-on');
    return this.generateImage([...images, prompt]);
  }

  async recolorOutfit(request: OutfitRecolorRequest): Promise<GeneratedAiImage> {
    const prompt = buildOutfitRecolorPrompt(request.color);
    this.logger.info({ color: request.color }, 'Gemini outfit recolor');
    return this.generateImage([request.image, prompt]);
  }

  private async generateImage(parts: Array<AiImageInput | string>): Promise<GeneratedAiImage> {
    await this.ensureGenClients();
    const geminiParts: GeminiPart[] = parts.map((p) =>
      typeof p === 'string'
        ? { text: p }
        : {
            inlineData: {
              data: stripDataUrl(p.base64),
              mimeType: p.mimeType || 'image/jpeg',
            },
          },
    );

    const runModel = async (model: string): Promise<GeneratedAiImage> => {
      let lastError: unknown;
      const maxAttempts = Math.max(3, this.genClients.length || 1);
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const ai = this.getGenClient();
          const response = await ai.models.generateContent({
            model,
            contents: [{ parts: geminiParts }],
            config: {
              responseModalities: ['IMAGE'],
              outputImageDimensions: { width: 1024, height: 1024 },
            },
          });
          const image = this.extractGeneratedImage(response);
          if (!image) throw new Error(`No image returned from ${model}`);
          return image;
        } catch (err) {
          lastError = err;
          this.logger.warn({ err, attempt, model }, 'Gemini image generation failed');
          if (this.shouldRotateKey(err)) this.rotateKey();
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    };

    const timeoutMs = GEMINI_TRYON_TIMEOUT_MS;
    try {
      return await withTimeout(runModel(GEMINI_TRYON_MODEL), timeoutMs, GEMINI_TRYON_MODEL);
    } catch (primaryErr) {
      this.logger.warn({ err: primaryErr }, 'Primary try-on model failed — racing fallback');
      const primaryRetry = withTimeout(runModel(GEMINI_TRYON_MODEL), timeoutMs * 2, GEMINI_TRYON_MODEL);
      const fallback = withTimeout(runModel(GEMINI_TRYON_FALLBACK_MODEL), timeoutMs * 2, GEMINI_TRYON_FALLBACK_MODEL);
      return await new Promise<GeneratedAiImage>((resolve, reject) => {
        let settled = false;
        const failReasons: unknown[] = [];
        const onDone = (result: PromiseSettledResult<GeneratedAiImage>) => {
          if (settled) return;
          if (result.status === 'fulfilled') {
            settled = true;
            resolve(result.value);
            return;
          }
          failReasons.push(result.reason);
          if (failReasons.length >= 2) {
            settled = true;
            reject(failReasons[0] instanceof Error ? failReasons[0] : new Error(String(failReasons[0])));
          }
        };
        primaryRetry.then(
          (v) => onDone({ status: 'fulfilled', value: v }),
          (e) => onDone({ status: 'rejected', reason: e }),
        );
        fallback.then(
          (v) => onDone({ status: 'fulfilled', value: v }),
          (e) => onDone({ status: 'rejected', reason: e }),
        );
      });
    }
  }

  private extractGeneratedImage(response: unknown): GeneratedAiImage | null {
    const res = response as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
    };
    for (const part of res?.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return toGeneratedImage(part.inlineData.data, part.inlineData.mimeType || 'image/png');
      }
    }
    return null;
  }

  // --- Events discovery ---

  async fetchBasicEventsForState(state: string): Promise<DiscoveredEvent[]> {
    const payload = await this.callEventsPrompt(buildBasicEventsPrompt(state));
    return payload.events.filter((e) => (e.name ?? '').trim().length > 0);
  }

  async enrichEvents(events: DiscoveredEvent[]): Promise<DiscoveredEvent[]> {
    if (!events.length) return [];
    const payload = await this.callEventsPrompt(buildEnrichEventsPrompt(events));
    const detailMap = new Map<string, DiscoveredEvent>();
    for (const e of payload.events) {
      if (e.name) detailMap.set(e.name, e);
    }
    return events.map((event) => ({
      ...event,
      ...(detailMap.get(event.name ?? '') || {}),
    }));
  }

  private async callEventsPrompt(prompt: string): Promise<DiscoveredEventsPayload> {
    await this.ensureGenClients();
    let lastError: unknown;
    for (let retry = 0; retry < Math.max(4, this.genClients.length || 1); retry++) {
      try {
        const ai = this.getGenClient();
        const response = (await ai.models.generateContent({
          model: GEMINI_EVENTS_MODEL,
          contents: prompt,
          config: {
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            tools: [{ googleSearch: {} }],
          },
        })) as { text?: string };
        const parsed = JSON.parse(extractJsonObject(response.text ?? '', 'Gemini')) as DiscoveredEventsPayload;
        return { events: Array.isArray(parsed.events) ? parsed.events : [] };
      } catch (err) {
        lastError = err;
        this.logger.warn({ err, retry }, 'Gemini events call failed');
        if (this.shouldRotateKey(err)) this.rotateKey();
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  // --- Resume analysis (@google/generative-ai) ---

  async analyzeResume(resumeData: any): Promise<ResumeAnalysisResult> {
    if (!this.resumeClient) {
      throw new Error('Gemini client not initialized');
    }

    const candidateProfile = await this.extractCandidateProfile(resumeData);
    const interviewQuestions = await this.generateInterviewQuestions(candidateProfile);
    candidateProfile.summary = null;

    return {
      candidateProfile,
      photoAnalysis: null,
      aiProvider: 'gemini',
      generatedInsights: null,
      interviewQuestions,
    };
  }

  async calculateRankingScore(
    questions: string[],
    answers: string[],
    jobDescription?: string,
  ): Promise<{
    score: number;
    feedback: string;
    strengths: string[];
    areasForImprovement: string[];
  }> {
    if (!this.resumeClient) {
      throw new Error('Gemini client not initialized');
    }

    const model = this.resumeClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `You are an expert interviewer analyzing interview responses. 
      Rate the candidate's answers on a scale of 0-100 based on the following criteria:
      - Relevance and accuracy of the answers (40%)
      - Depth of knowledge demonstrated (30%)
      - Communication skills (20%)
      - Problem-solving approach (10%)
      
      Questions and Answers:
      ${questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i] || 'No answer provided'}`).join('\n\n')}
      
      ${jobDescription ? `Job Description Context:\n${jobDescription}\n\n` : ''}
      Provide your response in the following JSON format:
      {
        "score": 0-100,
        "feedback": "Detailed feedback on the candidate's performance",
        "strengths": ["strength1", "strength2", ...],
        "areasForImprovement": ["area1", "area2", ...]
      }`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{.*\}/s);
    if (!jsonMatch) throw new Error('Failed to parse AI response');

    const resultData = JSON.parse(jsonMatch[0]);
    return {
      score: Math.min(100, Math.max(0, resultData.score || 0)),
      feedback: resultData.feedback || 'No feedback provided',
      strengths: Array.isArray(resultData.strengths) ? resultData.strengths : [],
      areasForImprovement: Array.isArray(resultData.areasForImprovement) ? resultData.areasForImprovement : [],
    };
  }

  async generateInterviewQuestions(profile: any): Promise<string[]> {
    if (!this.resumeClient) {
      throw new Error('Gemini client not initialized');
    }

    const model = this.resumeClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Based on the following candidate profile, generate 10 relevant interview questions that would help assess their skills and experience. 
      Focus on their technical skills, experience, and projects. Make the questions specific and tailored to their background.
      
      Candidate Profile:
      ${JSON.stringify(profile, null, 2)}
      
      Return the questions as a JSON array of strings.`;

    const result = await model.generateContent(prompt);
    let text = result.response.text();
    if (text.includes('```json')) {
      text = text.replace(/```json\s*/, '').replace(/```\s*$/, '');
    } else if (text.includes('```')) {
      text = text.replace(/```\s*/, '').replace(/```\s*$/, '');
    }

    try {
      const parsedResponse = JSON.parse(text);
      return Array.isArray(parsedResponse) ? parsedResponse : [text];
    } catch {
      return text
        .split('\n')
        .map((q) => q.trim())
        .filter((q) => q.length > 0 && !q.match(/^\d+\.?/));
    }
  }

  private async extractCandidateProfile(resumeData: any): Promise<any> {
    const model = this.resumeClient!.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Extract structured candidate information from this resume text. 
Focus on accuracy and use the provided raw text content.

Resume Text:
${resumeData?.raw_text || 'No raw text available'}

Please extract and return ONLY a JSON object with this exact structure:
{
  "fullName": "candidate's full name",
  "email": "candidate's email address",
  "phone": "candidate's phone number",
  "currentRole": "most recent or current job title",
  "yearsOfExperience": number of years of experience (estimate if not explicit),
  "topSkills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
}

If any field is not found, use appropriate fallback values:
- fullName: "Unknown" if not found
- email: "N/A" if not found  
- phone: "N/A" if not found
- currentRole: "Not specified" if not found
- yearsOfExperience: 0 if not determinable
- topSkills: empty array if no skills found

Return ONLY the JSON object, no additional text.`;

    try {
      const response = await model.generateContent(prompt);
      let responseText = response.response.text();
      if (responseText.includes('```json')) {
        responseText = responseText.replace(/```json\s*/, '').replace(/```\s*$/, '');
      } else if (responseText.includes('```')) {
        responseText = responseText.replace(/```\s*/, '').replace(/```\s*$/, '');
      }

      const aiExtractedProfile = JSON.parse(responseText.trim());
      return {
        fullName: aiExtractedProfile.fullName || 'Unknown',
        email: aiExtractedProfile.email || 'N/A',
        phone: aiExtractedProfile.phone || 'N/A',
        currentRole: aiExtractedProfile.currentRole || 'Not specified',
        yearsOfExperience: aiExtractedProfile.yearsOfExperience || 0,
        topSkills: Array.isArray(aiExtractedProfile.topSkills) ? aiExtractedProfile.topSkills.slice(0, 5) : [],
      };
    } catch {
      const fullName = resumeData?.personal_info?.names?.[0] || 'Unknown';
      const email = resumeData?.personal_info?.emails?.[0] || 'N/A';
      const phone = resumeData?.personal_info?.phone_numbers?.[0] || 'N/A';
      const currentRole = resumeData?.professional_info?.job_titles?.[0] || 'Not specified';
      const skills = resumeData?.skills_and_expertise?.technical_skills || [];
      let yearsOfExperience = 0;
      if (resumeData?.experience && Array.isArray(resumeData.experience)) {
        yearsOfExperience = resumeData.experience.length > 0 ? resumeData.experience.length : 0;
      }
      return { fullName, email, phone, currentRole, yearsOfExperience, topSkills: skills.slice(0, 5) };
    }
  }
}
