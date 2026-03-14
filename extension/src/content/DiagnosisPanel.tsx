import { useState, useEffect, useCallback } from "react";
import { getEditorContent, observeEditorChanges } from "../lib/editor-reader";
import { forbiddenCheck, profanityCheck, postDiagnosis } from "../lib/api";
import { isAuthenticated } from "../lib/auth";
import type { EditorContent } from "../lib/editor-reader";
import type { DiagnosisItem, ProfanityResult } from "../lib/types";
import { BenchmarkPanel } from "./BenchmarkPanel";

type StatusLevel = "pass" | "warn" | "fail";

interface LocalDiagnosis {
  charCount: { value: number; status: StatusLevel; message: string };
  imageCount: { value: number; status: StatusLevel; message: string };
  keywordCount: { value: number; status: StatusLevel; message: string };
  paragraphAvg: { value: number; status: StatusLevel; message: string };
}

function getStatusIcon(status: StatusLevel): string {
  if (status === "pass") return "\u{1F7E2}";
  if (status === "warn") return "\u{1F7E1}";
  return "\u{1F534}";
}

function getStatusClass(status: StatusLevel): string {
  if (status === "pass") return "bscamp-item-pass";
  if (status === "warn") return "bscamp-item-warn";
  return "bscamp-item-fail";
}

function analyzeLocally(content: EditorContent, targetKeyword: string): LocalDiagnosis {
  const text = content.content;
  const charCount = text.replace(/\s/g, "").length;
  const imageCount = content.imageCount;

  // 키워드 반복 횟수
  let keywordCount = 0;
  if (targetKeyword.trim()) {
    const regex = new RegExp(targetKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const titleMatches = content.title.match(regex);
    const contentMatches = text.match(regex);
    keywordCount = (titleMatches?.length ?? 0) + (contentMatches?.length ?? 0);
  }

  // 문단 평균 길이
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const paragraphAvg = paragraphs.length > 0
    ? Math.round(paragraphs.reduce((sum, p) => sum + p.replace(/\s/g, "").length, 0) / paragraphs.length)
    : 0;

  return {
    charCount: {
      value: charCount,
      status: charCount >= 2000 ? "pass" : charCount >= 1000 ? "warn" : "fail",
      message: charCount >= 2000
        ? `${charCount}자 (충분)`
        : charCount >= 1000
          ? `${charCount}자 (2,000자 이상 권장)`
          : `${charCount}자 (최소 1,000자 이상 작성 필요)`,
    },
    imageCount: {
      value: imageCount,
      status: imageCount >= 6 ? "pass" : imageCount >= 3 ? "warn" : "fail",
      message: imageCount >= 6
        ? `${imageCount}장 (충분)`
        : imageCount >= 3
          ? `${imageCount}장 (8장 전후 권장)`
          : `${imageCount}장 (최소 5장 이상 권장)`,
    },
    keywordCount: {
      value: keywordCount,
      status: keywordCount >= 5 && keywordCount <= 15 ? "pass" : keywordCount >= 3 ? "warn" : "fail",
      message: keywordCount >= 5 && keywordCount <= 15
        ? `${keywordCount}회 (적절)`
        : keywordCount >= 3
          ? `${keywordCount}회 (5~15회 권장)`
          : `${keywordCount}회 (키워드 반복 부족)`,
    },
    paragraphAvg: {
      value: paragraphAvg,
      status: paragraphAvg > 0 && paragraphAvg <= 300 ? "pass" : paragraphAvg <= 500 ? "warn" : "fail",
      message: paragraphAvg <= 300
        ? `평균 ${paragraphAvg}자 (적절)`
        : paragraphAvg <= 500
          ? `평균 ${paragraphAvg}자 (300자 이하 권장)`
          : `평균 ${paragraphAvg}자 (문단이 너무 깁니다)`,
    },
  };
}

export function DiagnosisPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"diagnosis" | "benchmark">("diagnosis");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [editorContent, setEditorContent] = useState<EditorContent | null>(null);
  const [localDiag, setLocalDiag] = useState<LocalDiagnosis | null>(null);
  const [serverDiag, setServerDiag] = useState<DiagnosisItem[] | null>(null);
  const [forbiddenResults, setForbiddenResults] = useState<Array<{ keyword: string; isForbidden: boolean }> | null>(null);
  const [profanityResults, setProfanityResults] = useState<ProfanityResult[] | null>(null);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [imageSlotCount, setImageSlotCount] = useState(0);

  // 이미지 슬롯 메시지 수신 (EditorInjector에서 전달)
  useEffect(() => {
    function handleSlotMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type !== "BSCAMP_IMAGE_SLOTS") return;
      setImageSlotCount(event.data.slotCount ?? 0);
    }
    window.addEventListener("message", handleSlotMessage);
    return () => window.removeEventListener("message", handleSlotMessage);
  }, []);

  // 인증 확인
  useEffect(() => {
    isAuthenticated().then(setLoggedIn);
  }, []);

  // 에디터 변경 감지
  useEffect(() => {
    const initial = getEditorContent();
    setEditorContent(initial);

    const cleanup = observeEditorChanges((content) => {
      setEditorContent(content);
    });

    return cleanup;
  }, []);

  // 로컬 진단 (에디터 변경 시마다)
  useEffect(() => {
    if (!editorContent) return;
    setLocalDiag(analyzeLocally(editorContent, targetKeyword));
  }, [editorContent, targetKeyword]);

  // 분석 실행 (로컬 + 서버)
  const runServerAnalysis = useCallback(async () => {
    if (!editorContent) return;

    // 로컬 진단은 항상 갱신
    setLocalDiag(analyzeLocally(editorContent, targetKeyword));

    // 서버 API는 로그인 시에만
    if (!loggedIn) return;
    setAnalyzing(true);

    try {
      // 병렬 API 호출
      const promises: Promise<void>[] = [];

      // 금칙어 체크 (타겟 키워드가 있을 때)
      if (targetKeyword.trim()) {
        promises.push(
          forbiddenCheck([targetKeyword]).then((res) => {
            setForbiddenResults(res.results);
          }).catch(() => setForbiddenResults(null))
        );
      }

      // 비속어 체크
      if (editorContent.content.length > 10) {
        promises.push(
          profanityCheck(editorContent.content).then((res) => {
            setProfanityResults(res.results);
          }).catch(() => setProfanityResults(null))
        );
      }

      // 포스팅 진단
      if (targetKeyword.trim() && editorContent.content.length > 10) {
        promises.push(
          postDiagnosis({
            title: editorContent.title,
            content: editorContent.content,
            targetKeyword,
            imageCount: editorContent.imageCount,
            externalLinks: editorContent.externalLinks,
          }).then((res) => {
            setServerDiag(res.results);
            setOverallScore(res.overallScore);
          }).catch(() => {
            setServerDiag(null);
            setOverallScore(null);
          })
        );
      }

      await Promise.allSettled(promises);
    } finally {
      setAnalyzing(false);
    }
  }, [editorContent, targetKeyword, loggedIn]);

  // 에디터 내용 변경 시 3초 디바운스로 서버 분석
  useEffect(() => {
    if (!editorContent || !loggedIn) return;
    const timer = setTimeout(runServerAnalysis, 3000);
    return () => clearTimeout(timer);
  }, [editorContent, runServerAnalysis, loggedIn]);

  if (collapsed) {
    return (
      <div className="bscamp-panel bscamp-panel-collapsed">
        <button className="bscamp-toggle-btn" onClick={() => setCollapsed(false)} title="패널 펼치기">
          {"◀"}
        </button>
      </div>
    );
  }

  const computedScore = overallScore ?? (localDiag ? computeLocalScore(localDiag) : 0);

  return (
    <div className="bscamp-panel">
      {/* 헤더 */}
      <div className="bscamp-panel-header">
        <span className="bscamp-panel-logo">{"\u{1F3EB}"}</span>
        <div style={{ flex: 1 }}>
          <h2 className="bscamp-panel-title">블로그 도우미</h2>
          <p className="bscamp-panel-subtitle">자사몰사관학교</p>
        </div>
        <button className="bscamp-toggle-btn-white" onClick={() => setCollapsed(true)} title="패널 접기">
          {"▶"}
        </button>
      </div>

      {/* 키워드 입력 */}
      <div className="bscamp-keyword-bar">
        <input
          className="bscamp-keyword-input"
          type="text"
          value={targetKeyword}
          onChange={(e) => setTargetKeyword(e.target.value)}
          placeholder="타겟 키워드 입력"
        />
        <button className="bscamp-analyze-btn" onClick={runServerAnalysis} disabled={analyzing}>
          {analyzing ? "..." : "분석"}
        </button>
      </div>

      {/* 탭 */}
      <div className="bscamp-tabs">
        <button
          className={`bscamp-tab ${activeTab === "diagnosis" ? "bscamp-tab-active" : ""}`}
          onClick={() => setActiveTab("diagnosis")}
        >
          실시간 진단
        </button>
        <button
          className={`bscamp-tab ${activeTab === "benchmark" ? "bscamp-tab-active" : ""}`}
          onClick={() => setActiveTab("benchmark")}
        >
          TOP3 비교
        </button>
      </div>

      {/* 본문 */}
      <div className="bscamp-panel-body">
        {activeTab === "diagnosis" ? (
          <>
            {/* 종합 점수 */}
            <div className="bscamp-score-section">
              <div className={`bscamp-score-circle ${getScoreClass(computedScore)}`}>
                <span className="bscamp-score-value">{computedScore}</span>
                <span className="bscamp-score-label">점</span>
              </div>
              <p className="bscamp-score-text">{getScoreMessage(computedScore)}</p>
            </div>

            {/* 로컬 진단 항목 */}
            {localDiag && (
              <div className="bscamp-diagnosis-list">
                <DiagItem
                  icon={getStatusIcon(localDiag.charCount.status)}
                  label="글자 수"
                  status={localDiag.charCount.status}
                  message={localDiag.charCount.message}
                />
                <DiagItem
                  icon={getStatusIcon(localDiag.imageCount.status)}
                  label="이미지 수"
                  status={localDiag.imageCount.status}
                  message={localDiag.imageCount.message}
                />
                {imageSlotCount > 0 && (
                  <DiagItem
                    icon="📷"
                    label="이미지 슬롯"
                    status="warn"
                    message={`슬롯: ${imageSlotCount}개 / 삽입됨: ${localDiag.imageCount.value}개`}
                  />
                )}
                <DiagItem
                  icon={getStatusIcon(localDiag.keywordCount.status)}
                  label="키워드 반복"
                  status={localDiag.keywordCount.status}
                  message={localDiag.keywordCount.message}
                />
                <DiagItem
                  icon={getStatusIcon(localDiag.paragraphAvg.status)}
                  label="문단 길이"
                  status={localDiag.paragraphAvg.status}
                  message={localDiag.paragraphAvg.message}
                />
              </div>
            )}

            {/* 금칙어 결과 */}
            {forbiddenResults && forbiddenResults.length > 0 && (
              <div className="bscamp-diagnosis-list">
                <h3 className="bscamp-section-title">금칙어 체크</h3>
                {forbiddenResults.map((r) => (
                  <DiagItem
                    key={r.keyword}
                    icon={r.isForbidden ? "\u{1F534}" : "\u{1F7E2}"}
                    label={r.keyword}
                    status={r.isForbidden ? "fail" : "pass"}
                    message={r.isForbidden ? "네이버 금칙어입니다! 이 키워드로 발행하면 노출되지 않습니다." : "정상 키워드입니다."}
                  />
                ))}
              </div>
            )}

            {/* 비속어 결과 */}
            {profanityResults && profanityResults.length > 0 && (
              <div className="bscamp-diagnosis-list">
                <h3 className="bscamp-section-title">비속어/부적절 단어</h3>
                {profanityResults.map((r, i) => (
                  <DiagItem
                    key={`${r.word}-${i}`}
                    icon={r.severity === "high" ? "\u{1F534}" : "\u{1F7E1}"}
                    label={r.matched}
                    status={r.severity === "high" ? "fail" : "warn"}
                    message={`카테고리: ${r.category} / 위험도: ${r.severity}`}
                  />
                ))}
              </div>
            )}

            {/* 서버 진단 결과 */}
            {serverDiag && serverDiag.length > 0 && (
              <div className="bscamp-diagnosis-list">
                <h3 className="bscamp-section-title">서버 진단 상세</h3>
                {serverDiag.map((item) => (
                  <DiagItem
                    key={item.id}
                    icon={getStatusIcon(item.status)}
                    label={item.name}
                    status={item.status}
                    message={item.message}
                  />
                ))}
              </div>
            )}

            {/* 로그인 안내 */}
            {!loggedIn && (
              <div className="bscamp-login-notice">
                <p>확장 아이콘 클릭 → 로그인하면 금칙어, 비속어, TOP3 비교 기능이 활성화됩니다.</p>
              </div>
            )}
          </>
        ) : (
          <BenchmarkPanel
            targetKeyword={targetKeyword}
            editorContent={editorContent}
            loggedIn={loggedIn}
          />
        )}
      </div>

      {/* 푸터 */}
      <div className="bscamp-panel-footer">
        <button className="bscamp-refresh-btn" onClick={runServerAnalysis} disabled={analyzing}>
          {analyzing ? "분석 중..." : "새로고침"}
        </button>
      </div>
    </div>
  );
}

function DiagItem({
  icon,
  label,
  status,
  message,
}: {
  icon: string;
  label: string;
  status: StatusLevel;
  message: string;
}) {
  return (
    <div className={`bscamp-diag-item ${getStatusClass(status)}`}>
      <div className="bscamp-diag-item-header">
        <span className="bscamp-diag-icon">{icon}</span>
        <span className="bscamp-diag-label">{label}</span>
      </div>
      <p className="bscamp-diag-message">{message}</p>
    </div>
  );
}

function computeLocalScore(diag: LocalDiagnosis): number {
  let score = 0;
  const items = [diag.charCount, diag.imageCount, diag.keywordCount, diag.paragraphAvg];
  for (const item of items) {
    if (item.status === "pass") score += 25;
    else if (item.status === "warn") score += 15;
    else score += 5;
  }
  return score;
}

function getScoreClass(score: number): string {
  if (score >= 80) return "bscamp-score-good";
  if (score >= 50) return "bscamp-score-warning";
  return "bscamp-score-danger";
}

function getScoreMessage(score: number): string {
  if (score >= 80) return "좋습니다! 발행 준비가 되었습니다.";
  if (score >= 50) return "개선이 필요한 항목이 있습니다.";
  return "발행 전 수정이 필요합니다.";
}
