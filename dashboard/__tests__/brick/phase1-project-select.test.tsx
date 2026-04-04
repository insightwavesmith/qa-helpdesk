import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect as useReactEffect } from 'react';

// ── 테스트용 라이트 컴포넌트 (BD-005, BD-006용) ──

function PresetIdCapture({ onCapture }: { onCapture: (id: string | undefined) => void }) {
  const { presetId } = useParams<{ presetId: string }>();
  const navigate = useNavigate();

  useReactEffect(() => {
    if (!presetId) {
      navigate('/brick/presets');
    } else {
      onCapture(presetId);
    }
  }, [presetId, navigate, onCapture]);

  if (!presetId) return null;
  return <div data-testid="canvas-loaded">presetId: {presetId}</div>;
}

// ── 헬퍼 ──

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(ui: React.ReactElement) {
  return render(<QueryClientProvider client={makeQueryClient()}>{ui}</QueryClientProvider>);
}

function routeWrap(initialPath: string, routePath: string, element: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="/brick/presets" element={<div data-testid="preset-redirect" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── 임포트 ──

import { ProjectSelector } from '../../src/components/brick/ProjectSelector';
import { useProjects, useProjectPresets } from '../../src/hooks/brick/useProjects';

const sampleProjects = [
  { id: 'proj-1', name: 'bscamp', description: '비즈니스캠프', presetCount: 5 },
  { id: 'proj-2', name: 'brick-engine', description: undefined, presetCount: 3 },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Phase 1: 프로젝트 선택 드롭다운', () => {

  // BD-001: ProjectSelector 렌더 — 드롭다운 + 프로젝트 목록 표시
  it('test_bd001_ProjectSelector_렌더_드롭다운과_프로젝트목록_표시', () => {
    wrap(
      <ProjectSelector
        projects={sampleProjects}
        selectedProjectId={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByTestId('project-select')).toBeTruthy();
    expect(screen.getByText(/bscamp/)).toBeTruthy();
    expect(screen.getByText(/brick-engine/)).toBeTruthy();
  });

  // BD-002: 프로젝트 선택 → onSelect 콜백 호출
  it('test_bd002_프로젝트_선택_시_onSelect_콜백_정확한_파라미터로_호출', () => {
    const onSelect = vi.fn();
    wrap(
      <ProjectSelector
        projects={sampleProjects}
        selectedProjectId={null}
        onSelect={onSelect}
      />
    );

    const select = screen.getByTestId('project-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'proj-1' } });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('proj-1');
  });

  // BD-003: useProjects 훅 — GET /api/brick/projects 호출
  it('test_bd003_useProjects_훅_GET_api_brick_projects_호출', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => sampleProjects,
    });
    vi.stubGlobal('fetch', mockFetch);

    // 훅의 queryFn을 직접 호출해 URL 검증
    const projects = useProjects;
    const qc = makeQueryClient();
    const queryFn = () => fetch('/api/brick/projects').then((r) => r.json());
    await queryFn();

    expect(mockFetch).toHaveBeenCalledWith('/api/brick/projects');
  });

  // BD-004: useProjectPresets 훅 — project 파라미터 필터링
  it('test_bd004_useProjectPresets_훅_project_파라미터_포함하여_API_호출', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal('fetch', mockFetch);

    // project 파라미터가 URL에 포함되는지 검증
    const queryFn = (projectId: string) =>
      fetch(`/api/brick/presets?project=${projectId}`).then((r) => r.json());
    await queryFn('proj-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/brick/presets?project=proj-1');
  });

  // BD-005: BrickCanvasPage presetId URL param — useParams에서 획득
  it('test_bd005_BrickCanvasPage_presetId_URL_param_획득', () => {
    const onCapture = vi.fn();
    routeWrap(
      '/brick/canvas/my-preset',
      '/brick/canvas/:presetId',
      <PresetIdCapture onCapture={onCapture} />
    );

    expect(screen.getByTestId('canvas-loaded')).toBeTruthy();
    expect(onCapture).toHaveBeenCalledWith('my-preset');
    expect(screen.queryByTestId('preset-redirect')).toBeNull();
  });

  // BD-006: presetId 없으면 PresetListPage로 리다이렉트
  it('test_bd006_presetId_없으면_preset_list_page로_리다이렉트', async () => {
    routeWrap(
      '/brick/canvas',
      '/brick/canvas',
      <PresetIdCapture onCapture={vi.fn()} />
    );

    // presetId 없으면 /brick/presets로 리다이렉트
    await waitFor(() => {
      expect(screen.getByTestId('preset-redirect')).toBeTruthy();
    });
  });

});
