import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Button,
  Font,
} from "@react-email/components";

interface NewsletterProps {
  subject?: string;
  bodyHtml?: string;
  ctaText?: string;
  ctaUrl?: string;
}

export default function Newsletter({
  subject = "BS CAMP 뉴스레터",
  bodyHtml = "<p>안녕하세요. BS CAMP 뉴스레터입니다.</p>",
  ctaText,
  ctaUrl,
}: NewsletterProps) {
  return (
    <Html lang="ko">
      <Head>
        <Font
          fontFamily="Pretendard"
          fallbackFontFamily="sans-serif"
          webFont={{
            url: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard/Pretendard-Regular.subset.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={headerBrand}>자사몰 사관학교</Text>
            <Heading as="h1" style={headerTitle}>
              BS CAMP
            </Heading>
          </Section>

          {/* Body */}
          <Section style={bodySection}>
            <Heading as="h2" style={subjectHeading}>
              {subject}
            </Heading>
            <Section
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
              style={htmlContent}
            />
          </Section>

          {/* Optional CTA */}
          {ctaText && ctaUrl && (
            <Section style={ctaWrapper}>
              <Button style={ctaButton} href={ctaUrl}>
                {ctaText}
              </Button>
            </Section>
          )}

          {/* Footer */}
          <Section style={footer}>
            <Hr style={divider} />
            <Text style={footerBrand}>자사몰 사관학교</Text>
            <Text style={footerText}>
              본 메일은 BS CAMP에서 발송한 뉴스레터입니다.
              <br />
              수신을 원하지 않으시면{" "}
              <Link
                href="mailto:smith.kim@inwv.co?subject=수신거부 요청"
                style={footerLink}
              >
                수신거부
              </Link>
              를 클릭해주세요.
            </Text>
            <Text style={footerCopyright}>
              &copy; {new Date().getFullYear()} BS CAMP. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main: React.CSSProperties = {
  backgroundColor: "#f5f5f5",
  fontFamily:
    "Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  margin: 0,
  padding: "20px 0",
};

const container: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
};

const header: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  padding: "28px 32px",
  textAlign: "center",
};

const headerBrand: React.CSSProperties = {
  color: "#E85A2A",
  fontSize: "14px",
  fontWeight: 600,
  margin: "0 0 8px",
};

const headerTitle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "18px",
  fontWeight: 600,
  margin: 0,
};

const bodySection: React.CSSProperties = {
  padding: "32px",
};

const subjectHeading: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "22px",
  fontWeight: 700,
  margin: "0 0 20px",
  padding: 0,
};

const htmlContent: React.CSSProperties = {
  color: "#333333",
  fontSize: "15px",
  lineHeight: "1.7",
};

const ctaWrapper: React.CSSProperties = {
  textAlign: "center",
  padding: "0 32px 32px",
};

const ctaButton: React.CSSProperties = {
  backgroundColor: "#E85A2A",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: 700,
  padding: "14px 36px",
  borderRadius: "500px",
  textDecoration: "none",
  display: "inline-block",
};

const footer: React.CSSProperties = {
  backgroundColor: "#fafafa",
  padding: "24px 32px",
  textAlign: "center",
};

const divider: React.CSSProperties = {
  border: 0,
  borderTop: "1px solid #eeeeee",
  margin: "0 0 16px",
};

const footerBrand: React.CSSProperties = {
  color: "#a4a4a4",
  fontSize: "12px",
  margin: "0 0 8px",
};

const footerText: React.CSSProperties = {
  color: "#999999",
  fontSize: "12px",
  lineHeight: "1.6",
  margin: "0 0 8px",
};

const footerLink: React.CSSProperties = {
  color: "#999999",
  textDecoration: "underline",
};

const footerCopyright: React.CSSProperties = {
  color: "#aaaaaa",
  fontSize: "11px",
  margin: 0,
};
