/**
 * TypedEventBus - Type-safe event bus for system-wide communication
 *
 * Design goals:
 * - Compile-time type safety for event payloads
 * - Loose coupling between modules
 * - Migration path to NATS for microservices
 * - Debug logging for troubleshooting
 * - Memory leak prevention (max listeners)
 *
 * Pattern: Based on existing agent-events.ts but expanded for system-wide events
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type {
  EventBusConfig,
  EventBusStats,
  EventHandler,
  SystemEvent,
  SystemEventMap,
  Unsubscribe,
} from "./types.js";

/**
 * TypedEventBus implementation using Node.js EventEmitter
 *
 * This is the in-process implementation. For microservices architecture,
 * this can be replaced with a NATS-based implementation using the same interface.
 */
export class TypedEventBus {
  private readonly emitter: EventEmitter;
  private readonly config: Required<EventBusConfig>;
  private readonly stats: EventBusStats;
  private readonly logger?: { debug: (msg: string, data?: unknown) => void };

  constructor(config: EventBusConfig = {}) {
    this.emitter = new EventEmitter();
    this.config = {
      debug: config.debug ?? false,
      maxListeners: config.maxListeners ?? 100,
      source: config.source ?? "event-bus",
      enableBuffering: config.enableBuffering ?? false,
    };

    // Set max listeners to prevent memory leak warnings
    this.emitter.setMaxListeners(this.config.maxListeners);

    this.stats = {
      totalEventsPublished: 0,
      totalEventsDelivered: 0,
      totalErrors: 0,
      eventCounts: {} as Record<keyof SystemEventMap, number>,
      listenerCounts: {} as Record<keyof SystemEventMap, number>,
    };

    // Optional: Use console logger for debug mode
    // Lazy loading of real logger would require async, so we use console as fallback
    if (this.config.debug) {
      this.logger = {
        debug: (msg: string, data?: unknown) => console.debug(`[EventBus] ${msg}`, data),
      };
    }
  }

  /**
   * Publish an event to all subscribers
   *
   * Type-safe: Payload must match the event type from SystemEventMap
   */
  publish<K extends keyof SystemEventMap>(
    eventType: K,
    payload: SystemEventMap[K],
  ): void {
    const event: SystemEvent<K> = {
      metadata: {
        eventId: randomUUID(),
        eventType,
        timestamp: Date.now(),
        source: this.config.source,
      },
      payload,
    };

    // Update statistics
    this.stats.totalEventsPublished++;
    this.stats.eventCounts[eventType] = (this.stats.eventCounts[eventType] ?? 0) + 1;

    // Debug logging
    if (this.config.debug && this.logger) {
      this.logger.debug(`Event published: ${eventType}`, {
        eventId: event.metadata.eventId,
        payload,
      });
    }

    // Emit event (sync)
    // Note: This maintains compatibility with existing agent-events pattern
    this.emitter.emit(eventType as string, event);
  }

  /**
   * Subscribe to an event
   *
   * Type-safe: Handler receives correctly typed event payload
   *
   * @returns Unsubscribe function to remove this handler
   */
  subscribe<K extends keyof SystemEventMap>(
    eventType: K,
    handler: EventHandler<K>,
  ): Unsubscribe {
    // Wrap handler to catch errors and maintain stats
    const wrappedHandler = async (event: SystemEvent<K>) => {
      this.stats.totalEventsDelivered++;

      try {
        await handler(event);
      } catch (error) {
        this.stats.totalErrors++;

        // Log error but don't throw (follow existing pattern in agent-events.ts)
        if (this.logger) {
          this.logger.debug(`Handler error for ${eventType}`, {
            eventId: event.metadata.eventId,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // Emit error event for observability
        this.emitErrorEvent({
          eventType,
          eventId: event.metadata.eventId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    };

    // Add listener
    this.emitter.on(eventType as string, wrappedHandler);

    // Update listener count
    this.stats.listenerCounts[eventType] = (this.stats.listenerCounts[eventType] ?? 0) + 1;

    // Return unsubscribe function
    return () => {
      this.emitter.off(eventType as string, wrappedHandler);
      this.stats.listenerCounts[eventType] = Math.max(
        0,
        (this.stats.listenerCounts[eventType] ?? 1) - 1,
      );
    };
  }

  /**
   * Subscribe to an event (one-time)
   *
   * Handler is automatically unsubscribed after first invocation
   */
  once<K extends keyof SystemEventMap>(
    eventType: K,
    handler: EventHandler<K>,
  ): Unsubscribe {
    const wrappedHandler = async (event: SystemEvent<K>) => {
      this.stats.totalEventsDelivered++;

      try {
        await handler(event);
      } catch (error) {
        this.stats.totalErrors++;

        if (this.logger) {
          this.logger.debug(`Handler error (once) for ${eventType}`, {
            eventId: event.metadata.eventId,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        this.emitErrorEvent({
          eventType,
          eventId: event.metadata.eventId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    };

    this.emitter.once(eventType as string, wrappedHandler);

    return () => {
      this.emitter.off(eventType as string, wrappedHandler);
    };
  }

  /**
   * Unsubscribe all handlers for an event type
   */
  unsubscribeAll<K extends keyof SystemEventMap>(eventType: K): void {
    this.emitter.removeAllListeners(eventType as string);
    this.stats.listenerCounts[eventType] = 0;
  }

  /**
   * Get current statistics
   */
  getStats(): Readonly<EventBusStats> {
    return { ...this.stats };
  }

  /**
   * Get listener count for an event type
   */
  getListenerCount<K extends keyof SystemEventMap>(eventType: K): number {
    return this.emitter.listenerCount(eventType as string);
  }

  /**
   * Check if there are any listeners for an event
   */
  hasListeners<K extends keyof SystemEventMap>(eventType: K): boolean {
    return this.getListenerCount(eventType) > 0;
  }

  /**
   * Clear all statistics (useful for testing)
   */
  clearStats(): void {
    this.stats.totalEventsPublished = 0;
    this.stats.totalEventsDelivered = 0;
    this.stats.totalErrors = 0;
    this.stats.eventCounts = {} as Record<keyof SystemEventMap, number>;
    // Don't clear listenerCounts as those represent current state
  }

  /**
   * Shutdown event bus (cleanup resources)
   */
  shutdown(): void {
    this.emitter.removeAllListeners();
    this.stats.listenerCounts = {} as Record<keyof SystemEventMap, number>;
  }

  /**
   * Internal helper to emit error events
   */
  private emitErrorEvent(params: {
    eventType: keyof SystemEventMap;
    eventId: string;
    error: Error;
  }): void {
    // Avoid infinite recursion if error.processing has a failing handler
    if (params.eventType === "error.processing") {
      return;
    }

    try {
      this.publish("error.processing", {
        messageId: params.eventId,
        error: params.error,
        context: {
          originalEventType: params.eventType,
        },
      });
    } catch {
      // Silently ignore if error event fails
    }
  }
}

/**
 * Global event bus singleton (optional)
 *
 * For most use cases, inject EventBus as a dependency.
 * This singleton is provided for backwards compatibility with existing code.
 */
let globalEventBus: TypedEventBus | null = null;

export function getGlobalEventBus(): TypedEventBus {
  if (!globalEventBus) {
    globalEventBus = new TypedEventBus({ source: "global" });
  }
  return globalEventBus;
}

export function setGlobalEventBus(eventBus: TypedEventBus): void {
  globalEventBus = eventBus;
}

export function resetGlobalEventBus(): void {
  if (globalEventBus) {
    globalEventBus.shutdown();
    globalEventBus = null;
  }
}
