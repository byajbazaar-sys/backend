import { Expose } from 'class-transformer';

export class GstCsvExportResult {
  @Expose()
  buffer: Buffer;

  @Expose()
  filename: string;
}
