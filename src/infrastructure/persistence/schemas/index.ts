import { usersSchema, UsersSchema } from './users.schema';
import { jobsSchema, JobsSchema } from './jobs.schema';
import { jobApplicationsSchema, JobApplicationsSchema } from './job-applications.schema';
import { rankingsSchema, RankingsSchema } from './rankings.schema';
import { SeedsSchema, seedsSchema } from './seeds.schema';

export * from './users.schema';
export * from './jobs.schema';
export * from './job-applications.schema';
export * from './rankings.schema';
export * from './seeds.schema';
export * from './schemas';

export default [
  {
    name: UsersSchema.name,
    schema: usersSchema,
  },
  {
    name: JobsSchema.name,
    schema: jobsSchema,
  },
  {
    name: JobApplicationsSchema.name,
    schema: jobApplicationsSchema,
  },
  {
    name: RankingsSchema.name,
    schema: rankingsSchema,
  },
  {
    name: SeedsSchema.name,
    schema: seedsSchema,
  },
];
