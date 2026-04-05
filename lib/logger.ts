/**
 * Structured logger for RankPill.
 *
 * Outputs JSON logs to stdout — compatible with Vercel Logs, Datadog, etc.
 * Replaces silent catch blocks with observable, searchable log entries.
 */

type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  message: string;
  context?: string;       // e.g. "cron/publish", "seo-analysis", "generate"
  userId?: string;
  error?: string;
  stack?: string;
  data?: Record<string, unknown>;
  timestamp: string;
};

function emit(entry: LogEntry) {
  const line = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(line);
  } else if (entry.level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function log(
  level: LogLevel,
  message: string,
  opts?: {
    context?: string;
    userId?: string;
    error?: unknown;
    data?: Record<string, unknown>;
  }
) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(opts?.context ? { context: opts.context } : {}),
    ...(opts?.userId ? { userId: opts.userId } : {}),
    ...(opts?.data ? { data: opts.data } : {}),
  };

  if (opts?.error) {
    if (opts.error instanceof Error) {
      entry.error = opts.error.message;
      entry.stack = opts.error.stack;
    } else {
      entry.error = String(opts.error);
    }
  }

  emit(entry);
}

export const logger = {
  info: (message: string, opts?: Parameters<typeof log>[2]) => log("info", message, opts),
  warn: (message: string, opts?: Parameters<typeof log>[2]) => log("warn", message, opts),
  error: (message: string, opts?: Parameters<typeof log>[2]) => log("error", message, opts),
};
