// The HTTP codec of the one Team API protocol. Routes of a side protocol are not here: they use
// `teamSideRouteCodec`, which a caller checks first.
import {
  decodeTeamProtocolV8CurrentHttpRequest,
  decodeTeamProtocolV8CurrentHttpResponse,
  encodeTeamProtocolV8CurrentHttpRequest,
  encodeTeamProtocolV8CurrentHttpResponse,
} from "./v8-adapter";

export interface TeamHttpCodecOptions {
  preserveSemanticTags?: boolean;
  /** An agent create request may name a model. */
  agentCreateModel?: boolean;
  /** The negotiated history-extent-v1 capability. */
  historyExtent?: boolean;
  /** The negotiated ui-blocks-v1 capability. */
  uiBlocks?: boolean;
  /** The negotiated subagents-v1 capability. */
  subagents?: boolean;
  /** The negotiated prompt-multi-select-v1 capability. */
  promptMultiSelect?: boolean;
}

export interface TeamHttpCodec {
  encodeRequest(method: string, path: string, value: unknown, options: TeamHttpCodecOptions): string;
  decodeRequest(
    method: string,
    path: string,
    value: unknown,
    options: TeamHttpCodecOptions,
  ): ReturnType<typeof decodeTeamProtocolV8CurrentHttpRequest>;
  encodeResponse(method: string, path: string, status: number, value: unknown, options: TeamHttpCodecOptions): string;
  decodeResponse(
    method: string,
    path: string,
    status: number,
    value: unknown,
  ): ReturnType<typeof decodeTeamProtocolV8CurrentHttpResponse>;
}

export const TEAM_HTTP_CODEC: TeamHttpCodec = {
  encodeRequest: encodeTeamProtocolV8CurrentHttpRequest,
  decodeRequest: decodeTeamProtocolV8CurrentHttpRequest,
  encodeResponse: encodeTeamProtocolV8CurrentHttpResponse,
  decodeResponse: decodeTeamProtocolV8CurrentHttpResponse,
};
