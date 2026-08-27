import {
  sanitizeTraceEvent,
  type SafeTraceMetadata,
  type TraceEvent,
  type TraceEventName,
} from "./trace";

export type TraceRecorder = {
  record(
    eventName: TraceEventName,
    traceId: string,
    metadata?: SafeTraceMetadata,
  ): void;
  events(): readonly TraceEvent[];
  clear(): void;
};

/** In-memory, local-only trace collection for one browser journey or request. */
export function createTraceRecorder(): TraceRecorder {
  const recorded: TraceEvent[] = [];
  return {
    record(eventName, traceId, metadata = {}) {
      const event = sanitizeTraceEvent({ eventName, traceId, ...metadata });
      if (event) recorded.push(event);
    },
    events() {
      return recorded.slice();
    },
    clear() {
      recorded.length = 0;
    },
  };
}
