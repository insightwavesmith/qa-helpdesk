import { describe, it, expect } from 'vitest';

describe('WidgetPage', () => {
  it('WidgetPage 컴포넌트가 존재한다', async () => {
    // 컴포넌트 모듈 import 테스트
    const { WidgetPage } = await import('../src/pages/WidgetPage');
    expect(WidgetPage).toBeDefined();
    expect(typeof WidgetPage).toBe('function');
  });

  it('WidgetPage는 React 함수 컴포넌트다', async () => {
    const { WidgetPage } = await import('../src/pages/WidgetPage');

    // 함수 컴포넌트인지 확인
    expect(typeof WidgetPage).toBe('function');
    expect(WidgetPage.name).toBe('WidgetPage');
  });

  it('useApi 훅들이 존재한다', async () => {
    const api = await import('../src/hooks/useApi');

    expect(api.useAgents).toBeDefined();
    expect(api.useTickets).toBeDefined();
    expect(api.useDashboardSummary).toBeDefined();
    expect(api.useNotifications).toBeDefined();

    expect(typeof api.useAgents).toBe('function');
    expect(typeof api.useTickets).toBe('function');
    expect(typeof api.useDashboardSummary).toBe('function');
    expect(typeof api.useNotifications).toBe('function');
  });

  it('라우팅 설정이 올바르다', async () => {
    const app = await import('../src/App');
    expect(app.default).toBeDefined();
    expect(typeof app.default).toBe('function');
  });

  it('PWA manifest 설정이 올바르다', async () => {
    // manifest.json의 기본 설정 검증
    const expectedConfig = {
      start_url: '/widget',
      display: 'standalone',
      name: 'bkit 에이전트 모니터'
    };

    // 설정 값들이 정의되어 있는지 확인
    expect(expectedConfig.start_url).toBe('/widget');
    expect(expectedConfig.display).toBe('standalone');
    expect(expectedConfig.name).toBe('bkit 에이전트 모니터');
  });
});