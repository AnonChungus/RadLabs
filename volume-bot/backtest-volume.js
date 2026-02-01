/**
 * Volume Bot Backtest
 * Test: How much volume can $1000 generate over 30 days?
 */

const { VolumeTrader, PriceTracker } = require('./volume-trader.js');

// ============================================
// BACKTEST CONFIGURATION
// ============================================

const BACKTEST_CONFIG = {
  token: 'RAD',
  capitalBTC: 0.0127,           // $1000 at $78,593/BTC
  startPrice: 0.00033775,       // RAD price
  days: 30,
  priceVolatility: 0.05,        // 5% daily volatility
  
  // Trading params
  volumeTradeSize: 0.0001,      // $7.86 per trade
  profitTradeSize: 0.0005,      // $39.30 per trade
  tradesPerDay: 12,             // Target 12 trades/day
  meanReversionThreshold: 0.03  // 3% deviation
};

// ============================================
// PRICE SIMULATOR
// ============================================

class PriceSimulator {
  constructor(basePrice, volatility) {
    this.basePrice = basePrice;
    this.currentPrice = basePrice;
    this.volatility = volatility;
    this.priceHistory = [];
  }

  /**
   * Simulate next price movement
   */
  nextPrice() {
    // Mean reversion model
    const meanReversion = -0.1 * (this.currentPrice - this.basePrice) / this.basePrice;
    const randomShock = (Math.random() - 0.5) * 2 * this.volatility;
    
    this.currentPrice *= (1 + meanReversion + randomShock);
    this.currentPrice = Math.max(this.basePrice * 0.7, Math.min(this.basePrice * 1.3, this.currentPrice));
    
    this.priceHistory.push({
      timestamp: Date.now(),
      price: this.currentPrice
    });
    
    return this.currentPrice;
  }

  /**
   * Get price statistics
   */
  getStats() {
    const prices = this.priceHistory.map(p => p.price);
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      final: this.currentPrice,
      priceChange: (this.currentPrice - this.basePrice) / this.basePrice
    };
  }
}

// ============================================
// BACKTEST RUNNER
// ============================================

async function runBacktest() {
  console.log('\n' + '='.repeat(70));
  console.log('  VOLUME BOT BACKTEST - $1000 OVER 30 DAYS');
  console.log('='.repeat(70));
  console.log(`Token: ${BACKTEST_CONFIG.token}`);
  console.log(`Capital: ${BACKTEST_CONFIG.capitalBTC} BTC ($1,000)`);
  console.log(`Target: ${BACKTEST_CONFIG.tradesPerDay} trades/day`);
  console.log(`Duration: ${BACKTEST_CONFIG.days} days`);
  console.log('='.repeat(70));
  console.log('');

  // Initialize trader
  const trader = new VolumeTrader({
    tradingAddress: 'bc1p...test',
    accessToken: 'test',
    token: BACKTEST_CONFIG.token,
    capitalBTC: BACKTEST_CONFIG.capitalBTC
  });

  await trader.init(BACKTEST_CONFIG.startPrice);

  // Initialize price simulator
  const priceSimulator = new PriceSimulator(
    BACKTEST_CONFIG.startPrice,
    BACKTEST_CONFIG.priceVolatility
  );

  // Simulate 30 days
  const minutesPerDay = 1440;
  const tradeInterval = minutesPerDay / BACKTEST_CONFIG.tradesPerDay; // ~120 minutes

  let dayResults = [];

  for (let day = 1; day <= BACKTEST_CONFIG.days; day++) {
    const dayStartValue = trader.btc + (trader.tokens * priceSimulator.currentPrice);
    const dayStartVolume = trader.volumeGenerated;
    const dayStartTrades = trader.trades.length;

    // Simulate trades throughout the day
    for (let minute = 0; minute < minutesPerDay; minute += tradeInterval) {
      const currentPrice = priceSimulator.nextPrice();
      trader.priceTracker.addPrice(currentPrice);

      // Try profit trade (mean reversion)
      await trader.makeProfitTrade(currentPrice);

      // Make volume trade
      await trader.makeVolumeTrade(currentPrice);

      // Occasional rebalance
      if (Math.random() < 0.1) { // 10% chance per trade
        await trader.rebalance(currentPrice);
      }
    }

    // End of day summary
    const currentPrice = priceSimulator.currentPrice;
    const dayEndValue = trader.btc + (trader.tokens * currentPrice);
    const dayVolume = trader.volumeGenerated - dayStartVolume;
    const dayTrades = trader.trades.length - dayStartTrades;
    const dayPnL = dayEndValue - dayStartValue;

    const result = {
      day: day,
      price: currentPrice,
      value: dayEndValue,
      pnl: dayPnL,
      volume: dayVolume,
      trades: dayTrades,
      cumulativeVolume: trader.volumeGenerated
    };

    dayResults.push(result);

    console.log(`Day ${day.toString().padStart(2)}: ` +
                `Vol $${dayVolume.toFixed(0).padStart(5)} | ` +
                `Trades ${dayTrades.toString().padStart(2)} | ` +
                `PnL ${dayPnL >= 0 ? '+' : ''}${dayPnL.toFixed(8)} BTC | ` +
                `Value ${dayEndValue.toFixed(8)} BTC`);
  }

  // Final results
  const finalPrice = priceSimulator.currentPrice;
  const finalMetrics = trader.getMetrics(finalPrice);
  const priceStats = priceSimulator.getStats();

  console.log('\n' + '='.repeat(70));
  console.log('  FINAL RESULTS');
  console.log('='.repeat(70));

  console.log(`\n📊 Volume Generation:`);
  console.log(`   Total Volume: $${finalMetrics.volumeGenerated.toFixed(0)}`);
  console.log(`   Daily Average: $${(finalMetrics.volumeGenerated / BACKTEST_CONFIG.days).toFixed(0)}`);
  console.log(`   Total Trades: ${finalMetrics.totalTrades}`);
  console.log(`   Trades/Day: ${(finalMetrics.totalTrades / BACKTEST_CONFIG.days).toFixed(1)}`);

  console.log(`\n💰 Financial Performance:`);
  console.log(`   Initial Capital: ${BACKTEST_CONFIG.capitalBTC.toFixed(8)} BTC ($1,000)`);
  console.log(`   Final Value: ${finalMetrics.currentValueBTC.toFixed(8)} BTC ($${(finalMetrics.currentValueBTC * 78593).toFixed(2)})`);
  console.log(`   PnL: ${finalMetrics.pnl >= 0 ? '+' : ''}${finalMetrics.pnl.toFixed(8)} BTC (${finalMetrics.pnlPct >= 0 ? '+' : ''}${finalMetrics.pnlPct.toFixed(2)}%)`);
  console.log(`   Fees Paid: $${finalMetrics.feesPaid.toFixed(2)}`);

  console.log(`\n📈 Efficiency:`);
  console.log(`   Cost per $1k Volume: $${finalMetrics.costPerThousandVolume.toFixed(2)}`);
  console.log(`   Volume/Capital Ratio: ${(finalMetrics.volumeGenerated / 1000).toFixed(1)}x`);
  console.log(`   Net Cost: ${Math.abs(finalMetrics.pnl * 78593).toFixed(2)} (${Math.abs(finalMetrics.pnlPct).toFixed(2)}% of capital)`);

  console.log(`\n💎 Price Movement:`);
  console.log(`   Start: $${BACKTEST_CONFIG.startPrice.toFixed(8)}`);
  console.log(`   End: $${priceStats.final.toFixed(8)}`);
  console.log(`   Min: $${priceStats.min.toFixed(8)}`);
  console.log(`   Max: $${priceStats.max.toFixed(8)}`);
  console.log(`   Change: ${(priceStats.priceChange * 100).toFixed(2)}%`);

  console.log('\n' + '='.repeat(70));

  // Calculate scenarios
  console.log('\n📋 SCENARIOS:');
  
  const scenarios = [
    { capital: 1000, volume: finalMetrics.volumeGenerated, cost: Math.abs(finalMetrics.pnl * 78593) },
    { capital: 2500, volume: finalMetrics.volumeGenerated * 2.5, cost: Math.abs(finalMetrics.pnl * 78593) * 2.5 },
    { capital: 5000, volume: finalMetrics.volumeGenerated * 5, cost: Math.abs(finalMetrics.pnl * 78593) * 5 },
    { capital: 10000, volume: finalMetrics.volumeGenerated * 10, cost: Math.abs(finalMetrics.pnl * 78593) * 10 }
  ];

  console.log('\n   Capital | 30-Day Volume | Net Cost | Cost per $1k Vol');
  console.log('   ' + '-'.repeat(60));
  
  for (const s of scenarios) {
    console.log(`   $${s.capital.toLocaleString().padStart(6)} | $${s.volume.toFixed(0).padStart(12)} | $${s.cost.toFixed(0).padStart(7)} | $${(s.cost / (s.volume / 1000)).toFixed(2)}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✅ Volume Bot can generate $${(finalMetrics.volumeGenerated / 1000).toFixed(1)}k volume per $1k capital`);
  console.log('='.repeat(70) + '\n');

  return {
    finalMetrics,
    priceStats,
    dayResults,
    scenarios
  };
}

// Run if called directly
if (require.main === module) {
  runBacktest().catch(console.error);
}

module.exports = { runBacktest };
