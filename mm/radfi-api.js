/**
 * RadFi API Helper for Volume Bot
 * 
 * Provides authenticated API calls to RadFi for real trading.
 */

const fetch = require('node-fetch');

const RADFI_API_BASE = 'https://api.radfi.co';

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Origin': 'https://app.radfi.co',
  'Referer': 'https://app.radfi.co/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

class RadFiAPI {
  constructor(authToken = null) {
    this.authToken = authToken;
  }

  setAuth(token) {
    this.authToken = token;
  }

  async fetch(endpoint, options = {}) {
    const url = `${RADFI_API_BASE}${endpoint}`;
    
    const headers = { ...HEADERS };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    const response = await fetch(url, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`RadFi API error ${response.status}: ${text}`);
    }

    return response.json();
  }

  // Get pool info
  async getPool(poolId) {
    const data = await this.fetch('/api/pools');
    return data.data?.find(p => p._id === poolId);
  }

  // Get token price from pool
  async getTokenPrice(poolId) {
    const pool = await this.getPool(poolId);
    if (!pool) return null;
    
    const btcReserve = parseFloat(pool.token0Reserve || 0);
    const tokenReserve = parseFloat(pool.token1Reserve || 1);
    return btcReserve / tokenReserve;
  }

  // Get user's positions (NFTs)
  async getUserPositions(userAddress) {
    const data = await this.fetch(`/api/user-assets/${userAddress}`);
    return data.data?.nfts || [];
  }

  // Provide liquidity (create position)
  async provideLiquidity(params) {
    const {
      userAddress,
      poolId,
      token0Id,
      token1Id,
      amount0,
      amount1,
      upperTick,
      lowerTick,
      feeRate,
      tickSpacing,
      scVersion
    } = params;

    const payload = {
      type: 'provide-liquidity',
      params: {
        userAddress,
        poolId,
        token0Id,
        token1Id,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        upperTick: upperTick || '887200',
        lowerTick: lowerTick || '-887200',
        feeRate: feeRate || 3000,
        tickSpacing: tickSpacing || 200,
        scVersion: scVersion || 'v4'
      }
    };

    return this.fetch('/api/vm-transactions', {
      method: 'POST',
      body: payload
    });
  }

  // Withdraw liquidity (close position)
  async withdrawLiquidity(params) {
    const {
      userAddress,
      nftId,
      liquidityValue,
      amount0,
      amount1,
      token0Id,
      token1Id,
      scVersion
    } = params;

    const payload = {
      type: 'withdraw-liquidity',
      params: {
        userAddress,
        nftId: nftId.toString(),
        liquidityValue: liquidityValue.toString(),
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        token0Id,
        token1Id,
        scVersion: scVersion || 'v4'
      }
    };

    return this.fetch('/api/vm-transactions', {
      method: 'POST',
      body: payload
    });
  }

  // Execute swap (market order)
  async swap(params) {
    const {
      userAddress,
      poolId,
      amountIn,
      amountOut,
      tokenIn,
      tokenOut,
      slippage
    } = params;

    const payload = {
      type: 'swap',
      params: {
        userAddress,
        poolId,
        amountIn: amountIn.toString(),
        amountOut: amountOut.toString(),
        tokenIn,
        tokenOut,
        slippage: slippage || 100 // 1% default
      }
    };

    return this.fetch('/api/vm-transactions', {
      method: 'POST',
      body: payload
    });
  }

  // Get recent swaps in a pool (to detect fills)
  async getPoolSwaps(poolId, limit = 50) {
    const data = await this.fetch(`/api/histories?poolId=${poolId}&type=swap&pageSize=${limit}&sort=-btcBlockTime`);
    return data.data || [];
  }

  // Get fee rate
  async getFeeRate() {
    const data = await this.fetch('/api/vm-transactions/fee-rate');
    return data.feeRate;
  }
}

module.exports = RadFiAPI;
