import Foundation

public enum SecretaryDeviceCommand: String, Codable, Sendable {
    case status = "device.status"
    case info = "device.info"
}

public enum SecretaryBatteryState: String, Codable, Sendable {
    case unknown
    case unplugged
    case charging
    case full
}

public enum SecretaryThermalState: String, Codable, Sendable {
    case nominal
    case fair
    case serious
    case critical
}

public enum SecretaryNetworkPathStatus: String, Codable, Sendable {
    case satisfied
    case unsatisfied
    case requiresConnection
}

public enum SecretaryNetworkInterfaceType: String, Codable, Sendable {
    case wifi
    case cellular
    case wired
    case other
}

public struct SecretaryBatteryStatusPayload: Codable, Sendable, Equatable {
    public var level: Double?
    public var state: SecretaryBatteryState
    public var lowPowerModeEnabled: Bool

    public init(level: Double?, state: SecretaryBatteryState, lowPowerModeEnabled: Bool) {
        self.level = level
        self.state = state
        self.lowPowerModeEnabled = lowPowerModeEnabled
    }
}

public struct SecretaryThermalStatusPayload: Codable, Sendable, Equatable {
    public var state: SecretaryThermalState

    public init(state: SecretaryThermalState) {
        self.state = state
    }
}

public struct SecretaryStorageStatusPayload: Codable, Sendable, Equatable {
    public var totalBytes: Int64
    public var freeBytes: Int64
    public var usedBytes: Int64

    public init(totalBytes: Int64, freeBytes: Int64, usedBytes: Int64) {
        self.totalBytes = totalBytes
        self.freeBytes = freeBytes
        self.usedBytes = usedBytes
    }
}

public struct SecretaryNetworkStatusPayload: Codable, Sendable, Equatable {
    public var status: SecretaryNetworkPathStatus
    public var isExpensive: Bool
    public var isConstrained: Bool
    public var interfaces: [SecretaryNetworkInterfaceType]

    public init(
        status: SecretaryNetworkPathStatus,
        isExpensive: Bool,
        isConstrained: Bool,
        interfaces: [SecretaryNetworkInterfaceType])
    {
        self.status = status
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
        self.interfaces = interfaces
    }
}

public struct SecretaryDeviceStatusPayload: Codable, Sendable, Equatable {
    public var battery: SecretaryBatteryStatusPayload
    public var thermal: SecretaryThermalStatusPayload
    public var storage: SecretaryStorageStatusPayload
    public var network: SecretaryNetworkStatusPayload
    public var uptimeSeconds: Double

    public init(
        battery: SecretaryBatteryStatusPayload,
        thermal: SecretaryThermalStatusPayload,
        storage: SecretaryStorageStatusPayload,
        network: SecretaryNetworkStatusPayload,
        uptimeSeconds: Double)
    {
        self.battery = battery
        self.thermal = thermal
        self.storage = storage
        self.network = network
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct SecretaryDeviceInfoPayload: Codable, Sendable, Equatable {
    public var deviceName: String
    public var modelIdentifier: String
    public var systemName: String
    public var systemVersion: String
    public var appVersion: String
    public var appBuild: String
    public var locale: String

    public init(
        deviceName: String,
        modelIdentifier: String,
        systemName: String,
        systemVersion: String,
        appVersion: String,
        appBuild: String,
        locale: String)
    {
        self.deviceName = deviceName
        self.modelIdentifier = modelIdentifier
        self.systemName = systemName
        self.systemVersion = systemVersion
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.locale = locale
    }
}
