import type { ConnectionState } from "../types";

interface StatusIndicatorProps {
  connectionState: ConnectionState;
  isRecording: boolean;
  audioLevel: number;
}

export default function StatusIndicator({
  connectionState,
  isRecording,
  audioLevel,
}: StatusIndicatorProps) {
  const getStatusColor = () => {
    switch (connectionState) {
      case "connected":
        return "bg-green-500";
      case "connecting":
        return "bg-yellow-500 animate-pulse";
      case "reconnecting":
        return "bg-yellow-500 animate-pulse";
      case "failed":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "reconnecting":
        return "Reconnecting...";
      case "failed":
        return "Connection Failed";
      default:
        return "Disconnected";
    }
  };

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
        <span className="font-medium text-gray-700">{getStatusText()}</span>
      </div>

      {isRecording && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Audio Level:</span>
          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-100"
              style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
            ></div>
          </div>
        </div>
      )}

      {connectionState === "connected" && !isRecording && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Ready to chat
        </div>
      )}
    </div>
  );
}
