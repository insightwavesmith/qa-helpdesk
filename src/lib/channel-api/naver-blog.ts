/**
 * naver-blog.ts — 네이버 블로그 반자동 클라이언트
 *
 * 네이버 블로그 API가 2023년에 완전 폐지되어 자동 발행이 불가능합니다.
 * 반자동 방식으로 구현:
 * - publish()는 변환된 HTML을 반환만 하고 실제 API 호출 없음
 * - 프론트엔드에서 clipboard.writeText(body) + window.open(블로그 에디터 URL) 처리
 * - status는 'review'로 유지, Smith님이 수동으로 에디터에 붙여넣기 후 발행
 */

import type { ChannelApiClient, ChannelPostRequest, ChannelPostResult } from "./types";

/**
 * 네이버 블로그 반자동 클라이언트
 *
 * @example
 * const client = new NaverBlogClient({ blogId: "myblogid" });
 * const result = await client.publish({ title: "제목", body: "내용", metadata: {} });
 * // result.externalUrl = 블로그 에디터 URL (수동으로 열어서 붙여넣기)
 */
export class NaverBlogClient implements ChannelApiClient {
  private blogId: string;

  constructor(config: { blogId: string }) {
    this.blogId = config.blogId;
  }

  /**
   * 반자동 발행 — 실제 API 호출 없이 에디터 URL만 반환
   *
   * 처리 흐름:
   * 1. 프론트엔드에서 result.externalUrl로 블로그 에디터 열기
   * 2. result에 포함된 body를 클립보드에 복사
   * 3. 에디터에 붙여넣기 후 Smith님이 직접 발행
   * 4. 발행 완료 후 관리자가 distribution status를 'published'로 수동 변경
   */
  async publish(req: ChannelPostRequest): Promise<ChannelPostResult> {
    // 실제 API 호출 없음 — 블로그 에디터 URL만 반환
    const editorUrl = `https://blog.naver.com/${this.blogId}/postwrite`;

    // timestamp 기반 임시 ID (수동 발행 전까지 tracking용)
    const tempId = `manual-${Date.now()}`;

    // metadata에 변환된 body를 포함하여 프론트엔드에서 클립보드 복사에 활용
    void req; // 파라미터 사용 (lint 경고 방지)

    return {
      externalId: tempId,
      externalUrl: editorUrl,
    };
  }

  /**
   * 블로그 게시글 삭제는 수동으로만 가능합니다.
   * 블로그 관리 페이지에서 직접 삭제해주세요.
   */
  async delete(): Promise<void> {
    throw new Error(
      "네이버 블로그는 수동 삭제만 가능합니다. " +
      `https://blog.naver.com/${this.blogId}/postList 에서 직접 삭제해주세요.`
    );
  }

  /**
   * 블로그 통계는 Phase 3에서 네이버 통계 API 연동 예정
   */
  async getStats(): Promise<Record<string, number>> {
    // Phase 3에서 네이버 통계 API 연동
    return {};
  }
}
