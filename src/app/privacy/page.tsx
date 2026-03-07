export const metadata = {
  title: "개인정보처리방침 | BS Camp",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fc] py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl border border-[#e2e8f0] p-8 md:p-12">
        <h1 className="text-2xl font-bold text-[#1a1a1a] mb-2">개인정보처리방침</h1>
        <p className="text-sm text-[#64748b] mb-8">최종 업데이트: 2026년 3월 7일</p>

        <div className="space-y-8 text-[#1a1a1a] text-[15px] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-3">1. 수집하는 개인정보</h2>
            <p className="mb-2">BS Camp(이하 &quot;서비스&quot;)는 다음의 개인정보를 수집합니다.</p>
            <ul className="list-disc pl-6 space-y-1 text-[#334155]">
              <li>이메일 주소, 이름 (회원가입 및 로그인 시)</li>
              <li>광고 계정 정보 (Meta 광고 계정 ID, 광고 성과 데이터)</li>
              <li>서비스 이용 기록, 접속 로그, 쿠키</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">2. 개인정보 수집 및 이용 목적</h2>
            <ul className="list-disc pl-6 space-y-1 text-[#334155]">
              <li>서비스 제공 및 회원 관리</li>
              <li>Meta 광고 데이터 분석 및 교육 콘텐츠 제공</li>
              <li>광고 성과 벤치마크 및 경쟁사 분석 리포트 생성</li>
              <li>서비스 개선 및 신규 기능 개발</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">3. 광고 데이터 수집 및 활용 동의</h2>
            <p className="text-[#334155]">
              서비스는 Meta 광고 라이브러리 API 및 Meta Marketing API를 통해 공개된 광고 데이터를 수집·분석합니다.
              수집된 광고 데이터는 교육 목적의 벤치마크 분석, 경쟁사 광고 모니터링, 성과 비교에 활용되며,
              이용자의 동의 없이 제3자에게 판매하거나 마케팅 목적으로 사용하지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">4. 데이터 사용 동의</h2>
            <p className="text-[#334155]">
              이용자가 서비스에 연동한 광고 계정의 성과 데이터(노출수, 클릭수, 전환수, 비용 등)는
              서비스 내 대시보드 표시, 벤치마크 비교, AI 기반 인사이트 생성에 사용됩니다.
              데이터는 암호화하여 저장하며, 이용자가 계정을 삭제하면 관련 데이터도 함께 삭제됩니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">5. 개인정보 보유 및 파기</h2>
            <ul className="list-disc pl-6 space-y-1 text-[#334155]">
              <li>회원 탈퇴 시 즉시 파기 (단, 법령에 따른 보존 의무가 있는 경우 해당 기간까지 보관)</li>
              <li>광고 데이터: 계정 삭제 후 30일 이내 파기</li>
              <li>서비스 이용 기록: 3개월 보관 후 파기</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">6. 제3자 제공</h2>
            <p className="text-[#334155]">
              서비스는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다.
              다만, 다음의 경우에는 예외로 합니다.
            </p>
            <ul className="list-disc pl-6 space-y-1 text-[#334155] mt-2">
              <li>이용자가 사전에 동의한 경우</li>
              <li>법령에 의해 요구되는 경우</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">7. 이용자의 권리</h2>
            <ul className="list-disc pl-6 space-y-1 text-[#334155]">
              <li>개인정보 열람, 수정, 삭제 요청</li>
              <li>광고 데이터 수집 동의 철회</li>
              <li>서비스 탈퇴 및 데이터 삭제 요청</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">8. 연락처</h2>
            <p className="text-[#334155]">
              개인정보 관련 문의사항은 서비스 내 문의 기능 또는 관리자에게 연락해 주세요.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
