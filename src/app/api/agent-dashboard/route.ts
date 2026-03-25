import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import { createClient, createServiceClient } from "@/lib/supabase/server";
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

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function readJsonlFile(filePath: string, maxLines: number): Promise<CommLog[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const recent = lines.slice(-maxLines);
    return recent
      .map((line) => {
        try {
          return JSON.parse(line) as CommLog;
        } catch {
          return null;
        }
      })
      .filter((item): item is CommLog => item !== null);
  } catch {
    return [];
  }
}

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

function parsePdcaFeatures(raw: PdcaStatusJson | null): PdcaFeature[] {
  if (!raw?.features) return [];

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

export async function GET() {
  // 인증 확인
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // admin 역할 확인
  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
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
    const filePath = `/tmp/cross-team/${teamId}/state.json`;
    const data = await readJsonFile<TeamState>(filePath);
    if (data) {
      teamStates[teamId] = data;
    }
  }

  // 소통 로그 읽기 (최근 50건)
  const logs = await readJsonlFile("/tmp/cross-team/logs/comm.jsonl", 50);

  // 백그라운드 태스크 읽기
  const backgroundData = await readJsonFile<BackgroundTask[]>("/tmp/cross-team/background/tasks.json");
  const background = backgroundData ?? [];

  // PDCA 상태 읽기
  const pdcaRaw = await readJsonFile<PdcaStatusJson>(
    "/Users/smith/projects/bscamp/.pdca-status.json"
  );
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
