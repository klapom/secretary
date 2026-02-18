import { useState } from "react";

interface Character {
  id: string;
  name: string;
  description: string;
}

const CHARACTERS: Character[] = [
  { id: "default", name: "Alex", description: "Friendly and professional" },
  { id: "emma", name: "Emma", description: "Warm and empathetic" },
  { id: "james", name: "James", description: "Confident and clear" },
];

interface CharacterSelectorProps {
  selectedCharacter: string;
  onSelectCharacter: (characterId: string) => void;
}

export default function CharacterSelector({
  selectedCharacter,
  onSelectCharacter,
}: CharacterSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selected = CHARACTERS.find((c) => c.id === selectedCharacter) || CHARACTERS[0];

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">Select Character</label>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white border-2 border-gray-200 rounded-lg hover:border-primary transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
            {selected.name[0]}
          </div>
          <div className="text-left">
            <p className="font-semibold">{selected.name}</p>
            <p className="text-sm text-gray-500">{selected.description}</p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-lg">
          {CHARACTERS.map((character) => (
            <button
              key={character.id}
              onClick={() => {
                onSelectCharacter(character.id);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                character.id === selectedCharacter ? "bg-primary bg-opacity-10" : ""
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
                {character.name[0]}
              </div>
              <div className="text-left">
                <p className="font-semibold">{character.name}</p>
                <p className="text-sm text-gray-500">{character.description}</p>
              </div>
              {character.id === selectedCharacter && (
                <svg
                  className="w-5 h-5 text-primary ml-auto"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
