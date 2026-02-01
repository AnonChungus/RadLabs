/**
 * Risk Monitor
 * 
 * Monitors risk limits and generates alerts when thresholds are exceeded.
 */

const fs = require('fs').promises;
const path = require('path');
const { MM_CONFIG } = require('../production-config');

class RiskMonitor {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data/mm');
  }
  
  async checkLimits(userAddress) {
    const positions = await this.loadUserPositions(userAddress);
    const alerts = [];
    
    for (const position of positions) {
      const currentValue = position.inventory.btc + (position.inventory.token * position.currentPrice);
      
      // 1. Check drawdown
      const drawdown = (currentValue - position.allocation) / position.allocation;
      if (drawdown < -0.15) {
        alerts.push({
          severity: 'HIGH',
          type: 'DRAWDOWN_EXCEEDED',
          ticker: position.tokenConfig.ticker,
          drawdown: drawdown * 100,
          limit: -15,
          action: 'PAUSE_TRADING',
          message: `${position.tokenConfig.ticker} drawdown ${(drawdown * 100).toFixed(2)}% exceeds -15% limit`
        });
      } else if (drawdown < -0.10) {
        alerts.push({
          severity: 'MEDIUM',
          type: 'DRAWDOWN_WARNING',
          ticker: position.tokenConfig.ticker,
          drawdown: drawdown * 100,
          message: `${position.tokenConfig.ticker} drawdown ${(drawdown * 100).toFixed(2)}% approaching -15% limit`
        });
      }
      
      // 2. Check inventory skew
      const totalValueBTC = currentValue;
      const btcRatio = position.inventory.btc / totalValueBTC;
      const tokenRatio = (position.inventory.token * position.currentPrice) / totalValueBTC;
      
      const maxSkew = position.tokenConfig.maxInventorySkew || 0.60;
      
      if (tokenRatio > maxSkew) {
        alerts.push({
          severity: 'MEDIUM',
          type: 'INVENTORY_SKEW',
          ticker: position.tokenConfig.ticker,
          tokenRatio: tokenRatio * 100,
          btcRatio: btcRatio * 100,
          maxSkew: maxSkew * 100,
          action: 'REBALANCE',
          message: `${position.tokenConfig.ticker} inventory skewed: ${(tokenRatio * 100).toFixed(1)}% token / ${(btcRatio * 100).toFixed(1)}% BTC`
        });
      }
      
      // 3. Check TVL exposure (if we have pool data)
      if (position.poolTVL) {
        const exposure = currentValue / position.poolTVL;
        if (exposure > 0.1) {
          alerts.push({
            severity: 'HIGH',
            type: 'TVL_EXPOSURE_HIGH',
            ticker: position.tokenConfig.ticker,
            exposure: exposure * 100,
            limit: 10,
            action: 'REDUCE_POSITION',
            message: `${position.tokenConfig.ticker} TVL exposure ${(exposure * 100).toFixed(2)}% exceeds 10% limit`
          });
        }
      }
      
      // 4. Check if bot has stopped
      if (!position.running && position.lastUpdate) {
        const timeSinceLast = Date.now() - position.lastUpdate;
        if (timeSinceLast > 5 * 60 * 1000) { // 5 minutes
          alerts.push({
            severity: 'HIGH',
            type: 'BOT_STOPPED',
            ticker: position.tokenConfig.ticker,
            timeSinceLast: Math.floor(timeSinceLast / 1000 / 60),
            message: `${position.tokenConfig.ticker} volume bot has stopped`
          });
        }
      }
      
      // 5. Check volume target progress
      if (position.tokenConfig.volumeTarget24h) {
        const progress = position.metrics.volumeGenerated24h / position.tokenConfig.volumeTarget24h;
        
        if (progress < 0.25) { // Less than 25% of target
          alerts.push({
            severity: 'LOW',
            type: 'VOLUME_TARGET_BEHIND',
            ticker: position.tokenConfig.ticker,
            progress: progress * 100,
            target: position.tokenConfig.volumeTarget24h,
            current: position.metrics.volumeGenerated24h,
            message: `${position.tokenConfig.ticker} only ${(progress * 100).toFixed(1)}% of daily volume target`
          });
        }
      }
    }
    
    // 6. Check portfolio-level metrics
    if (positions.length > 0) {
      const totalDeposited = positions.reduce((sum, p) => sum + p.allocation, 0);
      const totalValue = positions.reduce((sum, p) => {
        return sum + p.inventory.btc + (p.inventory.token * p.currentPrice);
      }, 0);
      
      const portfolioDrawdown = (totalValue - totalDeposited) / totalDeposited;
      
      if (portfolioDrawdown < -0.15) {
        alerts.push({
          severity: 'CRITICAL',
          type: 'PORTFOLIO_STOP_LOSS',
          drawdown: portfolioDrawdown * 100,
          action: 'SHUTDOWN_ALL',
          message: `Portfolio drawdown ${(portfolioDrawdown * 100).toFixed(2)}% - STOP LOSS TRIGGERED`
        });
      }
    }
    
    return alerts;
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
      console.error('[RiskMonitor] Error loading positions:', error);
    }
    
    return positions;
  }
  
  async pausePosition(userAddress, ticker) {
    const filePath = path.join(this.dataDir, `${userAddress}-${ticker}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const position = JSON.parse(data);
      
      position.running = false;
      position.pausedAt = Date.now();
      position.pauseReason = 'Risk limit exceeded';
      
      await fs.writeFile(filePath, JSON.stringify(position, null, 2));
      
      console.log(`[RiskMonitor] Paused ${ticker} for ${userAddress}`);
      return true;
    } catch (error) {
      console.error('[RiskMonitor] Error pausing position:', error);
      return false;
    }
  }
  
  async resumePosition(userAddress, ticker) {
    const filePath = path.join(this.dataDir, `${userAddress}-${ticker}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const position = JSON.parse(data);
      
      position.running = true;
      delete position.pausedAt;
      delete position.pauseReason;
      
      await fs.writeFile(filePath, JSON.stringify(position, null, 2));
      
      console.log(`[RiskMonitor] Resumed ${ticker} for ${userAddress}`);
      return true;
    } catch (error) {
      console.error('[RiskMonitor] Error resuming position:', error);
      return false;
    }
  }
  
  getAlertSummary(alerts) {
    const critical = alerts.filter(a => a.severity === 'CRITICAL').length;
    const high = alerts.filter(a => a.severity === 'HIGH').length;
    const medium = alerts.filter(a => a.severity === 'MEDIUM').length;
    const low = alerts.filter(a => a.severity === 'LOW').length;
    
    return {
      total: alerts.length,
      critical,
      high,
      medium,
      low,
      alerts: alerts.sort((a, b) => {
        const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
    };
  }
}

module.exports = RiskMonitor;
