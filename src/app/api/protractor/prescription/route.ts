/**
 * POST /api/protractor/prescription
 * 처방 생성 API
 * 설계서: docs/02-design/features/prescription-system-v2.design.md 섹션 2.1
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/db';
import { requireProtractorAccess, verifyAccountOwnership } from '../_shared';
import { generatePrescription } from '@/lib/protractor/prescription-engine';
import { PrescriptionError } from '@/types/prescription';

/**
 * GET /api/protractor/prescription?id={creative_media_id}&force=true
 * 처방 조회 (캐시 우선) — creative-detail-panel.tsx에서 lazy 호출
 */
export async function GET(req: NextRequest) {
  // CRON 인증 (CRON_SECRET 헤더) 또는 일반 사용자 인증
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;
  
  let svc: ReturnType<typeof createServiceClient>;
  if (isCronAuth) {
    svc = createServiceClient();
  } else {
    const auth = await requireProtractorAccess();
    if ('response' in auth) return auth.response;
    svc = auth.svc;
  }

  const creativeMediaId = req.nextUrl.searchParams.get('id');
  if (!creativeMediaId) {
    return NextResponse.json({ error: 'id 파라미터가 필요합니다' }, { status: 400 });
  }

  const force = req.nextUrl.searchParams.get('force') === 'true';

  try {
    // creative_media에서 analysis_json, account_id 조회
    const { data: media, error: mediaErr } = await svc
      .from('creative_media')
      .select('analysis_json, creative_id')
      .eq('id', creativeMediaId)
      .single();

    if (mediaErr || !media) {
      return NextResponse.json({ error: '소재를 찾을 수 없습니다' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = media as any;

    // account_id 결정 (creative_media에 없으면 creatives에서 조회)
    let accountId: string = '';
    if (!accountId && m.creative_id) {
      const { data: creative } = await svc
        .from('creatives')
        .select('account_id')
        .eq('id', m.creative_id)
        .single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accountId = (creative as any)?.account_id ?? '';
    }

    if (!accountId) {
      return NextResponse.json({ error: '계정 정보를 찾을 수 없습니다' }, { status: 404 });
    }

    // 캐시 체크: force가 아니고 이미 처방 결과가 있으면 캐시 반환
    const analysisJson = m.analysis_json;
    if (!force && analysisJson?.top3_prescriptions?.length > 0 && analysisJson?.meta) {
      // generatePrescription 내부 캐시와 동일한 로직
      const result = await generatePrescription(svc, creativeMediaId, accountId, false);
      return NextResponse.json(result);
    }

    // 처방 생성 (13단계)
    const result = await generatePrescription(svc, creativeMediaId, accountId, force);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PrescriptionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[prescription GET] 처방 조회 오류:', err);
    return NextResponse.json({ error: '처방 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // 1. 인증 + 역할 확인
  const auth = await requireProtractorAccess();
  if ('response' in auth) return auth.response;
  const { user, profile, svc } = auth;

  // 2. 요청 파싱
  let body: { creative_media_id?: string; account_id?: string; force_refresh?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON 파싱 오류' }, { status: 400 });
  }

  const { creative_media_id, account_id, force_refresh = false } = body;

  if (!creative_media_id) {
    return NextResponse.json({ error: 'creative_media_id 필수' }, { status: 400 });
  }

  if (!account_id) {
    return NextResponse.json({ error: 'account_id 필수' }, { status: 400 });
  }

  // 3. 계정 소유권 확인
  const hasAccess = await verifyAccountOwnership(svc, user.uid, profile.role, account_id);
  if (!hasAccess) {
    return NextResponse.json({ error: '계정 접근 권한이 없습니다' }, { status: 403 });
  }

  // 4. 처방 생성 (13단계)
  try {
    const result = await generatePrescription(svc, creative_media_id, account_id, force_refresh);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PrescriptionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[prescription] 처방 생성 오류:', err);
    return NextResponse.json({ error: '처방 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
