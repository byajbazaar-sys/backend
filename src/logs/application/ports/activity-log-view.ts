import { ActivityLogRow } from '../domain';

export type ActivityLogView = Omit<ActivityLogRow, 'createdAt'> & { createdAt: Date; performedByName: string | null };
