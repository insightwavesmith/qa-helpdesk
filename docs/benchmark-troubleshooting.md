# 트러블슈팅

## 1. Cloud Run 메모리 에러

```
ERROR: memory must be between 128Mi and 512Mi
```

**원인**: 기본 CPU(0.33)는 512Mi까지만 허용

**해결**:
```bash
gcloud run deploy ... --cpu=1 --memory=1Gi
```

### CPU별 허용 메모리
| CPU | 허용 메모리 |
|-----|------------|
| 0.33 (기본) | 128Mi ~ 512Mi |
| 1 | 128Mi ~ 4Gi |
| 2 | 128Mi ~ 8Gi |

---

## 2. BigQuery 스트리밍 버퍼 지연

```
데이터가 바로 조회 안 됨 (최대 90분 지연)
```

**해결**: `insert_rows_json` 후 바로 조회 필요하면:
```sql
SELECT * FROM table WHERE _PARTITIONTIME IS NULL
```

---

## 3. Meta API 토큰 만료

```
Error validating access token
```

**해결**:
1. Meta Business Suite에서 토큰 재발급
2. .env 업데이트
3. Cloud Run 재배포 (환경변수 업데이트)

```bash
gcloud run deploy dashboard-api \
  --source . \
  --region asia-northeast3 \
  --project modified-shape-477110-h8 \
  --set-env-vars "META_ACCESS_TOKEN=새토큰"
```

---

## 4. 시간대 불일치

```
데이터가 하루 밀리거나 당겨짐
```

**체크리스트**:
- [ ] Cloud Scheduler: `Asia/Seoul` 시간대 설정 확인
- [ ] 코드: `어제 날짜` 사용 확인
- [ ] BigQuery 조회 시 KST 고려

**Scheduler 확인**:
```bash
gcloud scheduler jobs describe collect-daily-morning \
  --location=asia-northeast3 \
  --project=modified-shape-477110-h8
```

---

## 5. 중복 데이터

```
같은 날짜에 데이터가 여러 번 들어감
```

**해결**: DELETE 후 INSERT 패턴 사용

```python
# 삭제 먼저
DELETE FROM benchmarks WHERE date = '{date_str}'

# 그 다음 INSERT
INSERT INTO benchmarks ...
```

---

## 6. Cloud Run 배포 실패

```
ERROR: (gcloud.run.deploy) FAILED_PRECONDITION
```

**체크리스트**:
- [ ] Dockerfile 또는 Procfile 존재 확인
- [ ] requirements.txt 문법 오류 확인
- [ ] 서비스 계정 권한 확인

**로그 확인**:
```bash
gcloud builds list --limit=5 --project=modified-shape-477110-h8
gcloud builds log BUILD_ID --project=modified-shape-477110-h8
```

---

## 7. Meta API Rate Limit

```
(#17) User request limit reached
```

**해결**:
- 요청 간 `time.sleep(1)` 추가
- 배치 크기 줄이기
- 새벽 시간대 실행 (트래픽 적음)

---

## 8. BigQuery 권한 에러

```
Access Denied: Project modified-shape-477110-h8
```

**해결**:
```bash
# 서비스 계정 권한 확인
gcloud projects get-iam-policy modified-shape-477110-h8 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount"

# BigQuery 권한 부여
gcloud projects add-iam-policy-binding modified-shape-477110-h8 \
  --member="serviceAccount:YOUR_SA@modified-shape-477110-h8.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"
```
