import { useState } from "react";
import AvatarVideo from "./components/AvatarVideo";
import CharacterSelector from "./components/CharacterSelector";
import StatusIndicator from "./components/StatusIndicator";
import VoiceControls from "./components/VoiceControls";
import { useAudioStream } from "./hooks/useAudioStream";
import { useWebRTC } from "./hooks/useWebRTC";

function App() {
  const [selectedCharacter, setSelectedCharacter] = useState<string>("default");
  const { connectionState, remoteStream, connect, disconnect } = useWebRTC();

  const { isRecording, startRecording, stopRecording, audioLevel } = useAudioStream();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-primary to-secondary p-6 text-white">
          <h1 className="text-3xl font-bold">Secretary Avatar Chat</h1>
          <p className="text-sm opacity-90 mt-1">Real-time AI Avatar Interaction</p>
        </div>

        <div className="p-6 space-y-6">
          <StatusIndicator
            connectionState={connectionState}
            isRecording={isRecording}
            audioLevel={audioLevel}
          />

          <CharacterSelector
            selectedCharacter={selectedCharacter}
            onSelectCharacter={setSelectedCharacter}
          />

          <AvatarVideo remoteStream={remoteStream} connectionState={connectionState} />

          <VoiceControls
            isRecording={isRecording}
            isConnected={connectionState === "connected"}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
