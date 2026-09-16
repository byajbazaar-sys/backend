import * as fs from 'fs';
import * as path from 'path';

import * as protobuf from 'protobufjs';

let feedResponseType: protobuf.Type | null = null;

function resolveProtoPaths(): string[] {
  const candidates = [
    path.join(__dirname, '../proto/MarketDataFeed.proto'),
    path.join(process.cwd(), 'proto/MarketDataFeed.proto'),
    path.join(process.cwd(), 'dist/../proto/MarketDataFeed.proto'),
  ];
  const protoPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!protoPath) {
    throw new Error('MarketDataFeed.proto not found');
  }

  const wrapperCandidates = [
    path.join(process.cwd(), 'node_modules/protobufjs/google/protobuf/wrappers.proto'),
    path.join(__dirname, '../../node_modules/protobufjs/google/protobuf/wrappers.proto'),
  ].filter((candidate) => fs.existsSync(candidate));

  return [protoPath, ...wrapperCandidates];
}

export function decodeUpstoxFeedResponse(buffer: Buffer): protobuf.Message {
  if (!feedResponseType) {
    const root = new protobuf.Root();
    root.loadSync(resolveProtoPaths(), { keepCase: true });
    feedResponseType = root.lookupType('com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse');
  }

  return feedResponseType.decode(buffer);
}
