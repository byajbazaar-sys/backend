import OpenAI from 'openai';
import { AIBase } from '../ai-base.interface';
import { ResumeOCRData, ResumeAnalysisResult, CandidatePhotoAnalysis } from '../interfaces';

export class OpenAIService implements AIBase {
  private client: OpenAI;

  constructor(apiKey: string) {
    console?.log('hereeeeeeeeee');
    this?.initializeClient(apiKey);
  }

  private initializeClient(apiKey: string): void {
    if (apiKey) {
      this.client = new OpenAI({ apiKey: apiKey });
    }
  }

  isAvailable(): boolean {
    return !!this?.client;
  }

  getProvider(): string {
    return 'openai';
  }

  async analyzeResume(resumeData: ResumeOCRData): Promise<ResumeAnalysisResult> {
    if (!this?.isAvailable()) {
      throw new Error('OpenAI client not initialized');
    }

    const candidateProfile = this?.extractCandidateProfile(resumeData);
    const photoAnalysis = await this?.analyzeImages(resumeData?.images);
    const generatedInsights = await this?.generateInsights(resumeData, candidateProfile);

    // Update the candidate profile with the generated insights as summary
    candidateProfile.summary = generatedInsights;

    return {
      candidateProfile,
      photoAnalysis,
      aiProvider: 'openai',
      generatedInsights,
      interviewQuestions: [],
    };
  }

  private extractCandidateProfile(resumeData: ResumeOCRData) {
    const fullName = resumeData?.personal_info?.names[0] || 'Unknown';
    const email = resumeData?.personal_info?.emails[0] || 'N/A';
    const phone = resumeData?.personal_info?.phone_numbers[0] || 'N/A';
    const currentRole = resumeData?.professional_info?.job_titles[0] || 'Not specified';
    const skills = resumeData?.skills_and_expertise?.technical_skills;

    // Calculate years of experience (simplified - would need more sophisticated logic)
    const yearsOfExperience = resumeData?.experience?.length > 0 ? 0 : 0;

    return {
      fullName,
      email,
      phone,
      currentRole,
      yearsOfExperience,
      topSkills: skills?.slice(0, 5),
      summary: '', // Will be populated by AI insights
    };
  }

  private async analyzeImages(images: ResumeOCRData['images']): Promise<ResumeAnalysisResult['photoAnalysis']> {
    const photoAnalysis: CandidatePhotoAnalysis[] = [];
    let bestPhoto: ResumeAnalysisResult['photoAnalysis']['bestPhoto'] = null;
    let highestConfidence = 0;

    for (let i = 0; i < images?.length; i++) {
      const image = images[i];

      try {
        const response = await this?.client?.chat?.completions?.create({
          model: 'gpt-4-vision-preview',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/${image?.image_format};base64,${image?.image_base64}`,
                  },
                },
                {
                  type: 'text',
                  text: `Analyze this image and determine:
1?. Is this a professional headshot/photo of a person (candidate)?
2?. If yes, provide confidence (0-1) that this is a candidate photo suitable for a resume?.
3?. Provide a brief description of the image?.
4?. Explain your reasoning?.

Respond in JSON format:
{
  "isCandidatePhoto": boolean,
  "confidence": number,
  "description": string,
  "reasoning": string
}`,
                },
              ],
            },
          ],
        });

        const analysisText = response?.choices[0]?.message?.content || '';
        const analysis = JSON?.parse(analysisText);
        photoAnalysis?.push(analysis);

        // Track best photo
        if (analysis?.isCandidatePhoto && analysis?.confidence > highestConfidence) {
          highestConfidence = analysis?.confidence;
          bestPhoto = {
            index: i,
            base64: image?.image_base64,
            reasoning: analysis?.reasoning,
          };
        }
      } catch (error) {
        console?.warn(`Error analyzing image ${i}:`, error);
        photoAnalysis?.push({
          isCandidatePhoto: false,
          confidence: 0,
          description: 'Analysis failed',
          reasoning: error?.message,
        });
      }
    }

    return {
      identifiedPhotoIndex: bestPhoto?.index ?? null,
      photoDetails: photoAnalysis,
      bestPhoto,
    };
  }

  private async generateInsights(
    resumeData: ResumeOCRData,
    candidateProfile: ResumeAnalysisResult['candidateProfile'],
  ): Promise<string> {
    const prompt = `Based on the following resume data, generate a professional summary and key insights:

Candidate: ${candidateProfile?.fullName}
Current Role: ${candidateProfile?.currentRole}
Years of Experience: ${candidateProfile?.yearsOfExperience}
Top Skills: ${candidateProfile?.topSkills?.join(', ')}

Education:
${resumeData?.education?.map((e) => `- ${e?.degree} in ${e?.field} from ${e?.institution}`)?.join('\n')}

Experience:
${resumeData?.experience
  ?.slice(0, 5)
  ?.map((e) => `- ${e?.job_title} at ${e?.company}`)
  ?.join('\n')}

Skills:
${resumeData?.skills_and_expertise?.technical_skills?.join(', ')}

Provide:
1?. A professional 2-3 sentence summary of the candidate
2?. Key strengths
3?. Potential areas for growth
4?. Recommended next roles or career paths`;

    const response = await this?.client?.chat?.completions?.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    return response?.choices[0]?.message?.content;
  }
}
