// ecosystem.config.cjs — PM2 Agent Ops 데몬 관리
// 실행: pm2 start ecosystem.config.cjs
// 상태: pm2 status
// 로그: pm2 logs

module.exports = {
  apps: [
    {
      name: 'chain-watcher',
      script: 'scripts/chain-watcher.mjs',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        SLACK_UNIFIED_CHANNEL: 'C0AN7ATS4DD',
      },
      error_file: '/tmp/cross-team/logs/chain-watcher-error.log',
      out_file: '/tmp/cross-team/logs/chain-watcher-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'idle-detector',
      script: 'scripts/idle-detector.mjs',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        IDLE_THRESHOLD_MINUTES: '5',
        STUCK_THRESHOLD_MINUTES: '10',
        POLL_INTERVAL_SECONDS: '30',
        SLACK_UNIFIED_CHANNEL: 'C0AN7ATS4DD',
      },
      error_file: '/tmp/cross-team/logs/idle-detector-error.log',
      out_file: '/tmp/cross-team/logs/idle-detector-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'terminal-ws-server',
      script: 'scripts/terminal-ws-server.mjs',
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        WS_PORT: '3001',
      },
      error_file: '/tmp/cross-team/logs/ws-server-error.log',
      out_file: '/tmp/cross-team/logs/ws-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
