/**
 * newsletter.ts — 뉴스레터 채널 클라이언트
 *
 * 기존 email_logs + email_sends 파이프라인을 ChannelApiClient로 래핑합니다.
 * 실제 이메일 발송은 하지 않고, email_logs + email_sends 레코드만 생성합니다.
 * 실제 발송은 기존 /api/admin/email/send cron이 처리합니다.
 *
 * 발행 흐름:
 * 1. getRecipients(segmentName)로 수신자 목록 조회
 * 2. email_logs 테이블에 캠페인 레코드 INSERT
 * 3. email_sends 테이블에 수신자별 레코드 배치 INSERT (status: "queued")
 * 4. email_logs.id를 externalId로 반환
 */

import type { ChannelApiClient, ChannelPostRequest, ChannelPostResult } from "./types";
import { createServiceClient } from "@/lib/db";

// 배치당 수신자 INSERT 크기 (DB 부하 방지)
const INSERT_BATCH_SIZE = 100;

/**
 * 세그먼트 이름으로 수신자 목록 조회
 * newsletter_segments → filter_rules 기반으로 수신자 결정
 * 기본 세그먼트는 all_leads (opted_out 제외)를 사용
 */
async function fetchRecipientsBySegment(
  segmentName: string
): Promise<Array<{ email: string; name: string }>> {
  const svc = createServiceClient();

  // newsletter_segments 테이블에서 세그먼트 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: segment } = await (svc as any)
    .from("newsletter_segments")
    .select("filter_rules, is_default")
    .eq("name", segmentName)
    .single();

  // 세그먼트 미발견 시 기본 전략: all_leads (opted_out 제외)
  if (!segment) {
    return fetchDefaultRecipients(svc);
  }

  // filter_rules에 따른 수신자 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rules = (segment as any).filter_rules as Record<string, unknown>;

  // 지원하는 filter 타입별 처리
  if (rules.source === "all" || (segment as { is_default: boolean }).is_default) {
    return fetchDefaultRecipients(svc);
  }

  if (rules.source === "leads") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (svc as any)
      .from("leads")
      .select("email, name")
      .eq("email_opted_out", false)
      .limit(5000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as any[]) || []).map((r) => ({ email: r.email, name: r.name ?? "" }));
  }

  if (rules.source === "members") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (svc as any)
      .from("profiles")
      .select("email, name")
      .in("role", ["member", "student"])
      .not("email", "is", null)
      .neq("email", "")
      .limit(5000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as any[]) || []).map((r) => ({ email: r.email, name: r.name ?? "" }));
  }

  // 기타 rules는 기본 전략으로 폴백
  return fetchDefaultRecipients(svc);
}

/**
 * 기본 수신자 목록: leads(opted_out 제외) + profiles(member/student) 합산 중복 제거
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchDefaultRecipients(svc: any): Promise<Array<{ email: string; name: string }>> {
  const [leadsRes, profilesRes] = await Promise.all([
    svc.from("leads").select("email, name").eq("email_opted_out", false).limit(5000),
    svc
      .from("profiles")
      .select("email, name")
      .in("role", ["member", "student"])
      .not("email", "is", null)
      .neq("email", "")
      .limit(5000),
  ]);

  const uniqueMap = new Map<string, { email: string; name: string }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of ((leadsRes.data as any[]) || [])) {
    if (!uniqueMap.has(r.email)) {
      uniqueMap.set(r.email, { email: r.email, name: r.name ?? "" });
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of ((profilesRes.data as any[]) || [])) {
    if (!uniqueMap.has(r.email)) {
      uniqueMap.set(r.email, { email: r.email, name: r.name ?? "" });
    }
  }

  return Array.from(uniqueMap.values());
}

/**
 * 뉴스레터 채널 클라이언트
 *
 * metadata 필드:
 * - segmentName: 발송 대상 세그먼트 이름 (기본: "all")
 * - subject: 이메일 제목 (없으면 req.title 사용)
 * - ctaText: CTA 버튼 텍스트
 * - ctaUrl: CTA 버튼 URL
 * - contentId: 연결된 콘텐츠 ID (옵션)
 *
 * @example
 * const client = new NewsletterClient();
 * const result = await client.publish({
 *   title: "5월 뉴스레터",
 *   body: "<p>내용</p>",
 *   metadata: {
 *     segmentName: "all",
 *     subject: "[bscamp] 5월 뉴스레터",
 *     ctaText: "자세히 보기",
 *     ctaUrl: "https://bscamp.kr/posts/xxx",
 *   }
 * });
 */
export class NewsletterClient implements ChannelApiClient {
  /**
   * 뉴스레터 발행 — email_logs + email_sends 레코드 생성
   * 실제 발송은 기존 email cron이 처리
   */
  async publish(req: ChannelPostRequest): Promise<ChannelPostResult> {
    const svc = createServiceClient();

    // metadata에서 발행 설정 추출
    const segmentName = (req.metadata.segmentName as string) ?? "all";
    const subject = (req.metadata.subject as string) ?? req.title;
    const ctaText = (req.metadata.ctaText as string) ?? "";
    const ctaUrl = (req.metadata.ctaUrl as string) ?? "";
    const contentId = (req.metadata.contentId as string) ?? null;

    // 수신자 목록 조회
    const recipients = await fetchRecipientsBySegment(segmentName);

    if (recipients.length === 0) {
      throw new Error(`세그먼트 "${segmentName}"에 해당하는 수신자가 없습니다.`);
    }

    // CTA가 있으면 본문 끝에 추가
    let htmlBody = req.body;
    if (ctaText && ctaUrl) {
      htmlBody += `\n<p><a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;background:#F75D5D;color:#fff;text-decoration:none;border-radius:6px;">${ctaText}</a></p>`;
    }

    // email_logs 캠페인 레코드 INSERT
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logInsertPayload: any = {
      subject,
      html_body: htmlBody,
      status: "queued",
      template: "newsletter",
      recipient_count: recipients.length,
      sent_at: null,
    };
    if (contentId) logInsertPayload.content_id = contentId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: logData, error: logError } = await (svc as any)
      .from("email_logs")
      .insert(logInsertPayload)
      .select("id")
      .single();

    if (logError || !logData) {
      throw new Error(
        `email_logs INSERT 실패: ${logError?.message ?? "알 수 없는 오류"}`
      );
    }

    const logId = (logData as { id: string }).id;

    // email_sends 수신자별 레코드 배치 INSERT (status: "queued")
    for (let i = 0; i < recipients.length; i += INSERT_BATCH_SIZE) {
      const batch = recipients.slice(i, i + INSERT_BATCH_SIZE);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payloads: any[] = batch.map((r) => ({
        recipient_email: r.email,
        recipient_type: "newsletter",
        subject,
        template: "newsletter",
        status: "queued",
        ...(contentId ? { content_id: contentId } : {}),
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: sendsError } = await (svc as any)
        .from("email_sends")
        .insert(payloads);

      if (sendsError) {
        console.error(
          `email_sends 배치 INSERT 실패 (batch ${i}~${i + batch.length}):`,
          sendsError.message
        );
        // 부분 실패는 계속 진행 (나머지 배치는 정상 처리)
      }
    }

    // email_logs.id를 externalId로 반환
    const externalUrl = contentId
      ? `https://bscamp.kr/admin/email?log=${logId}`
      : `https://bscamp.kr/admin/email`;

    return {
      externalId: logId,
      externalUrl,
    };
  }

  /**
   * 뉴스레터 발송 취소 — email_logs status를 "cancelled"로 변경
   * 이미 "sent" 상태인 경우 에러
   */
  async delete(externalId: string): Promise<void> {
    const svc = createServiceClient();

    // 현재 상태 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: logData, error: fetchError } = await (svc as any)
      .from("email_logs")
      .select("status")
      .eq("id", externalId)
      .single();

    if (fetchError || !logData) {
      throw new Error(`email_logs 조회 실패: ${fetchError?.message ?? "레코드를 찾을 수 없습니다."}`);
    }

    const currentStatus = (logData as { status: string }).status;
    if (currentStatus === "sent") {
      throw new Error("이미 발송된 뉴스레터는 취소할 수 없습니다.");
    }

    // email_logs status 취소로 변경
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (svc as any)
      .from("email_logs")
      .update({ status: "cancelled" })
      .eq("id", externalId);

    if (updateError) {
      throw new Error(`뉴스레터 취소 실패: ${updateError.message}`);
    }

    // email_sends 레코드도 취소 처리
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (svc as any)
      .from("email_sends")
      .update({ status: "cancelled" })
      .eq("status", "queued");
    // 참고: email_sends에는 log_id FK가 없어서 subject 기반 취소는 안전하지 않음
    // Phase 2에서 email_sends에 log_id 컬럼 추가 후 연결 취소 구현 예정
  }

  /**
   * 뉴스레터 발송 통계 조회 — email_sends 집계
   * opened_at, clicked_at 기준으로 열람율/클릭율 계산
   */
  async getStats(externalId: string): Promise<Record<string, number>> {
    const svc = createServiceClient();

    // email_logs에서 발송 정보 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: logData } = await (svc as any)
      .from("email_logs")
      .select("subject, recipient_count")
      .eq("id", externalId)
      .single();

    if (!logData) {
      return { sent: 0, opened: 0, clicked: 0, openRate: 0, clickRate: 0 };
    }

    const log = logData as { subject: string; recipient_count: number | null };

    // email_sends에서 subject 기준 통계 집계
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sendsData } = await (svc as any)
      .from("email_sends")
      .select("status, opened_at, clicked_at")
      .eq("subject", log.subject)
      .eq("template", "newsletter");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sends = ((sendsData as any[]) || []);
    const sent = sends.filter((s) => s.status === "sent").length;
    const opened = sends.filter((s) => s.opened_at !== null).length;
    const clicked = sends.filter((s) => s.clicked_at !== null).length;
    const totalRecipients = log.recipient_count ?? sent;

    return {
      sent,
      opened,
      clicked,
      totalRecipients,
      openRate: totalRecipients > 0 ? Math.round((opened / totalRecipients) * 100) : 0,
      clickRate: totalRecipients > 0 ? Math.round((clicked / totalRecipients) * 100) : 0,
    };
  }
}
