/**
 * 한국어 비속어/금칙어 DB
 * 카테고리: swear(욕설), adult(성인), discrimination(차별), crime(범죄), commercial(상업성), gambling(도박)
 * severity: high(즉시 누락), medium(주의), low(과다 사용 시 누락)
 */

export interface ProfanityEntry {
  word: string;
  category: 'swear' | 'adult' | 'discrimination' | 'crime' | 'commercial' | 'gambling';
  severity: 'low' | 'medium' | 'high';
}

export interface ProfanityResult {
  word: string;      // DB에 등록된 원본 단어
  matched: string;   // 실제 텍스트에서 매칭된 부분
  category: string;
  severity: 'low' | 'medium' | 'high';
}

export const PROFANITY_DB: ProfanityEntry[] = [
  // ─────────────────────────────────────────
  // 1. swear (욕설)
  // ─────────────────────────────────────────
  { word: '시발', category: 'swear', severity: 'high' },
  { word: '씨발', category: 'swear', severity: 'high' },
  { word: '씨바', category: 'swear', severity: 'high' },
  { word: '씨팔', category: 'swear', severity: 'high' },
  { word: '시팔', category: 'swear', severity: 'high' },
  { word: '씨bal', category: 'swear', severity: 'high' },
  { word: '시bal', category: 'swear', severity: 'high' },
  { word: 'ㅅㅂ', category: 'swear', severity: 'high' },
  { word: 'ㅆㅂ', category: 'swear', severity: 'high' },
  { word: '개새끼', category: 'swear', severity: 'high' },
  { word: '개새기', category: 'swear', severity: 'high' },
  { word: '개세끼', category: 'swear', severity: 'high' },
  { word: '개세기', category: 'swear', severity: 'high' },
  { word: 'ㄱㅅㄲ', category: 'swear', severity: 'high' },
  { word: '병신', category: 'swear', severity: 'high' },
  { word: '벙신', category: 'swear', severity: 'high' },
  { word: 'ㅂㅅ', category: 'swear', severity: 'high' },
  { word: '지랄', category: 'swear', severity: 'high' },
  { word: 'ㅈㄹ', category: 'swear', severity: 'high' },
  { word: '미친', category: 'swear', severity: 'medium' },
  { word: '미친놈', category: 'swear', severity: 'high' },
  { word: '미친년', category: 'swear', severity: 'high' },
  { word: '미쳤어', category: 'swear', severity: 'medium' },
  { word: '좆', category: 'swear', severity: 'high' },
  { word: '좆같', category: 'swear', severity: 'high' },
  { word: '좆까', category: 'swear', severity: 'high' },
  { word: '닥쳐', category: 'swear', severity: 'medium' },
  { word: '꺼져', category: 'swear', severity: 'medium' },
  { word: '엿먹어', category: 'swear', severity: 'high' },
  { word: '엿이나 먹어', category: 'swear', severity: 'high' },
  { word: '썅', category: 'swear', severity: 'high' },
  { word: '새끼', category: 'swear', severity: 'high' },
  { word: '새기', category: 'swear', severity: 'high' },
  { word: '개소리', category: 'swear', severity: 'medium' },
  { word: '개같은', category: 'swear', severity: 'high' },
  { word: '개같다', category: 'swear', severity: 'high' },
  { word: '개년', category: 'swear', severity: 'high' },
  { word: '개놈', category: 'swear', severity: 'high' },
  { word: '개련', category: 'swear', severity: 'high' },
  { word: '걸레', category: 'swear', severity: 'high' },
  { word: '보지', category: 'swear', severity: 'high' },
  { word: '보즤', category: 'swear', severity: 'high' },
  { word: '보짓', category: 'swear', severity: 'high' },
  { word: '보지같', category: 'swear', severity: 'high' },
  { word: '보지년', category: 'swear', severity: 'high' },
  { word: '빠구리', category: 'swear', severity: 'high' },
  { word: '찐따', category: 'swear', severity: 'high' },
  { word: '찐다', category: 'swear', severity: 'medium' },
  { word: '창녀', category: 'swear', severity: 'high' },
  { word: '창년', category: 'swear', severity: 'high' },
  { word: '창녀같', category: 'swear', severity: 'high' },
  { word: '쌍년', category: 'swear', severity: 'high' },
  { word: '쌍놈', category: 'swear', severity: 'high' },
  { word: '호로새끼', category: 'swear', severity: 'high' },
  { word: '호로놈', category: 'swear', severity: 'high' },
  { word: '개쓰레기', category: 'swear', severity: 'high' },
  { word: '쓰레기같은', category: 'swear', severity: 'medium' },
  { word: '재수없어', category: 'swear', severity: 'medium' },
  { word: '재수없는', category: 'swear', severity: 'medium' },
  { word: '존나', category: 'swear', severity: 'high' },
  { word: '존나게', category: 'swear', severity: 'high' },
  { word: '졸라', category: 'swear', severity: 'medium' },
  { word: '조낙', category: 'swear', severity: 'high' },
  { word: '자지', category: 'swear', severity: 'high' },
  { word: '자지같', category: 'swear', severity: 'high' },
  { word: '망할', category: 'swear', severity: 'medium' },
  { word: '죽어버려', category: 'swear', severity: 'high' },
  { word: '뒤져', category: 'swear', severity: 'high' },
  { word: '뒤지다', category: 'swear', severity: 'high' },
  { word: '뒈져', category: 'swear', severity: 'high' },
  { word: '뒈지다', category: 'swear', severity: 'high' },
  { word: '꼴통', category: 'swear', severity: 'medium' },
  { word: '꼴값', category: 'swear', severity: 'medium' },
  { word: '한심한', category: 'swear', severity: 'low' },
  { word: '머저리', category: 'swear', severity: 'medium' },
  { word: '멍청이', category: 'swear', severity: 'medium' },
  { word: '멍청한', category: 'swear', severity: 'medium' },
  { word: '바보같은', category: 'swear', severity: 'low' },
  { word: '쪼다', category: 'swear', severity: 'medium' },
  { word: '빠저', category: 'swear', severity: 'medium' },
  { word: '꺼지라', category: 'swear', severity: 'medium' },
  { word: '개xx', category: 'swear', severity: 'high' },
  { word: '시xx', category: 'swear', severity: 'high' },
  { word: '씹', category: 'swear', severity: 'high' },
  { word: '씹새', category: 'swear', severity: 'high' },
  { word: '씹놈', category: 'swear', severity: 'high' },
  { word: '씹년', category: 'swear', severity: 'high' },
  { word: '씹덕', category: 'swear', severity: 'medium' },
  { word: '니미', category: 'swear', severity: 'high' },
  { word: '니애미', category: 'swear', severity: 'high' },
  { word: '니에미', category: 'swear', severity: 'high' },
  { word: '니어머니', category: 'swear', severity: 'high' },
  { word: '느그', category: 'swear', severity: 'medium' },
  { word: '느개비', category: 'swear', severity: 'high' },
  { word: '팔년', category: 'swear', severity: 'high' },
  { word: '팔놈', category: 'swear', severity: 'high' },
  { word: '죽여버려', category: 'swear', severity: 'high' },
  { word: '죽일', category: 'swear', severity: 'high' },
  { word: '꼬추', category: 'swear', severity: 'medium' },
  { word: '거시기', category: 'swear', severity: 'low' },
  { word: '빌어먹을', category: 'swear', severity: 'medium' },
  { word: '엿같은', category: 'swear', severity: 'high' },
  { word: '엿같다', category: 'swear', severity: 'high' },
  { word: '썩을', category: 'swear', severity: 'medium' },
  { word: '개쪽', category: 'swear', severity: 'medium' },

  // ─────────────────────────────────────────
  // 2. adult (성인/19금)
  // ─────────────────────────────────────────
  { word: '야동', category: 'adult', severity: 'high' },
  { word: '야설', category: 'adult', severity: 'high' },
  { word: '야사', category: 'adult', severity: 'high' },
  { word: '포르노', category: 'adult', severity: 'high' },
  { word: '포르노그래피', category: 'adult', severity: 'high' },
  { word: '섹스', category: 'adult', severity: 'high' },
  { word: 'sex', category: 'adult', severity: 'high' },
  { word: '성인사이트', category: 'adult', severity: 'high' },
  { word: '성인방송', category: 'adult', severity: 'high' },
  { word: '성인영화', category: 'adult', severity: 'high' },
  { word: '성인동영상', category: 'adult', severity: 'high' },
  { word: '성인콘텐츠', category: 'adult', severity: 'high' },
  { word: '자위', category: 'adult', severity: 'high' },
  { word: '자위행위', category: 'adult', severity: 'high' },
  { word: '오르가즘', category: 'adult', severity: 'high' },
  { word: '오르가슴', category: 'adult', severity: 'high' },
  { word: '에로', category: 'adult', severity: 'high' },
  { word: '에로영화', category: 'adult', severity: 'high' },
  { word: '에로사이트', category: 'adult', severity: 'high' },
  { word: '누드', category: 'adult', severity: 'high' },
  { word: '누드사진', category: 'adult', severity: 'high' },
  { word: '알몸', category: 'adult', severity: 'medium' },
  { word: '벗은', category: 'adult', severity: 'medium' },
  { word: '나체', category: 'adult', severity: 'medium' },
  { word: '나체사진', category: 'adult', severity: 'high' },
  { word: '19금', category: 'adult', severity: 'high' },
  { word: '18금', category: 'adult', severity: 'high' },
  { word: '성인물', category: 'adult', severity: 'high' },
  { word: '성인만화', category: 'adult', severity: 'high' },
  { word: '성인게임', category: 'adult', severity: 'high' },
  { word: '스와핑', category: 'adult', severity: 'high' },
  { word: '원나잇', category: 'adult', severity: 'high' },
  { word: '원나잇스탠드', category: 'adult', severity: 'high' },
  { word: '조건만남', category: 'adult', severity: 'high' },
  { word: '원조교제', category: 'adult', severity: 'high' },
  { word: '원조', category: 'adult', severity: 'medium' },
  { word: '성매매', category: 'adult', severity: 'high' },
  { word: '매춘', category: 'adult', severity: 'high' },
  { word: '매춘부', category: 'adult', severity: 'high' },
  { word: '콜걸', category: 'adult', severity: 'high' },
  { word: '성인채팅', category: 'adult', severity: 'high' },
  { word: '야채팅', category: 'adult', severity: 'high' },
  { word: '유흥업소', category: 'adult', severity: 'medium' },
  { word: '룸살롱', category: 'adult', severity: 'medium' },
  { word: '퇴폐', category: 'adult', severity: 'medium' },
  { word: '퇴폐업소', category: 'adult', severity: 'high' },
  { word: '리얼돌', category: 'adult', severity: 'high' },
  { word: '성인용품', category: 'adult', severity: 'medium' },
  { word: '바이브레이터', category: 'adult', severity: 'high' },
  { word: '딜도', category: 'adult', severity: 'high' },
  { word: '스트립', category: 'adult', severity: 'medium' },
  { word: '스트리퍼', category: 'adult', severity: 'high' },
  { word: '란제리', category: 'adult', severity: 'low' },
  { word: '음란물', category: 'adult', severity: 'high' },
  { word: '음란사이트', category: 'adult', severity: 'high' },
  { word: '음란행위', category: 'adult', severity: 'high' },
  { word: '음란동영상', category: 'adult', severity: 'high' },

  // ─────────────────────────────────────────
  // 3. discrimination (차별)
  // ─────────────────────────────────────────
  { word: '장애인새끼', category: 'discrimination', severity: 'high' },
  { word: '병신새끼', category: 'discrimination', severity: 'high' },
  { word: '애자', category: 'discrimination', severity: 'high' },
  { word: '봉사', category: 'discrimination', severity: 'medium' },
  { word: '귀머거리', category: 'discrimination', severity: 'medium' },
  { word: '절름발이', category: 'discrimination', severity: 'high' },
  { word: '앉은뱅이', category: 'discrimination', severity: 'high' },
  { word: '정신병자', category: 'discrimination', severity: 'medium' },
  { word: '미치광이', category: 'discrimination', severity: 'medium' },
  { word: '정신이상자', category: 'discrimination', severity: 'medium' },
  { word: '빨갱이', category: 'discrimination', severity: 'high' },
  { word: '좌빨', category: 'discrimination', severity: 'high' },
  { word: '홍어', category: 'discrimination', severity: 'high' },
  { word: '된장녀', category: 'discrimination', severity: 'high' },
  { word: '김치녀', category: 'discrimination', severity: 'high' },
  { word: '한남충', category: 'discrimination', severity: 'high' },
  { word: '한녀충', category: 'discrimination', severity: 'high' },
  { word: '쪽발이', category: 'discrimination', severity: 'high' },
  { word: '짱깨', category: 'discrimination', severity: 'high' },
  { word: '짱개', category: 'discrimination', severity: 'high' },
  { word: '왜놈', category: 'discrimination', severity: 'high' },
  { word: '쪽바리', category: 'discrimination', severity: 'high' },
  { word: '흑형', category: 'discrimination', severity: 'medium' },
  { word: '니거', category: 'discrimination', severity: 'high' },
  { word: '계집', category: 'discrimination', severity: 'medium' },
  { word: '계집년', category: 'discrimination', severity: 'high' },
  { word: '잡년', category: 'discrimination', severity: 'high' },
  { word: '잡놈', category: 'discrimination', severity: 'high' },
  { word: '여성혐오', category: 'discrimination', severity: 'high' },
  { word: '남성혐오', category: 'discrimination', severity: 'high' },
  { word: '인종차별', category: 'discrimination', severity: 'high' },
  { word: '노인충', category: 'discrimination', severity: 'high' },
  { word: '노인네', category: 'discrimination', severity: 'medium' },
  { word: '틀딱', category: 'discrimination', severity: 'high' },
  { word: '틀딱충', category: 'discrimination', severity: 'high' },
  { word: '급식충', category: 'discrimination', severity: 'medium' },
  { word: '맘충', category: 'discrimination', severity: 'high' },
  { word: '부동산충', category: 'discrimination', severity: 'medium' },
  { word: '페미나치', category: 'discrimination', severity: 'high' },
  { word: '메갈', category: 'discrimination', severity: 'high' },
  { word: '한남', category: 'discrimination', severity: 'medium' },
  { word: '한녀', category: 'discrimination', severity: 'medium' },
  { word: '조선족', category: 'discrimination', severity: 'medium' },
  { word: '동남아놈', category: 'discrimination', severity: 'high' },

  // ─────────────────────────────────────────
  // 4. crime (범죄)
  // ─────────────────────────────────────────
  { word: '마약', category: 'crime', severity: 'high' },
  { word: '대마초', category: 'crime', severity: 'high' },
  { word: '대마', category: 'crime', severity: 'high' },
  { word: '필로폰', category: 'crime', severity: 'high' },
  { word: '메스암페타민', category: 'crime', severity: 'high' },
  { word: '히로뽕', category: 'crime', severity: 'high' },
  { word: '마리화나', category: 'crime', severity: 'high' },
  { word: '엑스터시', category: 'crime', severity: 'high' },
  { word: 'ecstasy', category: 'crime', severity: 'high' },
  { word: '코카인', category: 'crime', severity: 'high' },
  { word: '헤로인', category: 'crime', severity: 'high' },
  { word: 'lsd', category: 'crime', severity: 'high' },
  { word: '해킹', category: 'crime', severity: 'high' },
  { word: '해킹툴', category: 'crime', severity: 'high' },
  { word: '개인정보판매', category: 'crime', severity: 'high' },
  { word: '개인정보 판매', category: 'crime', severity: 'high' },
  { word: '피싱', category: 'crime', severity: 'high' },
  { word: '보이스피싱', category: 'crime', severity: 'high' },
  { word: '스미싱', category: 'crime', severity: 'high' },
  { word: '불법총기', category: 'crime', severity: 'high' },
  { word: '총기밀수', category: 'crime', severity: 'high' },
  { word: '총기거래', category: 'crime', severity: 'high' },
  { word: '불법촬영', category: 'crime', severity: 'high' },
  { word: '몰카', category: 'crime', severity: 'high' },
  { word: '도청', category: 'crime', severity: 'high' },
  { word: '사기', category: 'crime', severity: 'medium' },
  { word: '사기사이트', category: 'crime', severity: 'high' },
  { word: '먹튀사이트', category: 'crime', severity: 'high' },
  { word: '먹튀', category: 'crime', severity: 'high' },
  { word: '다단계', category: 'crime', severity: 'high' },
  { word: '폰지사기', category: 'crime', severity: 'high' },
  { word: '사설대출', category: 'crime', severity: 'high' },
  { word: '불법대출', category: 'crime', severity: 'high' },
  { word: '불법도박', category: 'crime', severity: 'high' },
  { word: '불법사이트', category: 'crime', severity: 'high' },
  { word: '탈세', category: 'crime', severity: 'high' },
  { word: '폭발물', category: 'crime', severity: 'high' },
  { word: '테러', category: 'crime', severity: 'high' },
  { word: '폭탄제조', category: 'crime', severity: 'high' },
  { word: '자살방법', category: 'crime', severity: 'high' },
  { word: '자살사이트', category: 'crime', severity: 'high' },
  { word: '자살방법알려줘', category: 'crime', severity: 'high' },
  { word: '살인방법', category: 'crime', severity: 'high' },
  { word: '랜섬웨어', category: 'crime', severity: 'high' },
  { word: '악성코드', category: 'crime', severity: 'high' },
  { word: '크래킹', category: 'crime', severity: 'high' },
  { word: '신분증위조', category: 'crime', severity: 'high' },
  { word: '서류위조', category: 'crime', severity: 'high' },
  { word: '허위진단서', category: 'crime', severity: 'high' },
  { word: '공문서위조', category: 'crime', severity: 'high' },
  { word: '저작권침해', category: 'crime', severity: 'medium' },
  { word: '불법다운로드', category: 'crime', severity: 'high' },
  { word: '토렌트', category: 'crime', severity: 'medium' },
  { word: '무단복제', category: 'crime', severity: 'medium' },
  { word: '아동포르노', category: 'crime', severity: 'high' },
  { word: '아동음란물', category: 'crime', severity: 'high' },
  { word: '아청물', category: 'crime', severity: 'high' },
  { word: '청소년성착취', category: 'crime', severity: 'high' },

  // ─────────────────────────────────────────
  // 5. commercial (상업성 — 네이버 특화)
  // ─────────────────────────────────────────
  { word: '무료', category: 'commercial', severity: 'low' },
  { word: '완전무료', category: 'commercial', severity: 'medium' },
  { word: '100%무료', category: 'commercial', severity: 'medium' },
  { word: '공짜', category: 'commercial', severity: 'low' },
  { word: '최저가', category: 'commercial', severity: 'medium' },
  { word: '최저가보장', category: 'commercial', severity: 'medium' },
  { word: '쿠폰', category: 'commercial', severity: 'low' },
  { word: '쿠폰발급', category: 'commercial', severity: 'medium' },
  { word: '100%', category: 'commercial', severity: 'low' },
  { word: '이벤트', category: 'commercial', severity: 'low' },
  { word: '특가', category: 'commercial', severity: 'low' },
  { word: '할인', category: 'commercial', severity: 'low' },
  { word: '대박할인', category: 'commercial', severity: 'medium' },
  { word: '무료배송', category: 'commercial', severity: 'low' },
  { word: '사은품', category: 'commercial', severity: 'low' },
  { word: '당일발송', category: 'commercial', severity: 'low' },
  { word: '당일배송', category: 'commercial', severity: 'low' },
  { word: '최대할인', category: 'commercial', severity: 'medium' },
  { word: '파격세일', category: 'commercial', severity: 'medium' },
  { word: '파격할인', category: 'commercial', severity: 'medium' },
  { word: '떠리', category: 'commercial', severity: 'medium' },
  { word: '공구', category: 'commercial', severity: 'low' },
  { word: '핫딜', category: 'commercial', severity: 'low' },
  { word: '한정수량', category: 'commercial', severity: 'medium' },
  { word: '마감임박', category: 'commercial', severity: 'medium' },
  { word: '품절임박', category: 'commercial', severity: 'medium' },
  { word: '한정판매', category: 'commercial', severity: 'medium' },
  { word: '한정특가', category: 'commercial', severity: 'medium' },
  { word: '타임세일', category: 'commercial', severity: 'medium' },
  { word: '타임딜', category: 'commercial', severity: 'medium' },
  { word: '오픈기념', category: 'commercial', severity: 'medium' },
  { word: '가입즉시', category: 'commercial', severity: 'medium' },
  { word: '가입혜택', category: 'commercial', severity: 'low' },
  { word: '무료체험', category: 'commercial', severity: 'medium' },
  { word: '무료증정', category: 'commercial', severity: 'medium' },
  { word: '1+1', category: 'commercial', severity: 'low' },
  { word: '2+1', category: 'commercial', severity: 'low' },
  { word: '덤증정', category: 'commercial', severity: 'low' },
  { word: '증정', category: 'commercial', severity: 'low' },
  { word: '경품', category: 'commercial', severity: 'low' },
  { word: '경품증정', category: 'commercial', severity: 'medium' },
  { word: '추첨', category: 'commercial', severity: 'low' },
  { word: '경품추첨', category: 'commercial', severity: 'medium' },
  { word: '당첨', category: 'commercial', severity: 'low' },
  { word: '현금증정', category: 'commercial', severity: 'high' },
  { word: '현금지급', category: 'commercial', severity: 'high' },
  { word: '포인트지급', category: 'commercial', severity: 'medium' },
  { word: '적립금', category: 'commercial', severity: 'low' },
  { word: '리워드', category: 'commercial', severity: 'low' },
  { word: '캐시백', category: 'commercial', severity: 'medium' },
  { word: '페이백', category: 'commercial', severity: 'medium' },
  { word: '기간한정', category: 'commercial', severity: 'medium' },
  { word: '오늘만', category: 'commercial', severity: 'medium' },
  { word: '오늘만가격', category: 'commercial', severity: 'high' },
  { word: '최고가격', category: 'commercial', severity: 'medium' },
  { word: '최강가격', category: 'commercial', severity: 'medium' },
  { word: '초특가', category: 'commercial', severity: 'medium' },
  { word: '폭탄세일', category: 'commercial', severity: 'high' },
  { word: '폭탄할인', category: 'commercial', severity: 'high' },
  { word: '땡처리', category: 'commercial', severity: 'medium' },
  { word: '재고처리', category: 'commercial', severity: 'medium' },
  { word: '창고대방출', category: 'commercial', severity: 'high' },
  { word: '광고', category: 'commercial', severity: 'low' },
  { word: '광고성글', category: 'commercial', severity: 'medium' },
  { word: '협찬', category: 'commercial', severity: 'low' },
  { word: '홍보글', category: 'commercial', severity: 'medium' },
  { word: '바이럴', category: 'commercial', severity: 'low' },
  { word: '바이럴마케팅', category: 'commercial', severity: 'medium' },
  { word: '블체글', category: 'commercial', severity: 'high' },
  { word: '체험단', category: 'commercial', severity: 'medium' },
  { word: '체험단모집', category: 'commercial', severity: 'high' },
  { word: '리뷰어모집', category: 'commercial', severity: 'high' },
  { word: '모니터요원', category: 'commercial', severity: 'high' },
  { word: '할인코드', category: 'commercial', severity: 'medium' },
  { word: '프로모션코드', category: 'commercial', severity: 'medium' },
  { word: '디스카운트', category: 'commercial', severity: 'low' },
  { word: '세일', category: 'commercial', severity: 'low' },
  { word: '클리어런스', category: 'commercial', severity: 'low' },
  { word: '최다판매', category: 'commercial', severity: 'medium' },
  { word: '베스트셀러', category: 'commercial', severity: 'low' },
  { word: '인기폭발', category: 'commercial', severity: 'medium' },
  { word: '매진임박', category: 'commercial', severity: 'medium' },
  { word: '상위노출', category: 'commercial', severity: 'high' },
  { word: '상위등록', category: 'commercial', severity: 'high' },

  // ─────────────────────────────────────────
  // 6. gambling (도박)
  // ─────────────────────────────────────────
  { word: '카지노', category: 'gambling', severity: 'high' },
  { word: '온라인카지노', category: 'gambling', severity: 'high' },
  { word: '카지노사이트', category: 'gambling', severity: 'high' },
  { word: '슬롯머신', category: 'gambling', severity: 'high' },
  { word: '슬롯', category: 'gambling', severity: 'high' },
  { word: '슬롯사이트', category: 'gambling', severity: 'high' },
  { word: '바카라', category: 'gambling', severity: 'high' },
  { word: '바카라사이트', category: 'gambling', severity: 'high' },
  { word: '토토', category: 'gambling', severity: 'high' },
  { word: '토토사이트', category: 'gambling', severity: 'high' },
  { word: '사설토토', category: 'gambling', severity: 'high' },
  { word: '스포츠토토', category: 'gambling', severity: 'medium' },
  { word: '배팅', category: 'gambling', severity: 'high' },
  { word: '베팅', category: 'gambling', severity: 'high' },
  { word: '배팅사이트', category: 'gambling', severity: 'high' },
  { word: '베팅사이트', category: 'gambling', severity: 'high' },
  { word: '도박', category: 'gambling', severity: 'high' },
  { word: '도박사이트', category: 'gambling', severity: 'high' },
  { word: '불법도박사이트', category: 'gambling', severity: 'high' },
  { word: '온라인도박', category: 'gambling', severity: 'high' },
  { word: '포커', category: 'gambling', severity: 'medium' },
  { word: '홀덤', category: 'gambling', severity: 'medium' },
  { word: '홀덤사이트', category: 'gambling', severity: 'high' },
  { word: '온라인포커', category: 'gambling', severity: 'high' },
  { word: '블랙잭', category: 'gambling', severity: 'medium' },
  { word: '룰렛', category: 'gambling', severity: 'medium' },
  { word: '경마', category: 'gambling', severity: 'medium' },
  { word: '경마사이트', category: 'gambling', severity: 'high' },
  { word: '사설경마', category: 'gambling', severity: 'high' },
  { word: '복권', category: 'gambling', severity: 'low' },
  { word: '로또', category: 'gambling', severity: 'low' },
  { word: '파워볼', category: 'gambling', severity: 'medium' },
  { word: '파워볼사이트', category: 'gambling', severity: 'high' },
  { word: '사다리게임', category: 'gambling', severity: 'medium' },
  { word: '사다리사이트', category: 'gambling', severity: 'high' },
  { word: '미니게임', category: 'gambling', severity: 'medium' },
  { word: '미니게임사이트', category: 'gambling', severity: 'high' },
  { word: '승부예측', category: 'gambling', severity: 'medium' },
  { word: '배당률', category: 'gambling', severity: 'medium' },
  { word: '배당분석', category: 'gambling', severity: 'medium' },
  { word: '무한배당', category: 'gambling', severity: 'high' },
  { word: '먹튀검증', category: 'gambling', severity: 'high' },
  { word: '먹튀검증사이트', category: 'gambling', severity: 'high' },
  { word: '안전사이트', category: 'gambling', severity: 'medium' },
  { word: '안전놀이터', category: 'gambling', severity: 'high' },
  { word: '메이저사이트', category: 'gambling', severity: 'high' },
  { word: '토큰게임', category: 'gambling', severity: 'high' },
  { word: '크립토카지노', category: 'gambling', severity: 'high' },
  { word: '코인카지노', category: 'gambling', severity: 'high' },
];

const SEVERITY_ORDER: Record<ProfanityResult['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * 텍스트에서 비속어/금칙어를 검사합니다.
 *
 * @param text 검사할 텍스트
 * @param options.ignoreSpaces 공백을 무시하고 매칭 (기본: true) — "시 발" → "시발" 매칭
 * @param options.categories 특정 카테고리만 검사 (미지정 시 전체)
 * @returns 매칭된 비속어 목록 (severity 내림차순)
 */
export function checkProfanity(
  text: string,
  options?: {
    ignoreSpaces?: boolean;
    categories?: Array<ProfanityEntry['category']>;
  }
): ProfanityResult[] {
  const ignoreSpaces = options?.ignoreSpaces !== false; // 기본 true
  const categories = options?.categories;

  // 텍스트 정규화
  const normalizedText = text.toLowerCase();
  const noSpaceText = ignoreSpaces ? normalizedText.replace(/\s+/g, '') : normalizedText;

  const seen = new Set<string>(); // 중복 제거용
  const results: ProfanityResult[] = [];

  const entries = categories
    ? PROFANITY_DB.filter((e) => categories.includes(e.category))
    : PROFANITY_DB;

  for (const entry of entries) {
    if (seen.has(entry.word)) continue;

    const needle = entry.word.toLowerCase();

    // 1) 원본 텍스트에서 매칭 시도
    if (normalizedText.includes(needle)) {
      seen.add(entry.word);
      // 원본 텍스트에서 실제 매칭된 부분 추출
      const idx = normalizedText.indexOf(needle);
      const matched = text.slice(idx, idx + needle.length);
      results.push({
        word: entry.word,
        matched,
        category: entry.category,
        severity: entry.severity,
      });
      continue;
    }

    // 2) 공백 제거 텍스트에서 매칭 시도 (ignoreSpaces: true 일 때)
    if (ignoreSpaces && noSpaceText.includes(needle.replace(/\s+/g, ''))) {
      seen.add(entry.word);
      results.push({
        word: entry.word,
        matched: entry.word, // 공백 무시 매칭이므로 원본 단어 반환
        category: entry.category,
        severity: entry.severity,
      });
    }
  }

  // severity 내림차순 정렬 (high → medium → low)
  return results.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}
