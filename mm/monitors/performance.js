/**
 * Performance Monitor
 * 
 * Aggregates metrics across all volume bot positions for a user
 * and calculates real-time performance statistics.
 */

const fs = require('fs').promises;
const path = require('path');

class PerformanceMonitor {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data/mm');
  }
  
  async getMetrics(userAddress) {
    // Load all positions for this user
    const positions = await this.loadUserPositions(userAddress);
    
    if (positions.length === 0) {
      return {
        totalDeposited: 0,
        currentValue: 0,
        netPnL: 0,
        pnlPercent: 0,
        volumeGenerated24h: 0,
        volumeGeneratedTotal: 0,
        realizedAPY: 0,
        estimatedAPY: 0,
        trades24h: 0,
        tradesTotal: 0,
        tokenAllocations: []
      };
    }
    
    // Aggregate metrics
    const totalDeposited = positions.reduce((sum, p) => sum + p.allocation, 0);
    const currentValue = positions.reduce((sum, p) => {
      const totalValueBTC = p.inventory.btc + (p.inventory.token * p.currentPrice);
      return sum + totalValueBTC;
    }, 0);
    
    const netPnL = currentValue - totalDeposited;
    const pnlPercent = (netPnL / totalDeposited) * 100;
    
    // Volume metrics
    const volumeGenerated24h = positions.reduce((sum, p) => sum + p.metrics.volumeGenerated24h, 0);
    const volumeGeneratedTotal = positions.reduce((sum, p) => sum + p.metrics.volumeGenerated, 0);
    
    // Trade counts
    const trades24h = this.countTrades24h(positions);
    const tradesTotal = positions.reduce((sum, p) => sum + p.metrics.trades.length, 0);
    
    // APY calculation
    const realizedAPY = this.calculateAPY(positions);
    const estimatedAPY = this.estimateAPY(positions);
    
    // Token breakdown
    const tokenAllocations = positions.map(p => ({
      ticker: p.tokenConfig.ticker,
      allocation: p.allocation,
      currentValue: p.inventory.btc + (p.inventory.token * p.currentPrice),
      pnl: (p.inventory.btc + (p.inventory.token * p.currentPrice)) - p.allocation,
      pnlPercent: (((p.inventory.btc + (p.inventory.token * p.currentPrice)) - p.allocation) / p.allocation) * 100,
      volumeGenerated24h: p.metrics.volumeGenerated24h,
      volumeGeneratedTotal: p.metrics.volumeGenerated,
      trades: p.metrics.trades.length,
      tokenAppreciation: p.metrics.tokenAppreciation,
      tokenAppreciationPercent: p.startPrice ? ((p.currentPrice - p.startPrice) / p.startPrice) * 100 : 0,
      running: p.running
    }));
    
    return {
      totalDeposited,
      currentValue,
      netPnL,
      pnlPercent,
      volumeGenerated24h,
      volumeGeneratedTotal,
      realizedAPY,
      estimatedAPY,
      trades24h,
      tradesTotal,
      feesPaid: positions.reduce((sum, p) => sum + p.metrics.tradingFeesPaid, 0),
      feesEarned: positions.reduce((sum, p) => sum + p.metrics.feesCollected, 0),
      tokenAllocations,
      lastUpdate: Date.now()
    };
  }
  
  async loadUserPositions(userAddress) {
    const positions = [];
    
    try {
      const files = await fs.readdir(this.dataDir);
      
      for (const file of files) {
        if (file.startsWith(userAddress) && file.endsWith('.json')) {
          const filePath = path.join(this.dataDir, file);
          const data = await fs.readFile(filePath, 'utf8');
          const position = JSON.parse(data);
          
          // Add current price (TODO: fetch from API)
          position.currentPrice = position.tokenConfig.price;
          
          positions.push(position);
        }
      }
    } catch (error) {
      console.error('[PerformanceMonitor] Error loading positions:', error);
    }
    
    return positions;
  }
  
  calculateAPY(positions) {
    if (positions.length === 0) return 0;
    
    const totalTime = Date.now() - positions[0].metrics.startTime;
    const totalPnL = positions.reduce((sum, p) => {
      const currentValue = p.inventory.btc + (p.inventory.token * p.currentPrice);
      return sum + (currentValue - p.allocation);
    }, 0);
    const totalDeposited = positions.reduce((sum, p) => sum + p.allocation, 0);
    
    const roi = totalPnL / totalDeposited;
    const daysElapsed = totalTime / (1000 * 60 * 60 * 24);
    
    if (daysElapsed < 1) return 0;
    
    const apy = (roi * 365) / daysElapsed;
    return apy * 100; // Return as percentage
  }
  
  estimateAPY(positions) {
    // Use config estimates weighted by allocation
    const totalAllocation = positions.reduce((sum, p) => sum + p.allocation, 0);
    
    const weightedAPY = positions.reduce((sum, p) => {
      const weight = p.allocation / totalAllocation;
      const estimatedAPY = p.tokenConfig.expectedAppreciation30d 
        ? (p.tokenConfig.expectedAppreciation30d * 12 * 100) // Annualize
        : 15; // Default 15% APY
      
      return sum + (estimatedAPY * weight);
    }, 0);
    
    return weightedAPY;
  }
  
  countTrades24h(positions) {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    return positions.reduce((sum, p) => {
      const recentTrades = p.metrics.trades.filter(t => t.timestamp >= oneDayAgo);
      return sum + recentTrades.length;
    }, 0);
  }
  
  async getRecentTrades(userAddress, limit = 20) {
    const positions = await this.loadUserPositions(userAddress);
    
    // Collect all trades
    const allTrades = [];
    for (const position of positions) {
      for (const trade of position.metrics.trades) {
        allTrades.push({
          ...trade,
          ticker: position.tokenConfig.ticker
        });
      }
    }
    
    // Sort by timestamp descending
    allTrades.sort((a, b) => b.timestamp - a.timestamp);
    
    // Return latest N trades
    return allTrades.slice(0, limit);
  }
  
  async getVolumeHistory(userAddress, days = 30) {
    const positions = await this.loadUserPositions(userAddress);
    
    // TODO: Aggregate volume by day
    // For now, just return current 24h volume
    const volumeGenerated24h = positions.reduce((sum, p) => sum + p.metrics.volumeGenerated24h, 0);
    
    return {
      current24h: volumeGenerated24h,
      history: [] // TODO: Implement daily volume tracking
    };
  }
}

module.exports = PerformanceMonitor;
