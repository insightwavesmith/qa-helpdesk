import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { renderHook } from '@testing-library/react';

// ── 글로벌 fetch 모킹 ──
const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

// ── Monaco 모킹 ──
vi.mock('@monaco-editor/react', () => ({
  default: (props: any) => (
    <textarea
      data-testid="monaco-editor"
      value={props.value}
      onChange={(e: any) => props.onChange?.(e.target.value)}
    />
  ),
}));

// ── React Router 모킹 (useParams) ──
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'team-1' }),
  };
});

import {
  useBlockTypes,
  useCreateBlockType,
  useUpdateBlockType,
  useDeleteBlockType,
} from '../../src/hooks/brick/useBlockTypes';
import {
  useTeams,
  useCreateTeam,
  useDeleteTeam,
  useTeamMembers,
  useAddMember,
  useRemoveMember,
  useUpdateSkill,
  useConfigureMcp,
  useSetModel,
  useTeamStatus,
} from '../../src/hooks/brick/useTeams';
import {
  usePresets,
  useCreatePreset,
  useExportPreset,
  useImportPreset,
  useApplyPreset,
} from '../../src/hooks/brick/usePresets';
import { BlockCatalogPage } from '../../src/pages/brick/BlockCatalogPage';
import { TeamManagePage } from '../../src/pages/brick/TeamManagePage';
import { TeamDetailPage } from '../../src/pages/brick/TeamDetailPage';
import { PresetListPage } from '../../src/pages/brick/PresetListPage';
import { PresetEditorPage } from '../../src/pages/brick/PresetEditorPage';
import { TeamMemberList } from '../../src/components/brick/team/TeamMemberList';
import { SkillEditor } from '../../src/components/brick/team/SkillEditor';
import { McpServerList } from '../../src/components/brick/team/McpServerList';
import { ModelSelector } from '../../src/components/brick/team/ModelSelector';
import { AdapterSelector } from '../../src/components/brick/team/AdapterSelector';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockJsonResponse(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
    statusText: 'OK',
  });
}

// ═══════════════════════════════════════════
// BF-026 ~ BF-031: Block Type CRUD
// ═══════════════════════════════════════════

describe('BlockType Hooks', () => {
  it('bf026_use_block_types_get', async () => {
    const items = [{ id: '1', name: '기획', what: '계획', done: '완료', createdAt: '2026-01-01' }];
    mockFetch.mockResolvedValueOnce(mockJsonResponse(items));

    const { result } = renderHook(() => useBlockTypes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/block-types',
      undefined,
    );
    expect(result.current.data).toEqual(items);
  });

  it('bf027_use_create_block_type_post', async () => {
    const newItem = { id: '2', name: '구현', what: '코딩', done: '빌드성공', createdAt: '2026-01-01' };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(newItem));

    const { result } = renderHook(() => useCreateBlockType(), { wrapper: createWrapper() });
    result.current.mutate({ name: '구현', what: '코딩', done: '빌드성공' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/block-types',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('bf028_use_update_block_type_put_invalidates', async () => {
    const updated = { id: '1', name: '기획v2', what: '기획', done: '완료', createdAt: '2026-01-01' };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(updated));

    const wrapper = createWrapper();
    const { result } = renderHook(() => useUpdateBlockType(), { wrapper });
    result.current.mutate({ id: '1', name: '기획v2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/block-types/기획v2',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('bf029_use_delete_block_type_delete_invalidates', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    const wrapper = createWrapper();
    const { result } = renderHook(() => useDeleteBlockType(), { wrapper });
    result.current.mutate('1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/block-types/1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('BlockCatalogPage', () => {
  it('bf030_block_catalog_page_grid_rendering', async () => {
    const items = [
      { id: '1', name: '기획', what: '계획', done: '완료', icon: '📋', createdAt: '2026-01-01' },
      { id: '2', name: '구현', what: '코딩', done: '빌드', icon: '⚙️', createdAt: '2026-01-01' },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse(items));

    renderWithProviders(<BlockCatalogPage />);

    await waitFor(() => {
      expect(screen.getByTestId('block-grid')).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByTestId('block-card-1')).toBeTruthy();
      expect(screen.getByTestId('block-card-2')).toBeTruthy();
    });
  });

  it('bf031_block_catalog_page_create_modal', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse([]));

    renderWithProviders(<BlockCatalogPage />);

    // 모달은 처음에 없음
    expect(screen.queryByTestId('create-modal')).toBeNull();

    // 생성 버튼 클릭
    const createBtn = screen.getByTestId('create-block-btn');
    fireEvent.click(createBtn);

    // 모달 열림
    expect(screen.getByTestId('create-modal')).toBeTruthy();
    expect(screen.getByTestId('input-name')).toBeTruthy();

    // 취소 클릭 시 닫힘
    fireEvent.click(screen.getByTestId('cancel-btn'));
    expect(screen.queryByTestId('create-modal')).toBeNull();
  });
});

// ═══════════════════════════════════════════
// BF-032 ~ BF-047: Team Management
// ═══════════════════════════════════════════

describe('Team Hooks', () => {
  it('bf032_use_teams_get', async () => {
    const teams = [{ id: '1', name: 'CTO팀', memberCount: 3, createdAt: '2026-01-01' }];
    mockFetch.mockResolvedValueOnce(mockJsonResponse(teams));

    const { result } = renderHook(() => useTeams(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith('/api/brick/teams', undefined);
    expect(result.current.data).toEqual(teams);
  });

  it('bf033_use_create_team_post', async () => {
    const newTeam = { id: '2', name: 'PM팀', memberCount: 0, createdAt: '2026-01-01' };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(newTeam));

    const { result } = renderHook(() => useCreateTeam(), { wrapper: createWrapper() });
    result.current.mutate({ name: 'PM팀' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/teams',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('bf034_use_delete_team_invalidates', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    const { result } = renderHook(() => useDeleteTeam(), { wrapper: createWrapper() });
    result.current.mutate('1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/teams/1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('TeamManagePage', () => {
  it('bf035_team_manage_page_card_grid', async () => {
    const teams = [
      { id: '1', name: 'CTO팀', description: '개발', memberCount: 3, createdAt: '2026-01-01' },
      { id: '2', name: 'PM팀', description: '기획', memberCount: 2, createdAt: '2026-01-01' },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse(teams));

    renderWithProviders(<TeamManagePage />);

    await waitFor(() => {
      expect(screen.getByTestId('team-grid')).toBeTruthy();
      expect(screen.getByTestId('team-card-1')).toBeTruthy();
      expect(screen.getByTestId('team-card-2')).toBeTruthy();
    });
  });
});

describe('TeamDetailPage', () => {
  it('bf036_team_detail_page_four_tabs', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse([]));

    renderWithProviders(<TeamDetailPage />);

    const tabList = screen.getByTestId('tab-list');
    expect(tabList).toBeTruthy();

    expect(screen.getByTestId('tab-members')).toBeTruthy();
    expect(screen.getByTestId('tab-skills')).toBeTruthy();
    expect(screen.getByTestId('tab-mcp')).toBeTruthy();
    expect(screen.getByTestId('tab-model')).toBeTruthy();

    // 기본은 팀원 탭
    expect(screen.getByTestId('team-member-list')).toBeTruthy();
  });
});

describe('TeamMemberList', () => {
  it('bf037_team_member_list_add_remove', () => {
    const members = [
      { id: 'm1', name: '김철수', role: '개발자' },
      { id: 'm2', name: '이영희', role: 'PM' },
    ];
    const onAdd = vi.fn();
    const onRemove = vi.fn();

    render(<TeamMemberList members={members} onAdd={onAdd} onRemove={onRemove} />);

    // 팀원 렌더링 확인
    expect(screen.getByTestId('member-m1')).toBeTruthy();
    expect(screen.getByTestId('member-m2')).toBeTruthy();

    // 제거 버튼
    fireEvent.click(screen.getByTestId('remove-m1'));
    expect(onRemove).toHaveBeenCalledWith('m1');

    // 추가
    fireEvent.change(screen.getByTestId('member-name-input'), { target: { value: '박민수' } });
    fireEvent.change(screen.getByTestId('member-role-input'), { target: { value: 'QA' } });
    fireEvent.click(screen.getByTestId('add-member-btn'));
    expect(onAdd).toHaveBeenCalledWith({ name: '박민수', role: 'QA' });
  });
});

describe('SkillEditor', () => {
  it('bf038_skill_editor_monaco_render_save', () => {
    const onSave = vi.fn();
    render(<SkillEditor initialContent="# 스킬 문서" onSave={onSave} />);

    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toBeTruthy();

    // 저장 버튼
    fireEvent.click(screen.getByTestId('save-skill-btn'));
    expect(onSave).toHaveBeenCalledWith('# 스킬 문서');
  });
});

describe('McpServerList', () => {
  it('bf039_mcp_server_list_toggle', () => {
    const servers = [
      { name: 'filesystem', enabled: true },
      { name: 'github', enabled: false },
    ];
    const onToggle = vi.fn();

    render(<McpServerList servers={servers} onToggle={onToggle} />);

    const fsToggle = screen.getByTestId('mcp-filesystem').querySelector('input');
    expect(fsToggle).toBeTruthy();
    expect((fsToggle as HTMLInputElement).checked).toBe(true);

    // github 토글 ON
    const ghToggle = screen.getByTestId('mcp-github').querySelector('input');
    fireEvent.click(ghToggle!);
    expect(onToggle).toHaveBeenCalledWith('github', true);
  });
});

describe('ModelSelector', () => {
  it('bf040_model_selector_radio_selection', () => {
    const onSelect = vi.fn();
    render(<ModelSelector selected="claude-opus-4-6" onSelect={onSelect} />);

    const opusRadio = screen.getByTestId('model-claude-opus-4-6').querySelector('input');
    expect((opusRadio as HTMLInputElement).checked).toBe(true);

    // Sonnet 선택
    const sonnetRadio = screen.getByTestId('model-claude-sonnet-4-6').querySelector('input');
    fireEvent.click(sonnetRadio!);
    expect(onSelect).toHaveBeenCalledWith('claude-sonnet-4-6');
  });
});

describe('AdapterSelector', () => {
  it('bf041_adapter_selector_dropdown', () => {
    const onSelect = vi.fn();
    render(<AdapterSelector selected="anthropic" onSelect={onSelect} />);

    const dropdown = screen.getByTestId('adapter-dropdown') as HTMLSelectElement;
    expect(dropdown.value).toBe('anthropic');

    fireEvent.change(dropdown, { target: { value: 'bedrock' } });
    expect(onSelect).toHaveBeenCalledWith('bedrock');
  });
});

describe('Team Member Hooks', () => {
  it('bf042_use_team_members_get', async () => {
    const members = [{ id: 'm1', name: '김철수', role: '개발자' }];
    mockFetch.mockResolvedValueOnce(mockJsonResponse(members));

    const { result } = renderHook(() => useTeamMembers('team-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith('/api/brick/teams/team-1/members', undefined);
  });

  it('bf043_use_add_member_post', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 'm2', name: '이영희', role: 'PM' }));

    const { result } = renderHook(() => useAddMember(), { wrapper: createWrapper() });
    result.current.mutate({ teamId: 'team-1', name: '이영희', role: 'PM' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/teams/team-1/members',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('bf044_use_remove_member_delete', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    const { result } = renderHook(() => useRemoveMember(), { wrapper: createWrapper() });
    result.current.mutate({ teamId: 'team-1', memberId: 'm1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/teams/team-1/members/m1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('bf045_use_update_skill_put', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    const { result } = renderHook(() => useUpdateSkill(), { wrapper: createWrapper() });
    result.current.mutate({ teamId: 'team-1', content: '# 새 스킬' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/teams/team-1/skills',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('bf046_use_configure_mcp_put', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    const { result } = renderHook(() => useConfigureMcp(), { wrapper: createWrapper() });
    result.current.mutate({ teamId: 'team-1', servers: { filesystem: true, github: false } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/teams/team-1/mcp',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('bf047_use_set_model_put', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    const { result } = renderHook(() => useSetModel(), { wrapper: createWrapper() });
    result.current.mutate({ teamId: 'team-1', model: 'claude-opus-4-6' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/teams/team-1/model',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});

// ═══════════════════════════════════════════
// BF-048 ~ BF-054: Preset CRUD
// ═══════════════════════════════════════════

describe('Preset Hooks', () => {
  it('bf048_use_presets_get', async () => {
    const presets = [{ id: '1', name: 'PDCA', blockCount: 5, createdAt: '2026-01-01' }];
    mockFetch.mockResolvedValueOnce(mockJsonResponse(presets));

    const { result } = renderHook(() => usePresets(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith('/api/brick/presets', undefined);
  });

  it('bf049_use_create_preset_post', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: '2', name: '새 프리셋', blockCount: 0, createdAt: '2026-01-01' }));

    const { result } = renderHook(() => useCreatePreset(), { wrapper: createWrapper() });
    result.current.mutate({ name: '새 프리셋', yaml: 'blocks: []' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/presets',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('PresetListPage', () => {
  it('bf050_preset_list_page_card_grid', async () => {
    const presets = [
      { id: '1', name: 'PDCA', description: 'PDCA 워크플로우', blockCount: 5, createdAt: '2026-01-01' },
      { id: '2', name: 'CI/CD', description: 'CI/CD 파이프라인', blockCount: 8, createdAt: '2026-01-01' },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse(presets));

    renderWithProviders(<PresetListPage />);

    await waitFor(() => {
      expect(screen.getByTestId('preset-grid')).toBeTruthy();
      expect(screen.getByTestId('preset-card-1')).toBeTruthy();
      expect(screen.getByTestId('preset-card-2')).toBeTruthy();
    });
  });
});

describe('PresetEditorPage', () => {
  it('bf051_preset_editor_page_monaco_yaml', () => {
    renderWithProviders(<PresetEditorPage />);

    expect(screen.getByTestId('preset-editor-page')).toBeTruthy();
    expect(screen.getByTestId('monaco-editor')).toBeTruthy();
    expect(screen.getByTestId('save-preset-btn')).toBeTruthy();
  });
});

describe('Preset Advanced Hooks', () => {
  it('bf052_use_export_preset_get', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ yaml: 'blocks:\n  - plan' }));

    const { result } = renderHook(() => useExportPreset(), { wrapper: createWrapper() });
    result.current.mutate('preset-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/presets/preset-1/export',
      undefined,
    );
  });

  it('bf053_use_import_preset_post', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: '3', name: 'imported', blockCount: 3, createdAt: '2026-01-01' }));

    const { result } = renderHook(() => useImportPreset(), { wrapper: createWrapper() });
    result.current.mutate({ yaml: 'blocks:\n  - plan' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/presets/import',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('bf054_use_apply_preset_post_canvas_refresh', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    const { result } = renderHook(() => useApplyPreset(), { wrapper: createWrapper() });
    result.current.mutate({ presetId: 'preset-1', canvasId: 'canvas-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/presets/preset-1/apply',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// ═══════════════════════════════════════════
// BF-055: Team Status
// ═══════════════════════════════════════════

describe('TeamStatus', () => {
  it('bf055_use_team_status_realtime_badge', async () => {
    const statusData = { teamId: 'team-1', status: 'running', lastHeartbeat: '2026-01-01T00:00:00Z' };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(statusData));

    const { result } = renderHook(() => useTeamStatus('team-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe('running');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/brick/teams/team-1/status',
      undefined,
    );
  });
});
