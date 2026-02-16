/**
 * Event Bus Type Definitions
 *
 * TypeScript-typed event bus for decoupling system modules.
 * Provides compile-time type safety for event payloads.
 */

/**
 * System-wide event schema.
 * Add new events here to maintain type safety across the system.
 */
export type SystemEventMap = {
  // Inbound message events
  "inbound.message.received": {
    messageId: string;
    sessionId: string;
    channelId: string;
    content: string;
    timestamp: number;
  };

  "inbound.message.queued": {
    messageId: string;
    sessionId: string;
    queuePosition: number;
    queueLength: number;
  };

  "inbound.message.dequeued": {
    messageId: string;
    sessionId: string;
    queueLength: number;
  };

  "inbound.message.processing": {
    messageId: string;
    sessionId: string;
    runId: string;
  };

  // Agent runtime events
  "agent.run.started": {
    runId: string;
    sessionId: string;
    messageId: string;
  };

  "agent.run.completed": {
    runId: string;
    sessionId: string;
    messageId: string;
    duration: number;
  };

  "agent.run.failed": {
    runId: string;
    sessionId: string;
    messageId: string;
    error: Error;
    duration: number;
  };

  "agent.response.generated": {
    runId: string;
    sessionId: string;
    messageId: string;
    response: string;
    tokenCount?: number;
  };

  // Message queue events
  "queue.message.enqueued": {
    messageId: string;
    sessionId: string;
    queueLength: number;
    priority?: number;
  };

  "queue.message.dequeued": {
    messageId: string;
    sessionId: string;
    remainingCount: number;
  };

  "queue.message.retry": {
    messageId: string;
    sessionId: string;
    retryCount: number;
    nextRetryAt: number;
    error: Error;
  };

  "queue.message.dead_letter": {
    messageId: string;
    sessionId: string;
    reason: string;
    finalError: Error;
  };

  // Error events
  "error.processing": {
    messageId: string;
    sessionId?: string;
    runId?: string;
    error: Error;
    context: Record<string, unknown>;
  };

  "error.gateway": {
    connectionId: string;
    error: Error;
    context: Record<string, unknown>;
  };

  "error.queue": {
    operation: string;
    messageId?: string;
    error: Error;
    context: Record<string, unknown>;
  };

  // System events
  "system.health.check": {
    component: string;
    status: "healthy" | "degraded" | "unhealthy";
    metrics?: Record<string, number>;
  };

  "system.shutdown.initiated": {
    reason: string;
    gracefulShutdown: boolean;
  };
};

/**
 * Event metadata attached to all events
 */
export type EventMetadata = {
  eventId: string;
  eventType: keyof SystemEventMap;
  timestamp: number;
  source: string;
};

/**
 * Enriched event with metadata
 */
export type SystemEvent<K extends keyof SystemEventMap = keyof SystemEventMap> = {
  metadata: EventMetadata;
  payload: SystemEventMap[K];
};

/**
 * Event handler function type
 */
export type EventHandler<K extends keyof SystemEventMap> = (
  event: SystemEvent<K>,
) => void | Promise<void>;

/**
 * Event handler with error handling
 */
export type SafeEventHandler<K extends keyof SystemEventMap> = (
  event: SystemEvent<K>,
) => Promise<void>;

/**
 * Event bus configuration
 */
export type EventBusConfig = {
  /**
   * Enable debug logging for all events
   */
  debug?: boolean;

  /**
   * Maximum listeners per event (prevent memory leaks)
   */
  maxListeners?: number;

  /**
   * Source identifier for this event bus instance
   */
  source?: string;

  /**
   * Enable event buffering during initialization
   */
  enableBuffering?: boolean;
};

/**
 * Event bus statistics
 */
export type EventBusStats = {
  totalEventsPublished: number;
  totalEventsDelivered: number;
  totalErrors: number;
  eventCounts: Record<keyof SystemEventMap, number>;
  listenerCounts: Record<keyof SystemEventMap, number>;
};

/**
 * Unsubscribe function returned by subscribe
 */
export type Unsubscribe = () => void;
