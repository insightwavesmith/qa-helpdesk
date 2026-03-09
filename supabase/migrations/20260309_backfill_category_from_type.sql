-- T3: category 누락분 백필 — type 값을 category에 복사
-- category가 NULL이고 type이 있는 행만 대상
UPDATE contents
SET category = type
WHERE category IS NULL
  AND type IS NOT NULL;
