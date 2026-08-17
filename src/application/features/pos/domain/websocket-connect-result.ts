import { Expose } from 'class-transformer';

export class WebSocketConnectResult {
  @Expose()
  statusCode: number;
}
