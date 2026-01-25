import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIBase } from '../ai-base.interface';
import { ResumeOCRData, ResumeAnalysisResult, CandidatePhotoAnalysis } from '../interfaces';
import { AIOptions } from '../ai.options';

export class GeminiService implements AIBase {
  private client: GoogleGenerativeAI;

  constructor(protected apiKey: string) {
    this.initializeClient();
  }

  private initializeClient(): void {
    if (this.apiKey) {
      this.client = new GoogleGenerativeAI(this.apiKey);
    }
  }

  isAvailable(): boolean {
    return !!this.client;
  }

  getProvider(): string {
    return 'gemini';
  }

  /**
   * Generates interview questions based on candidate profile data
   * @param profile The candidate profile data
   * @returns Promise with an array of interview questions
   */
  async generateInterviewQuestions(profile: any): Promise<string[]> {
    if (!this.isAvailable()) {
      throw new Error('Gemini client not initialized');
    }

    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `Based on the following candidate profile, generate 10 relevant interview questions that would help assess their skills and experience. 
      Focus on their technical skills, experience, and projects. Make the questions specific and tailored to their background.
      
      Candidate Profile:
      ${JSON.stringify(profile, null, 2)}
      
      Return the questions as a JSON array of strings.`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      let text = response.text();
      // Remove markdown code blocks if present
      if (text.includes('```json')) {
        text = text.replace(/```json\s*/, '').replace(/```\s*$/, '');
      } else if (text.includes('```')) {
        text = text.replace(/```\s*/, '').replace(/```\s*$/, '');
      }

      // Try to parse the response as JSON, fallback to splitting by newlines if not valid JSON
      try {
        const parsedResponse = JSON.parse(text);
        return Array.isArray(parsedResponse) ? parsedResponse : [text];
      } catch (e) {
        // If JSON parsing fails, split by newlines and clean up
        return text
          .split('\n')
          .map((q) => q.trim())
          .filter((q) => q.length > 0 && !q.match(/^\d+\.?/));
      }
    } catch (error) {
      throw new Error(`Failed to generate interview questions: ${error.message}`);
    }
  }

  /**
   * Calculates a ranking score based on interview questions and answers
   * @param questions Array of questions asked during the interview
   * @param answers Array of answers provided by the candidate
   * @param jobDescription Optional job description for context
   * @returns Promise with the ranking score and detailed feedback
   */
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
    if (!this.isAvailable()) {
      throw new Error('Gemini client not initialized');
    }

    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
      const response = result.response;
      const text = response.text();

      // Extract JSON from the response
      const jsonMatch = text.match(/\{.*\}/s);
      if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
      }

      const resultData = JSON.parse(jsonMatch[0]);

      return {
        score: Math.min(100, Math.max(0, resultData.score || 0)), // Ensure score is between 0-100
        feedback: resultData.feedback || 'No feedback provided',
        strengths: Array.isArray(resultData.strengths) ? resultData.strengths : [],
        areasForImprovement: Array.isArray(resultData.areasForImprovement) ? resultData.areasForImprovement : [],
      };
    } catch (error) {
      throw new Error(`Failed to calculate ranking score: ${error.message}`);
    }
  }

  async analyzeResume(resumeData: any): Promise<ResumeAnalysisResult> {
    if (!this.isAvailable()) {
      throw new Error('Gemini client not initialized');
    }

    const candidateProfile = await this.extractCandidateProfile(resumeData);
    // const photoAnalysis = resumeData?.images ? await this.analyzeImages(resumeData?.images) : null;
    // const generatedInsights = await this.generateInsights(resumeData, candidateProfile);
    const interviewQuestions = await this.generateInterviewQuestions(candidateProfile);

    // Update the candidate profile with the generated insights as summary
    candidateProfile.summary = null;

    return {
      candidateProfile,
      photoAnalysis: null,
      aiProvider: 'gemini',
      generatedInsights: null,
      interviewQuestions,
    };
  }

  private async extractCandidateProfile(resumeData: any): Promise<any> {
    // Use Gemini to extract candidate profile from raw text for better accuracy
    const model = this.client.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

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

      // Remove markdown code blocks if present
      if (responseText.includes('```json')) {
        responseText = responseText.replace(/```json\s*/, '').replace(/```\s*$/, '');
      } else if (responseText.includes('```')) {
        responseText = responseText.replace(/```\s*/, '').replace(/```\s*$/, '');
      }

      const aiExtractedProfile = JSON.parse(responseText.trim());

      // Validate and ensure required fields
      return {
        fullName: aiExtractedProfile.fullName || 'Unknown',
        email: aiExtractedProfile.email || 'N/A',
        phone: aiExtractedProfile.phone || 'N/A',
        currentRole: aiExtractedProfile.currentRole || 'Not specified',
        yearsOfExperience: aiExtractedProfile.yearsOfExperience || 0,
        topSkills: Array.isArray(aiExtractedProfile.topSkills) ? aiExtractedProfile.topSkills.slice(0, 5) : [],
      };
    } catch (error) {
      // Fallback to manual extraction if AI fails
      const fullName = resumeData?.personal_info?.names?.[0] || 'Unknown';
      const email = resumeData?.personal_info?.emails?.[0] || 'N/A';
      const phone = resumeData?.personal_info?.phone_numbers?.[0] || 'N/A';
      const currentRole = resumeData?.professional_info?.job_titles?.[0] || 'Not specified';
      const skills = resumeData?.skills_and_expertise?.technical_skills || [];

      // Calculate years of experience from experience array
      let yearsOfExperience = 0;
      if (resumeData?.experience && Array.isArray(resumeData.experience)) {
        yearsOfExperience = resumeData.experience.length > 0 ? resumeData.experience.length : 0;
      }

      return {
        fullName,
        email,
        phone,
        currentRole,
        yearsOfExperience,
        topSkills: skills.slice(0, 5),
      };
    }
  }

  private async analyzeImages(images: any): Promise<ResumeAnalysisResult['photoAnalysis']> {
    const model = this.client.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    const photoAnalysis: CandidatePhotoAnalysis[] = [];
    let bestPhoto: ResumeAnalysisResult['photoAnalysis']['bestPhoto'] = null;
    let highestConfidence = 0;

    for (let i = 0; i < images?.length; i++) {
      const image = images[i];

      try {
        const response = await model.generateContent([
          {
            inlineData: {
              data: image?.image_base64,
              mimeType: `image/${image.image_format}`,
            },
          },
          {
            text: `Is this a professional headshot/photo of a person suitable for a resume?
Reply in JSON format:
{
  "isCandidatePhoto": boolean,
  "confidence": 0-1,
  "description": "brief description",
  "reasoning": "why or why not"
}`,
          },
        ]);

        const analysisText = response.response.text();

        // Remove markdown code blocks if present
        let cleanedText = analysisText;
        if (analysisText.includes('```json')) {
          cleanedText = analysisText.replace(/```json\s*/, '').replace(/```\s*$/, '');
        } else if (analysisText.includes('```')) {
          cleanedText = analysisText.replace(/```\s*/, '').replace(/```\s*$/, '');
        }

        const analysis = JSON.parse(cleanedText.trim());
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
        // Skip failed image analysis
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

  private async generateInsights(
    resumeData: any,
    candidateProfile: ResumeAnalysisResult['candidateProfile'],
  ): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    const prompt = `Based on the following resume data, generate a professional short  summary under 50 words and key insights:

Candidate: ${candidateProfile?.fullName}
Current Role: ${candidateProfile?.currentRole}
Years of Experience: ${candidateProfile?.yearsOfExperience}
Top Skills: ${candidateProfile?.topSkills?.join(', ')}

Education:
${resumeData?.education?.map((e) => `- ${e.degree} in ${e.field} from ${e.institution}`).join('\n')}

Experience:
${resumeData?.experience
  ?.slice(0, 5)
  ?.map((e) => `- ${e.job_title} at ${e.company}`)
  ?.join('\n')}

Skills:
${resumeData?.skills_and_expertise?.technical_skills?.join(', ')}

Provide:
1. A professional 2-3 sentence summary of the candidate
2. Key strengths
3. Potential areas for growth
4. Recommended next roles or career paths`;

    const response = await model.generateContent(prompt);
    return response.response.text();
  }
}
