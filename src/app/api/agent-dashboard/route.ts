import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/firebase/auth";
import { readGcsJson, readGcsJsonl } from "@/lib/gcs-storage";
import type {
  DashboardState,
  OrgChart,
  TeamId,
  TeamState,
  CommLog,
  BackgroundTask,
  PdcaFeature,
  PdcaPhase,
} from "@/types/agent-dashboard";

const ORG_CHART: OrgChart = {
  ceo: { name: "Smith", title: "CEO" },
  coo: { name: "모찌", title: "COO" },
  teams: [
    {
      id: "pm",
      name: "PM팀",
      emoji: "📋",
      lead: "pm-lead",
      memberCount: 3,
    },
    {
      id: "marketing",
      name: "마케팅팀",
      emoji: "📊",
      lead: "marketing-strategist",
      memberCount: 4,
    },
    {
      id: "cto",
      name: "CTO팀",
      emoji: "⚙️",
      lead: "cto-lead",
      memberCount: 4,
    },
  ],
};

const DEFAULT_TEAM_STATE: TeamState = {
  name: "",
  emoji: "",
  status: "idle",
  color: "#6B7280",
  members: [],
  tasks: [],
};

interface PdcaStatusJson {
  status?: string;
  tasks?: unknown[];
  features?: Record<
    string,
    {
      phase?: string;
      matchRate?: number;
      documents?: {
        plan?: string;
        design?: string;
        analysis?: string;
        report?: string;
      };
      startedAt?: string;
      completedAt?: string;
      notes?: string;
      team?: string;
    }
  >;
}

/** 루트 pdca-status.json 형식 (features 래퍼 없이 flat) */
interface PdcaRootJson {
  [feature: string]: {
    status?: string;
    matchRate?: number;
    plan?: string;
    design?: string;
    updatedAt?: string;
    completedAt?: string;
    notes?: string;
    team?: string;
    tasks?: unknown[];
  };
}

/** phase 문자열 → PdcaPhase 매핑 */
function toPdcaPhase(status?: string): PdcaPhase {
  const map: Record<string, PdcaPhase> = {
    planning: "planning",
    designing: "designing",
    implementing: "implementing",
    checking: "checking",
    completed: "completed",
    deployed: "completed",
  };
  return map[status ?? ""] ?? "implementing";
}

function parsePdcaFeatures(raw: PdcaStatusJson | PdcaRootJson | null): PdcaFeature[] {
  if (!raw) return [];

  // Format 1: docs/.pdca-status.json — { features: { ... } }
  if ("features" in raw && raw.features) {
    return Object.entries(raw.features).map(([name, feature]) => ({
      name,
      phase: (feature.phase as PdcaPhase) || "planning",
      matchRate: feature.matchRate ?? 0,
      documents: feature.documents ?? {},
      startedAt: feature.startedAt ?? new Date().toISOString(),
      completedAt: feature.completedAt,
      notes: feature.notes ?? "",
      team: (feature.team as TeamId) ?? "cto",
    }));
  }

  // Format 2: root .pdca-status.json — flat object { "feature-name": { status, ... } }
  const entries = Object.entries(raw).filter(
    ([key]) => !["status", "tasks", "features"].includes(key),
  );
  if (entries.length === 0) return [];

  return entries.map(([name, feature]) => ({
    name,
    phase: toPdcaPhase(feature.status),
    matchRate: feature.matchRate ?? 0,
    documents: {
      plan: feature.plan,
      design: feature.design,
    },
    startedAt: feature.updatedAt ?? new Date().toISOString(),
    completedAt: feature.completedAt,
    notes: feature.notes ?? "",
    team: (feature.team as TeamId) ?? "cto",
  }));
}

export async function GET() {
  // 인증 확인
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // admin 역할 확인
  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.uid)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // 팀 state.json 읽기
  const teamIds: TeamId[] = ["pm", "marketing", "cto"];
  const teamStates: Record<TeamId, TeamState> = {
    pm: { ...DEFAULT_TEAM_STATE, name: "PM팀", emoji: "📋" },
    marketing: { ...DEFAULT_TEAM_STATE, name: "마케팅팀", emoji: "📊" },
    cto: { ...DEFAULT_TEAM_STATE, name: "CTO팀", emoji: "⚙️" },
  };

  for (const teamId of teamIds) {
    const data = await readGcsJson<TeamState>(`${teamId}/state.json`);
    if (data) {
      teamStates[teamId] = data;
    }
  }

  // 소통 로그 읽기 (최근 50건)
  const logs = await readGcsJsonl<CommLog>("logs/comm.jsonl", 50);

  // 백그라운드 태스크 읽기
  const backgroundData = await readGcsJson<BackgroundTask[]>("background/tasks.json");
  const background = backgroundData ?? [];

  // PDCA 상태 읽기
  const pdcaRaw = await readGcsJson<PdcaStatusJson>("pdca-status.json");
  const features = parsePdcaFeatures(pdcaRaw);

  const completed = features.filter((f) => f.phase === "completed").length;
  const inProgress = features.filter((f) => f.phase !== "completed").length;
  const avgMatchRate =
    features.length > 0
      ? Math.round(features.reduce((sum, f) => sum + f.matchRate, 0) / features.length)
      : 0;

  const dashboardState: DashboardState = {
    updatedAt: new Date().toISOString(),
    org: ORG_CHART,
    teams: teamStates,
    logs,
    background,
    pdca: {
      features,
      summary: {
        total: features.length,
        completed,
        inProgress,
        avgMatchRate,
      },
    },
    connection: {
      status: "live",
      lastPing: new Date().toISOString(),
    },
  };

  return NextResponse.json(dashboardState);
}
