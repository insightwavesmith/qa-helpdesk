/**
 * types.ts — 채널 API 클라이언트 공통 인터페이스
 *
 * 각 채널(네이버 블로그, 네이버 카페, 뉴스레터 등) 클라이언트가
 * 동일한 인터페이스를 구현하도록 강제.
 */

/** 채널 발행 요청 */
export interface ChannelPostRequest {
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

/** 채널 발행 결과 */
export interface ChannelPostResult {
  externalId: string;
  externalUrl: string;
}

/** 채널 API 클라이언트 인터페이스 */
export interface ChannelApiClient {
  /** 콘텐츠 발행 */
  publish(req: ChannelPostRequest): Promise<ChannelPostResult>;
  /** 발행된 콘텐츠 삭제 */
  delete(externalId: string): Promise<void>;
  /** 채널별 통계 조회 (views, clicks, comments 등) */
  getStats(externalId: string): Promise<Record<string, number>>;
}
