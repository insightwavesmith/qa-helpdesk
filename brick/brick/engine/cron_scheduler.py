"""CronScheduler — asyncio 기반 cron 링크 스케줄링."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from croniter import croniter


@dataclass
class CronJob:
    workflow_id: str
    from_block_id: str
    to_block_id: str
    adapter: str
    schedule: str  # cron 표현식 (예: "0 0 * * *")
    max_runs: int
    run_count: int = 0


class CronScheduler:
    """워크플로우 내 cron 링크 스케줄링."""

    def __init__(self):
        self.jobs: dict[str, CronJob] = {}  # job_key → CronJob
        self._tasks: dict[str, asyncio.Task] = {}
        self._running = False

    def register(self, job: CronJob) -> None:
        """cron 링크에서 호출. _find_next_blocks가 cron 링크를 만나면 여기에 등록."""
        key = f"{job.workflow_id}:{job.from_block_id}:{job.to_block_id}"
        self.jobs[key] = job

    def unregister_workflow(self, workflow_id: str) -> None:
        """워크플로우 종료 시 해당 cron job 전부 제거."""
        to_remove = [k for k, j in self.jobs.items() if j.workflow_id == workflow_id]
        for k in to_remove:
            if k in self._tasks:
                self._tasks[k].cancel()
                del self._tasks[k]
            del self.jobs[k]

    def start(self, emit_callback) -> None:
        """스케줄러 시작. emit_callback(job)은 executor가 블록을 큐잉하는 함수."""
        self._running = True
        for key, job in self.jobs.items():
            if key not in self._tasks:
                self._tasks[key] = asyncio.create_task(
                    self._run_job(key, job, emit_callback)
                )

    def stop(self) -> None:
        """스케줄러 중지."""
        self._running = False
        for task in self._tasks.values():
            task.cancel()
        self._tasks.clear()

    async def _run_job(self, key: str, job: CronJob, emit_callback) -> None:
        """단일 cron job 실행 루프."""
        cron = croniter(job.schedule, time.time())

        while self._running and job.run_count < job.max_runs:
            next_run = cron.get_next(float)
            delay = next_run - time.time()
            if delay > 0:
                await asyncio.sleep(delay)

            if not self._running:
                break

            job.run_count += 1
            await emit_callback(job)
