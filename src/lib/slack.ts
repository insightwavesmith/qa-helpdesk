const SLACK_CHANNEL = "C0AL8E8LUTT";

/**
 * 수강생 새 질문 등록 시 슬랙 채널에 알림 발송
 * fire-and-forget: 실패해도 throw 하지 않음
 */
export async function notifyNewQuestion({
  title,
  authorName,
  questionId,
}: {
  title: string;
  authorName: string;
  questionId: string;
}): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.log("[Slack] SLACK_BOT_TOKEN 미설정, 스킵");
    return;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bscamp.app";
  const url = `${siteUrl}/questions/${questionId}`;
  const text = `📩 새 질문이 등록됐습니다\n*${title}*\n작성자: ${authorName}\n${url}`;

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[Slack] 발송 실패:", res.status, body);
    } else {
      const data = await res.json();
      if (!data.ok) {
        console.error("[Slack] API 에러:", data.error);
      } else {
        console.log("[Slack] 새 질문 알림 발송 성공:", questionId);
      }
    }
  } catch (err) {
    console.error("[Slack] 네트워크 에러:", err);
  }
}
