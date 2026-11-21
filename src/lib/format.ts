export function shortAddress(address?: string, chars = 4): string {
  if (!address) return "—";
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function formatUnits(value: bigint, decimals: number, maxFractionDigits = 4): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;
  const wholeText = whole.toLocaleString("en-US");
  if (fraction === 0n) return `${negative ? "−" : ""}${wholeText}`;
  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");
  return `${negative ? "−" : ""}${wholeText}${fractionText ? `.${fractionText}` : ""}`;
}

export function formatToken(value: bigint, decimals: number, maxFractionDigits = 2): string {
  return formatUnits(value, decimals, maxFractionDigits);
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: digits })}%`;
}

export function formatDate(unixSeconds: bigint | number, withTime = false): string {
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "UTC",
  }).format(new Date(ms));
}

export function formatBlock(block: bigint | number): string {
  return Number(block).toLocaleString("en-US");
}

export function relativeTime(unixSeconds: bigint | number): string {
  const target = Number(unixSeconds) * 1000;
  if (!Number.isFinite(target) || target <= 0) return "—";
  const diff = target - Date.now();
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 3600 * 1000],
    ["month", 30 * 24 * 3600 * 1000],
    ["day", 24 * 3600 * 1000],
    ["hour", 3600 * 1000],
    ["minute", 60 * 1000],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (abs >= size) return rtf.format(Math.round(diff / size), unit);
  }
  return "moments";
}

/** Coupon per 1e18 bond token base units, in payment-token base units. */
export function couponPerToken(faceValuePerToken: bigint, couponRateBps: number, paymentsPerYear: number): bigint {
  if (paymentsPerYear <= 0) return 0n;
  return (faceValuePerToken * BigInt(couponRateBps)) / BigInt(10_000 * paymentsPerYear);
}

export function monthlyStepMonths(paymentsPerYear: number): number {
  return Math.max(1, Math.round(12 / Math.max(1, paymentsPerYear)));
}

/** Projected coupon dates derived only from maturity and frequency (no on-chain period exists yet). */
export function projectedSchedule(maturity: bigint, paymentsPerYear: number, count = 8): number[] {
  const step = monthlyStepMonths(paymentsPerYear);
  const end = new Date(Number(maturity) * 1000);
  const dates: number[] = [];
  for (let index = 1; index <= count; index += 1) {
    const date = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - index * step, end.getUTCDate()),
    );
    dates.push(Math.floor(date.getTime() / 1000));
  }
  return dates.reverse();
}

export function bpsToPercent(bps: number): number {
  return bps / 100;
}

function humanizeRevert(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

/**
 * Walks the viem/wallet error chain so users see a wallet rejection or a named revert
 * instead of viem's generic "An unknown RPC error occurred" wrapper.
 */
export function errorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;

  const seen = new Set<unknown>();
  let current = error as {
    code?: number | string;
    shortMessage?: string;
    message?: string;
    reason?: string;
    data?: { errorName?: string };
    cause?: unknown;
  };

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (current.code === 4001 || current.code === "ACTION_REJECTED") {
      return "The wallet rejected the request.";
    }
    if (current.data?.errorName) {
      return `Contract reverted: ${humanizeRevert(current.data.errorName)}.`;
    }
    if (typeof current.message === "string" && /user (rejected|denied)|rejected the request/i.test(current.message)) {
      return "The wallet rejected the request.";
    }
    current = current.cause as typeof current;
  }

  const candidate = error as {
    shortMessage?: string;
    message?: string;
    cause?: { shortMessage?: string; message?: string; reason?: string };
  };
  return (
    candidate.cause?.reason ??
    (candidate.shortMessage && candidate.shortMessage !== "An unknown RPC error occurred."
      ? candidate.shortMessage
      : undefined) ??
    candidate.cause?.shortMessage ??
    candidate.message ??
    String(error)
  );
}

export function isHexValue(value: string): boolean {
  return /^0x[0-9a-fA-F]*$/.test(value.trim());
}
