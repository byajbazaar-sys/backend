import { ResumeOCRData, ResumeAnalysisResult } from './interfaces';

export interface AIBase {
  /**
   * Analyze resume OCR data and return comprehensive analysis
   */
  analyzeResume(resumeData: any): Promise<ResumeAnalysisResult>;

  /**
   * Check if the AI service is properly configured and available
   */
  isAvailable(): boolean;

  /**
   * Get the provider name/type
   */
  getProvider(): string;
}
