/**
 * RadLabs Volume Bot
 * 
 * Core engine for generating trading volume on low-liquidity Runes tokens.
 * Now with REAL RadFi API integration and comprehensive tracking.
 * 
 * Strategy:
 * - Place liquidity at narrow ranges to capture trades
 * - Execute ping-pong trades (reverse fills to generate volume)
 * - Maintain bullish inventory bias (55-60% token / 40-45% BTC)
 * - Profit from: token appreciation (primary) + pool fees + spread capture
 */

const { TOKENS, MM_CONFIG } = require('./production-config');
const RadFiAPI = require('./radfi-api');
const TradeTracker = require('./trade-tracker');
const fs = require('fs').promises;
const path = require('path');

class VolumeBot {
  constructor(userAddress, tokenConfig, allocation, authToken = null, refreshToken = null, testMode = false) {
    this.userAddress = userAddress;
    this.tokenConfig = tokenConfig;
    this.allocation = allocation; // BTC amount allocated
    this.authToken = authToken;
    this.refreshToken = refreshToken;
    this.testMode = testMode; // If true, log but don't execute real trades
    
    // Trade tracker for auditing
    this.tracker = new TradeTracker(userAddress);
    
    // RadFi API client with tracker
    this.api = new RadFiAPI(authToken, refreshToken, this.tracker);
    
    // State
    this.inventory = {
      btc: allocation / 2,
      token: 0
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
    
    this.positions = [];     // Active LP positions (NFT IDs)
    this.pendingTx = [];     // Pending transactions
    this.startPrice = null;
    this.currentPrice = null;
    this.pool = null;
    
    this.running = false;
    this.paused = false;
    this.timer = null;
    
    // Data directory for persistence
    this.dataDir = path.join(__dirname, '../data/mm');
  }
  
  setAuth(token) {
    this.authToken = token;
    this.api.setAuth(token);
  }
  
  async start() {
    if (this.running) {
      console.log(`[VolumeBot] Already running for ${this.tokenConfig.ticker}`);
      return;
    }
    
    // Initialize tracker
    await this.tracker.init();
    
    await this.tracker.logInfo('Bot starting', {
      ticker: this.tokenConfig.ticker,
      allocation: this.allocation,
      testMode: this.testMode,
      hasAuth: !!this.authToken
    });
    
    console.log(`[VolumeBot] Starting for ${this.tokenConfig.ticker}, allocation: ${this.allocation} BTC`);
    console.log(`[VolumeBot] Mode: ${this.testMode ? 'TEST (no real trades)' : this.authToken ? 'LIVE' : 'SIMULATED'}`);
    
    this.running = true;
    
    try {
      // Load pool data
      await this.loadPoolData();
      
      await this.tracker.logInfo('Pool loaded', {
        poolId: this.pool?._id,
        token0Id: this.pool?.token0Id,
        token1Id: this.pool?.token1Id
      });
      
      // Get initial price
      this.currentPrice = await this.api.getTokenPrice(this.tokenConfig.poolId);
      this.startPrice = this.currentPrice;
      
      // Calculate initial token inventory based on current price
      const targetTokenRatio = this.tokenConfig.inventoryTarget?.token || 0.55;
      const btcForTokens = this.allocation * targetTokenRatio;
      this.inventory.token = Math.floor(btcForTokens / this.currentPrice);
      this.inventory.btc = this.allocation - btcForTokens;
      
      await this.tracker.logInfo('Inventory initialized', {
        btc: this.inventory.btc,
        token: this.inventory.token,
        startPrice: this.startPrice,
        targetTokenRatio
      });
      
      console.log(`[VolumeBot] Initial inventory: ${this.inventory.btc.toFixed(8)} BTC, ${this.inventory.token} ${this.tokenConfig.ticker}`);
      console.log(`[VolumeBot] Start price: $${this.currentPrice?.toFixed(8) || 'N/A'}`);
      
      // Place initial liquidity (skip if test mode)
      if (!this.testMode) {
        await this.deployLiquidity();
      } else {
        await this.tracker.logInfo('Skipping liquidity deployment (test mode)');
      }
      
      // Start update loop
      this.timer = setInterval(() => this.tick(), MM_CONFIG.updateFrequencyMs || 60000);
      
      await this.tracker.logSuccess('Bot started successfully', {
        ticker: this.tokenConfig.ticker,
        poolId: this.tokenConfig.poolId,
        startPrice: this.startPrice
      });
      
      // Save state
      await this.saveState();
      
    } catch (error) {
      await this.tracker.logError('Bot start failed', error);
      console.error(`[VolumeBot] Start error:`, error);
      this.running = false;
      throw error;
    }
  }
  
  async stop() {
    console.log(`[VolumeBot] Stopping for ${this.tokenConfig.ticker}`);
    this.running = false;
    
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    await this.saveState();
  }
  
  pause() {
    console.log(`[VolumeBot] Paused ${this.tokenConfig.ticker}`);
    this.paused = true;
  }
  
  resume() {
    console.log(`[VolumeBot] Resumed ${this.tokenConfig.ticker}`);
    this.paused = false;
  }
  
  async loadPoolData() {
    if (this.tokenConfig.poolId) {
      this.pool = await this.api.getPool(this.tokenConfig.poolId);
    } else {
      // Fetch pools and find matching one
      const pools = await this.api.fetch('/api/pools');
      this.pool = pools.data?.find(p => 
        p.token1Id === this.tokenConfig.tokenId || 
        p.token0Id === this.tokenConfig.tokenId
      );
      if (this.pool) {
        this.tokenConfig.poolId = this.pool._id;
      }
    }
    
    if (!this.pool) {
      throw new Error(`No pool found for ${this.tokenConfig.ticker}`);
    }
    
    console.log(`[VolumeBot] Pool loaded: ${this.pool._id}`);
  }
  
  async tick() {
    if (!this.running || this.paused) return;
    
    try {
      // Update market data
      await this.updateMarketData();
      
      // Check for fills and execute ping-pong
      await this.checkFillsAndReverse();
      
      // Check inventory and rebalance if needed
      await this.checkAndRebalance();
      
      // Reset 24h volume if needed
      this.checkVolumeReset();
      
      // Calculate PnL
      this.calculatePnL();
      
      // Save state periodically
      await this.saveState();
      
    } catch (error) {
      console.error(`[VolumeBot] Tick error:`, error.message);
    }
  }
  
  async updateMarketData() {
    this.currentPrice = await this.api.getTokenPrice(this.tokenConfig.poolId);
    
    // Update token appreciation metric
    if (this.startPrice && this.currentPrice) {
      this.metrics.tokenAppreciation = ((this.currentPrice - this.startPrice) / this.startPrice) * 100;
    }
  }
  
  async deployLiquidity() {
    if (!this.authToken) {
      console.log(`[VolumeBot] No auth token - liquidity deployment simulated`);
      this.positions.push({
        id: `sim_${Date.now()}`,
        simulated: true,
        btcAmount: this.inventory.btc,
        tokenAmount: this.inventory.token,
        price: this.currentPrice,
        createdAt: Date.now()
      });
      return;
    }
    
    try {
      // Deploy real liquidity via RadFi API
      const result = await this.api.provideLiquidity({
        userAddress: this.userAddress,
        poolId: this.tokenConfig.poolId,
        token0Id: this.pool.token0Id,
        token1Id: this.pool.token1Id,
        amount0: Math.floor(this.inventory.btc * 1e8), // Convert to sats
        amount1: this.inventory.token,
        upperTick: this.pool.upperTick || '887200',
        lowerTick: this.pool.lowerTick || '-887200',
        feeRate: this.pool.fee || 3000,
        tickSpacing: this.pool.tickSpacing || 200,
        scVersion: this.pool.scVersion || 'v4'
      });
      
      console.log(`[VolumeBot] Liquidity deployed:`, result);
      
      if (result.nftId) {
        this.positions.push({
          id: result.nftId,
          simulated: false,
          btcAmount: this.inventory.btc,
          tokenAmount: this.inventory.token,
          price: this.currentPrice,
          createdAt: Date.now(),
          txData: result
        });
      }
      
    } catch (error) {
      console.error(`[VolumeBot] Deploy liquidity error:`, error);
      // Fall back to simulated position
      this.positions.push({
        id: `sim_${Date.now()}`,
        simulated: true,
        btcAmount: this.inventory.btc,
        tokenAmount: this.inventory.token,
        price: this.currentPrice,
        createdAt: Date.now(),
        error: error.message
      });
    }
  }
  
  async checkFillsAndReverse() {
    if (!this.pool) return;
    
    try {
      // Get recent swaps in this pool
      const swaps = await this.api.getPoolSwaps(this.tokenConfig.poolId, 20);
      
      // Filter swaps since last check
      const lastCheck = this.metrics.lastFillCheck || (Date.now() - 60000);
      const newSwaps = swaps.filter(s => (s.btcBlockTime * 1000) > lastCheck);
      
      this.metrics.lastFillCheck = Date.now();
      
      for (const swap of newSwaps) {
        // Calculate value
        const btcAmount = parseFloat(swap.token0Amount || swap.amount0) / 1e8;
        const volumeUSD = btcAmount * 78600; // Approximate BTC price
        
        this.metrics.volumeGenerated += volumeUSD;
        this.metrics.volumeGenerated24h += volumeUSD;
        
        // Track trade
        this.metrics.trades.push({
          timestamp: swap.btcBlockTime * 1000,
          txId: swap.txId,
          volumeUSD,
          btcAmount
        });
        
        // Execute ping-pong if enabled (50% reverse trade)
        if (this.tokenConfig.pingPongEnabled && this.authToken) {
          // TODO: Execute reverse trade via swap API
          // For now, just track the volume
          console.log(`[VolumeBot] Would execute ping-pong for ${volumeUSD.toFixed(2)} USD`);
        }
      }
      
      if (newSwaps.length > 0) {
        console.log(`[VolumeBot] Detected ${newSwaps.length} new swaps`);
      }
      
    } catch (error) {
      console.error(`[VolumeBot] Check fills error:`, error.message);
    }
  }
  
  async checkAndRebalance() {
    if (!this.currentPrice) return;
    
    const totalValueBTC = this.inventory.btc + (this.inventory.token * this.currentPrice);
    const btcRatio = this.inventory.btc / totalValueBTC;
    const tokenRatio = (this.inventory.token * this.currentPrice) / totalValueBTC;
    
    const target = this.tokenConfig.inventoryTarget || { btc: 0.45, token: 0.55 };
    const maxSkew = this.tokenConfig.maxInventorySkew || 0.60;
    
    // Check if we need to rebalance (>10% off target)
    if (Math.abs(tokenRatio - target.token) > 0.10) {
      console.log(`[VolumeBot] Rebalance needed: token=${(tokenRatio*100).toFixed(1)}% vs target=${(target.token*100).toFixed(1)}%`);
      
      // TODO: Execute rebalance trade
      // For now just log
    }
  }
  
  checkVolumeReset() {
    const now = Date.now();
    const elapsed = now - this.metrics.lastVolumeReset;
    
    if (elapsed >= 24 * 60 * 60 * 1000) {
      this.metrics.volumeGenerated24h = 0;
      this.metrics.lastVolumeReset = now;
    }
  }
  
  calculatePnL() {
    if (!this.currentPrice || !this.startPrice) return;
    
    const currentValueBTC = this.inventory.btc + (this.inventory.token * this.currentPrice);
    this.metrics.netPnL = currentValueBTC - this.allocation;
    this.metrics.netPnLPercent = (this.metrics.netPnL / this.allocation) * 100;
  }
  
  async saveState() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      const state = {
        userAddress: this.userAddress,
        ticker: this.tokenConfig.ticker,
        allocation: this.allocation,
        inventory: this.inventory,
        metrics: this.metrics,
        positions: this.positions,
        startPrice: this.startPrice,
        currentPrice: this.currentPrice,
        running: this.running,
        paused: this.paused,
        pool: this.pool ? { _id: this.pool._id } : null,
        savedAt: Date.now()
      };
      
      const filename = `${this.userAddress}_${this.tokenConfig.ticker}.json`;
      await fs.writeFile(
        path.join(this.dataDir, filename),
        JSON.stringify(state, null, 2)
      );
      
    } catch (error) {
      console.error(`[VolumeBot] Save state error:`, error.message);
    }
  }
  
  async loadState() {
    try {
      const filename = `${this.userAddress}_${this.tokenConfig.ticker}.json`;
      const data = await fs.readFile(path.join(this.dataDir, filename), 'utf8');
      const state = JSON.parse(data);
      
      this.inventory = state.inventory;
      this.metrics = state.metrics;
      this.positions = state.positions;
      this.startPrice = state.startPrice;
      this.currentPrice = state.currentPrice;
      
      console.log(`[VolumeBot] Loaded state for ${this.tokenConfig.ticker}`);
      return true;
      
    } catch (error) {
      // No existing state
      return false;
    }
  }
  
  // Get current status for API
  getStatus() {
    const totalValueBTC = this.inventory.btc + (this.inventory.token * (this.currentPrice || 0));
    
    return {
      ticker: this.tokenConfig.ticker,
      running: this.running,
      paused: this.paused,
      allocation: this.allocation,
      currentValue: totalValueBTC,
      inventory: this.inventory,
      metrics: {
        volumeGenerated24h: this.metrics.volumeGenerated24h,
        volumeGeneratedTotal: this.metrics.volumeGenerated,
        netPnL: this.metrics.netPnL,
        netPnLPercent: this.metrics.netPnLPercent,
        tokenAppreciation: this.metrics.tokenAppreciation,
        trades: this.metrics.trades.length,
        uptime: Date.now() - this.metrics.startTime
      },
      positions: this.positions.length,
      startPrice: this.startPrice,
      currentPrice: this.currentPrice
    };
  }
}

module.exports = VolumeBot;
