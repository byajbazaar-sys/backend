export const AI_RESUME_SERVICE = 'IAIResumeService';

export interface IAIResumeService {
  analyzeResumeWithAI(resumeData: any, preferredProvider?: string): Promise<any>;

  /**
   * Calculates a ranking score based on interview questions and answers
   * @param questions Array of questions asked during the interview
   * @param answers Array of answers provided by the candidate
   * @param jobDescription Optional job description for context
   * @returns Promise with the ranking score (0-100) and feedback
   */
  calculateRankingScore(
    questions: string[],
    answers: string[],
    jobDescription?: string,
  ): Promise<{
    score: number;
    feedback: string;
    strengths: string[];
    areasForImprovement: string[];
  }>;
}
