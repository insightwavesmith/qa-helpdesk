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
  Row,
  Column,
  Font,
} from "@react-email/components";

interface WebinarInviteProps {
  title?: string;
  date?: string;
  time?: string;
  registrationUrl?: string;
}

export default function WebinarInvite({
  title = "사례로 배우는 메타 광고",
  date = "2026. 02. 12. 목",
  time = "15:00~17:30",
  registrationUrl = "https://1bpluschool.com",
}: WebinarInviteProps) {
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
      <Preview>자사몰 사관학교 LIVE 무료 웨비나 - {title}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={headerBrand}>자사몰 사관학교</Text>
          </Section>

          {/* Hero Section */}
          <Section style={heroSection}>
            <Text style={heroSubtitle}>자사몰 대표자를 위한</Text>
            <Heading as="h1" style={heroTitle}>
              {title}
            </Heading>
            <Text style={heroDate}>{date}</Text>
            <Text style={heroTime}>{time}</Text>
            <Section style={badgeWrapper}>
              <Text style={liveBadge}>LIVE 무료 웨비나</Text>
            </Section>
            <Text style={heroNote}>
              사전등록 필수 | 더 자세한 내용은 아래에서 확인해 주세요.
            </Text>
            <Section style={ctaWrapperHero}>
              <Button style={ctaButtonWhite} href={registrationUrl}>
                신청하기
              </Button>
            </Section>
          </Section>

          {/* Body - PAS 구조 */}
          <Section style={bodySection}>
            <Text style={bodyText}>
              안녕하세요. 자사몰 사관학교 스미스입니다.
            </Text>
            <Text style={bodyText}>
              최근 대표님들과 이야기를 나누다 보면 이런 말을 정말 자주 듣습니다.
            </Text>
            <Text style={quoteText}>
              &ldquo;자사몰 사관학교 아니었으면,
              <br />
              잘못된 정보로 계속 광고 돌리고 있었을 것 같아요.&rdquo;
            </Text>

            <Heading as="h2" style={sectionHeading}>
              자사몰 광고의 현실
            </Heading>
            <Text style={bodyText}>
              쿠팡이나 오픈마켓에서는 매출이 나오는데, 자사몰 광고는 유독 어렵게
              느껴집니다.
            </Text>
            <Text style={bodyText}>
              소재를 바꾸고, 타겟을 바꾸고, 예산을 조절해도 누군가에게 &ldquo;왜
              이 광고를 지금 쓰고 있는지&rdquo; 설명하려 하면 말이 막힙니다.
            </Text>

            <Heading as="h2" style={sectionHeading}>
              &lsquo;방법만 배운&rsquo; 광고 운영
            </Heading>
            <Text style={bodyText}>
              이건 대표님이 광고를 못해서가 아닙니다. 대부분{" "}
              <strong>방법만 배워왔기 때문</strong>이죠.
            </Text>
            <Text style={emphasisText}>
              &ldquo;나는 이 고객에게 이 광고를 왜 지금 써야 하는가?&rdquo;
            </Text>
            <Text style={bodyText}>
              이 질문에 답하지 못하면 광고는 계속 &lsquo;감&rsquo;으로 운영될
              수밖에 없습니다.
            </Text>
          </Section>

          {/* 성과 데이터 */}
          <Section style={statsSection}>
            <Heading as="h2" style={statsSectionHeading}>
              구조를 이해한 자사몰의 결과
            </Heading>
            <Text style={statsSubtext}>
              1기~5기 수강생 78명의 성과입니다.
            </Text>
            <Section>
              <Row>
                <Column style={statCard}>
                  <Text style={statLabel}>총 광고비</Text>
                  <Text style={statValue}>40.8억</Text>
                </Column>
                <Column style={statCard}>
                  <Text style={statLabel}>총 매출</Text>
                  <Text style={statValue}>104억</Text>
                </Column>
                <Column style={statCard}>
                  <Text style={statLabel}>평균 ROAS</Text>
                  <Text style={statValue}>254%</Text>
                </Column>
              </Row>
            </Section>
          </Section>

          {/* Final CTA */}
          <Section style={bodySection}>
            <Text style={{ ...bodyText, textAlign: "center" as const }}>
              구조가 잡히면 광고는 더 이상 불안한 영역이 아닙니다.
            </Text>
            <Text style={{ ...bodyText, textAlign: "center" as const }}>
              <strong>
                왜 이 광고를 지금 쓰는지, 스스로 설명할 수 있는 상태
              </strong>
              를 만들고 싶다면
              <br />
              이번 웨비나에서 뵙겠습니다.
            </Text>
            <Section style={ctaWrapper}>
              <Button style={ctaButton} href={registrationUrl}>
                웨비나 신청하기
              </Button>
            </Section>
          </Section>

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
  backgroundColor: "#2D2D2D",
  padding: "28px 32px 8px",
  textAlign: "center",
};

const headerBrand: React.CSSProperties = {
  color: "#E85A2A",
  fontSize: "14px",
  fontWeight: 600,
  margin: 0,
};

const heroSection: React.CSSProperties = {
  backgroundColor: "#2D2D2D",
  padding: "0 32px 32px",
  textAlign: "center",
};

const heroSubtitle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "20px",
  fontWeight: 700,
  margin: "0 0 4px",
};

const heroTitle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "36px",
  fontWeight: 700,
  lineHeight: "1.2",
  margin: "0 0 16px",
};

const heroDate: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "18px",
  fontWeight: 700,
  margin: "0",
};

const heroTime: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "18px",
  fontWeight: 700,
  margin: "0 0 16px",
};

const badgeWrapper: React.CSSProperties = {
  textAlign: "center",
  marginBottom: "8px",
};

const liveBadge: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#E85A2A",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 700,
  padding: "6px 16px",
  borderRadius: "20px",
  margin: "0",
};

const heroNote: React.CSSProperties = {
  color: "#cccccc",
  fontSize: "14px",
  margin: "8px 0 16px",
};

const ctaWrapperHero: React.CSSProperties = {
  textAlign: "center",
  padding: "8px 0 0",
};

const ctaButtonWhite: React.CSSProperties = {
  backgroundColor: "#ffffff",
  color: "#2D2D2D",
  fontSize: "16px",
  fontWeight: 700,
  padding: "14px 32px",
  borderRadius: "500px",
  textDecoration: "none",
  display: "inline-block",
};

const bodySection: React.CSSProperties = {
  backgroundColor: "#ffffff",
  padding: "32px",
};

const bodyText: React.CSSProperties = {
  color: "#333333",
  fontSize: "15px",
  lineHeight: "1.7",
  margin: "0 0 16px",
};

const quoteText: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "16px",
  fontWeight: 700,
  lineHeight: "1.7",
  margin: "0 0 24px",
  padding: "16px 20px",
  borderLeft: "3px solid #E85A2A",
  backgroundColor: "#fafafa",
};

const emphasisText: React.CSSProperties = {
  color: "#E85A2A",
  fontSize: "16px",
  fontWeight: 700,
  fontStyle: "italic",
  lineHeight: "1.7",
  margin: "0 0 16px",
};

const sectionHeading: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "20px",
  fontWeight: 700,
  margin: "32px 0 12px",
  padding: 0,
};

const statsSection: React.CSSProperties = {
  backgroundColor: "#f9f9f9",
  padding: "32px",
  textAlign: "center",
};

const statsSectionHeading: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "20px",
  fontWeight: 700,
  margin: "0 0 4px",
  padding: 0,
};

const statsSubtext: React.CSSProperties = {
  color: "#777777",
  fontSize: "13px",
  margin: "0 0 20px",
};

const statCard: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "16px 8px",
  textAlign: "center",
  border: "1px solid #eeeeee",
  width: "33.33%",
};

const statLabel: React.CSSProperties = {
  color: "#888888",
  fontSize: "12px",
  margin: "0 0 4px",
};

const statValue: React.CSSProperties = {
  color: "#E85A2A",
  fontSize: "22px",
  fontWeight: 700,
  margin: 0,
};

const ctaWrapper: React.CSSProperties = {
  textAlign: "center",
  padding: "16px 0 0",
};

const ctaButton: React.CSSProperties = {
  backgroundColor: "#E85A2A",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: 700,
  padding: "16px 40px",
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
