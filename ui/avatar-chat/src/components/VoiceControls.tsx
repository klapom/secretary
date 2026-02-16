interface VoiceControlsProps {
  isRecording: boolean;
  isConnected: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function VoiceControls({
  isRecording,
  isConnected,
  onStartRecording,
  onStopRecording,
  onConnect,
  onDisconnect,
}: VoiceControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
      {!isConnected ? (
        <button
          onClick={onConnect}
          className="flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Connect
        </button>
      ) : (
        <>
          <button
            onClick={isRecording ? onStopRecording : onStartRecording}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${
              isRecording
                ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                : "bg-blue-500 hover:bg-blue-600 text-white"
            }`}
          >
            {isRecording ? (
              <>
                <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                Stop Recording
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
                Start Recording
              </>
            )}
          </button>

          <button
            onClick={onDisconnect}
            className="flex items-center gap-2 px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Disconnect
          </button>
        </>
      )}
    </div>
  );
}
