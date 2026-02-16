/**
 * Logging utility for Avatar Test UI
 */

class Logger {
  constructor() {
    this.container = null;
    this.entries = [];
    this.maxEntries = CONFIG.MAX_LOG_ENTRIES;
    this.logLevel = this.parseLogLevel(CONFIG.LOG_LEVEL);
  }

  init() {
    this.container = document.getElementById('log-container');
    const clearBtn = document.getElementById('clear-log');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }
  }

  parseLogLevel(level) {
    const levels = { debug: 0, info: 1, warning: 2, error: 3 };
    return levels[level.toLowerCase()] || 1;
  }

  shouldLog(level) {
    const levels = { debug: 0, info: 1, warning: 2, error: 3 };
    return levels[level] >= this.logLevel;
  }

  log(level, message, data) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toLocaleTimeString();
    const entry = { timestamp, level, message, data };

    this.entries.push(entry);

    // Limit entries
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    // Console output
    const consoleMethod = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
    console[consoleMethod](`[${timestamp}] ${message}`, data || '');

    // UI output
    this.render();
  }

  debug(message, data) {
    this.log('debug', message, data);
  }

  info(message, data) {
    this.log('info', message, data);
  }

  success(message, data) {
    this.log('success', message, data);
  }

  warning(message, data) {
    this.log('warning', message, data);
  }

  error(message, data) {
    this.log('error', message, data);
  }

  clear() {
    this.entries = [];
    this.render();
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = this.entries
      .map(
        (entry) => `
        <div class="log-entry ${entry.level}">
          <span class="log-timestamp">${entry.timestamp}</span>
          <span class="log-message">${this.escapeHtml(entry.message)}</span>
        </div>
      `
      )
      .join('');

    // Auto-scroll to bottom
    this.container.scrollTop = this.container.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Create global logger instance
window.logger = new Logger();
