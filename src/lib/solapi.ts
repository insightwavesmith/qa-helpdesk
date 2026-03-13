import { createHmac, randomUUID } from "crypto";

const SOLAPI_API_URL = "https://api.solapi.com/messages/v4/send";
const KAKAO_PF_ID = "KA01PF260224053759051mFP88hSPjQv";
const KAKAO_TEMPLATE_ID = "KA01TP2603110817364241yYm61nGS6W";

function generateAuthHeader(): string {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("SOLAPI 환경변수 미설정");
  }

  const date = new Date().toISOString();
  const salt = randomUUID();
  const signature = createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");

  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

/**
 * 솔라피 카카오 알림톡 발송
 * - 전화번호가 없거나 환경변수 미설정이면 조용히 스킵
 * - 발송 실패해도 에러를 throw하지 않음
 */
export async function sendKakaoNotification(phone: string): Promise<void> {
  if (!phone) {
    console.log("[Solapi] 전화번호 없음, 스킵");
    return;
  }

  if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET) {
    console.log("[Solapi] 환경변수 미설정, 스킵");
    return;
  }

  // 전화번호 정규화: 하이픈 제거
  const normalizedPhone = phone.replace(/-/g, "");

  try {
    const res = await fetch(SOLAPI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: generateAuthHeader(),
      },
      body: JSON.stringify({
        message: {
          to: normalizedPhone,
          from: "01095948905",
          kakaoOptions: {
            pfId: KAKAO_PF_ID,
            templateId: KAKAO_TEMPLATE_ID,
            disableSms: true,
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[Solapi] 발송 실패:", res.status, body);
    } else {
      console.log("[Solapi] 알림톡 발송 성공:", normalizedPhone);
    }
  } catch (err) {
    console.error("[Solapi] 네트워크 에러:", err);
  }
}
