/**
 * Event Bus Module
 *
 * Type-safe event bus for decoupling system modules.
 *
 * Usage:
 *
 * ```typescript
 * import { TypedEventBus } from './event-bus';
 *
 * const eventBus = new TypedEventBus({ source: 'my-service' });
 *
 * // Subscribe to events
 * eventBus.subscribe('inbound.message.received', (event) => {
 *   console.log('Received message:', event.payload.messageId);
 * });
 *
 * // Publish events
 * eventBus.publish('inbound.message.received', {
 *   messageId: 'msg-123',
 *   sessionId: 'session-456',
 *   channelId: 'whatsapp',
 *   content: 'Hello',
 *   timestamp: Date.now(),
 * });
 * ```
 *
 * For global singleton usage:
 *
 * ```typescript
 * import { getGlobalEventBus } from './event-bus';
 *
 * const eventBus = getGlobalEventBus();
 * eventBus.publish('agent.run.started', { ... });
 * ```
 */

export { TypedEventBus, getGlobalEventBus, setGlobalEventBus, resetGlobalEventBus } from "./event-bus.js";

export type {
  SystemEventMap,
  EventMetadata,
  SystemEvent,
  EventHandler,
  SafeEventHandler,
  EventBusConfig,
  EventBusStats,
  Unsubscribe,
} from "./types.js";
