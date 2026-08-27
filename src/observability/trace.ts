/**
 * Privacy-safe tracing primitives. This module intentionally has no platform
 * dependencies so it can be imported by both the browser and the server.
 */

import { redactSensitiveIdentifiers } from "../model/redaction";

export const TRACE_ID_PATTERN = /^tr-[a-f0-9]{16}$/;

export type TraceEventName =
  | "interpretation.started"
  | "interpretation.completed"
  | "resolution.started"
  | "resolution.completed"
  | "evidence.rejected"
  | "route.validated"
  | "filing.acknowledged";

export type TraceCounts = Readonly<Record<string, number>>;

export type SafeTraceMetadata = {
  component?: string;
  version?: string;
  hash?: string;
  code?: string;
  status?: string;
  counts?: TraceCounts;
};

export type TraceEvent = SafeTraceMetadata & {
  eventName: TraceEventName;
  traceId: string;
};

const EVENT_NAMES: ReadonlySet<string> = new Set<TraceEventName>([
  "interpretation.started",
  "interpretation.completed",
  "resolution.started",
  "resolution.completed",
  "evidence.rejected",
  "route.validated",
  "filing.acknowledged",
]);

const SAFE_KEYS = new Set([
  "eventName",
  "traceId",
  "component",
  "version",
  "hash",
  "code",
  "status",
  "counts",
]);

/** Generate an opaque trace ID without deriving it from citizen content. */
export function generateTraceId(): string {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return `tr-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `tr-${Math.random().toString(16).slice(2).padEnd(16, "0").slice(0, 16)}`;
}

/** Normalize an incoming opaque ID, or generate one when absent or invalid. */
export function normalizeTraceId(value: unknown): string {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (TRACE_ID_PATTERN.test(normalized)) return normalized;
  }
  return generateTraceId();
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 256) return undefined;
  return redactSensitiveIdentifiers(value).redacted;
}

function sanitizeCounts(value: unknown): TraceCounts | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const counts: Record<string, number> = {};
  for (const key of Object.keys(value)) {
    const count = (value as Record<string, unknown>)[key];
    if (
      key.length <= 64 &&
      typeof count === "number" &&
      Number.isFinite(count)
    ) {
      counts[key] = count;
    }
  }
  return Object.keys(counts).length > 0 ? counts : undefined;
}

/**
 * Keep only explicitly approved telemetry fields. Unknown fields are dropped,
 * including prompt, evidence, model response, filing profile, secret, and
 * identifier fields. Invalid required fields reject the event altogether.
 */
export function sanitizeTraceEvent(input: unknown): TraceEvent | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const source = input as Record<string, unknown>;
  const eventName = source.eventName;
  if (typeof eventName !== "string" || !EVENT_NAMES.has(eventName)) return;
  const traceId = normalizeTraceId(source.traceId);
  const output: TraceEvent = {
    eventName: eventName as TraceEventName,
    traceId,
  };

  for (const key of SAFE_KEYS) {
    if (key === "eventName" || key === "traceId" || key === "counts") continue;
    const value = source[key];
    const safeValue = safeString(value);
    if (safeValue !== undefined)
      output[key as keyof SafeTraceMetadata] = safeValue as never;
  }
  const counts = sanitizeCounts(source.counts);
  if (counts) output.counts = counts;
  return output;
}

export function createTraceEvent(
  eventName: TraceEventName,
  traceId: string,
  metadata: SafeTraceMetadata = {},
): TraceEvent {
  return sanitizeTraceEvent({ eventName, traceId, ...metadata }) as TraceEvent;
}
