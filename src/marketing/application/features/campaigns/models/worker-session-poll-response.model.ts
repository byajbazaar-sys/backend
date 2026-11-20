import { ApiPropertyOptional } from '@nestjs/swagger';

/** Run `job`, poll again after `pollSeconds`, or stop. */
export class WorkerSessionPollResponseModel {
  @ApiPropertyOptional() stop?: boolean;
  @ApiPropertyOptional() reason?: string;
  @ApiPropertyOptional() pollSeconds?: number;
  @ApiPropertyOptional({ description: 'The backend knows the idle session’s WebSocket (false: register it again)' })
  listening?: boolean;
  @ApiPropertyOptional({ description: 'id, kind, pipeline (image | video | video-fast | cpu | voice) and the notebook code cells' })
  job?: { id: string; kind: string; pipeline: 'image' | 'video' | 'video-fast' | 'cpu' | 'voice'; cells: string[] };
}
