export const metadata = {
  title: "개인정보처리방침 | BS Camp",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fc] py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl border border-[#e2e8f0] p-8 md:p-12">
        <h1 className="text-2xl font-bold text-[#1a1a1a] mb-2">개인정보처리방침</h1>
        <p className="text-sm text-[#64748b] mb-8">최종 업데이트: 2026년 3월 8일</p>

        <div className="space-y-8 text-[#1a1a1a] text-[15px] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-3">1. 수집하는 개인정보</h2>
            <p className="mb-2">BS Camp(이하 &quot;서비스&quot;)는 회원가입 및 서비스 제공을 위해 다음의 개인정보를 수집합니다.</p>
            <h3 className="text-sm font-semibold text-[#475569] mt-3 mb-1">필수 수집 항목</h3>
            <ul className="list-disc pl-6 space-y-1 text-[#334155]">
              <li>이메일 주소 (로그인 및 계정 식별)</li>
              <li>이름 (서비스 내 표시 및 수강 관리)</li>
              <li>비밀번호 (계정 인증, 암호화 저장)</li>
            </ul>
            <h3 className="text-sm font-semibold text-[#475569] mt-3 mb-1">선택 수집 항목</h3>
            <ul className="list-disc pl-6 space-y-1 text-[#334155]">
              <li>전화번호 (사업자 회원 가입 시)</li>
              <li>사업자등록번호, 쇼핑몰 정보 (사업자 회원 가입 시)</li>
              <li>Meta 광고 계정 ID (광고 성과 분석 연동 시)</li>
            </ul>
            <h3 className="text-sm font-semibold text-[#475569] mt-3 mb-1">자동 수집 항목</h3>
            <ul className="list-disc pl-6 space-y-1 text-[#334155]">
              <li>서비스 이용 기록, 접속 로그, 쿠키</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">2. 개인정보 수집 및 이용 목적</h2>
            <ul className="list-disc pl-6 space-y-1 text-[#334155]">
              <li>서비스 제공 및 회원 관리 (회원가입, 로그인, 본인 확인)</li>
              <li>수강 관리 (기수별 수강생 관리, 학습 진행 상황 파악)</li>
              <li>콘텐츠 추천 (교육 콘텐츠, 정보공유 게시글 개인화)</li>
              <li>Q&amp;A 서비스 (질문 등록, AI 기반 답변 생성)</li>
              <li>광고 성과 분석 (Meta 광고 데이터 대시보드, 벤치마크 비교)</li>
              <li>서비스 개선 및 신규 기능 개발</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">3. 수집하는 이용 데이터</h2>
            <p className="mb-2 text-[#334155]">
              서비스 개선 목적으로 다음의 이용 데이터를 수집합니다. 해당 데이터는 개인을 식별하지 않는 형태로 활용됩니다.
            </p>
            <ul className="list-disc pl-6 space-y-1 text-[#334155]">
              <li>검색 기록 (Q&amp;A 검색어, 콘텐츠 검색어)</li>
              <li>콘텐츠 열람 기록 (교육 콘텐츠 조회 이력)</li>
              <li>광고 분석 기록 (경쟁사 광고 검색, 광고 소재 다운로드 이력)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">4. 개인정보 보유 및 파기</h2>
            <ul className="list-disc pl-6 space-y-1 text-[#334155]">
              <li><strong>회원 정보:</strong> 회원 탈퇴 시까지 보유하며, 탈퇴 시 즉시 파기합니다.</li>
              <li><strong>광고 데이터:</strong> 계정 삭제 후 30일 이내 파기합니다.</li>
              <li><strong>서비스 이용 기록:</strong> 3개월 보관 후 파기합니다.</li>
              <li>단, 법령에 따른 보존 의무가 있는 경우 해당 기간까지 보관합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">5. 제3자 제공</h2>
            <p className="text-[#334155] mb-2">
              서비스는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다.
              다만, 다음의 경우에는 예외로 합니다.
            </p>
            <ul className="list-disc pl-6 space-y-1 text-[#334155]">
              <li>이용자가 사전에 동의한 경우</li>
              <li>법령에 의해 요구되는 경우</li>
            </ul>
            <p className="text-[#334155] mt-3">
              <strong>외부 서비스 연동 안내:</strong> 경쟁사 광고 분석 기능은 Meta 광고 라이브러리 API를
              SearchAPI.io를 경유하여 조회합니다. 이 과정에서 이용자의 개인정보는 전송되지 않으며,
              공개된 광고 데이터만 조회됩니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">6. 동의 철회 (회원 탈퇴)</h2>
            <p className="text-[#334155]">
              이용자는 언제든지 개인정보 수집 및 이용에 대한 동의를 철회할 수 있습니다.
              동의 철회는 회원 탈퇴를 통해 가능하며, 서비스 내 문의 기능 또는 관리자에게 요청하시면
              지체 없이 처리합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">7. 이용자의 권리</h2>
            <ul className="list-disc pl-6 space-y-1 text-[#334155]">
              <li>개인정보 열람, 수정, 삭제 요청</li>
              <li>개인정보 수집·이용 동의 철회</li>
              <li>광고 데이터 수집 동의 철회</li>
              <li>서비스 탈퇴 및 데이터 삭제 요청</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">8. 문의</h2>
            <p className="text-[#334155]">
              개인정보 관련 문의사항은 서비스 내 Q&amp;A 기능 또는 관리자에게 연락해 주세요.
            </p>
            <div className="mt-3 p-4 bg-[#f8f9fc] rounded-lg text-sm text-[#475569]">
              <p><strong>서비스명:</strong> BS Camp (자사몰사관학교)</p>
              <p><strong>개인정보 관리 책임자:</strong> 서비스 관리자</p>
              <p><strong>문의 방법:</strong> 서비스 내 Q&amp;A 게시판</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
