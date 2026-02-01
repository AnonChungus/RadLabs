/**
 * RadFi Market Maker - Production Orchestrator
 * 
 * Handles:
 * - User deposits → auto-start MM
 * - Position tracking across multiple users
 * - Performance metrics & reporting
 * - Backend state management
 * - UI data endpoints
 */

const { MarketMaker } = require('./market-maker.js');
const { TOKENS, MM_CONFIG, POSITION_STATES, METRICS } = require('./production-config.js');
const fs = require('fs');
const path = require('path');

// ============================================
// USER POSITION MANAGER
// ============================================

class UserPositionManager {
  constructor() {
    this.userPositions = new Map(); // userAddress → UserPosition
    this.activeMarketMakers = new Map(); // userAddress → MarketMaker[]
    this.dataDir = path.join(__dirname, '../data/mm');
    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * User deposits funds → start market making
   */
  async createPosition({
    userAddress,
    tradingAddress,
    accessToken,
    depositBTC,
    tokens = ['RAD', 'BOTT'] // Default to both tokens
  }) {
    console.log(`[Orchestrator] Creating position for ${userAddress}`);
    console.log(`[Orchestrator] Deposit: ${depositBTC} BTC`);
    console.log(`[Orchestrator] Tokens: ${tokens.join(', ')}`);

    // Validate minimum deposit
    const minDeposit = 0.00127; // $100 at $78,593/BTC
    if (depositBTC < minDeposit) {
      throw new Error(`Minimum deposit is ${minDeposit} BTC ($100)`);
    }

    // Create user position record
    const userPosition = {
      userAddress,
      tradingAddress,
      depositBTC,
      depositUSD: depositBTC * 78593, // TODO: fetch real BTC price
      createdAt: Date.now(),
      status: 'active',
      tokens: tokens,
      
      // Performance tracking
      currentValueBTC: depositBTC,
      currentValueUSD: depositBTC * 78593,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalTrades: 0,
      
      // Allocations per token
      allocations: {}
    };

    // Split capital across tokens
    const capitalPerToken = depositBTC / tokens.length;
    
    for (const token of tokens) {
      userPosition.allocations[token] = {
        allocatedBTC: capitalPerToken,
        currentValueBTC: capitalPerToken,
        trades: 0,
        pnl: 0
      };
    }

    // Save to storage
    this.userPositions.set(userAddress, userPosition);
    this.savePositionToDisk(userAddress, userPosition);

    // Start market makers for each token
    const marketMakers = [];
    
    for (const token of tokens) {
      const mm = await this.startMarketMaker({
        userAddress,
        tradingAddress,
        accessToken,
        token,
        capitalBTC: capitalPerToken
      });
      
      marketMakers.push(mm);
    }

    this.activeMarketMakers.set(userAddress, marketMakers);

    console.log(`[Orchestrator] ✅ Position created for ${userAddress}`);
    console.log(`[Orchestrator] Running ${marketMakers.length} market makers`);

    return {
      positionId: userAddress,
      userPosition,
      marketMakers: marketMakers.length
    };
  }

  /**
   * Start a market maker for a specific token
   */
  async startMarketMaker({ userAddress, tradingAddress, accessToken, token, capitalBTC }) {
    const tokenConfig = TOKENS[token];
    
    if (!tokenConfig) {
      throw new Error(`Unknown token: ${token}`);
    }

    console.log(`[Orchestrator] Starting ${token} market maker for ${userAddress}`);
    console.log(`[Orchestrator] Capital: ${capitalBTC} BTC`);

    const mm = new MarketMaker({
      tradingAddress,
      accessToken,
      initialCapitalBTC: capitalBTC
    });

    // Override config with token-specific settings
    mm.config.orderSizeBTC = tokenConfig.orderSizeBTC;
    mm.config.poolId = tokenConfig.poolId;
    mm.config.tokenId = tokenConfig.tokenId;
    mm.config.updateFrequency = MM_CONFIG.updateFrequencyMs;

    // Store metadata
    mm.metadata = {
      userAddress,
      token,
      startedAt: Date.now()
    };

    // Initialize with current price
    const currentPrice = tokenConfig.price;
    await mm.init(currentPrice);

    // Start the MM loop (non-blocking)
    mm.run().catch(err => {
      console.error(`[Orchestrator] MM error for ${userAddress}/${token}:`, err);
      this.handleMarketMakerError(userAddress, token, err);
    });

    return mm;
  }

  /**
   * Get user's current position status
   */
  getUserPosition(userAddress) {
    const position = this.userPositions.get(userAddress);
    
    if (!position) {
      return null;
    }

    // Aggregate current state from active MMs
    const mms = this.activeMarketMakers.get(userAddress) || [];
    
    let totalValueBTC = 0;
    let totalRealizedPnL = 0;
    let totalUnrealizedPnL = 0;
    let totalTrades = 0;

    for (const mm of mms) {
      const token = mm.metadata.token;
      const tokenConfig = TOKENS[token];
      const currentPrice = tokenConfig.price;
      
      const mmValue = mm.inventory.getTotalValueBTC(currentPrice);
      totalValueBTC += mmValue;
      totalRealizedPnL += mm.pnl.realized;
      totalUnrealizedPnL += mm.pnl.unrealized;
      totalTrades += mm.pnl.trades;

      // Update per-token allocation
      position.allocations[token].currentValueBTC = mmValue;
      position.allocations[token].trades = mm.pnl.trades;
      position.allocations[token].pnl = mm.pnl.realized + mm.pnl.unrealized;
    }

    // Update position
    position.currentValueBTC = totalValueBTC;
    position.currentValueUSD = totalValueBTC * 78593;
    position.realizedPnL = totalRealizedPnL;
    position.unrealizedPnL = totalUnrealizedPnL;
    position.totalTrades = totalTrades;
    position.totalPnL = totalRealizedPnL + totalUnrealizedPnL;
    position.returnPct = (position.totalPnL / position.depositBTC) * 100;

    // Calculate APY
    const daysActive = (Date.now() - position.createdAt) / (1000 * 60 * 60 * 24);
    if (daysActive > 0) {
      const totalReturn = position.totalPnL / position.depositBTC;
      position.apy = (Math.pow(1 + totalReturn, 365 / daysActive) - 1) * 100;
    } else {
      position.apy = 0;
    }

    // Save updated position
    this.savePositionToDisk(userAddress, position);

    return position;
  }

  /**
   * Get all active positions (for monitoring)
   */
  getAllPositions() {
    const positions = [];
    
    for (const [userAddress, position] of this.userPositions) {
      positions.push(this.getUserPosition(userAddress));
    }

    return positions;
  }

  /**
   * Stop market making for a user
   */
  async stopPosition(userAddress) {
    console.log(`[Orchestrator] Stopping position for ${userAddress}`);

    const mms = this.activeMarketMakers.get(userAddress) || [];
    
    for (const mm of mms) {
      await mm.shutdown();
    }

    this.activeMarketMakers.delete(userAddress);

    const position = this.userPositions.get(userAddress);
    if (position) {
      position.status = 'stopped';
      position.stoppedAt = Date.now();
      this.savePositionToDisk(userAddress, position);
    }

    console.log(`[Orchestrator] ✅ Position stopped for ${userAddress}`);
  }

  /**
   * Handle MM errors
   */
  handleMarketMakerError(userAddress, token, error) {
    console.error(`[Orchestrator] ⚠️ MM error: ${userAddress}/${token}`, error.message);

    // TODO: Notify user
    // TODO: Attempt restart if recoverable
    // TODO: Log to error tracking system
  }

  /**
   * Save position to disk (persistence)
   */
  savePositionToDisk(userAddress, position) {
    const filePath = path.join(this.dataDir, `${userAddress}.json`);
    fs.writeFileSync(filePath, JSON.stringify(position, null, 2));
  }

  /**
   * Load position from disk
   */
  loadPositionFromDisk(userAddress) {
    const filePath = path.join(this.dataDir, `${userAddress}.json`);
    
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    
    return null;
  }

  /**
   * Restore all positions on restart
   */
  async restoreAllPositions() {
    console.log('[Orchestrator] Restoring positions from disk...');

    const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const userAddress = file.replace('.json', '');
      const position = this.loadPositionFromDisk(userAddress);
      
      if (position && position.status === 'active') {
        console.log(`[Orchestrator] Restoring position: ${userAddress}`);
        
        // TODO: Restore market makers
        // This requires stored accessToken (security consideration!)
        
        this.userPositions.set(userAddress, position);
      }
    }

    console.log(`[Orchestrator] Restored ${this.userPositions.size} positions`);
  }
}

// ============================================
// GLOBAL ORCHESTRATOR INSTANCE
// ============================================

const orchestrator = new UserPositionManager();

// ============================================
// API ENDPOINTS (for backend server)
// ============================================

const API = {
  /**
   * POST /mm/deposit
   * User deposits funds → start MM
   */
  async deposit(req) {
    const { userAddress, tradingAddress, accessToken, depositBTC, tokens } = req.body;

    try {
      const result = await orchestrator.createPosition({
        userAddress,
        tradingAddress,
        accessToken,
        depositBTC,
        tokens
      });

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * GET /mm/position/:userAddress
   * Get user's current position & performance
   */
  async getPosition(req) {
    const { userAddress } = req.params;

    const position = orchestrator.getUserPosition(userAddress);

    if (!position) {
      return {
        success: false,
        error: 'Position not found'
      };
    }

    return {
      success: true,
      data: position
    };
  },

  /**
   * GET /mm/positions
   * Get all active positions (admin view)
   */
  async getAllPositions(req) {
    const positions = orchestrator.getAllPositions();

    return {
      success: true,
      data: positions,
      count: positions.length
    };
  },

  /**
   * POST /mm/withdraw/:userAddress
   * Stop MM and return funds
   */
  async withdraw(req) {
    const { userAddress } = req.params;

    try {
      await orchestrator.stopPosition(userAddress);

      return {
        success: true,
        message: 'Market making stopped. Withdrawing funds...'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * GET /mm/metrics
   * Global performance metrics
   */
  async getMetrics(req) {
    const positions = orchestrator.getAllPositions();

    let totalDeposits = 0;
    let totalValue = 0;
    let totalTrades = 0;
    let totalPnL = 0;

    for (const position of positions) {
      totalDeposits += position.depositBTC;
      totalValue += position.currentValueBTC;
      totalTrades += position.totalTrades;
      totalPnL += position.totalPnL;
    }

    return {
      success: true,
      data: {
        totalPositions: positions.length,
        totalDepositsBTC: totalDeposits,
        totalValueBTC: totalValue,
        totalTrades: totalTrades,
        totalPnLBTC: totalPnL,
        avgAPY: positions.reduce((sum, p) => sum + p.apy, 0) / Math.max(positions.length, 1)
      }
    };
  }
};

// ============================================
// MONITORING LOOP
// ============================================

async function startMonitoring() {
  console.log('[Orchestrator] Starting monitoring loop...');

  setInterval(async () => {
    try {
      const positions = orchestrator.getAllPositions();

      console.log('\n' + '='.repeat(60));
      console.log(`  Active Positions: ${positions.length}`);
      console.log('='.repeat(60));

      for (const position of positions) {
        const pnlSign = position.totalPnL >= 0 ? '+' : '';
        console.log(`${position.userAddress.slice(0, 10)}... | ` +
                    `Value: ${position.currentValueBTC.toFixed(8)} BTC | ` +
                    `PnL: ${pnlSign}${position.totalPnL.toFixed(8)} BTC (${pnlSign}${position.returnPct.toFixed(2)}%) | ` +
                    `Trades: ${position.totalTrades} | ` +
                    `APY: ${position.apy.toFixed(1)}%`);
      }

      console.log('='.repeat(60) + '\n');

    } catch (error) {
      console.error('[Orchestrator] Monitoring error:', error);
    }
  }, MM_CONFIG.reportingInterval); // Every hour
}

// ============================================
// EXPORT
// ============================================

module.exports = {
  UserPositionManager,
  orchestrator,
  API,
  startMonitoring
};

// Start monitoring if run directly
if (require.main === module) {
  orchestrator.restoreAllPositions().then(() => {
    startMonitoring();
    console.log('[Orchestrator] Ready to accept deposits');
  });
}
