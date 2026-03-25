/**
 * naver-cafe.ts — 네이버 카페 API 클라이언트
 *
 * 네이버 오픈 API를 사용하여 카페에 게시글을 작성합니다.
 * API 엔드포인트: https://openapi.naver.com/v1/cafe/{clubId}/menu/{menuId}/articles
 * 인증 방식: OAuth2 Bearer Token
 *
 * 토큰은 channel_credentials 테이블에 AES-256-GCM으로 암호화 저장됩니다.
 */

import { createDecipheriv } from "crypto";
import type { ChannelApiClient, ChannelPostRequest, ChannelPostResult } from "./types";
import { createServiceClient } from "@/lib/db";

// 네이버 카페 API 베이스 URL
const NAVER_CAFE_API_BASE = "https://openapi.naver.com/v1/cafe";

// 토큰 갱신 API
const NAVER_TOKEN_REFRESH_URL = "https://nid.naver.com/oauth2.0/token";

/**
 * AES-256-GCM 토큰 복호화
 * 저장 형식: {ivHex}:{authTagHex}:{ciphertextHex}
 *
 * 환경변수 CHANNEL_CREDENTIAL_KEY: 32바이트(64자 hex) 암호화 키
 */
function decryptToken(encryptedToken: string): string {
  const keyHex = process.env.CHANNEL_CREDENTIAL_KEY;
  if (!keyHex) {
    throw new Error("CHANNEL_CREDENTIAL_KEY 환경변수가 설정되지 않았습니다.");
  }

  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("CHANNEL_CREDENTIAL_KEY는 32바이트(64자 hex)여야 합니다.");
  }

  const parts = encryptedToken.split(":");
  if (parts.length !== 3) {
    throw new Error("암호화된 토큰 형식이 올바르지 않습니다. 형식: ivHex:authTagHex:ciphertextHex");
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext, "hex", "utf8") + decipher.final("utf8");
}

/**
 * 네이버 액세스 토큰 갱신
 * 만료된 액세스 토큰을 리프레시 토큰으로 갱신하고 DB에 저장
 */
async function refreshNaverAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(NAVER_TOKEN_REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`네이버 토큰 갱신 실패: ${response.status} ${response.statusText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();
  if (!data.access_token) {
    throw new Error(`네이버 토큰 갱신 응답에 access_token이 없습니다: ${JSON.stringify(data)}`);
  }

  return data.access_token as string;
}

/**
 * channel_credentials 테이블에서 네이버 카페 액세스 토큰 조회
 * 만료 시 리프레시 토큰으로 갱신
 */
async function getNaverAccessToken(): Promise<string> {
  const svc = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc as any)
    .from("channel_credentials")
    .select("access_token_enc, refresh_token_enc, token_expires_at")
    .eq("channel", "naver_cafe")
    .eq("is_active", true)
    .single();

  if (error || !data) {
    throw new Error("네이버 카페 자격증명을 찾을 수 없습니다. channel_credentials 테이블을 확인해주세요.");
  }

  const credentials = data as {
    access_token_enc: string | null;
    refresh_token_enc: string | null;
    token_expires_at: string | null;
  };

  if (!credentials.access_token_enc) {
    throw new Error("네이버 카페 액세스 토큰이 없습니다.");
  }

  // 토큰 만료 확인 (5분 여유 두고 갱신)
  const isExpired =
    credentials.token_expires_at
      ? new Date(credentials.token_expires_at).getTime() - 5 * 60 * 1000 < Date.now()
      : false;

  if (isExpired && credentials.refresh_token_enc) {
    // 리프레시 토큰으로 갱신
    const refreshToken = decryptToken(credentials.refresh_token_enc);
    const newAccessToken = await refreshNaverAccessToken(refreshToken);

    // 갱신된 토큰은 암호화하지 않고 원문 반환
    // (DB 업데이트는 별도 관리 - Phase 2에서 구현)
    return newAccessToken;
  }

  // 복호화하여 반환
  return decryptToken(credentials.access_token_enc);
}

/**
 * 네이버 카페 API 클라이언트
 *
 * @example
 * const client = new NaverCafeClient({ clubId: "12345", menuId: "67890" });
 * const result = await client.publish({ title: "제목", body: "내용", metadata: {} });
 */
export class NaverCafeClient implements ChannelApiClient {
  private clubId: string;
  private menuId: string;

  constructor(config: { clubId: string; menuId: string }) {
    this.clubId = config.clubId;
    this.menuId = config.menuId;
  }

  /**
   * 카페에 게시글 발행
   * POST https://openapi.naver.com/v1/cafe/{clubId}/menu/{menuId}/articles
   * Content-Type: multipart/form-data (subject, content — HTML 본문)
   */
  async publish(req: ChannelPostRequest): Promise<ChannelPostResult> {
    const accessToken = await getNaverAccessToken();

    // multipart/form-data 구성
    const formData = new FormData();
    formData.append("subject", req.title);

    // 마크다운을 HTML로 단순 변환 (줄바꿈 → <br>)
    const htmlBody = req.body.replace(/\n/g, "<br/>");
    formData.append("content", htmlBody);

    const apiUrl = `${NAVER_CAFE_API_BASE}/${this.clubId}/menu/${this.menuId}/articles`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // Content-Type은 FormData가 자동으로 multipart/form-data + boundary 설정
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `네이버 카페 게시글 발행 실패: ${response.status} ${response.statusText} — ${errorText}`
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();

    // 응답에서 게시글 ID와 URL 추출
    const articleId = String(data?.message?.result?.articleId ?? data?.articleId ?? "");
    const externalUrl = articleId
      ? `https://cafe.naver.com/${this.clubId}/${articleId}`
      : `https://cafe.naver.com/${this.clubId}`;

    return {
      externalId: articleId,
      externalUrl,
    };
  }

  /**
   * 카페 API는 게시글 삭제를 지원하지 않습니다.
   * 카페 관리자 페이지에서 직접 삭제해주세요.
   */
  async delete(_externalId: string): Promise<void> {
    throw new Error(
      "네이버 카페 API는 게시글 삭제를 지원하지 않습니다. 카페 관리자 페이지에서 직접 삭제해주세요."
    );
  }

  /**
   * 카페 API는 게시글 통계를 지원하지 않습니다.
   * Phase 3에서 카페 통계 API 연동 예정.
   */
  async getStats(_externalId: string): Promise<Record<string, number>> {
    return {};
  }
}
