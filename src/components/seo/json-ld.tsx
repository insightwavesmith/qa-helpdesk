export function JsonLd() {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "자사몰사관학교",
    url: "https://bscamp.app",
    description:
      "메타 광고 전문 교육 플랫폼. 자사몰 운영자를 위한 실전 광고 전략과 Q&A 헬프데스크를 제공합니다.",
    sameAs: [],
  };

  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "자사몰사관학교",
    url: "https://bscamp.app",
    description: "자사몰사관학교 수강생 전용 Q&A 헬프데스크",
    inLanguage: "ko-KR",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webSiteSchema),
        }}
      />
    </>
  );
}
