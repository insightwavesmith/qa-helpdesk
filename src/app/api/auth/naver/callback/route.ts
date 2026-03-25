/**
 * GET /api/auth/naver/callback
 * 네이버 OAuth 인증 코드 수신 → 토큰 교환 → DB 저장
 *
 * state 파라미터: "naver_blog" | "naver_cafe" (어떤 채널 자격증명을 저장할지 구분)
 * 성공 시: /admin/organic?auth=success 리다이렉트
 * 실패 시: /admin/organic?auth=error&reason=... 리다이렉트
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ----------------------------------------------------------------
// 암호화 유틸 (AES-256-GCM)
// ----------------------------------------------------------------

/**
 * AES-256-GCM 암호화
 * 반환 형식: "{iv_hex}:{authTag_hex}:{encrypted_hex}"
 */
function encryptToken(token: string): string {
  const keyHex = process.env.CHANNEL_CREDENTIAL_KEY;
  if (!keyHex) throw new Error("CHANNEL_CREDENTIAL_KEY 환경변수가 설정되지 않았습니다.");

  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12); // GCM 권장 12바이트
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = cipher.update(token, "utf8", "hex") + cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * AES-256-GCM 복호화
 * 입력 형식: "{iv_hex}:{authTag_hex}:{encrypted_hex}"
 */
function decryptToken(encryptedStr: string): string {
  const keyHex = process.env.CHANNEL_CREDENTIAL_KEY;
  if (!keyHex) throw new Error("CHANNEL_CREDENTIAL_KEY 환경변수가 설정되지 않았습니다.");

  const parts = encryptedStr.split(":");
  if (parts.length !== 3) throw new Error("잘못된 암호화 형식입니다.");

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encryptedHex, "hex", "utf8") + decipher.final("utf8");
}

// ----------------------------------------------------------------
// 네이버 OAuth 토큰 교환
// ----------------------------------------------------------------

interface NaverTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/**
 * 네이버 OAuth 인증 코드 → 액세스/리프레시 토큰 교환
 */
async function exchangeNaverCode(code: string, state: string): Promise<NaverTokenResponse> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.");
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    state,
  });

  const res = await fetch("https://nid.naver.com/oauth2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  return res.json() as Promise<NaverTokenResponse>;
}

// ----------------------------------------------------------------
// GET 핸들러: OAuth 콜백 처리
// ----------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // "naver_blog" | "naver_cafe"
  const errorParam = searchParams.get("error");

  // 베이스 리다이렉트 URL
  const baseRedirect = new URL("/admin/organic", req.url);

  // 사용자가 인증을 거부한 경우
  if (errorParam) {
    baseRedirect.searchParams.set("auth", "error");
    baseRedirect.searchParams.set("reason", errorParam);
    return NextResponse.redirect(baseRedirect);
  }

  // 필수 파라미터 검증
  if (!code || !state) {
    baseRedirect.searchParams.set("auth", "error");
    baseRedirect.searchParams.set("reason", "missing_params");
    return NextResponse.redirect(baseRedirect);
  }

  // state가 유효한 채널인지 검증
  const validChannels = ["naver_blog", "naver_cafe"];
  if (!validChannels.includes(state)) {
    baseRedirect.searchParams.set("auth", "error");
    baseRedirect.searchParams.set("reason", "invalid_state");
    return NextResponse.redirect(baseRedirect);
  }

  try {
    // 1. 네이버 토큰 교환
    const tokenRes = await exchangeNaverCode(code, state);

    if (tokenRes.error || !tokenRes.access_token) {
      console.error("[naver-callback] 토큰 교환 실패:", tokenRes.error_description || tokenRes.error);
      baseRedirect.searchParams.set("auth", "error");
      baseRedirect.searchParams.set("reason", tokenRes.error || "token_exchange_failed");
      return NextResponse.redirect(baseRedirect);
    }

    // 2. 토큰 암호화
    const accessTokenEnc = encryptToken(tokenRes.access_token);
    const refreshTokenEnc = tokenRes.refresh_token
      ? encryptToken(tokenRes.refresh_token)
      : null;

    // 만료 시각 계산 (expires_in: 초 단위)
    const tokenExpiresAt = tokenRes.expires_in
      ? new Date(Date.now() + tokenRes.expires_in * 1000).toISOString()
      : null;

    // 3. channel_credentials UPSERT (채널별 1개 레코드 유지)
    const svc = createServiceClient();
    const { error: upsertErr } = await svc
      .from("channel_credentials")
      .upsert(
        {
          channel: state,
          access_token_enc: accessTokenEnc,
          refresh_token_enc: refreshTokenEnc,
          token_expires_at: tokenExpiresAt,
          is_active: true,
          extra_config: {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "channel" }
      );

    if (upsertErr) {
      console.error("[naver-callback] DB upsert 실패:", upsertErr);
      baseRedirect.searchParams.set("auth", "error");
      baseRedirect.searchParams.set("reason", "db_error");
      return NextResponse.redirect(baseRedirect);
    }

    // 4. 성공 리다이렉트
    const successRedirect = new URL("/admin/organic", req.url);
    successRedirect.searchParams.set("auth", "success");
    successRedirect.searchParams.set("channel", state);
    return NextResponse.redirect(successRedirect);
  } catch (err) {
    console.error("[naver-callback] 오류:", err);
    baseRedirect.searchParams.set("auth", "error");
    baseRedirect.searchParams.set("reason", "server_error");
    return NextResponse.redirect(baseRedirect);
  }
}

// ----------------------------------------------------------------
// 토큰 갱신 유틸 (외부 노출용)
// ----------------------------------------------------------------

/**
 * 네이버 리프레시 토큰으로 액세스 토큰 갱신
 * channel: "naver_blog" | "naver_cafe"
 */
export async function refreshNaverToken(
  channel: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const svc = createServiceClient();

  // channel_credentials에서 refresh_token 로드
  const { data: credential, error: credErr } = await svc
    .from("channel_credentials")
    .select("refresh_token_enc")
    .eq("channel", channel)
    .eq("is_active", true)
    .single();

  if (credErr || !credential) {
    throw new Error(`채널 자격증명을 찾을 수 없습니다: ${channel}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshTokenEnc: string | null = (credential as any).refresh_token_enc;
  if (!refreshTokenEnc) {
    throw new Error(`${channel}의 리프레시 토큰이 없습니다.`);
  }

  // 복호화
  const refreshToken = decryptToken(refreshTokenEnc);

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.");
  }

  // 새 액세스 토큰 요청
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch("https://nid.naver.com/oauth2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const tokenRes = (await res.json()) as NaverTokenResponse;

  if (tokenRes.error || !tokenRes.access_token) {
    throw new Error(`토큰 갱신 실패: ${tokenRes.error_description || tokenRes.error}`);
  }

  // 새 토큰 암호화
  const newAccessTokenEnc = encryptToken(tokenRes.access_token);
  const expiresAt = tokenRes.expires_in
    ? new Date(Date.now() + tokenRes.expires_in * 1000)
    : new Date(Date.now() + 3600 * 1000); // 기본 1시간

  // DB 업데이트
  await svc
    .from("channel_credentials")
    .update({
      access_token_enc: newAccessTokenEnc,
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("channel", channel);

  return { accessToken: tokenRes.access_token, expiresAt };
}
