/**
 * Reporting Monitor
 * 
 * Aggregates data for UI display and generates reports.
 */

const PerformanceMonitor = require('./performance');
const RiskMonitor = require('./risk');

class ReportingMonitor {
  constructor() {
    this.performanceMonitor = new PerformanceMonitor();
    this.riskMonitor = new RiskMonitor();
  }
  
  async getDashboardData(userAddress) {
    // Get performance metrics
    const performance = await this.performanceMonitor.getMetrics(userAddress);
    
    // Get risk alerts
    const alerts = await this.riskMonitor.checkLimits(userAddress);
    const alertSummary = this.riskMonitor.getAlertSummary(alerts);
    
    // Get recent trades
    const recentTrades = await this.performanceMonitor.getRecentTrades(userAddress, 10);
    
    // Get volume history
    const volumeHistory = await this.performanceMonitor.getVolumeHistory(userAddress, 7);
    
    return {
      performance,
      alerts: alertSummary,
      recentTrades,
      volumeHistory,
      timestamp: Date.now()
    };
  }
  
  async getPositionDetails(userAddress, ticker) {
    const positions = await this.performanceMonitor.loadUserPositions(userAddress);
    const position = positions.find(p => p.tokenConfig.ticker === ticker);
    
    if (!position) {
      return null;
    }
    
    const currentValue = position.inventory.btc + (position.inventory.token * position.currentPrice);
    const pnl = currentValue - position.allocation;
    const pnlPercent = (pnl / position.allocation) * 100;
    
    // Calculate APY
    const elapsedDays = (Date.now() - position.metrics.startTime) / (1000 * 60 * 60 * 24);
    const roi = pnl / position.allocation;
    const apy = elapsedDays > 1 ? ((roi * 365) / elapsedDays) * 100 : 0;
    
    // Token appreciation
    const tokenAppreciationPercent = position.startPrice 
      ? ((position.currentPrice - position.startPrice) / position.startPrice) * 100
      : 0;
    
    return {
      ticker: position.tokenConfig.ticker,
      tokenId: position.tokenConfig.tokenId,
      poolId: position.tokenConfig.poolId,
      
      // Allocation & value
      allocation: position.allocation,
      currentValue,
      pnl,
      pnlPercent,
      apy,
      
      // Inventory
      inventory: {
        btc: position.inventory.btc,
        token: position.inventory.token,
        btcRatio: (position.inventory.btc / currentValue) * 100,
        tokenRatio: ((position.inventory.token * position.currentPrice) / currentValue) * 100,
        target: position.tokenConfig.inventoryTarget
      },
      
      // Trading metrics
      volumeGenerated24h: position.metrics.volumeGenerated24h,
      volumeGeneratedTotal: position.metrics.volumeGenerated,
      volumeTarget24h: position.tokenConfig.volumeTarget24h,
      volumeProgress: position.tokenConfig.volumeTarget24h 
        ? (position.metrics.volumeGenerated24h / position.tokenConfig.volumeTarget24h) * 100
        : 0,
      
      // Trade stats
      totalTrades: position.metrics.trades.length,
      trades24h: position.metrics.trades.filter(t => {
        return t.timestamp >= Date.now() - (24 * 60 * 60 * 1000);
      }).length,
      
      // Fees
      feesPaid: position.metrics.tradingFeesPaid,
      feesEarned: position.metrics.feesCollected,
      netFees: position.metrics.feesCollected - position.metrics.tradingFeesPaid,
      
      // Token appreciation
      startPrice: position.startPrice,
      currentPrice: position.currentPrice,
      tokenAppreciation: position.metrics.tokenAppreciation,
      tokenAppreciationPercent,
      
      // Status
      running: position.running,
      startTime: position.metrics.startTime,
      lastUpdate: position.lastUpdate,
      
      // Active positions count
      activePositions: position.positions.filter(p => p.status === 'open').length
    };
  }
  
  formatCurrency(value, decimals = 2) {
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(decimals)}k`;
    }
    return `$${value.toFixed(decimals)}`;
  }
  
  formatBTC(value, decimals = 8) {
    return `${value.toFixed(decimals)} BTC`;
  }
  
  formatPercent(value, decimals = 2) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(decimals)}%`;
  }
  
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  async exportMetrics(userAddress, format = 'json') {
    const data = await this.getDashboardData(userAddress);
    
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }
    
    if (format === 'csv') {
      // TODO: Implement CSV export
      return '';
    }
    
    return data;
  }
}

module.exports = ReportingMonitor;
