module.exports = {
  apps: [
    {
      name: "clutch-social",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
      restart_delay: 4000,
      error_file: "/var/log/clutch-social/error.log",
      out_file: "/var/log/clutch-social/app.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
