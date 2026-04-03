// dashboard/server/brick/project/sync.ts — .bkit/project.yaml → DB 동기화
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parse as parseYaml } from 'yaml';
import { db } from '../../db/index.js';
import { brickProjects } from '../../db/schema/brick.js';
import { eq } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// sync.ts: dashboard/server/brick/project/ → 4단계 상위가 bscamp 루트
const YAML_PATH = join(__dirname, '../../../../.bkit/project.yaml');

export function syncProjectYaml(): void {
  if (!existsSync(YAML_PATH)) {
    console.log('[sync-project] .bkit/project.yaml 없음 — 동기화 스킵');
    return;
  }

  try {
    const raw = readFileSync(YAML_PATH, 'utf-8');
    const yaml = parseYaml(raw) as {
      id: string;
      name: string;
      description?: string;
      infrastructure?: Record<string, unknown>;
    };

    if (!yaml.id || !yaml.name) {
      console.warn('[sync-project] project.yaml에 id/name 없음');
      return;
    }

    const infrastructureJson = JSON.stringify(yaml.infrastructure ?? {});
    const now = new Date().toISOString();

    const existing = db.select({ id: brickProjects.id, updatedAt: brickProjects.updatedAt })
      .from(brickProjects)
      .where(eq(brickProjects.id, yaml.id))
      .get();

    if (existing) {
      db.update(brickProjects)
        .set({
          name: yaml.name,
          description: yaml.description ?? null,
          infrastructure: infrastructureJson,
          updatedAt: now,
        })
        .where(eq(brickProjects.id, yaml.id))
        .run();
      console.log(`[sync-project] 프로젝트 갱신: ${yaml.id}`);
    } else {
      db.insert(brickProjects).values({
        id: yaml.id,
        name: yaml.name,
        description: yaml.description ?? null,
        infrastructure: infrastructureJson,
        config: '{}',
        active: 1,
        createdAt: now,
        updatedAt: now,
      }).run();
      console.log(`[sync-project] 프로젝트 신규 등록: ${yaml.id}`);
    }
  } catch (err) {
    console.error('[sync-project] YAML 동기화 실패:', err);
  }
}
