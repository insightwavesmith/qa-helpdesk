import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getFirebaseAuth } from "@/lib/firebase/admin";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "이메일이 필요합니다" }, { status: 400 });
    }

    const auth = getFirebaseAuth();

    const resetLink = await auth.generatePasswordResetLink(email, {
      url: "https://bscamp.app/login",
    });

    const url = new URL(resetLink);
    const oobCode = url.searchParams.get("oobCode");

    if (!oobCode) {
      throw new Error("oobCode 추출 실패");
    }

    const customResetLink = `https://bscamp.app/reset-password?oobCode=${oobCode}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: '"자사몰사관학교" <smith.kim@inwv.co>',
      to: email,
      subject: "[자사몰사관학교] 비밀번호 재설정",
      html: `
        <div style="max-width: 480px; margin: 0 auto; font-family: 'Pretendard', -apple-system, sans-serif; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h2 style="color: #111827; font-size: 20px; margin: 0;">자사몰사관학교</h2>
            <p style="color: #6B7280; font-size: 14px; margin-top: 8px;">비밀번호 재설정 안내</p>
          </div>
          <div style="background: #F9FAFB; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0;">
              비밀번호 재설정을 요청하셨습니다.<br>
              아래 버튼을 클릭하여 새 비밀번호를 설정해 주세요.
            </p>
          </div>
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${customResetLink}"
               style="display: inline-block; background: #F75D5D; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
              비밀번호 재설정
            </a>
          </div>
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; line-height: 1.5;">
            본인이 요청하지 않았다면 이 이메일을 무시해 주세요.<br>
            링크는 1시간 후 만료됩니다.
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[reset-password] error:", error);
    return NextResponse.json({ success: true });
  }
}
