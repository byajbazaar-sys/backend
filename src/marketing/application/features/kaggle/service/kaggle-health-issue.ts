export interface KaggleHealthIssue {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  account?: string;
  jobId?: string;
}
