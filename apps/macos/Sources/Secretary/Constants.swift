import Foundation

// Stable identifier used for both the macOS LaunchAgent label and Nix-managed defaults suite.
// nix-secretary writes app defaults into this suite to survive app bundle identifier churn.
let launchdLabel = "ai.secretary.mac"
let gatewayLaunchdLabel = "ai.secretary.gateway"
let onboardingVersionKey = "secretary.onboardingVersion"
let onboardingSeenKey = "secretary.onboardingSeen"
let currentOnboardingVersion = 7
let pauseDefaultsKey = "secretary.pauseEnabled"
let iconAnimationsEnabledKey = "secretary.iconAnimationsEnabled"
let swabbleEnabledKey = "secretary.swabbleEnabled"
let swabbleTriggersKey = "secretary.swabbleTriggers"
let voiceWakeTriggerChimeKey = "secretary.voiceWakeTriggerChime"
let voiceWakeSendChimeKey = "secretary.voiceWakeSendChime"
let showDockIconKey = "secretary.showDockIcon"
let defaultVoiceWakeTriggers = ["secretary"]
let voiceWakeMaxWords = 32
let voiceWakeMaxWordLength = 64
let voiceWakeMicKey = "secretary.voiceWakeMicID"
let voiceWakeMicNameKey = "secretary.voiceWakeMicName"
let voiceWakeLocaleKey = "secretary.voiceWakeLocaleID"
let voiceWakeAdditionalLocalesKey = "secretary.voiceWakeAdditionalLocaleIDs"
let voicePushToTalkEnabledKey = "secretary.voicePushToTalkEnabled"
let talkEnabledKey = "secretary.talkEnabled"
let iconOverrideKey = "secretary.iconOverride"
let connectionModeKey = "secretary.connectionMode"
let remoteTargetKey = "secretary.remoteTarget"
let remoteIdentityKey = "secretary.remoteIdentity"
let remoteProjectRootKey = "secretary.remoteProjectRoot"
let remoteCliPathKey = "secretary.remoteCliPath"
let canvasEnabledKey = "secretary.canvasEnabled"
let cameraEnabledKey = "secretary.cameraEnabled"
let systemRunPolicyKey = "secretary.systemRunPolicy"
let systemRunAllowlistKey = "secretary.systemRunAllowlist"
let systemRunEnabledKey = "secretary.systemRunEnabled"
let locationModeKey = "secretary.locationMode"
let locationPreciseKey = "secretary.locationPreciseEnabled"
let peekabooBridgeEnabledKey = "secretary.peekabooBridgeEnabled"
let deepLinkKeyKey = "secretary.deepLinkKey"
let modelCatalogPathKey = "secretary.modelCatalogPath"
let modelCatalogReloadKey = "secretary.modelCatalogReload"
let cliInstallPromptedVersionKey = "secretary.cliInstallPromptedVersion"
let heartbeatsEnabledKey = "secretary.heartbeatsEnabled"
let debugPaneEnabledKey = "secretary.debugPaneEnabled"
let debugFileLogEnabledKey = "secretary.debug.fileLogEnabled"
let appLogLevelKey = "secretary.debug.appLogLevel"
let voiceWakeSupported: Bool = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
