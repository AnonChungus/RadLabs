/**
 * Trade Tracker - Comprehensive audit logging for Volume Bot
 * 
 * Tracks all trades with full details for debugging and auditing.
 */

const fs = require('fs').promises;
const path = require('path');

const LOG_DIR = path.join(__dirname, '../data/mm/logs');

class TradeTracker {
  constructor(userAddress) {
    this.userAddress = userAddress;
    this.sessionId = Date.now().toString(36);
    this.trades = [];
    this.errors = [];
    this.apiCalls = [];
  }

  async init() {
    await fs.mkdir(LOG_DIR, { recursive: true });
  }

  async log(type, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userAddress: this.userAddress,
      type,
      ...data
    };
    
    // Console output with color coding
    const colors = {
      TRADE: '\x1b[32m',      // Green
      ERROR: '\x1b[31m',      // Red
      API_CALL: '\x1b[36m',   // Cyan
      WARNING: '\x1b[33m',    // Yellow
      INFO: '\x1b[37m',       // White
      SUCCESS: '\x1b[32m',    // Green
    };
    const reset = '\x1b[0m';
    const color = colors[type] || colors.INFO;
    
    console.log(`${color}[TradeTracker][${type}]${reset}`, JSON.stringify(data, null, 2));
    
    // Store in memory
    if (type === 'TRADE') {
      this.trades.push(entry);
    } else if (type === 'ERROR') {
      this.errors.push(entry);
    } else if (type === 'API_CALL') {
      this.apiCalls.push(entry);
    }
    
    // Append to log file
    const logFile = path.join(LOG_DIR, `${this.userAddress.slice(0, 10)}_${new Date().toISOString().split('T')[0]}.jsonl`);
    await fs.appendFile(logFile, JSON.stringify(entry) + '\n').catch(e => {
      console.error('[TradeTracker] Write error:', e.message);
    });
  }

  async logTrade(action, details) {
    await this.log('TRADE', { action, ...details });
  }

  async logError(action, error, context = {}) {
    await this.log('ERROR', {
      action,
      error: error.message || error,
      stack: error.stack,
      ...context
    });
  }

  async logApiCall(endpoint, method, status, responseTime, data = {}) {
    await this.log('API_CALL', {
      endpoint,
      method,
      status,
      responseTimeMs: responseTime,
      ...data
    });
  }

  async logWarning(message, context = {}) {
    await this.log('WARNING', { message, ...context });
  }

  async logInfo(message, context = {}) {
    await this.log('INFO', { message, ...context });
  }

  async logSuccess(message, context = {}) {
    await this.log('SUCCESS', { message, ...context });
  }

  // Get session summary
  getSummary() {
    return {
      sessionId: this.sessionId,
      userAddress: this.userAddress,
      totalTrades: this.trades.length,
      totalErrors: this.errors.length,
      totalApiCalls: this.apiCalls.length,
      trades: this.trades.slice(-10), // Last 10 trades
      errors: this.errors.slice(-5)   // Last 5 errors
    };
  }

  // Export full log
  async exportLog() {
    const logFile = path.join(LOG_DIR, `export_${this.sessionId}.json`);
    await fs.writeFile(logFile, JSON.stringify({
      sessionId: this.sessionId,
      userAddress: this.userAddress,
      exportedAt: new Date().toISOString(),
      trades: this.trades,
      errors: this.errors,
      apiCalls: this.apiCalls
    }, null, 2));
    return logFile;
  }
}

module.exports = TradeTracker;
