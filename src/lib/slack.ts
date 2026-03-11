const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID = "C0AL8E8LUTT";
const BASE_URL = "https://bscamp.vercel.app";

export async function notifyNewQuestion({
  questionId,
  title,
  authorName,
}: {
  questionId: string;
  title: string;
  authorName: string;
}) {
  if (!SLACK_BOT_TOKEN) {
    console.warn("SLACK_BOT_TOKEN이 설정되지 않아 슬랙 알림을 건너뜁니다.");
    return;
  }

  const questionUrl = `${BASE_URL}/questions/${questionId}`;
  const text = `📩 새 질문이 등록됐습니다\n*${title}*\n작성자: ${authorName}\n${questionUrl}`;

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL_ID,
        text,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error("슬랙 알림 전송 실패:", data.error);
    }
  } catch (err) {
    console.error("슬랙 알림 전송 중 오류:", err);
  }
}
