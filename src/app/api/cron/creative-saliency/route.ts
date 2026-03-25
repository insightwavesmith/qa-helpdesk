/**
 * GET /api/cron/creative-saliency
 * 광고 소재 시선 분석 크론 — Cloud Run DeepGaze 서비스 호출
 *
 * CAROUSEL 지원 (Wave 1 이후):
 *   - creative_media N행(position별) 조회
 *   - VIDEO 타입 카드 스킵 (DeepGaze는 이미지 전용)
 *   - 이미지 카드만 DeepGaze 실행 → creative_media.saliency_url 저장
 *   - IMAGE/VIDEO 소재(position=0 단일): 기존 동작과 동일
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { triggerNext } from "@/lib/pipeline-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ━━━ creative_media 행 타입 ━━━
interface CreativeMediaRow {
  id: string;
  creative_id: string;
  position: number;
  media_type: string | null;
  media_url: string | null;
  storage_url: string | null;
  saliency_url: string | null;
  content_hash: string | null;
  creatives: {
    ad_id: string;
    account_id: string;
    creative_type: string | null;
  } | null;
}

// ━━━ account별 이미지 카드 그룹핑 ━━━
interface AccountImageCards {
  accountId: string;
  imageCards: Array<{
    id: string;
    creative_id: string;
    ad_id: string;
    position: number;
    media_url: string;
  }>;
}

export async function GET() {
  const start = Date.now();

  try {
    const pipelineUrl = process.env.CREATIVE_PIPELINE_URL
      || "https://creative-pipeline-906295665279.asia-northeast3.run.app";
    const pipelineSecret = process.env.CREATIVE_PIPELINE_SECRET;

    if (!pipelineUrl) {
      return NextResponse.json(
        { error: "CREATIVE_PIPELINE_URL 미설정" },
        { status: 500 },
      );
    }

    const supabase = createServiceClient();

    // ━━━ 1. creative_media에서 처리 대상 N행 조회 ━━━
    // - saliency_url IS NULL: 아직 분석 안 된 카드
    // - media_type = IMAGE: VIDEO 카드 스킵 (DeepGaze는 이미지 전용)
    // - media_url 또는 storage_url 있음: 이미지 다운로드 가능한 카드만
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = supabase as any;

    // 1단계: creative_media 조회 (임베딩 조인 없이)
    const { data: rawMedia, error: queryErr } = await svc
      .from("creative_media")
      .select(
        "id, creative_id, position, media_type, media_url, storage_url, saliency_url, content_hash",
      )
      .eq("media_type", "IMAGE")
      .is("saliency_url", null)
      .not("media_url", "is", null)
      .order("creative_id", { ascending: true })
      .order("position", { ascending: true })
      .limit(500);

    if (queryErr) {
      console.error("[creative-saliency] creative_media 조회 실패:", queryErr.message);
      return NextResponse.json(
        { error: `DB 조회 실패: ${queryErr.message}` },
        { status: 500 },
      );
    }

    if (!rawMedia || rawMedia.length === 0) {
      return NextResponse.json({
        message: "creative-saliency 완료 — 처리 대상 없음",
        elapsed: "0.0s",
        totalCards: 0,
        accounts: 0,
        image: {},
        video: {},
      });
    }

    // 2단계: creative_id → creatives 테이블에서 ad_id, account_id, creative_type 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creativeIds = [...new Set(rawMedia.map((r: any) => r.creative_id as string))];
    const { data: creativesData } = await svc
      .from("creatives")
      .select("id, ad_id, account_id, creative_type")
      .in("id", creativeIds);

    const creativeMap = new Map<string, { ad_id: string; account_id: string; creative_type: string | null }>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (creativesData ?? []).map((c: any) => [c.id, { ad_id: c.ad_id, account_id: c.account_id, creative_type: c.creative_type }])
    );

    // JS에서 합치기 (creatives!inner 대체)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: CreativeMediaRow[] = rawMedia
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => {
        const creative = creativeMap.get(r.creative_id);
        if (!creative) return null;
        return { ...r, creatives: creative } as CreativeMediaRow;
      })
      .filter(Boolean) as CreativeMediaRow[];
    const totalCards = rows.length;
    console.log(
      `[creative-saliency] 처리 대상 IMAGE 카드: ${totalCards}건`,
    );

    if (totalCards === 0) {
      return NextResponse.json({
        message: "creative-saliency 완료 — 처리 대상 없음",
        elapsed: "0.0s",
        totalCards: 0,
        accounts: 0,
        image: {},
        video: {},
      });
    }

    // ━━━ 2. content_hash 기반 saliency_url 사전 복사 ━━━
    // 동일 content_hash(= 동일 이미지)를 가진 다른 row에 saliency_url이 있으면
    // Cloud Run 호출 없이 바로 복사 → 처리 비용 절감
    let hashReuseCount = 0;
    for (const row of rows) {
      if (!row.content_hash || row.saliency_url) continue;

      const { data: donor } = await svc
        .from("creative_media")
        .select("saliency_url")
        .eq("content_hash", row.content_hash)
        .not("saliency_url", "is", null)
        .neq("id", row.id)
        .limit(1)
        .maybeSingle();

      if (donor?.saliency_url) {
        const { error: updateErr } = await svc
          .from("creative_media")
          .update({ saliency_url: donor.saliency_url })
          .eq("id", row.id);

        if (!updateErr) {
          // row 객체에도 반영 — 아래 그룹핑 단계에서 remainingRows 필터링에 사용
          row.saliency_url = donor.saliency_url;
          hashReuseCount++;
          console.log(`[creative-saliency] content_hash saliency 재사용: ${row.content_hash}`);
        }
      }
    }
    if (hashReuseCount > 0) {
      console.log(`[creative-saliency] content_hash 재사용 완료: ${hashReuseCount}건`);
    }

    // 복사 후 saliency_url이 채워진 row 제외 — Cloud Run에는 미분석 row만 전달
    const remainingRows = rows.filter((r) => !r.saliency_url);

    // ━━━ 3. account별 이미지 카드 그룹핑 ━━━
    // VIDEO 타입 카드는 이미 media_type=IMAGE 필터로 제외됨
    // CAROUSEL 내 IMAGE 카드(position=0,2 등)와 VIDEO 카드(position=1 등) 혼재 시
    // → IMAGE 카드만 포함됨을 로그로 명시
    const accountMap = new Map<string, AccountImageCards>();

    for (const row of remainingRows) {
      const creative = row.creatives;
      if (!creative) continue;

      const { account_id, creative_type } = creative;

      // CAROUSEL인데 VIDEO 카드가 남아있으면 스킵 (방어 로직)
      if (row.media_type === "VIDEO") {
        console.log(
          `[creative-saliency] VIDEO 카드 스킵: creative_id=${row.creative_id} pos=${row.position}`,
        );
        continue;
      }

      const imageUrl = row.storage_url || row.media_url;
      if (!imageUrl) continue;

      if (!accountMap.has(account_id)) {
        accountMap.set(account_id, { accountId: account_id, imageCards: [] });
      }
      accountMap.get(account_id)!.imageCards.push({
        id: row.id,
        creative_id: row.creative_id,
        ad_id: creative.ad_id,
        position: row.position,
        media_url: imageUrl,
      });

      if (creative_type === "CAROUSEL") {
        console.log(
          `[creative-saliency] CAROUSEL 이미지 카드 포함: ad_id=${creative.ad_id} pos=${row.position}`,
        );
      }
    }

    const accountList = Array.from(accountMap.values());
    console.log(
      `[creative-saliency] 처리 계정 수: ${accountList.length}, 총 이미지 카드(신규): ${
        accountList.reduce((s, a) => s + a.imageCards.length, 0)
      }건 (hash 재사용: ${hashReuseCount}건 제외)`,
    );

    // ━━━ 4. account별 Cloud Run /saliency 호출 ━━━
    // Python predict.py가 media_type=IMAGE 필터 + creative_saliency dedup 처리
    // CAROUSEL 카드별 결과는 creative_saliency → creative_media.saliency_url 동기화(step 5)로 반영
    const accountResults: Record<string, unknown>[] = [];

    for (const { accountId, imageCards } of accountList) {
      try {
        console.log(
          `[creative-saliency] account=${accountId} 이미지 카드 ${imageCards.length}건 → Cloud Run /saliency 호출`,
        );
        const res = await fetch(`${pipelineUrl}/saliency`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-SECRET": pipelineSecret || "",
          },
          body: JSON.stringify({ limit: imageCards.length, accountId }),
          signal: AbortSignal.timeout(240_000),
        });
        const result = await res.json();
        accountResults.push({ accountId, ...result });
        console.log(
          `[creative-saliency] account=${accountId} 완료: ${JSON.stringify(result).slice(0, 200)}`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[creative-saliency] account=${accountId} 오류: ${msg}`);
        accountResults.push({ accountId, error: msg });
      }

      // account 간 딜레이 (Cloud Run 부하 분산)
      await new Promise((r) => setTimeout(r, 500));
    }

    // ━━━ 5. creative_saliency → creative_media.saliency_url 동기화 ━━━
    // Cloud Run Python이 creative_saliency 테이블에 저장한 결과를
    // creative_media.saliency_url 컬럼에도 반영
    let syncUpdated = 0;
    try {
      // Cloud Run이 방금 처리한 ad_id 목록 (content_hash 재사용분 제외)
      const processedAdIds = remainingRows
        .map((r) => r.creatives?.ad_id)
        .filter(Boolean) as string[];

      if (processedAdIds.length > 0) {
        // creative_saliency에서 attention_map_url 조회
        const { data: saliencyRows } = await svc
          .from("creative_saliency")
          .select("ad_id, account_id, attention_map_url")
          .in("ad_id", processedAdIds)
          .not("attention_map_url", "is", null);

        if (saliencyRows && saliencyRows.length > 0) {
          // ad_id → attention_map_url 매핑
          const saliencyMap = new Map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (saliencyRows as any[]).map((s) => [s.ad_id as string, s.attention_map_url as string]),
          );

          // creative_media.saliency_url 업데이트 (position=0 카드 기준)
          for (const row of remainingRows) {
            const adId = row.creatives?.ad_id;
            if (!adId) continue;
            const mapUrl = saliencyMap.get(adId);
            if (!mapUrl) continue;
            if (row.saliency_url) continue; // 이미 있으면 스킵

            const { error: updateErr } = await svc
              .from("creative_media")
              .update({ saliency_url: mapUrl })
              .eq("id", row.id);

            if (!updateErr) {
              syncUpdated++;
            } else {
              console.error(
                `[creative-saliency] saliency_url 업데이트 실패 id=${row.id}: ${updateErr.message}`,
              );
            }
          }
        }
      }
    } catch (syncErr) {
      console.error("[creative-saliency] 동기화 오류 (무시):", syncErr);
    }

    // VIDEO saliency는 전용 크론(/api/cron/video-saliency)으로 분리됨

    // ━━━ 6. 파이프라인 체인 트리거 ━━━
    // creative-saliency 완료 → deepgaze-gemini 결합 분석 트리거
    if (syncUpdated > 0 || hashReuseCount > 0) {
      await triggerNext("deepgaze-gemini");
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    return NextResponse.json({
      message: "creative-saliency 완료",
      elapsed: `${elapsed}s`,
      totalCards,
      hashReused: hashReuseCount,
      accounts: accountList.length,
      syncUpdated,
      image: accountResults,
    });
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`[creative-saliency] 에러 (${elapsed}s):`, e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        elapsed: `${elapsed}s`,
      },
      { status: 500 },
    );
  }
}
