/**
 * RadFi Market Maker - Production Configuration
 * 
 * REALITY CHECK:
 * - RadFi has EXTREMELY low volume ($400-500/day)
 * - Any trade >$50 moves price significantly
 * - Need WIDE spreads to be profitable
 * - Small order sizes to avoid moving market
 */

const TOKENS = {
  RAD: {
    tokenId: '907897:2259',
    poolId: '6978b8fe9af885cca3ad9617',
    ticker: 'RAD',
    decimals: 2,
    
    // Market data (Feb 1, 2026)
    marketCap: 337749,        // $337k
    volume24h: 426,           // $426/day (TINY!)
    volumeRatio: 0.0013,      // 0.13% of mcap
    price: 0.00033775,        // $0.000338
    
    // Spread strategy
    baseSpreadBPS: 500,       // 5% base spread (was 100 bps - WAY too tight!)
    minSpreadBPS: 300,        // 3% minimum
    maxSpreadBPS: 1000,       // 10% maximum
    
    // Order sizing
    orderSizeBTC: 0.00001,    // $0.79 per order (TINY to avoid moving market)
    maxOrderSizeBTC: 0.0001,  // $7.86 max
    
    // Risk limits
    maxPositionBTC: 0.01,     // $786 max exposure per token
    volatilityEstimate: 0.25   // 25% daily volatility (thin orderbook)
  },
  
  BOTT: {
    tokenId: '911892:685',
    poolId: null,  // TODO: fetch from API
    ticker: 'BOTT',
    decimals: 2,
    
    // Market data
    marketCap: 2199342,       // $2.2M
    volume24h: 474,           // $474/day (EVEN WORSE ratio!)
    volumeRatio: 0.0002,      // 0.02% of mcap
    price: 0.002199342,       // $0.0022
    
    // Spread strategy - WIDER because worse liquidity
    baseSpreadBPS: 700,       // 7% base spread
    minSpreadBPS: 400,        // 4% minimum
    maxSpreadBPS: 1500,       // 15% maximum
    
    // Order sizing
    orderSizeBTC: 0.000005,   // $0.39 per order (SUPER tiny)
    maxOrderSizeBTC: 0.00005, // $3.93 max
    
    // Risk limits
    maxPositionBTC: 0.005,    // $393 max exposure
    volatilityEstimate: 0.30   // 30% daily volatility
  }
};

// Global MM settings
const MM_CONFIG = {
  // Update frequency
  updateFrequencyMs: 30000,   // 30 seconds (slower = cheaper tx fees)
  
  // Position management
  maxActivePositions: 4,       // 2 per token (1 bid, 1 ask)
  
  // Risk management
  globalStopLoss: -0.15,       // -15% portfolio loss → shutdown
  maxInventorySkew: 0.25,      // 25% imbalance before rebalance
  rebalanceThreshold: 0.20,    // 20% skew triggers rebalance
  
  // Fee estimation
  btcTxFee: 0.00001,          // ~$0.79 per Bitcoin tx
  expectedFillRate: 0.01,      // 1% chance of fill per update (pessimistic!)
  
  // Performance tracking
  minTradesForAPY: 5,          // Need 5+ trades for reliable APY calc
  reportingInterval: 3600000   // Report every hour
};

// Spread adjustment factors
const SPREAD_ADJUSTMENTS = {
  // Inventory bias (Jane Street core principle)
  inventorySkew: {
    low: 0.10,      // <10% skew: normal spread
    medium: 0.20,   // 10-20% skew: widen spread 20%
    high: 0.30      // >20% skew: widen spread 50%
  },
  
  // Volume adjustments
  volumeMultipliers: {
    veryLow: 1.5,   // <$200/day: 1.5x wider
    low: 1.2,       // $200-500/day: 1.2x wider  
    medium: 1.0,    // $500-1000/day: normal
    high: 0.8       // >$1000/day: 0.8x tighter
  },
  
  // Volatility adjustments
  volatilityMultipliers: {
    low: 0.8,       // <10% vol: tighten 20%
    medium: 1.0,    // 10-20% vol: normal
    high: 1.3,      // 20-30% vol: widen 30%
    extreme: 1.8    // >30% vol: widen 80%
  }
};

// Expected performance (realistic for RadFi)
const EXPECTED_PERFORMANCE = {
  RAD: {
    tradesPerDay: 0.1,        // 1 trade every 10 days (low volume!)
    avgSpreadCaptureBPS: 300, // 3% avg spread
    estimatedAPY: 15,         // 15% APY (conservative)
    maxDrawdown: 10           // 10% expected max DD
  },
  
  BOTT: {
    tradesPerDay: 0.05,       // 1 trade every 20 days
    avgSpreadCaptureBPS: 400, // 4% avg spread  
    estimatedAPY: 12,         // 12% APY (even more conservative)
    maxDrawdown: 15           // 15% expected max DD
  },
  
  portfolio: {
    estimatedAPY: 13.5,       // Combined 13.5% APY
    sharpeRatio: 0.5,         // Low Sharpe (high vol, low return)
    maxDrawdown: 12           // 12% max DD
  }
};

// Position lifecycle states
const POSITION_STATES = {
  PENDING: 'pending',           // Created, not yet on-chain
  OPEN: 'open',                 // Active on-chain, waiting for fill
  PARTIAL: 'partial',           // Partially filled
  FILLED: 'filled',             // Fully filled
  CANCELLED: 'cancelled',       // Manually cancelled
  EXPIRED: 'expired',           // Timeout (no fill after 24h)
  FAILED: 'failed'              // Transaction failed
};

// Performance metrics tracked
const METRICS = {
  // Portfolio level
  totalValueBTC: 0,
  totalValueUSD: 0,
  realizedPnL: 0,
  unrealizedPnL: 0,
  totalPnL: 0,
  apy: 0,
  sharpeRatio: 0,
  maxDrawdown: 0,
  
  // Trading stats
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  winRate: 0,
  avgTradeSize: 0,
  
  // Token breakdown
  byToken: {
    RAD: { trades: 0, pnl: 0, fills: 0 },
    BOTT: { trades: 0, pnl: 0, fills: 0 }
  },
  
  // Fees
  totalFeesPaid: 0,
  totalFeesEarned: 0,
  netFees: 0
};

module.exports = {
  TOKENS,
  MM_CONFIG,
  SPREAD_ADJUSTMENTS,
  EXPECTED_PERFORMANCE,
  POSITION_STATES,
  METRICS
};
