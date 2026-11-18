import { ApiPropertyOptional } from '@nestjs/swagger';

/** Run `job`, poll again after `pollSeconds`, or stop. */
export class WorkerSessionPollResponseModel {
  @ApiPropertyOptional() stop?: boolean;
  @ApiPropertyOptional() reason?: string;
  @ApiPropertyOptional() pollSeconds?: number;
  @ApiPropertyOptional({ description: 'id, kind, pipeline (image | video) and the notebook code cells to run' })
  job?: { id: string; kind: string; pipeline: 'image' | 'video'; cells: string[] };
}
