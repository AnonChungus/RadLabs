/**
 * Base Market Making Strategy for RadFi
 * All strategies extend this class
 */

class BaseStrategy {
  constructor(config) {
    this.config = config;
    this.position = {
      token: config.token,
      capital: config.capital,
      inventory: { btc: config.capital, token: 0 },
      pnl: 0,
      trades: [],
      startTime: Date.now()
    };
    this.isRunning = false;
  }

  /**
   * Start the market making strategy
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[${this.constructor.name}] Starting MM for ${this.position.token.symbol}`);
    
    // Main strategy loop
    while (this.isRunning) {
      try {
        await this.tick();
        await this.sleep(this.config.tickInterval || 5000);
      } catch (error) {
        console.error(`[${this.constructor.name}] Error:`, error);
        await this.sleep(10000); // Wait longer on error
      }
    }
  }

  /**
   * Stop the strategy
   */
  stop() {
    this.isRunning = false;
    console.log(`[${this.constructor.name}] Stopped`);
  }

  /**
   * Main strategy logic - override in child classes
   */
  async tick() {
    throw new Error('tick() must be implemented by child class');
  }

  /**
   * Fetch current market data from RadFi
   */
  async getMarketData() {
    const response = await fetch(`http://localhost:3000/api/tokens?tokenId_eq=${this.position.token.tokenId}`);
    const data = await response.json();
    return data.data[0];
  }

  /**
   * Execute a swap on RadFi
   */
  async executeSwap(fromToken, toToken, amountIn, isExactIn = true) {
    // TODO: Implement via RadFi API
    // POST /api/transactions with type: 'swap'
    console.log(`[${this.constructor.name}] SWAP: ${amountIn} ${fromToken} -> ${toToken}`);
    
    // For now, simulate
    const trade = {
      time: Date.now(),
      fromToken,
      toToken,
      amountIn,
      amountOut: amountIn * 0.995, // Assume 0.5% spread
      type: isExactIn ? 'buy' : 'sell'
    };
    
    this.position.trades.push(trade);
    return trade;
  }

  /**
   * Provide liquidity to RadFi pool
   */
  async provideLiquidity(amount0, amount1) {
    // TODO: Implement via RadFi API
    // POST /api/transactions with type: 'provide-liquidity'
    console.log(`[${this.constructor.name}] ADD LP: ${amount0} BTC + ${amount1} ${this.position.token.symbol}`);
  }

  /**
   * Withdraw liquidity from RadFi pool
   */
  async withdrawLiquidity(liquidityValue) {
    // TODO: Implement via RadFi API
    // POST /api/transactions with type: 'withdraw-liquidity'
    console.log(`[${this.constructor.name}] REMOVE LP: ${liquidityValue}`);
  }

  /**
   * Calculate current P&L
   */
  calculatePnL() {
    // Simple P&L: current inventory value - initial capital
    const currentValue = this.position.inventory.btc; // TODO: Add token value
    this.position.pnl = currentValue - this.config.capital;
    return this.position.pnl;
  }

  /**
   * Get strategy status
   */
  getStatus() {
    return {
      strategy: this.constructor.name,
      token: this.position.token.symbol,
      capital: this.config.capital,
      inventory: this.position.inventory,
      pnl: this.calculatePnL(),
      trades: this.position.trades.length,
      running: this.isRunning,
      uptime: Date.now() - this.position.startTime
    };
  }

  /**
   * Utility: sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BaseStrategy;
