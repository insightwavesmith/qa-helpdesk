/**
 * POST /api/protractor/prescription
 * 처방 생성 API
 * 설계서: docs/02-design/features/prescription-system-v2.design.md 섹션 2.1
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProtractorAccess, verifyAccountOwnership } from '../_shared';
import { generatePrescription } from '@/lib/protractor/prescription-engine';
import { PrescriptionError } from '@/types/prescription';

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
