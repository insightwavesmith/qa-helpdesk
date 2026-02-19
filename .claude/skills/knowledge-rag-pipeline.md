# RAG Pipeline Design

## 5-Step Knowledge Base Construction

### Step 1: Domain & User Question Mapping

Before touching data, answer:
- What questions should the system answer? (specific topics, depth)
- Who asks? (students, admins, public)
- What sources are authoritative? (instructor > external > general)
- What are the core entities? (courses, topics, techniques, tools)

**Output:** Question-source mapping table

```markdown
| Question Type | Example | Primary Source | Fallback |
|--------------|---------|---------------|----------|
| How-to | "카탈로그 설정 방법" | 강의 스크립트 | 메타 공식 문서 |
| Troubleshooting | "ROAS가 안 나와요" | Q&A 이력 | 강의 + 레퍼런스 |
| Concept | "어트리뷰션이 뭔가요" | 강의 스크립트 | 엠타트업 |
```

### Step 2: Data Collection & Cleaning

Transform all sources to plain text (markdown preferred):

| Source Format | Transform Method | Notes |
|--------------|-----------------|-------|
| PDF | pdfplumber / pymupdf | Preserve headers, tables |
| Audio/Video | Whisper transcription | Timestamp segments for chunking |
| HTML/Web | cheerio + turndown | Strip nav/ads |
| Chat export | Parse → structured md | Separate Q from A |
| Database | SQL export → md | One file per record or batch |
| Slides | Extract text + speaker notes | Image descriptions if relevant |

**Cleaning checklist:**
- [ ] Remove boilerplate (headers, footers, navigation)
- [ ] Normalize encoding (UTF-8)
- [ ] Preserve structural markers (headings, lists, tables)
- [ ] Add metadata frontmatter (source, date, author, priority)

### Step 3: Chunking Strategy

| Strategy | Best For | Chunk Size |
|----------|---------|------------|
| Heading-based | Structured docs (lectures, manuals) | Varies by section |
| Recursive character | Unstructured text | 500-1000 chars, 100 overlap |
| Sentence-based | Q&A, conversations | 3-5 sentences |
| Semantic | Mixed content | Model-determined boundaries |

**Education-specific guidance:**
- Lecture scripts: chunk by topic/slide, not fixed size
- Q&A: keep question+answer as single chunk
- Meeting transcripts: chunk by speaker turn or topic shift
- Reference docs: heading-based with parent context

### Step 4: Embedding

| Model | Multilingual | Size | Quality | Speed |
|-------|-------------|------|---------|-------|
| bge-m3 | Excellent | 2.2GB | High | Fast (local) |
| text-embedding-3-small | Good | API | Medium | Fast |
| text-embedding-3-large | Good | API | High | Medium |
| Gemini text-embedding-004 | Good | API | High | Medium |

**Metadata to store with embeddings:**
```json
{
  "source_path": "cohorts/5기/scripts/week-3.md",
  "source_type": "lecture_script",
  "priority": 1,
  "author": "instructor",
  "date": "2026-01-15",
  "topic_tags": ["카탈로그", "메타광고"],
  "chunk_index": 3,
  "total_chunks": 12
}
```

### Step 5: Retrieval & Serving

**Retrieval pipeline:**
```
Query → Embed query → Vector similarity search → Re-rank by priority → Context window assembly → LLM generation
```

**Priority-aware retrieval:**
1. Get top-K results by similarity (K=10-20)
2. Sort by priority tier (instructor > framework > reference > crawled)
3. Within same tier, sort by similarity score
4. Assemble context: highest priority first, fill remaining window with lower tiers
5. Include source citation in generated answer

**Context window budget:**
- System prompt: ~2K tokens
- Retrieved context: ~4-8K tokens (3-5 chunks)
- Question: ~200 tokens
- Answer generation: ~1-2K tokens

## Progressive Enhancement Path

```
Week 1: Core documents only (lectures, key references)
         → Test retrieval quality with known questions
         → Tune chunk size if needed

Week 2: Add secondary sources (Q&A history, meeting notes)
         → Verify priority rules work (instructor beats Q&A)
         → Monitor for noise

Month 2: Add tertiary sources (external content, crawled data)
          → Evaluate if cross-domain search works
          → Consider domain-specific filtering

Month 3: Optimization
          → Analyze failed queries (no good results)
          → Add missing content to fill gaps
          → Consider re-ranking model if quality plateaus
```

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Chunks too large | Irrelevant context in answers | Reduce chunk size, use heading-based |
| Chunks too small | Missing context | Increase overlap, include parent headers |
| No priority rules | External content overrides instructor | Implement source-based ranking |
| Stale embeddings | New content not searchable | Cron re-indexing or watch-based sync |
| Mixed languages | Poor cross-lingual retrieval | Use multilingual model (bge-m3) |
| Duplicate content | Same info from multiple sources | Deduplicate before embedding, or rank |
