declare module 'bwip-js' {
  interface BwipOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    paddingwidth?: number;
    paddingheight?: number;
    includetext?: boolean;
    textxalign?: string;
    textsize?: number;
  }
  function toBuffer(options: BwipOptions): Promise<Buffer>;
  export default { toBuffer };
}

declare module 'qrcode' {
  export function toDataURL(
    text: string,
    options?: {
      width?: number;
      margin?: number;
      errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
      color?: { dark?: string; light?: string };
    },
  ): Promise<string>;
}

declare module '@aws-sdk/client-apigatewaymanagementapi' {
  export class GoneException extends Error {}
  export class PostToConnectionCommand {
    constructor(input: { ConnectionId: string; Data: Buffer });
  }
  export class ApiGatewayManagementApiClient {
    constructor(config: { endpoint: string });
    send(command: PostToConnectionCommand): Promise<unknown>;
  }
}
