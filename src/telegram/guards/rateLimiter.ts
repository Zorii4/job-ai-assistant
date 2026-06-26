type RateLimitRecord = {
  timestamps: number[];
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

const usageByUserId = new Map<string, RateLimitRecord>();

// TODO: Store Telegram usage limits in PostgreSQL after database support is added.
export function consumeAnalysisAttempt(userId: string): RateLimitResult {
  const now = Date.now();
  const limit = getFreeAnalysesLimit();
  const windowMs = getFreeAnalysesWindowMs();
  const record = usageByUserId.get(userId) ?? { timestamps: [] };
  const activeTimestamps = record.timestamps.filter((timestamp) => now - timestamp < windowMs);

  if (activeTimestamps.length >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(activeTimestamps[0] + windowMs)
    };
  }

  activeTimestamps.push(now);
  usageByUserId.set(userId, { timestamps: activeTimestamps });

  return {
    allowed: true,
    remaining: Math.max(limit - activeTimestamps.length, 0),
    resetAt: new Date(activeTimestamps[0] + windowMs)
  };
}

function getFreeAnalysesLimit(): number {
  return parsePositiveInteger(process.env.FREE_ANALYSES_LIMIT, 5);
}

function getFreeAnalysesWindowMs(): number {
  const hours = parsePositiveInteger(process.env.FREE_ANALYSES_WINDOW_HOURS, 24);

  return hours * 60 * 60 * 1000;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
