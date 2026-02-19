# Architecture Principles for Knowledge Pipelines

## Clean Architecture Dependency Rule

Inner layers must not know about outer layers. Dependencies point inward only.

```
┌─────────────────────────────────────────┐
│  Distribution (email, web, app)         │  Outer — can change freely
├─────────────────────────────────────────┤
│  Content Management (edit, review)      │  Adapters — UI, workflows
├─────────────────────────────────────────┤
│  Content Creation (AI, crawl, manual)   │  Use Cases — business logic
├─────────────────────────────────────────┤
│  Knowledge Base (embed, search, serve)  │  Core — most stable
└─────────────────────────────────────────┘
```

**Practical implications:**
- Changing email template (outer) doesn't affect knowledge base (inner)
- Switching embedding model (core) requires testing all dependent layers
- Adding new distribution channel (outer) needs zero changes to core

## Architecture Decision Record (ADR) Template

```markdown
# ADR-{number}: {Title}

## Status
Proposed / Accepted / Deprecated / Superseded

## Context
What problem are we solving? What constraints exist?

## Decision
What did we decide? Be specific.

## Consequences
### Positive
- [benefit 1]

### Negative
- [trade-off 1]

### Risks
- [risk 1] — Mitigation: [how]

## Alternatives Considered
| Option | Pros | Cons | Why rejected |
|--------|------|------|-------------|
```

## Layer Isolation Testing

Verify layer independence with these questions:

| Test | Expected |
|------|----------|
| Can Layer 0 work without Layer 1? | Yes — KB exists independently |
| Can Layer 1 work without Layer 2? | Yes — content created but not distributed |
| Can Layer 2 switch providers? | Yes — email provider change doesn't affect content |
| Can Layer 0 switch embedding model? | Yes — re-embed, layers 1-2 unaffected |

## Scaling Decision Framework

| Signal | Action |
|--------|--------|
| < 50 documents | Single folder, no structure needed |
| 50-200 documents | Tag-based organization, single vector store |
| 200-1000 documents | Folder structure by domain, consider namespaced search |
| 1000+ documents | Dedicated vector stores per domain, cross-search federation |
| Multiple teams using data | Separate agents per domain with shared core |

## Trade-off Matrix for Common Decisions

### Embedding: Local vs Cloud

| Factor | Local (bge-m3) | Cloud (OpenAI/Gemini) |
|--------|---------------|----------------------|
| Cost | Free | $0.0001/1K tokens |
| Latency | ~50ms | ~200ms + network |
| Privacy | Full control | Data leaves machine |
| Quality | Excellent multilingual | Slightly better English |
| Maintenance | Model updates manual | Auto-updated |
| Dependency | None | API key + internet |
| **Best for** | **Privacy-first, cost-sensitive** | **Scale, English-dominant** |

### Storage: Single vs Split Vector Stores

| Factor | Single store | Split by domain |
|--------|-------------|-----------------|
| Simplicity | Easy setup | More config |
| Cross-domain search | Automatic | Requires federation |
| Noise | Higher (mixed domains) | Lower (focused) |
| Scaling | Limited | Independent scaling |
| **Best for** | **< 500 docs, single team** | **1000+ docs, multi-domain** |

### Conflict Resolution: Priority Rules vs Deduplication

| Factor | Priority rules | Deduplication |
|--------|---------------|---------------|
| Implementation | Simple (rank sources) | Complex (similarity detection) |
| Accuracy | Source-based trust | Content-based truth |
| Maintenance | Update ranks as sources change | Threshold tuning |
| **Best for** | **Clear authority hierarchy** | **Redundant sources, no clear authority** |
