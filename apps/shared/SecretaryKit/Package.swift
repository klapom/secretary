// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "SecretaryKit",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        .library(name: "SecretaryProtocol", targets: ["SecretaryProtocol"]),
        .library(name: "SecretaryKit", targets: ["SecretaryKit"]),
        .library(name: "SecretaryChatUI", targets: ["SecretaryChatUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/steipete/ElevenLabsKit", exact: "0.1.0"),
        .package(url: "https://github.com/gonzalezreal/textual", exact: "0.3.1"),
    ],
    targets: [
        .target(
            name: "SecretaryProtocol",
            path: "Sources/SecretaryProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "SecretaryKit",
            dependencies: [
                "SecretaryProtocol",
                .product(name: "ElevenLabsKit", package: "ElevenLabsKit"),
            ],
            path: "Sources/SecretaryKit",
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "SecretaryChatUI",
            dependencies: [
                "SecretaryKit",
                .product(
                    name: "Textual",
                    package: "textual",
                    condition: .when(platforms: [.macOS, .iOS])),
            ],
            path: "Sources/SecretaryChatUI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "SecretaryKitTests",
            dependencies: ["SecretaryKit", "SecretaryChatUI"],
            path: "Tests/SecretaryKitTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
