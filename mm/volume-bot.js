/**
 * RadLabs Volume Bot
 * 
 * Core engine for generating trading volume on low-liquidity Runes tokens.
 * 
 * Strategy:
 * - Place ladder orders (5 bids, 5 asks) at different price levels
 * - Execute ping-pong trades (reverse 50% of fills to generate more volume)
 * - Maintain bullish inventory bias (55-60% token / 40-45% BTC)
 * - Rebalance when >10% off target
 * - Profit from: token appreciation (primary) + pool fees + spread capture
 */

const { TOKENS, MM_CONFIG } = require('./production-config');
const fs = require('fs').promises;
const path = require('path');

// Helper: Calculate directional bias based on market cap, volume dominance, momentum
function calculateDirectionalBias(token, ourDailyVolume) {
  const mcapUSD = token.marketCap;
  const ourVolumeRatio = Math.min(ourDailyVolume / token.volume24h, 1);
  const priceChange7d = token.priceChange7d || 0;
  
  // Smaller mcap = more bullish (under $5M)
  const mcapBias = Math.max(0, (5_000_000 - mcapUSD) / 5_000_000) * 0.15; // 0-15%
  
  // Our volume dominance = slight bullish (capped at 5%)
  const volumeBias = Math.min(ourVolumeRatio * 0.05, 0.05);
  
  // Recent momentum (small factor)
  const momentumBias = priceChange7d * 0.03; // ±3% max
  
  return mcapBias + volumeBias + momentumBias;
}

// Helper: Get inventory target based on bias
function getInventoryTarget(bias) {
  const tokenPct = 0.5 + (bias / 2); // 50% + half the bias
  return {
    btc: 1 - tokenPct,
    token: tokenPct
  };
}

class VolumeBot {
  constructor(userAddress, tokenConfig, allocation) {
    this.userAddress = userAddress;
    this.tokenConfig = tokenConfig;
    this.allocation = allocation; // BTC amount allocated to this token
    
    this.inventory = {
      btc: allocation / 2,
      token: 0 // Will be calculated based on current price
    };
    
    this.metrics = {
      startTime: Date.now(),
      volumeGenerated: 0,
      volumeGenerated24h: 0,
      feesCollected: 0,
      tradingFeesPaid: 0,
      spreadCapture: 0,
      tokenAppreciation: 0,
      netPnL: 0,
      trades: [],
      lastVolumeReset: Date.now()
    };
    
    this.positions = []; // Active liquidity positions
    this.fills = []; // Detected fills waiting for reverse trade
    
    this.running = false;
    this.timer = null;
    
    this.startPrice = null; // Track token price at start
  }
  
  async start() {
    if (this.running) {
      console.log(`[VolumeBot] Already running for ${this.tokenConfig.ticker}`);
      return;
    }
    
    console.log(`[VolumeBot] Starting for ${this.tokenConfig.ticker}, allocation: ${this.allocation} BTC`);
    this.running = true;
    
    // Initial setup
    await this.updateMarketData();
    this.startPrice = this.marketData.price;
    
    // Initialize inventory with token purchase
    await this.initialPurchase();
    
    // Start main loop
    this.timer = setInterval(() => this.tick(), MM_CONFIG.updateFrequencyMs);
  }
  
  async stop() {
    console.log(`[VolumeBot] Stopping for ${this.tokenConfig.ticker}`);
    this.running = false;
    
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    // Cancel all open positions
    await this.cancelAllPositions();
  }
  
  async tick() {
    if (!this.running) return;
    
    try {
      // 1. Update market data
      await this.updateMarketData();
      
      // 2. Reset 24h volume counter if needed
      this.reset24hVolumeIfNeeded();
      
      // 3. Calculate directional bias
      const bias = calculateDirectionalBias(this.marketData, this.metrics.volumeGenerated24h);
      
      // 4. Determine inventory targets
      const target = this.tokenConfig.inventoryTarget || getInventoryTarget(bias);
      
      // 5. Cancel old positions
      await this.cancelAllPositions();
      
      // 6. Place new ladder orders
      await this.placeLadderOrders(target);
      
      // 7. Check for fills and execute reverse trades
      await this.checkFillsAndReverse();
      
      // 8. Rebalance if needed
      await this.rebalanceIfNeeded(target);
      
      // 9. Update metrics
      await this.updateMetrics();
      
      // 10. Check risk limits
      await this.checkRiskLimits();
      
      // 11. Persist state
      await this.saveState();
      
    } catch (error) {
      console.error(`[VolumeBot] Error in tick for ${this.tokenConfig.ticker}:`, error);
    }
  }
  
  async updateMarketData() {
    // TODO: Fetch real market data from RadFi API
    // For now, simulate
    this.marketData = {
      price: this.tokenConfig.price,
      marketCap: this.tokenConfig.marketCap,
      volume24h: this.tokenConfig.volume24h,
      poolTVL: 143000, // TODO: fetch from API
      priceChange7d: 0.05 // +5% assumption
    };
  }
  
  async initialPurchase() {
    // Convert half of BTC allocation to tokens
    const btcToSpend = this.allocation / 2;
    const tokensReceived = btcToSpend / this.marketData.price;
    
    this.inventory.btc = this.allocation / 2;
    this.inventory.token = tokensReceived;
    
    console.log(`[VolumeBot] Initial purchase: ${btcToSpend} BTC → ${tokensReceived} ${this.tokenConfig.ticker}`);
  }
  
  reset24hVolumeIfNeeded() {
    const now = Date.now();
    const elapsed = now - this.metrics.lastVolumeReset;
    
    if (elapsed >= 24 * 60 * 60 * 1000) { // 24 hours
      this.metrics.volumeGenerated24h = 0;
      this.metrics.lastVolumeReset = now;
    }
  }
  
  async placeLadderOrders(target) {
    const currentPrice = this.marketData.price;
    const spreadBps = this.tokenConfig.baseSpreadBPS;
    const ladderLevels = this.tokenConfig.ladderLevels || 5;
    
    // Calculate how much to allocate per order
    const btcPerOrder = this.inventory.btc / ladderLevels;
    const tokenPerOrder = this.inventory.token / ladderLevels;
    
    // Place bid ladder (5 orders from -2.5% to -7.5%)
    for (let i = 0; i < ladderLevels; i++) {
      const offsetPct = -0.025 - (i * 0.01); // -2.5%, -3.5%, -4.5%, -5.5%, -6.5%
      const price = currentPrice * (1 + offsetPct);
      const size = btcPerOrder;
      
      await this.placeBid(price, size);
    }
    
    // Place ask ladder (5 orders from +2.5% to +7.5%)
    for (let i = 0; i < ladderLevels; i++) {
      const offsetPct = 0.025 + (i * 0.01);
      const price = currentPrice * (1 + offsetPct);
      const size = tokenPerOrder;
      
      await this.placeAsk(price, size);
    }
  }
  
  async placeBid(price, sizeBTC) {
    // Simulate position creation
    const position = {
      id: `bid_${Date.now()}_${Math.random()}`,
      side: 'bid',
      price,
      sizeBTC,
      sizeToken: sizeBTC / price,
      createdAt: Date.now(),
      status: 'open'
    };
    
    this.positions.push(position);
    console.log(`[VolumeBot] Placed BID: ${sizeBTC} BTC @ $${price.toFixed(8)}`);
    
    // TODO: Replace with real RadFi API call
    // const result = await radfiFetch('/api/vm-transactions', {
    //   method: 'POST',
    //   body: { type: 'provide-liquidity', ... }
    // });
  }
  
  async placeAsk(price, sizeToken) {
    const position = {
      id: `ask_${Date.now()}_${Math.random()}`,
      side: 'ask',
      price,
      sizeToken,
      sizeBTC: sizeToken * price,
      createdAt: Date.now(),
      status: 'open'
    };
    
    this.positions.push(position);
    console.log(`[VolumeBot] Placed ASK: ${sizeToken} ${this.tokenConfig.ticker} @ $${price.toFixed(8)}`);
    
    // TODO: Replace with real RadFi API call
  }
  
  async checkFillsAndReverse() {
    // Detect filled positions
    const fills = await this.detectFills();
    
    for (const fill of fills) {
      console.log(`[VolumeBot] FILL detected: ${fill.side} ${fill.sizeToken} ${this.tokenConfig.ticker} @ $${fill.price}`);
      
      // Update inventory
      if (fill.side === 'bid') {
        // We bought token with BTC
        this.inventory.btc -= fill.sizeBTC;
        this.inventory.token += fill.sizeToken;
      } else {
        // We sold token for BTC
        this.inventory.btc += fill.sizeBTC;
        this.inventory.token -= fill.sizeToken;
      }
      
      // Generate reverse volume (ping-pong)
      if (this.tokenConfig.pingPongEnabled) {
        const reverseRatio = this.tokenConfig.reverseTradeRatio || 0.5;
        
        if (fill.side === 'bid') {
          // We bought token, immediately sell 50% back
          const sellAmount = fill.sizeToken * reverseRatio;
          await this.marketSell(sellAmount);
        } else {
          // We sold token, immediately buy 50% back
          const buyAmount = fill.sizeBTC * reverseRatio;
          await this.marketBuy(buyAmount);
        }
        
        this.metrics.volumeGenerated += fill.value * 2; // Original + reverse
        this.metrics.volumeGenerated24h += fill.value * 2;
      } else {
        this.metrics.volumeGenerated += fill.value;
        this.metrics.volumeGenerated24h += fill.value;
      }
      
      // Track trade
      this.metrics.trades.push({
        timestamp: Date.now(),
        side: fill.side,
        price: fill.price,
        volume: fill.value,
        pnl: fill.pnl || 0
      });
      
      // Track fees paid
      const radfiFee = fill.value * MM_CONFIG.radfiFeeRate;
      this.metrics.tradingFeesPaid += radfiFee;
    }
  }
  
  async detectFills() {
    // Simulate fill detection (in production, query RadFi API for position status)
    const fills = [];
    const currentPrice = this.marketData.price;
    
    for (const position of this.positions) {
      if (position.status !== 'open') continue;
      
      // Simulate random fills (1% chance per tick)
      const fillChance = Math.random();
      
      if (fillChance < MM_CONFIG.expectedFillRate) {
        position.status = 'filled';
        
        fills.push({
          id: position.id,
          side: position.side,
          price: position.price,
          sizeBTC: position.sizeBTC,
          sizeToken: position.sizeToken,
          value: position.sizeBTC, // USD value
          pnl: 0 // Calculate based on entry/exit
        });
      }
    }
    
    return fills;
  }
  
  async marketSell(tokenAmount) {
    const currentPrice = this.marketData.price;
    const btcReceived = tokenAmount * currentPrice;
    
    this.inventory.token -= tokenAmount;
    this.inventory.btc += btcReceived;
    
    console.log(`[VolumeBot] MARKET SELL: ${tokenAmount} ${this.tokenConfig.ticker} → ${btcReceived} BTC`);
    
    // TODO: Replace with real RadFi swap
  }
  
  async marketBuy(btcAmount) {
    const currentPrice = this.marketData.price;
    const tokenReceived = btcAmount / currentPrice;
    
    this.inventory.btc -= btcAmount;
    this.inventory.token += tokenReceived;
    
    console.log(`[VolumeBot] MARKET BUY: ${btcAmount} BTC → ${tokenReceived} ${this.tokenConfig.ticker}`);
    
    // TODO: Replace with real RadFi swap
  }
  
  async rebalanceIfNeeded(target) {
    const totalValueBTC = this.inventory.btc + (this.inventory.token * this.marketData.price);
    const currentBTCRatio = this.inventory.btc / totalValueBTC;
    const targetBTCRatio = target.btc;
    
    const skew = Math.abs(currentBTCRatio - targetBTCRatio);
    
    if (skew > MM_CONFIG.rebalanceThreshold) {
      console.log(`[VolumeBot] REBALANCE needed: Current ${(currentBTCRatio * 100).toFixed(1)}% BTC, Target ${(targetBTCRatio * 100).toFixed(1)}%`);
      
      if (currentBTCRatio > targetBTCRatio) {
        // Too much BTC, buy tokens
        const btcToSpend = totalValueBTC * (currentBTCRatio - targetBTCRatio);
        await this.marketBuy(btcToSpend);
      } else {
        // Too much token, sell tokens
        const btcTarget = totalValueBTC * (targetBTCRatio - currentBTCRatio);
        const tokenToSell = btcTarget / this.marketData.price;
        await this.marketSell(tokenToSell);
      }
    }
  }
  
  async updateMetrics() {
    // Calculate current portfolio value
    const totalValueBTC = this.inventory.btc + (this.inventory.token * this.marketData.price);
    
    // Calculate P&L components
    const tokenAppreciation = this.startPrice 
      ? ((this.marketData.price - this.startPrice) / this.startPrice) * (this.inventory.token * this.marketData.price)
      : 0;
    
    this.metrics.tokenAppreciation = tokenAppreciation;
    this.metrics.netPnL = totalValueBTC - this.allocation;
    
    // Calculate APY if enough time has passed
    const elapsedDays = (Date.now() - this.metrics.startTime) / (1000 * 60 * 60 * 24);
    if (elapsedDays > 1) {
      const roi = this.metrics.netPnL / this.allocation;
      this.metrics.apy = (roi * 365) / elapsedDays;
    }
  }
  
  async checkRiskLimits() {
    const totalValueBTC = this.inventory.btc + (this.inventory.token * this.marketData.price);
    const drawdown = (totalValueBTC - this.allocation) / this.allocation;
    
    // Check stop loss
    if (drawdown < MM_CONFIG.globalStopLoss) {
      console.error(`[VolumeBot] STOP LOSS triggered: ${(drawdown * 100).toFixed(2)}%`);
      await this.stop();
      
      // TODO: Alert user
      return;
    }
    
    // Check TVL exposure
    const exposure = totalValueBTC / this.marketData.poolTVL;
    if (exposure > 0.1) {
      console.warn(`[VolumeBot] TVL exposure high: ${(exposure * 100).toFixed(2)}%`);
      // TODO: Alert user
    }
  }
  
  async cancelAllPositions() {
    for (const position of this.positions) {
      if (position.status === 'open') {
        position.status = 'cancelled';
        console.log(`[VolumeBot] Cancelled position: ${position.id}`);
        
        // TODO: Call RadFi API to cancel
      }
    }
    
    this.positions = [];
  }
  
  async saveState() {
    const state = {
      userAddress: this.userAddress,
      tokenConfig: this.tokenConfig,
      allocation: this.allocation,
      inventory: this.inventory,
      metrics: this.metrics,
      positions: this.positions,
      startPrice: this.startPrice,
      running: this.running,
      lastUpdate: Date.now()
    };
    
    const dataDir = path.join(__dirname, '../data/mm');
    await fs.mkdir(dataDir, { recursive: true });
    
    const filePath = path.join(dataDir, `${this.userAddress}-${this.tokenConfig.ticker}.json`);
    await fs.writeFile(filePath, JSON.stringify(state, null, 2));
  }
  
  async loadState(userAddress, ticker) {
    const filePath = path.join(__dirname, '../data/mm', `${userAddress}-${ticker}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const state = JSON.parse(data);
      
      // Restore state
      this.allocation = state.allocation;
      this.inventory = state.inventory;
      this.metrics = state.metrics;
      this.positions = state.positions;
      this.startPrice = state.startPrice;
      
      console.log(`[VolumeBot] Loaded state for ${userAddress} ${ticker}`);
      return true;
    } catch (error) {
      console.log(`[VolumeBot] No saved state found for ${userAddress} ${ticker}`);
      return false;
    }
  }
  
  getMetrics() {
    const totalValueBTC = this.inventory.btc + (this.inventory.token * this.marketData.price);
    
    return {
      ticker: this.tokenConfig.ticker,
      allocation: this.allocation,
      currentValue: totalValueBTC,
      pnl: this.metrics.netPnL,
      pnlPercent: (this.metrics.netPnL / this.allocation) * 100,
      apy: (this.metrics.apy || 0) * 100,
      volumeGenerated24h: this.metrics.volumeGenerated24h,
      volumeGeneratedTotal: this.metrics.volumeGenerated,
      trades: this.metrics.trades.length,
      feesPaid: this.metrics.tradingFeesPaid,
      tokenAppreciation: this.metrics.tokenAppreciation,
      inventory: {
        btc: this.inventory.btc,
        token: this.inventory.token,
        btcRatio: this.inventory.btc / totalValueBTC,
        tokenRatio: (this.inventory.token * this.marketData.price) / totalValueBTC
      },
      running: this.running
    };
  }
}

module.exports = VolumeBot;
