import { NextRequest, NextResponse } from "next/server";

// 사업자등록번호 검증 API
// TODO: 국세청 API 연동

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessNumber } = body;

    if (!businessNumber) {
      return NextResponse.json(
        { error: "사업자등록번호를 입력해주세요." },
        { status: 400 }
      );
    }

    // TODO: 국세청 사업자등록 상태조회 API 연동
    // https://www.data.go.kr/data/15081808/openapi.do
    // 현재는 형식 검증만 수행

    // 사업자등록번호 형식 검증 (10자리 숫자)
    const cleaned = businessNumber.replace(/[-\s]/g, "");
    if (!/^\d{10}$/.test(cleaned)) {
      return NextResponse.json(
        { valid: false, message: "올바른 사업자등록번호 형식이 아닙니다." },
        { status: 200 }
      );
    }

    return NextResponse.json({
      valid: true,
      message: "사업자등록번호 형식이 확인되었습니다.",
      // TODO: 실제 API 연동 시 상세 정보 포함
    });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
