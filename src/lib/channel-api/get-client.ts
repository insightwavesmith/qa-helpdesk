/**
 * get-client.ts — 채널별 API 클라이언트 팩토리
 *
 * distribution.ts(Server Action)와 publish-scheduled(Cron) 양쪽에서
 * 공통으로 사용하는 헬퍼. 채널명을 받아 적절한 ChannelApiClient 인스턴스를 반환.
 *
 * youtube, instagram, google_seo → Phase 3 구현 예정, 현재 null 반환
 */

import type { TransformChannel } from "@/types/distribution";
import type { ChannelApiClient } from "./types";
import { NaverCafeClient } from "./naver-cafe";
import { NaverBlogClient } from "./naver-blog";
import { NewsletterClient } from "./newsletter";
import { createServiceClient } from "@/lib/db";

/**
 * 채널에 맞는 API 클라이언트 인스턴스 생성
 *
 * naver_cafe, naver_blog: channel_credentials 테이블에서 extra_config 읽어 초기화
 * newsletter: 설정 없이 바로 생성
 * youtube, instagram, google_seo: Phase 3 미구현 → null 반환
 *
 * @param channel - TransformChannel 값
 * @returns ChannelApiClient 인스턴스 또는 null (미지원 채널)
 */
export async function getChannelClient(
  channel: TransformChannel
): Promise<ChannelApiClient | null> {
  // newsletter는 별도 자격증명 불필요
  if (channel === "newsletter") {
    return new NewsletterClient();
  }

  // Phase 3 미구현 채널 — null 반환
  if (channel === "youtube" || channel === "instagram" || channel === "google_seo") {
    return null;
  }

  // naver_cafe / naver_blog: channel_credentials에서 extra_config 조회
  const svc = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc as any)
    .from("channel_credentials")
    .select("extra_config")
    .eq("channel", channel)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    console.error(`getChannelClient: ${channel} 자격증명 조회 실패`, error?.message ?? "레코드 없음");
    return null;
  }

  const extraConfig = (data as { extra_config: Record<string, unknown> }).extra_config ?? {};

  if (channel === "naver_cafe") {
    const clubId = extraConfig.clubId as string | undefined;
    const menuId = extraConfig.menuId as string | undefined;

    if (!clubId || !menuId) {
      console.error("getChannelClient: naver_cafe extra_config에 clubId 또는 menuId가 없습니다.");
      return null;
    }
    return new NaverCafeClient({ clubId, menuId });
  }

  if (channel === "naver_blog") {
    const blogId = extraConfig.blogId as string | undefined;

    if (!blogId) {
      console.error("getChannelClient: naver_blog extra_config에 blogId가 없습니다.");
      return null;
    }
    return new NaverBlogClient({ blogId });
  }

  // 도달 불가 — 타입 완전성 보장용
  return null;
}
