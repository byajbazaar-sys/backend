import Anthropic from '@anthropic-ai/sdk';
import { AIBase } from '../ai-base.interface';
import { ResumeOCRData, ResumeAnalysisResult, CandidatePhotoAnalysis } from '../interfaces';

export class ClaudeService implements AIBase {
  private client: Anthropic;

  constructor(protected apiKey: string) {
    this.initializeClient();
  }

  private initializeClient(): void {
    if (this.apiKey) {
      this.client = new Anthropic({
        apiKey: this.apiKey,
      });
    }
  }

  isAvailable(): boolean {
    return !!this.client;
  }

  getProvider(): string {
    return 'claude';
  }

  async analyzeResume(resumeData: ResumeOCRData): Promise<ResumeAnalysisResult> {
    if (!this.isAvailable()) {
      throw new Error('Claude client not initialized');
    }

    const candidateProfile = this.extractCandidateProfile(resumeData);
    const photoAnalysis = await this.analyzeImages(resumeData.images);
    const generatedInsights = await this.generateInsights(resumeData, candidateProfile);

    // Update the candidate profile with the generated insights as summary
    candidateProfile.summary = generatedInsights;
    return {
      candidateProfile,
      photoAnalysis,
      aiProvider: 'claude',
      generatedInsights,
      interviewQuestions: [],
    };
  }

  private extractCandidateProfile(resumeData: ResumeOCRData) {
    const fullName = resumeData.personal_info.names[0] || 'Unknown';
    const email = resumeData.personal_info.emails[0] || 'N/A';
    const phone = resumeData.personal_info.phone_numbers[0] || 'N/A';
    const currentRole = resumeData.professional_info.job_titles[0] || 'Not specified';
    const skills = resumeData.skills_and_expertise.technical_skills;

    // Calculate years of experience (simplified - would need more sophisticated logic)
    const yearsOfExperience = resumeData.experience.length > 0 ? 0 : 0;

    return {
      fullName,
      email,
      phone,
      currentRole,
      yearsOfExperience,
      topSkills: skills.slice(0, 5),
      summary: '', // Will be populated by AI insights
    };
  }

  private async analyzeImages(images: ResumeOCRData['images']): Promise<ResumeAnalysisResult['photoAnalysis']> {
    const photoAnalysis: CandidatePhotoAnalysis[] = [];
    let bestPhoto: ResumeAnalysisResult['photoAnalysis']['bestPhoto'] = null;
    let highestConfidence = 0;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      try {
        const response = await this.client.messages.create({
          model: 'claude-3-vision-20240229',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: this.getValidMediaType(image.image_format),
                    data: image.image_base64,
                  },
                },
                {
                  type: 'text',
                  text: `Is this a professional headshot/photo of a person suitable for a resume?
Reply in JSON format:
{
  "isCandidatePhoto": boolean,
  "confidence": 0-1,
  "description": "brief description",
  "reasoning": "why or why not"
}`,
                },
              ],
            },
          ],
        });

        const analysisText = response.content[0].type === 'text' ? response.content[0].text : '';
        const analysis = JSON.parse(analysisText);
        photoAnalysis.push(analysis);

        if (analysis.isCandidatePhoto && analysis.confidence > highestConfidence) {
          highestConfidence = analysis.confidence;
          bestPhoto = {
            index: i,
            base64: image.image_base64,
            reasoning: analysis.reasoning,
          };
        }
      } catch (error) {
        console.warn(`Error analyzing image ${i} with Claude:`, error);
        photoAnalysis.push({
          isCandidatePhoto: false,
          confidence: 0,
          description: 'Analysis failed',
          reasoning: error.message,
        });
      }
    }

    return {
      identifiedPhotoIndex: bestPhoto?.index ?? null,
      photoDetails: photoAnalysis,
      bestPhoto,
    };
  }

  private getValidMediaType(format: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
    const normalizedFormat = format.toLowerCase();

    switch (normalizedFormat) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      default:
        // Default to jpeg if format is not supported
        return 'image/jpeg';
    }
  }

  private async generateInsights(
    resumeData: ResumeOCRData,
    candidateProfile: ResumeAnalysisResult['candidateProfile'],
  ): Promise<string> {
    const prompt = `Based on the following resume data, generate a professional summary and key insights:

Candidate: ${candidateProfile.fullName}
Current Role: ${candidateProfile.currentRole}
Years of Experience: ${candidateProfile.yearsOfExperience}
Top Skills: ${candidateProfile.topSkills.join(', ')}

Education:
${resumeData.education.map((e) => `- ${e.degree} in ${e.field} from ${e.institution}`).join('\n')}

Experience:
${resumeData.experience
  .slice(0, 5)
  .map((e) => `- ${e.job_title} at ${e.company}`)
  .join('\n')}

Skills:
${resumeData.skills_and_expertise.technical_skills.join(', ')}

Provide:
1. A professional 2-3 sentence summary of the candidate
2. Key strengths
3. Potential areas for growth
4. Recommended next roles or career paths`;

    const response = await this.client.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }
}
