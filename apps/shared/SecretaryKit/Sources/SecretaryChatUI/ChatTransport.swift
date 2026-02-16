import Foundation

public enum SecretaryChatTransportEvent: Sendable {
    case health(ok: Bool)
    case tick
    case chat(SecretaryChatEventPayload)
    case agent(SecretaryAgentEventPayload)
    case seqGap
}

public protocol SecretaryChatTransport: Sendable {
    func requestHistory(sessionKey: String) async throws -> SecretaryChatHistoryPayload
    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [SecretaryChatAttachmentPayload]) async throws -> SecretaryChatSendResponse

    func abortRun(sessionKey: String, runId: String) async throws
    func listSessions(limit: Int?) async throws -> SecretaryChatSessionsListResponse

    func requestHealth(timeoutMs: Int) async throws -> Bool
    func events() -> AsyncStream<SecretaryChatTransportEvent>

    func setActiveSessionKey(_ sessionKey: String) async throws
}

extension SecretaryChatTransport {
    public func setActiveSessionKey(_: String) async throws {}

    public func abortRun(sessionKey _: String, runId _: String) async throws {
        throw NSError(
            domain: "SecretaryChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "chat.abort not supported by this transport"])
    }

    public func listSessions(limit _: Int?) async throws -> SecretaryChatSessionsListResponse {
        throw NSError(
            domain: "SecretaryChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "sessions.list not supported by this transport"])
    }
}
