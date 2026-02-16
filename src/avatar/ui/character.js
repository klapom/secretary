/**
 * Character management for Avatar Test UI
 */

class CharacterManager {
  constructor() {
    this.characters = [];
    this.activeCharacter = null;
    this.selectElement = null;
    this.statusElement = null;
  }

  init() {
    this.selectElement = document.getElementById('character-select');
    this.statusElement = document.getElementById('status-character');

    // Event listeners
    this.selectElement.addEventListener('change', (e) => this.onCharacterChange(e));

    document.getElementById('refresh-characters').addEventListener('click', () => {
      this.loadCharacters();
    });

    // Initial load
    this.loadCharacters();
  }

  async loadCharacters() {
    try {
      logger.info('Loading characters...');
      this.updateStatus('pending', 'Loading...');

      const url = `${CONFIG.CHARACTER_API_URL}/api/characters`;
      const headers = {};

      if (CONFIG.AUTH_TOKEN) {
        headers['Authorization'] = `Bearer ${CONFIG.AUTH_TOKEN}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(CONFIG.API_TIMEOUT),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.characters = data.characters || [];

      logger.success(`Loaded ${this.characters.length} characters`);
      this.updateStatus('connected', 'Connected');

      this.renderCharacters();

      // Load active character
      this.loadActiveCharacter();
    } catch (error) {
      logger.error('Failed to load characters', error.message);
      this.updateStatus('error', 'Error');
      this.selectElement.innerHTML = '<option value="">Failed to load characters</option>';
    }
  }

  async loadActiveCharacter() {
    try {
      const url = `${CONFIG.CHARACTER_API_URL}/api/characters/active`;
      const headers = {};

      if (CONFIG.AUTH_TOKEN) {
        headers['Authorization'] = `Bearer ${CONFIG.AUTH_TOKEN}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(CONFIG.API_TIMEOUT),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.character) {
          this.activeCharacter = data.character;
          this.selectElement.value = data.character.id;
          this.displayCharacterInfo(data.character);
          logger.info(`Active character: ${data.character.displayName}`);
        }
      }
    } catch (error) {
      logger.warning('No active character found', error.message);
    }
  }

  renderCharacters() {
    if (this.characters.length === 0) {
      this.selectElement.innerHTML = '<option value="">No characters available</option>';
      this.selectElement.disabled = true;
      return;
    }

    this.selectElement.disabled = false;
    this.selectElement.innerHTML =
      '<option value="">Select a character...</option>' +
      this.characters
        .map(
          (char) =>
            `<option value="${char.id}">${char.displayName}${char.isActive ? ' (Active)' : ''}</option>`
        )
        .join('');
  }

  async onCharacterChange(event) {
    const characterId = event.target.value;

    if (!characterId) {
      this.hideCharacterInfo();
      return;
    }

    const character = this.characters.find((c) => c.id === characterId);

    if (!character) {
      logger.error('Character not found', characterId);
      return;
    }

    this.displayCharacterInfo(character);

    // Activate character
    try {
      await this.activateCharacter(characterId);
    } catch (error) {
      logger.error('Failed to activate character', error.message);
    }
  }

  async activateCharacter(characterId) {
    try {
      logger.info('Activating character...');

      const url = `${CONFIG.CHARACTER_API_URL}/api/characters/${characterId}/activate`;
      const headers = {};

      if (CONFIG.AUTH_TOKEN) {
        headers['Authorization'] = `Bearer ${CONFIG.AUTH_TOKEN}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(CONFIG.API_TIMEOUT),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.activeCharacter = data.character;

      logger.success(`Activated: ${data.character.displayName}`);

      // Notify other components
      window.dispatchEvent(
        new CustomEvent('character-activated', {
          detail: { character: data.character },
        })
      );
    } catch (error) {
      throw new Error(`Activation failed: ${error.message}`);
    }
  }

  displayCharacterInfo(character) {
    document.getElementById('char-name').textContent = character.displayName;
    document.getElementById('char-desc').textContent = character.description || 'No description';
    document.getElementById('char-personality').textContent =
      character.personality || 'No personality defined';

    document.getElementById('character-info').classList.remove('hidden');
  }

  hideCharacterInfo() {
    document.getElementById('character-info').classList.add('hidden');
  }

  updateStatus(status, text) {
    this.statusElement.className = `status-badge status-${status}`;
    this.statusElement.textContent = text;
  }

  getActiveCharacter() {
    return this.activeCharacter;
  }
}

// Create global character manager instance
window.characterManager = new CharacterManager();
