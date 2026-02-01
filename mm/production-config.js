/**
 * RadLabs Volume Bot - Production Configuration
 * 
 * STRATEGY: Volume Generation + Token Appreciation
 * 
 * Core Philosophy:
 * - Generate trading volume to increase token visibility
 * - Capture token price appreciation (main profit source)
 * - Earn pool fee rebates as secondary income
 * - Maintain slight bullish bias (hold more token than BTC)
 * 
 * REALITY CHECK:
 * - RadFi has EXTREMELY low volume ($400-500/day)
 * - Any trade >$50 moves price significantly
 * - Need WIDE spreads (5-10%) to be profitable
 * - Small order sizes to avoid moving market
 * - Profitability DEPENDS on token price appreciation
 * - RadFi L2 fees: 1% swap fee (NOT Bitcoin L1 fees!)
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
    
    // Bullish bias (Volume Bot specific)
    bullishBias: 0.15,        // +15% bias: Small mcap + our volume impact
    inventoryTarget: {
      btc: 0.425,             // 42.5% BTC (slightly underweight)
      token: 0.575            // 57.5% token (slightly overweight to capture appreciation)
    },
    expectedAppreciation30d: 0.18,  // +18% expected token appreciation in 30 days
    
    // Spread strategy
    baseSpreadBPS: 500,       // 5% base spread (was 100 bps - WAY too tight!)
    minSpreadBPS: 300,        // 3% minimum
    maxSpreadBPS: 1000,       // 10% maximum
    
    // Order sizing (ladder approach)
    orderSizeBTC: 0.00001,    // $0.79 per order (TINY to avoid moving market)
    maxOrderSizeBTC: 0.0001,  // $7.86 max
    ladderLevels: 5,          // 5 orders per side
    
    // Volume generation
    volumeTarget24h: 850,     // Target $850/day volume (2x current)
    pingPongEnabled: true,    // Execute reverse trades to generate more volume
    reverseTradeRatio: 0.5,   // Reverse 50% of fills
    
    // Risk limits
    maxPositionBTC: 0.01,     // $786 max exposure per token
    maxInventorySkew: 0.60,   // Max 60/40 imbalance (was 50/50 neutral)
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
    
    // Bullish bias (smaller than RAD - larger mcap)
    bullishBias: 0.10,        // +10% bias (less potential due to larger mcap)
    inventoryTarget: {
      btc: 0.45,              // 45% BTC
      token: 0.55             // 55% token
    },
    expectedAppreciation30d: 0.12,  // +12% expected token appreciation
    
    // Spread strategy - WIDER because worse liquidity
    baseSpreadBPS: 700,       // 7% base spread
    minSpreadBPS: 400,        // 4% minimum
    maxSpreadBPS: 1500,       // 15% maximum
    
    // Order sizing (ladder approach)
    orderSizeBTC: 0.000005,   // $0.39 per order (SUPER tiny)
    maxOrderSizeBTC: 0.00005, // $3.93 max
    ladderLevels: 5,          // 5 orders per side
    
    // Volume generation
    volumeTarget24h: 950,     // Target $950/day volume (2x current)
    pingPongEnabled: true,
    reverseTradeRatio: 0.5,
    
    // Risk limits
    maxPositionBTC: 0.005,    // $393 max exposure
    maxInventorySkew: 0.55,   // Max 55/45 imbalance (less aggressive than RAD)
    volatilityEstimate: 0.30   // 30% daily volatility
  }
};

// Global Volume Bot settings
const MM_CONFIG = {
  // Update frequency
  updateFrequencyMs: 30000,   // 30 seconds (balance between responsiveness and costs)
  
  // Position management (ladder orders)
  maxActivePositions: 10,      // 5 ladder orders per side
  ladderSpacing: 0.01,         // 1% spacing between ladder orders
  
  // Risk management
  globalStopLoss: -0.15,       // -15% portfolio loss → shutdown
  maxInventorySkew: 0.60,      // 60/40 max (bullish bias allows more skew)
  rebalanceThreshold: 0.10,    // 10% off target triggers rebalance
  
  // Fee structure (RadFi L2 - NOT Bitcoin L1!)
  radfiFeeRate: 0.01,          // 1% swap fee on RadFi
  platformFeeRate: 0.10,       // 10% of profitable fees
  expectedFillRate: 0.01,      // 1% chance of fill per update (pessimistic!)
  
  // Volume generation targets
  volumeBoostFactor: 2.0,      // Target 2x current market volume
  timeBasedActivity: {
    usMarketHours: 0.7,        // 70% of volume during US hours (9am-4pm EST)
    offHours: 0.3              // 30% of volume overnight
  },
  
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

// Expected performance (Volume Bot with token appreciation)
const EXPECTED_PERFORMANCE = {
  RAD: {
    // Trading stats
    tradesPerDay: 0.8,        // ~1 trade every 1.25 days (ladder orders + ping-pong)
    avgSpreadCaptureBPS: 300, // 3% avg spread capture
    volumeGenerated24h: 850,  // $850/day target volume
    
    // Revenue breakdown (per $1000 deposit, 30 days)
    tokenAppreciation: 90,    // $90 from +18% token price growth (MAIN SOURCE)
    poolFeeRebates: 8,        // $8 from LP fee earnings
    spreadCapture: 3,         // $3 from spread
    tradingFeesPaid: -26,     // -$26 from RadFi 1% swap fees
    netProfit: 75,            // $75 total (+7.5% monthly)
    
    estimatedAPY: 18,         // 18% APY (user-facing: 90% of 20%)
    realAPY: 20,              // 20% actual (platform keeps 10%)
    breakEvenAppreciation: 0.043,  // Need +4.3% token growth to break even
    maxDrawdown: 10           // 10% expected max DD
  },
  
  BOTT: {
    // Trading stats
    tradesPerDay: 0.5,        // ~1 trade every 2 days
    avgSpreadCaptureBPS: 400, // 4% avg spread  
    volumeGenerated24h: 950,  // $950/day target volume
    
    // Revenue breakdown (per $1000 deposit, 30 days)
    tokenAppreciation: 60,    // $60 from +12% token price growth
    poolFeeRebates: 6,        // $6 from LP fees
    spreadCapture: 2,         // $2 from spread
    tradingFeesPaid: -28,     // -$28 from RadFi fees
    netProfit: 40,            // $40 total (+4% monthly)
    
    estimatedAPY: 12,         // 12% APY (user-facing)
    realAPY: 13.3,            // 13.3% actual
    breakEvenAppreciation: 0.047,  // Need +4.7% token growth to break even
    maxDrawdown: 15           // 15% expected max DD
  },
  
  portfolio: {
    estimatedAPY: 15,         // Combined 15% APY (shown to users)
    realAPY: 16.7,            // 16.7% actual (platform earns 1.7%)
    volumeGenerated24h: 1800, // $1.8k/day total volume
    sharpeRatio: 0.6,         // Moderate Sharpe
    maxDrawdown: 12,          // 12% max DD
    
    // Critical dependency
    dependsOnAppreciation: true,
    minAppreciationRequired: 0.045,  // Need +4.5% avg token growth
    riskDisclosure: 'Profitability requires token price appreciation. You are bullish on selected tokens.'
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

// Performance metrics tracked (Volume Bot specific)
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
  
  // Volume generation (Volume Bot specific!)
  volumeGenerated24h: 0,
  volumeGeneratedTotal: 0,
  volumeTarget24h: 0,
  volumeTargetProgress: 0,     // % of daily target achieved
  
  // Token appreciation tracking
  tokenPriceStart: {},         // Initial token prices
  tokenPriceCurrent: {},       // Current token prices
  tokenAppreciation: {},       // % change per token
  appreciationPnL: 0,          // P&L from token price changes
  
  // Revenue breakdown
  spreadCapturePnL: 0,         // P&L from spread capture
  poolFeeRebates: 0,           // Earnings from LP fee rebates
  tradingFeesPaid: 0,          // RadFi 1% swap fees paid
  platformFeesOwed: 0,         // 10% of profits owed to platform
  
  // Inventory tracking
  inventoryBTC: 0,
  inventoryTokens: {},         // { RAD: 1000, BOTT: 500 }
  inventoryRatio: 0,           // Current BTC/Token ratio
  inventoryTarget: 0,          // Target BTC/Token ratio
  inventorySkew: 0,            // Deviation from target
  
  // Token breakdown
  byToken: {
    RAD: { 
      trades: 0, 
      pnl: 0, 
      fills: 0, 
      volumeGenerated: 0,
      appreciation: 0,
      inventoryBTC: 0,
      inventoryToken: 0
    },
    BOTT: { 
      trades: 0, 
      pnl: 0, 
      fills: 0,
      volumeGenerated: 0,
      appreciation: 0,
      inventoryBTC: 0,
      inventoryToken: 0
    }
  },
  
  // Fees (RadFi L2, not Bitcoin L1!)
  radfiFeesPaid: 0,            // 1% swap fees to RadFi
  poolFeesEarned: 0,           // LP fees earned back
  netFees: 0                   // poolFeesEarned - radfiFeesPaid
};

module.exports = {
  TOKENS,
  MM_CONFIG,
  SPREAD_ADJUSTMENTS,
  EXPECTED_PERFORMANCE,
  POSITION_STATES,
  METRICS
};
