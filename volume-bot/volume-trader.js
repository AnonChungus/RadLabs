/**
 * RadFi Volume Bot
 * 
 * Goal: Generate maximum trading volume while minimizing losses
 * Strategy: 70% volume generation + 30% mean reversion trading
 */

const { TOKENS } = require('../mm/production-config.js');

// ============================================
// PRICE TRACKER
// ============================================

class PriceTracker {
  constructor(token) {
    this.token = token;
    this.priceHistory = [];
    this.maxHistory = 288; // 24 hours at 5-minute intervals
  }

  /**
   * Add price observation
   */
  addPrice(price, timestamp = Date.now()) {
    this.priceHistory.push({ price, timestamp });
    
    // Keep only recent history
    if (this.priceHistory.length > this.maxHistory) {
      this.priceHistory.shift();
    }
  }

  /**
   * Calculate mean price over last N observations
   */
  getMeanPrice(lookback = 48) { // Last 4 hours
    if (this.priceHistory.length === 0) return null;
    
    const recent = this.priceHistory.slice(-lookback);
    const sum = recent.reduce((a, b) => a + b.price, 0);
    return sum / recent.length;
  }

  /**
   * Calculate price volatility (standard deviation)
   */
  getVolatility(lookback = 48) {
    const mean = this.getMeanPrice(lookback);
    if (!mean) return null;
    
    const recent = this.priceHistory.slice(-lookback);
    const squaredDiffs = recent.map(p => Math.pow(p.price - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / recent.length;
    return Math.sqrt(variance);
  }

  /**
   * Get current price
   */
  getCurrentPrice() {
    if (this.priceHistory.length === 0) return null;
    return this.priceHistory[this.priceHistory.length - 1].price;
  }

  /**
   * Determine if price is at a dip (buy opportunity)
   */
  isAtDip(threshold = 0.03) { // 3% below mean
    const current = this.getCurrentPrice();
    const mean = this.getMeanPrice();
    
    if (!current || !mean) return false;
    
    const deviation = (current - mean) / mean;
    return deviation < -threshold;
  }

  /**
   * Determine if price is at a pump (sell opportunity)
   */
  isAtPump(threshold = 0.03) { // 3% above mean
    const current = this.getCurrentPrice();
    const mean = this.getMeanPrice();
    
    if (!current || !mean) return false;
    
    const deviation = (current - mean) / mean;
    return deviation > threshold;
  }
}

// ============================================
// VOLUME TRADER
// ============================================

class VolumeTrader {
  constructor({ tradingAddress, accessToken, token, capitalBTC }) {
    this.tradingAddress = tradingAddress;
    this.accessToken = accessToken;
    this.token = token;
    this.capitalBTC = capitalBTC;
    
    this.priceTracker = new PriceTracker(token);
    
    // Strategy allocation
    this.volumeCapital = capitalBTC * 0.7; // 70% for volume gen
    this.profitCapital = capitalBTC * 0.3;  // 30% for mean reversion
    
    // Inventory tracking
    this.btc = capitalBTC / 2;
    this.tokens = 0;
    
    // Trade tracking
    this.trades = [];
    this.volumeGenerated = 0;
    this.feesPaid = 0;
    this.profitEarned = 0;
    
    // Config
    this.config = {
      volumeTradeSize: 0.0001,      // $7.86 per volume trade
      profitTradeSize: 0.0005,      // $39.30 per profit trade
      volumeTradeInterval: 300000,   // 5 minutes
      maxDailyTrades: 20,
      meanReversionThreshold: 0.03   // 3% deviation
    };
    
    this.running = false;
  }

  /**
   * Initialize trader
   */
  async init(startPrice) {
    console.log('='.repeat(60));
    console.log('  RadFi Volume Bot');
    console.log('='.repeat(60));
    console.log(`Token: ${this.token}`);
    console.log(`Capital: ${this.capitalBTC} BTC`);
    console.log(`Start Price: ${startPrice.toFixed(8)}`);
    console.log(`Volume Capital: ${this.volumeCapital.toFixed(8)} BTC (70%)`);
    console.log(`Profit Capital: ${this.profitCapital.toFixed(8)} BTC (30%)`);
    console.log('='.repeat(60));
    
    // Initialize inventory
    this.tokens = (this.capitalBTC / 2) / startPrice;
    this.priceTracker.addPrice(startPrice);
    
    console.log(`Inventory: ${this.btc.toFixed(8)} BTC + ${this.tokens.toFixed(2)} ${this.token}`);
  }

  /**
   * Execute a buy trade
   */
  async buy(amountBTC, price, type = 'volume') {
    const fee = amountBTC * 0.01; // 1% RadFi fee
    const netBTC = amountBTC - fee;
    const tokensReceived = netBTC / price;
    
    // Update inventory
    this.btc -= amountBTC;
    this.tokens += tokensReceived;
    
    // Track trade
    const trade = {
      timestamp: Date.now(),
      type: type,
      side: 'buy',
      amountBTC: amountBTC,
      price: price,
      tokensReceived: tokensReceived,
      fee: fee,
      volumeUSD: amountBTC * 78593 // TODO: use real BTC price
    };
    
    this.trades.push(trade);
    this.volumeGenerated += trade.volumeUSD;
    this.feesPaid += fee;
    
    console.log(`[${type.toUpperCase()}] BUY ${amountBTC.toFixed(8)} BTC → ${tokensReceived.toFixed(2)} ${this.token} @ ${price.toFixed(8)} | Fee: ${fee.toFixed(8)} BTC`);
    
    return trade;
  }

  /**
   * Execute a sell trade
   */
  async sell(amountTokens, price, type = 'volume') {
    const btcReceived = amountTokens * price;
    const fee = btcReceived * 0.01; // 1% RadFi fee
    const netBTC = btcReceived - fee;
    
    // Update inventory
    this.tokens -= amountTokens;
    this.btc += netBTC;
    
    // Track trade
    const trade = {
      timestamp: Date.now(),
      type: type,
      side: 'sell',
      amountTokens: amountTokens,
      price: price,
      btcReceived: netBTC,
      fee: fee,
      volumeUSD: btcReceived * 78593
    };
    
    this.trades.push(trade);
    this.volumeGenerated += trade.volumeUSD;
    this.feesPaid += fee;
    
    console.log(`[${type.toUpperCase()}] SELL ${amountTokens.toFixed(2)} ${this.token} → ${netBTC.toFixed(8)} BTC @ ${price.toFixed(8)} | Fee: ${fee.toFixed(8)} BTC`);
    
    return trade;
  }

  /**
   * Check if we should make a volume trade
   */
  shouldMakeVolumeTrade() {
    const now = Date.now();
    const recentTrades = this.trades.filter(t => now - t.timestamp < 86400000); // Last 24h
    
    // Don't exceed max daily trades
    if (recentTrades.length >= this.config.maxDailyTrades) {
      return false;
    }
    
    // Check if enough time passed since last trade
    if (this.trades.length > 0) {
      const lastTrade = this.trades[this.trades.length - 1];
      const timeSinceLastTrade = now - lastTrade.timestamp;
      
      if (timeSinceLastTrade < this.config.volumeTradeInterval) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Make a volume-generating trade
   */
  async makeVolumeTrade(currentPrice) {
    if (!this.shouldMakeVolumeTrade()) {
      return null;
    }
    
    // Random buy or sell (50/50)
    const isBuy = Math.random() < 0.5;
    
    // Check if we have inventory
    const canBuy = this.btc >= this.config.volumeTradeSize;
    const canSell = this.tokens * currentPrice >= this.config.volumeTradeSize;
    
    if (isBuy && canBuy) {
      return await this.buy(this.config.volumeTradeSize, currentPrice, 'volume');
    } else if (!isBuy && canSell) {
      const tokensToSell = this.config.volumeTradeSize / currentPrice;
      return await this.sell(tokensToSell, currentPrice, 'volume');
    }
    
    return null;
  }

  /**
   * Make a profit-seeking mean reversion trade
   */
  async makeProfitTrade(currentPrice) {
    const meanPrice = this.priceTracker.getMeanPrice();
    
    if (!meanPrice) {
      return null; // Not enough price history
    }
    
    // Buy the dip
    if (this.priceTracker.isAtDip(this.config.meanReversionThreshold)) {
      if (this.btc >= this.config.profitTradeSize) {
        console.log(`[PROFIT] Detected dip: ${currentPrice.toFixed(8)} vs mean ${meanPrice.toFixed(8)}`);
        return await this.buy(this.config.profitTradeSize, currentPrice, 'profit');
      }
    }
    
    // Sell the pump
    if (this.priceTracker.isAtPump(this.config.meanReversionThreshold)) {
      const tokensToSell = this.config.profitTradeSize / currentPrice;
      if (this.tokens >= tokensToSell) {
        console.log(`[PROFIT] Detected pump: ${currentPrice.toFixed(8)} vs mean ${meanPrice.toFixed(8)}`);
        return await this.sell(tokensToSell, currentPrice, 'profit');
      }
    }
    
    return null;
  }

  /**
   * Rebalance inventory if too skewed
   */
  async rebalance(currentPrice, threshold = 0.3) {
    const totalValueBTC = this.btc + (this.tokens * currentPrice);
    const btcPct = this.btc / totalValueBTC;
    const targetPct = 0.5;
    const deviation = Math.abs(btcPct - targetPct);
    
    if (deviation > threshold) {
      console.log(`[REBALANCE] Inventory skewed: ${(btcPct * 100).toFixed(1)}% BTC`);
      
      if (btcPct > targetPct) {
        // Too much BTC - buy tokens
        const btcToSpend = (this.btc - totalValueBTC * targetPct) / 2;
        await this.buy(btcToSpend, currentPrice, 'rebalance');
      } else {
        // Too many tokens - sell
        const tokensToSell = (this.tokens * currentPrice - totalValueBTC * targetPct) / 2 / currentPrice;
        await this.sell(tokensToSell, currentPrice, 'rebalance');
      }
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(currentPrice) {
    const totalValueBTC = this.btc + (this.tokens * currentPrice);
    const pnl = totalValueBTC - this.capitalBTC;
    const pnlPct = (pnl / this.capitalBTC) * 100;
    
    const volumeTrades = this.trades.filter(t => t.type === 'volume').length;
    const profitTrades = this.trades.filter(t => t.type === 'profit').length;
    
    return {
      capitalBTC: this.capitalBTC,
      currentValueBTC: totalValueBTC,
      pnl: pnl,
      pnlPct: pnlPct,
      volumeGenerated: this.volumeGenerated,
      feesPaid: this.feesPaid * 78593, // USD
      totalTrades: this.trades.length,
      volumeTrades: volumeTrades,
      profitTrades: profitTrades,
      costPerThousandVolume: (this.feesPaid * 78593) / (this.volumeGenerated / 1000)
    };
  }

  /**
   * Main trading loop
   */
  async run() {
    this.running = true;
    
    console.log('\n[Volume Bot] Starting trading loop...\n');
    
    while (this.running) {
      try {
        // TODO: Fetch real price from RadFi API
        // For now: simulate price movement
        const currentPrice = await this.fetchCurrentPrice();
        
        // Update price tracker
        this.priceTracker.addPrice(currentPrice);
        
        // 1. Try profit trade first (mean reversion)
        await this.makeProfitTrade(currentPrice);
        
        // 2. Make volume trade (70% of activity)
        await this.makeVolumeTrade(currentPrice);
        
        // 3. Rebalance if needed
        await this.rebalance(currentPrice);
        
        // 4. Report metrics
        const metrics = this.getMetrics(currentPrice);
        
        if (this.trades.length % 10 === 0) { // Every 10 trades
          this.printMetrics(metrics);
        }
        
        // 5. Wait for next interval
        await this.sleep(this.config.volumeTradeInterval);
        
      } catch (error) {
        console.error('[Volume Bot] Error:', error);
        await this.sleep(60000); // Wait 1 minute on error
      }
    }
  }

  /**
   * Fetch current price (placeholder - integrate with RadFi API)
   */
  async fetchCurrentPrice() {
    // TODO: Real implementation
    // const pool = await fetch(`/api/pools/${poolId}`);
    // return pool.token0Reserve / pool.token1Reserve;
    
    // For now: simulate realistic price movement
    const basePrice = TOKENS[this.token].price;
    const volatility = 0.02; // 2% random movement
    const randomMove = (Math.random() - 0.5) * 2 * volatility;
    return basePrice * (1 + randomMove);
  }

  /**
   * Print performance metrics
   */
  printMetrics(metrics) {
    console.log('\n' + '─'.repeat(60));
    console.log(`Volume: $${metrics.volumeGenerated.toFixed(0)} | Trades: ${metrics.totalTrades}`);
    console.log(`PnL: ${metrics.pnl >= 0 ? '+' : ''}${metrics.pnl.toFixed(8)} BTC (${metrics.pnlPct >= 0 ? '+' : ''}${metrics.pnlPct.toFixed(2)}%)`);
    console.log(`Fees: $${metrics.feesPaid.toFixed(2)} | Cost/\$1k vol: $${metrics.costPerThousandVolume.toFixed(2)}`);
    console.log(`Inventory: ${this.btc.toFixed(8)} BTC + ${this.tokens.toFixed(2)} ${this.token}`);
    console.log('─'.repeat(60) + '\n');
  }

  /**
   * Stop trading
   */
  async shutdown() {
    console.log('[Volume Bot] Shutting down...');
    this.running = false;
    
    const finalMetrics = this.getMetrics(this.priceTracker.getCurrentPrice());
    this.printMetrics(finalMetrics);
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================
// EXPORT
// ============================================

module.exports = {
  VolumeTrader,
  PriceTracker
};
