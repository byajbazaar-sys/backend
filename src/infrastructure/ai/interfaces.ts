export interface ResumeOCRData {
  raw_text: string;
  personal_info: {
    names: string[];
    emails: string[];
    phone_numbers: string[];
  };
  professional_info: {
    organizations: string[];
    job_titles: string[];
    companies: string[];
  };
  skills_and_expertise: {
    technical_skills: string[];
    certifications: string[];
  };
  education: Array<{
    degree: string;
    field: string;
    institution: string;
  }>;
  experience: Array<{
    job_title: string;
    company: string;
  }>;
  images: Array<{
    image_name: string;
    image_base64: string;
    image_format: string;
    page_number: number;
  }>;
}

export interface CandidatePhotoAnalysis {
  isCandidatePhoto: boolean;
  confidence: number;
  description: string;
  reasoning: string;
}

export interface ResumeAnalysisResult {
  candidateProfile: {
    fullName: string;
    email: string;
    phone: string;
    currentRole: string;
    yearsOfExperience: number;
    topSkills: string[];
    summary: string;
  };
  photoAnalysis: {
    identifiedPhotoIndex: number | null;
    photoDetails: CandidatePhotoAnalysis[];
    bestPhoto: {
      index: number;
      base64: string;
      reasoning: string;
    } | null;
  };
  aiProvider: 'openai' | 'gemini' | 'claude';
  generatedInsights: string;
  interviewQuestions: string[];
}
