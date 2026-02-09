import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { renderEmail, type TemplateName } from "@/lib/email-renderer";
import { makeUnsubscribeUrl, replaceUnsubscribeUrl } from "@/lib/email-templates";

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    // 인증 + admin 권한 확인
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 }
      );
    }

    // SMTP 환경변수 확인
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return NextResponse.json(
        { error: "SMTP 설정이 되어있지 않습니다. SMTP_USER, SMTP_PASS 환경변수를 설정해주세요." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      target,
      customEmails,
      subject,
      html,
      template,
      templateProps,
      attachments,
    } = body as {
      target: "all" | "all_leads" | "all_students" | "all_members" | "custom";
      customEmails?: string[];
      subject: string;
      html?: string;
      template?: TemplateName;
      templateProps?: Record<string, string>;
      attachments?: { filename: string; url: string; size: number }[];
    };

    if (!subject) {
      return NextResponse.json(
        { error: "제목은 필수입니다." },
        { status: 400 }
      );
    }

    // 템플릿 또는 html 중 하나는 필수
    if (!template && !html) {
      return NextResponse.json(
        { error: "템플릿 또는 HTML 본문이 필요합니다." },
        { status: 400 }
      );
    }

    // 수신자 목록 조회
    let recipients: { email: string; type: string }[] = [];

    if (target === "custom") {
      if (!customEmails || customEmails.length === 0) {
        return NextResponse.json(
          { error: "직접 입력 시 이메일 주소가 필요합니다." },
          { status: 400 }
        );
      }
      recipients = customEmails.map((email) => ({ email, type: "custom" }));
    } else if (target === "all_leads") {
      const { data } = await svc
        .from("leads")
        .select("email")
        .eq("email_opted_out", false);
      recipients = (data || []).map((r) => ({ email: r.email, type: "lead" }));
    } else if (target === "all_students") {
      const { data } = await svc
        .from("student_registry")
        .select("email");
      recipients = (data || []).map((r) => ({ email: r.email, type: "student" }));
    } else if (target === "all_members") {
      const { data } = await svc
        .from("profiles")
        .select("email")
        .in("role", ["member", "student", "alumni", "admin"]);
      recipients = (data || []).map((r) => ({ email: r.email, type: "member" }));
    } else if (target === "all") {
      // leads(opted_out 제외) + profiles 통합, 중복 제거
      const [leadsData, profilesData] = await Promise.all([
        svc.from("leads").select("email").eq("email_opted_out", false),
        svc.from("profiles").select("email").in("role", ["member", "student", "alumni", "admin"]),
      ]);
      const emailMap = new Map<string, string>();
      for (const r of leadsData.data || []) {
        emailMap.set(r.email, "lead");
      }
      // profiles 덮어쓰기 (회원 정보 우선)
      for (const r of profilesData.data || []) {
        emailMap.set(r.email, "member");
      }
      recipients = Array.from(emailMap.entries()).map(([email, type]) => ({ email, type }));
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "수신자가 없습니다." },
        { status: 400 }
      );
    }

    // 중복 제거
    const uniqueMap = new Map<string, string>();
    for (const r of recipients) {
      if (!uniqueMap.has(r.email)) {
        uniqueMap.set(r.email, r.type);
      }
    }
    recipients = Array.from(uniqueMap.entries()).map(([email, type]) => ({
      email,
      type,
    }));

    // Nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // HTML 렌더링: React Email 템플릿 또는 기존 HTML
    let fullHtml: string;
    const templateName = template || "newsletter";

    try {
      if (template && templateProps) {
        fullHtml = await renderEmail(template as TemplateName, {
          subject,
          ...templateProps,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      } else {
        fullHtml = await renderEmail("newsletter", {
          subject,
          bodyHtml: html || "",
        });
      }
    } catch (renderError) {
      console.error("Template render error:", renderError);
      return NextResponse.json(
        { error: `템플릿 렌더링 오류: ${renderError instanceof Error ? renderError.message : String(renderError)}` },
        { status: 500 }
      );
    }

    // 수신거부 URL용 base URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://bscamp.kr");

    // 배치 발송
    let sent = 0;
    let failed = 0;
    const errors: { email: string; error: string }[] = [];

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (recipient) => {
          try {
            // 수신자별 수신거부 URL 삽입
            const unsubUrl = makeUnsubscribeUrl(baseUrl, recipient.email);
            const recipientHtml = replaceUnsubscribeUrl(fullHtml, unsubUrl);

            await transporter.sendMail({
              from: `"BS CAMP" <${process.env.SMTP_USER}>`,
              to: recipient.email,
              subject,
              html: recipientHtml,
              ...(attachments && attachments.length > 0 && {
                attachments: attachments.map((a) => ({
                  filename: a.filename,
                  path: a.url,
                })),
              }),
            });

            await svc.from("email_sends").insert({
              recipient_email: recipient.email,
              recipient_type: recipient.type,
              subject,
              template: templateName,
              status: "sent",
              sent_at: new Date().toISOString(),
            });

            return { success: true };
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : "알 수 없는 오류";

            await svc.from("email_sends").insert({
              recipient_email: recipient.email,
              recipient_type: recipient.type,
              subject,
              template: templateName,
              status: "failed",
              error_message: errorMessage,
            });

            return { success: false, email: recipient.email, error: errorMessage };
          }
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value.success) {
          sent++;
        } else {
          failed++;
          if (result.status === "fulfilled" && !result.value.success) {
            errors.push({
              email: result.value.email!,
              error: result.value.error!,
            });
          }
        }
      }

      // 배치 간 딜레이 (마지막 배치 제외)
      if (i + BATCH_SIZE < recipients.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    return NextResponse.json({
      success: true,
      total: recipients.length,
      sent,
      failed,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error("Email send error:", error);
    return NextResponse.json(
      { error: "이메일 발송 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
