import Foundation

public enum SecretaryCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum SecretaryCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum SecretaryCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum SecretaryCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct SecretaryCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: SecretaryCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: SecretaryCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: SecretaryCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: SecretaryCameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct SecretaryCameraClipParams: Codable, Sendable, Equatable {
    public var facing: SecretaryCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: SecretaryCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: SecretaryCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: SecretaryCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
