import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { EngineBridge } from './bridge.js';

const PYTHON_PORT = 3202;
const HEALTH_CHECK_INTERVAL = 5000;
const HEALTH_CHECK_MAX_RETRIES = 10;  // 10 * 5초 = 최대 50초 대기
const SHUTDOWN_TIMEOUT = 10000;  // 10초

export class ProcessManager {
  private pythonProcess: ChildProcess | null = null;
  private bridge = new EngineBridge();
  private healthy = false;

  /**
   * Python 엔진 프로세스 시작.
   * brick/ 디렉토리에서 uvicorn 실행.
   */
  async startPython(): Promise<void> {
    if (this.pythonProcess) {
      console.log('[process-manager] Python 이미 실행 중');
      return;
    }

    const brickDir = path.resolve(process.cwd(), '..', 'brick');

    this.pythonProcess = spawn('python', [
      '-m', 'uvicorn',
      'brick.dashboard.main:app',
      '--host', '0.0.0.0',
      '--port', String(PYTHON_PORT),
      '--reload',
    ], {
      cwd: brickDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    // stdout/stderr 포워딩
    this.pythonProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim();
      if (lines) console.log(`[python] ${lines}`);
    });

    this.pythonProcess.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().trim();
      if (lines) console.error(`[python] ${lines}`);
    });

    this.pythonProcess.on('exit', (code) => {
      console.log(`[process-manager] Python 종료 (code=${code})`);
      this.pythonProcess = null;
      this.healthy = false;
    });

    // 헬스체크로 기동 대기
    await this.waitForHealth();
  }

  /**
   * Python /health 엔드포인트 응답 대기.
   */
  private async waitForHealth(): Promise<void> {
    for (let i = 0; i < HEALTH_CHECK_MAX_RETRIES; i++) {
      try {
        const result = await this.bridge.checkHealth();
        if (result) {
          this.healthy = true;
          console.log('[process-manager] Python 엔진 정상 기동');
          return;
        }
      } catch {}
      await new Promise(r => setTimeout(r, HEALTH_CHECK_INTERVAL));
    }
    console.error('[process-manager] Python 엔진 기동 실패 — 타임아웃');
    // 실패해도 Express는 시작. bridge가 engine_unavailable 반환할 것
  }

  /**
   * 정상 종료. SIGTERM → 10초 대기 → SIGKILL.
   */
  async stop(): Promise<void> {
    if (!this.pythonProcess) return;

    return new Promise((resolve) => {
      const proc = this.pythonProcess!;

      const killTimer = setTimeout(() => {
        console.warn('[process-manager] SIGKILL 전송');
        proc.kill('SIGKILL');
        resolve();
      }, SHUTDOWN_TIMEOUT);

      proc.on('exit', () => {
        clearTimeout(killTimer);
        this.pythonProcess = null;
        this.healthy = false;
        resolve();
      });

      proc.kill('SIGTERM');
    });
  }

  isHealthy(): boolean {
    return this.healthy;
  }
}
