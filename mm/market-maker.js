/**
 * RadFi Market Maker - Jane Street Inspired
 * True market making using concentrated liquidity as pseudo-limit orders
 * 
 * Token: RAD (RADTARDED•RAT)
 * TokenID: 907897:2259
 * Pool: 6978b8fe9af885cca3ad9617
 * TVL: $143k
 * 24h Volume: $425
 */

// ============================================
// 1. TICK/PRICE CONVERTER
// ============================================

class TickMath {
  // Uniswap v3 tick math constants
  static MIN_TICK = -887272;
  static MAX_TICK = 887272;
  static MIN_SQRT_RATIO = 4295128739n;
  static MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;

  /**
   * Convert price to tick
   * Price = (1.0001 ^ tick)
   * tick = log(price) / log(1.0001)
   */
  static priceToTick(price) {
    if (price <= 0) throw new Error('Price must be positive');
    const tick = Math.floor(Math.log(price) / Math.log(1.0001));
    return Math.max(this.MIN_TICK, Math.min(this.MAX_TICK, tick));
  }

  /**
   * Convert tick to price
   * Price = 1.0001 ^ tick
   */
  static tickToPrice(tick) {
    return Math.pow(1.0001, tick);
  }

  /**
   * Get nearest valid tick for tickSpacing
   * RadFi uses tickSpacing = 200
   */
  static nearestUsableTick(tick, tickSpacing = 200) {
    const rounded = Math.round(tick / tickSpacing) * tickSpacing;
    return Math.max(this.MIN_TICK, Math.min(this.MAX_TICK, rounded));
  }

  /**
   * Calculate tick range for a narrow "limit order"
   * Returns [lowerTick, upperTick] for a 0.01% wide range
   */
  static limitOrderRange(targetPrice, tickSpacing = 200) {
    const centerTick = this.priceToTick(targetPrice);
    const lowerTick = this.nearestUsableTick(centerTick, tickSpacing);
    const upperTick = this.nearestUsableTick(centerTick + tickSpacing, tickSpacing);
    return { lowerTick, upperTick };
  }
}

// ============================================
// 2. POSITION MANAGER
// ============================================

class PositionManager {
  constructor(tradingAddress, accessToken) {
    this.tradingAddress = tradingAddress;
    this.accessToken = accessToken;
    this.activePositions = [];
  }

  /**
   * Create a narrow-range liquidity position (pseudo-limit order)
   * @param {string} side - 'bid' or 'ask'
   * @param {number} price - Target execution price
   * @param {number} sizeBTC - Amount in BTC
   * @param {object} pool - Pool data
   */
  async createLimitOrder({ side, price, sizeBTC, pool }) {
    const { lowerTick, upperTick } = TickMath.limitOrderRange(price);

    // For bids: provide BTC (token0), receive tokens (token1)
    // For asks: provide tokens (token1), receive BTC (token0)
    const amount0 = side === 'bid' ? Math.floor(sizeBTC * 1e8) : 0;
    const amount1 = side === 'ask' ? Math.floor(sizeBTC / price * 100) : 0; // RAD has 2 decimals

    const txParams = {
      type: "provide-liquidity",
      params: {
        userAddress: this.tradingAddress,
        token0Id: "0:0", // BTC
        token1Id: "907897:2259", // RAD
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        upperTick: upperTick.toString(),
        lowerTick: lowerTick.toString(),
        feeRate: 10000, // 1%
        tickSpacing: 200,
        hookSeq: 0
      }
    };

    console.log(`[MM] Creating ${side} order at ${price} (${sizeBTC} BTC)`);
    console.log(`[MM] Tick range: [${lowerTick}, ${upperTick}]`);

    // In production: submit to RadFi API, sign with Xverse
    const position = {
      id: `pos-${Date.now()}-${side}`,
      side: side,
      targetPrice: price,
      sizeBTC: sizeBTC,
      lowerTick: lowerTick,
      upperTick: upperTick,
      status: 'open',
      createdAt: Date.now(),
      txParams: txParams
    };

    this.activePositions.push(position);
    return position;
  }

  /**
   * Cancel all active positions (withdraw liquidity)
   */
  async cancelAllPositions() {
    console.log(`[MM] Cancelling ${this.activePositions.length} positions`);
    
    for (const position of this.activePositions) {
      // In production: call RadFi withdraw-liquidity
      console.log(`[MM] Cancelling ${position.side} at ${position.targetPrice}`);
    }

    this.activePositions = [];
  }

  /**
   * Get all active positions
   */
  getActivePositions() {
    return this.activePositions;
  }
}

// ============================================
// 3. FILL MONITOR
// ============================================

class FillMonitor {
  constructor(poolId) {
    this.poolId = poolId;
    this.lastCheck = Date.now();
  }

  /**
   * Check if positions have been filled
   * A position is "filled" when price enters its tick range
   */
  async checkFills(positions, currentPrice) {
    const fills = [];

    for (const position of positions) {
      const lowerPrice = TickMath.tickToPrice(position.lowerTick);
      const upperPrice = TickMath.tickToPrice(position.upperTick);

      // Check if current price is in position's range
      const isInRange = currentPrice >= lowerPrice && currentPrice <= upperPrice;

      if (isInRange && position.status === 'open') {
        console.log(`[FillMonitor] Position filling: ${position.side} @ ${position.targetPrice}`);
        position.status = 'filling';
        fills.push(position);
      }

      // If price moved past range, position is fully filled
      if (position.side === 'bid' && currentPrice > upperPrice && position.status === 'filling') {
        console.log(`[FillMonitor] BUY FILLED: ${position.sizeBTC} BTC @ ${position.targetPrice}`);
        position.status = 'filled';
        position.filledAt = Date.now();
        fills.push(position);
      }

      if (position.side === 'ask' && currentPrice < lowerPrice && position.status === 'filling') {
        console.log(`[FillMonitor] SELL FILLED: ${position.sizeBTC} BTC @ ${position.targetPrice}`);
        position.status = 'filled';
        position.filledAt = Date.now();
        fills.push(position);
      }
    }

    return fills;
  }

  /**
   * Monitor swap events from RadFi API
   */
  async monitorSwaps() {
    // In production: fetch recent swaps from /api/histories
    // Track which swaps crossed our positions' price ranges
    return [];
  }
}

// ============================================
// 4. INVENTORY TRACKER
// ============================================

class InventoryTracker {
  constructor() {
    this.btc = 0;
    this.rad = 0;
    this.targetRatio = 0.5; // 50/50 in value
    this.trades = [];
  }

  /**
   * Update inventory after a fill
   */
  recordFill(position, fillPrice) {
    if (position.side === 'bid') {
      // Bought RAD with BTC
      this.btc -= position.sizeBTC;
      this.rad += position.sizeBTC / fillPrice * 100; // RAD has 2 decimals
      this.trades.push({
        type: 'buy',
        price: fillPrice,
        btcAmount: position.sizeBTC,
        radAmount: position.sizeBTC / fillPrice * 100,
        timestamp: Date.now()
      });
    } else if (position.side === 'ask') {
      // Sold RAD for BTC
      const radSold = position.sizeBTC / fillPrice * 100;
      this.btc += position.sizeBTC;
      this.rad -= radSold;
      this.trades.push({
        type: 'sell',
        price: fillPrice,
        btcAmount: position.sizeBTC,
        radAmount: radSold,
        timestamp: Date.now()
      });
    }

    console.log(`[Inventory] BTC: ${this.btc.toFixed(8)} | RAD: ${this.rad.toFixed(2)}`);
  }

  /**
   * Calculate current inventory imbalance
   * Positive = too much BTC, Negative = too much RAD
   */
  getImbalance(currentPrice) {
    const totalValueBTC = this.btc + (this.rad / 100 * currentPrice);
    if (totalValueBTC === 0) return 0;
    
    const btcPct = this.btc / totalValueBTC;
    return btcPct - this.targetRatio;
  }

  /**
   * Check if we need to rebalance
   */
  needsRebalance(currentPrice, threshold = 0.15) {
    return Math.abs(this.getImbalance(currentPrice)) > threshold;
  }

  /**
   * Get total portfolio value in BTC
   */
  getTotalValueBTC(currentPrice) {
    return this.btc + (this.rad / 100 * currentPrice);
  }

  /**
   * Initialize inventory with starting capital
   */
  init(btcAmount, currentPrice) {
    // Start 50/50
    this.btc = btcAmount / 2;
    this.rad = (btcAmount / 2) / currentPrice * 100;
    console.log(`[Inventory] Initialized with ${btcAmount} BTC @ ${currentPrice}`);
    console.log(`[Inventory] BTC: ${this.btc.toFixed(8)} | RAD: ${this.rad.toFixed(2)}`);
  }
}

// ============================================
// 5. SPREAD CALCULATOR
// ============================================

class SpreadCalculator {
  constructor() {
    this.baseSpreadBPS = 100; // 1% base spread (100 basis points)
    this.minSpreadBPS = 50;     // 0.5% minimum
    this.maxSpreadBPS = 200;    // 2% maximum
  }

  /**
   * Calculate optimal bid/ask spread based on:
   * - Inventory imbalance (Jane Street principle)
   * - Market volatility
   * - Pool volume
   */
  calculateSpread({ inventory, currentPrice, recentVolatility, poolVolume24h }) {
    let spreadBPS = this.baseSpreadBPS;

    // 1. Inventory adjustment (key Jane Street insight)
    const imbalance = inventory.getImbalance(currentPrice);
    
    if (imbalance > 0.1) {
      // Too much BTC - widen bid (buy less), tighten ask (sell more)
      spreadBPS *= 1.2;
    } else if (imbalance < -0.1) {
      // Too much RAD - tighten bid (buy more), widen ask (sell less)
      spreadBPS *= 1.2;
    }

    // 2. Volatility adjustment
    if (recentVolatility > 0.05) { // >5% recent price move
      spreadBPS *= 1.5; // Widen spread in volatile markets
    }

    // 3. Volume adjustment
    if (poolVolume24h < 100) { // Low volume (<$100/day)
      spreadBPS *= 1.3; // Widen spread for illiquid markets
    }

    // Clamp to min/max
    spreadBPS = Math.max(this.minSpreadBPS, Math.min(this.maxSpreadBPS, spreadBPS));

    return {
      spreadBPS: spreadBPS,
      bidSpread: spreadBPS / 2,
      askSpread: spreadBPS / 2
    };
  }

  /**
   * Calculate bid and ask prices
   */
  getQuotes({ currentPrice, spread, inventory }) {
    const imbalance = inventory.getImbalance(currentPrice);

    let bidSpread = spread.bidSpread;
    let askSpread = spread.askSpread;

    // Skew quotes based on inventory
    if (imbalance > 0.1) {
      // Too much BTC - aggressive ask, passive bid
      askSpread *= 0.8;
      bidSpread *= 1.2;
    } else if (imbalance < -0.1) {
      // Too much RAD - aggressive bid, passive ask
      bidSpread *= 0.8;
      askSpread *= 1.2;
    }

    const bidPrice = currentPrice * (1 - bidSpread / 10000);
    const askPrice = currentPrice * (1 + askSpread / 10000);

    return {
      bid: bidPrice,
      ask: askPrice,
      mid: currentPrice,
      spread: askPrice - bidPrice,
      spreadBPS: (askPrice - bidPrice) / currentPrice * 10000
    };
  }
}

// ============================================
// 6. MAIN ORCHESTRATION LOOP
// ============================================

class MarketMaker {
  constructor({ tradingAddress, accessToken, initialCapitalBTC }) {
    this.positionManager = new PositionManager(tradingAddress, accessToken);
    this.fillMonitor = new FillMonitor('6978b8fe9af885cca3ad9617');
    this.inventory = new InventoryTracker();
    this.spreadCalc = new SpreadCalculator();
    
    this.config = {
      poolId: '6978b8fe9af885cca3ad9617',
      tokenId: '907897:2259',
      updateFrequency: 10000, // 10 seconds
      orderSizeBTC: 0.0001,    // 0.0001 BTC per order (~$7.86)
      maxPositions: 10,
      riskLimits: {
        maxLoss: -0.1,          // -10% max loss
        maxInventorySkew: 0.2,  // 20% max imbalance
        minPoolTVL: 10000       // $10k minimum TVL
      }
    };

    this.initialCapital = initialCapitalBTC;
    this.running = false;
    this.pnl = {
      realized: 0,
      unrealized: 0,
      fees: 0,
      trades: 0
    };
  }

  /**
   * Initialize market maker
   */
  async init(currentPrice) {
    console.log('='.repeat(60));
    console.log('  RadFi Market Maker - Jane Street Strategy');
    console.log('='.repeat(60));
    console.log(`Token: RAD (907897:2259)`);
    console.log(`Pool: 6978b8fe9af885cca3ad9617`);
    console.log(`Capital: ${this.initialCapital} BTC`);
    console.log(`Current Price: ${currentPrice.toFixed(8)} BTC/RAD`);
    console.log('='.repeat(60));

    this.inventory.init(this.initialCapital, currentPrice);
  }

  /**
   * Main market making loop
   */
  async run() {
    this.running = true;

    while (this.running) {
      try {
        // 1. Get current market price
        const pool = await this.fetchPool();
        const currentPrice = this.calculatePrice(pool);

        // 2. Check for fills
        const fills = await this.fillMonitor.checkFills(
          this.positionManager.getActivePositions(),
          currentPrice
        );

        // Update inventory for fills
        for (const fill of fills) {
          if (fill.status === 'filled') {
            this.inventory.recordFill(fill, currentPrice);
            this.pnl.trades++;
            
            // Calculate realized PnL
            const spreadCapture = fill.side === 'bid' 
              ? (currentPrice - fill.targetPrice) * fill.sizeBTC / fill.targetPrice
              : (fill.targetPrice - currentPrice) * fill.sizeBTC / currentPrice;
            this.pnl.realized += spreadCapture;
          }
        }

        // 3. Check inventory skew
        if (this.inventory.needsRebalance(currentPrice)) {
          console.log('[MM] ⚠️  Inventory skewed, rebalancing needed');
          await this.rebalance(currentPrice);
        }

        // 4. Cancel old positions
        await this.positionManager.cancelAllPositions();

        // 5. Calculate new spread
        const spread = this.spreadCalc.calculateSpread({
          inventory: this.inventory,
          currentPrice: currentPrice,
          recentVolatility: 0.03, // TODO: calculate from recent swaps
          poolVolume24h: pool.volume24h
        });

        // 6. Get new quotes
        const quotes = this.spreadCalc.getQuotes({
          currentPrice: currentPrice,
          spread: spread,
          inventory: this.inventory
        });

        console.log(`[MM] Quotes: Bid ${quotes.bid.toFixed(8)} | Ask ${quotes.ask.toFixed(8)} | Spread ${quotes.spreadBPS.toFixed(0)}bps`);

        // 7. Place new orders
        await this.positionManager.createLimitOrder({
          side: 'bid',
          price: quotes.bid,
          sizeBTC: this.config.orderSizeBTC,
          pool: pool
        });

        await this.positionManager.createLimitOrder({
          side: 'ask',
          price: quotes.ask,
          sizeBTC: this.config.orderSizeBTC,
          pool: pool
        });

        // 8. Calculate unrealized PnL
        const currentValue = this.inventory.getTotalValueBTC(currentPrice);
        this.pnl.unrealized = currentValue - this.initialCapital;

        // 9. Risk check
        const totalPnL = this.pnl.realized + this.pnl.unrealized;
        if (totalPnL / this.initialCapital < this.config.riskLimits.maxLoss) {
          console.log('[MM] ⛔ STOP LOSS HIT! Shutting down...');
          await this.shutdown();
          break;
        }

        // 10. Status update
        this.printStatus(currentPrice);

        // 11. Wait for next update
        await this.sleep(this.config.updateFrequency);

      } catch (error) {
        console.error('[MM] Error in main loop:', error);
        await this.sleep(5000);
      }
    }
  }

  /**
   * Rebalance inventory via swaps
   */
  async rebalance(currentPrice) {
    const imbalance = this.inventory.getImbalance(currentPrice);
    
    if (Math.abs(imbalance) > this.config.riskLimits.maxInventorySkew) {
      console.log(`[MM] 🔄 Rebalancing: ${(imbalance * 100).toFixed(1)}% skew`);
      
      // In production: execute swap via RadFi API
      // For now: just log
      const swapAmount = this.inventory.getTotalValueBTC(currentPrice) * Math.abs(imbalance) / 2;
      
      if (imbalance > 0) {
        console.log(`[MM] Swapping ${swapAmount.toFixed(8)} BTC → RAD`);
      } else {
        console.log(`[MM] Swapping ${(swapAmount / currentPrice * 100).toFixed(2)} RAD → BTC`);
      }
    }
  }

  /**
   * Fetch pool data
   */
  async fetchPool() {
    // In production: fetch from RadFi API
    // For backtest: return mock data
    return {
      volume24h: 425.69,
      tvl: 143320.55,
      token0Reserve: 1.8222, // BTC
      token1Reserve: 42500000 // RAD (with 2 decimals)
    };
  }

  /**
   * Calculate current price from pool reserves
   */
  calculatePrice(pool) {
    // Price = BTC reserve / RAD reserve (accounting for decimals)
    return pool.token0Reserve / (pool.token1Reserve / 100);
  }

  /**
   * Print status
   */
  printStatus(currentPrice) {
    const totalValue = this.inventory.getTotalValueBTC(currentPrice);
    const totalPnL = this.pnl.realized + this.pnl.unrealized;
    const pnlPct = (totalPnL / this.initialCapital) * 100;

    console.log('─'.repeat(60));
    console.log(`Price: ${currentPrice.toFixed(8)} | Value: ${totalValue.toFixed(8)} BTC`);
    console.log(`Inventory: ${this.inventory.btc.toFixed(8)} BTC | ${this.inventory.rad.toFixed(2)} RAD`);
    console.log(`PnL: ${totalPnL.toFixed(8)} BTC (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%) | Trades: ${this.pnl.trades}`);
    console.log(`Realized: ${this.pnl.realized.toFixed(8)} | Unrealized: ${this.pnl.unrealized.toFixed(8)}`);
    console.log('─'.repeat(60));
  }

  /**
   * Shutdown and withdraw all positions
   */
  async shutdown() {
    console.log('[MM] Shutting down market maker...');
    this.running = false;
    await this.positionManager.cancelAllPositions();
    console.log('[MM] All positions closed');
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
  TickMath,
  PositionManager,
  FillMonitor,
  InventoryTracker,
  SpreadCalculator,
  MarketMaker
};
