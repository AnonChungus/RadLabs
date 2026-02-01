/**
 * RadFi API Helper for Volume Bot
 * 
 * Provides authenticated API calls to RadFi for real trading.
 * Uses native fetch (Node 18+)
 * Includes comprehensive logging and token refresh.
 */

const RADFI_API_BASE = 'https://api.radfi.co';

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Origin': 'https://app.radfi.co',
  'Referer': 'https://app.radfi.co/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

class RadFiAPI {
  constructor(authToken = null, refreshToken = null, tracker = null) {
    this.authToken = authToken;
    this.refreshToken = refreshToken;
    this.tracker = tracker;
    this.tokenExpiresAt = authToken ? Date.now() + 9 * 60 * 1000 : 0; // 9 min (safe margin)
  }

  setAuth(accessToken, refreshToken = null) {
    this.authToken = accessToken;
    if (refreshToken) this.refreshToken = refreshToken;
    this.tokenExpiresAt = Date.now() + 9 * 60 * 1000;
  }

  setTracker(tracker) {
    this.tracker = tracker;
  }

  // Check if token needs refresh
  isTokenExpired() {
    return Date.now() > this.tokenExpiresAt;
  }

  // Refresh the access token
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const startTime = Date.now();
    try {
      const response = await fetch(`${RADFI_API_BASE}/api/auth/refresh-token`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const data = await response.json();
      this.authToken = data.accessToken;
      this.tokenExpiresAt = Date.now() + 9 * 60 * 1000;

      if (this.tracker) {
        await this.tracker.logSuccess('Token refreshed', { 
          responseTime: Date.now() - startTime 
        });
      }

      return data;
    } catch (error) {
      if (this.tracker) {
        await this.tracker.logError('Token refresh', error);
      }
      throw error;
    }
  }

  async fetch(endpoint, options = {}) {
    // Auto-refresh token if expired
    if (this.authToken && this.isTokenExpired() && this.refreshToken) {
      await this.refreshAccessToken();
    }

    const url = `${RADFI_API_BASE}${endpoint}`;
    const startTime = Date.now();
    
    const headers = { ...HEADERS };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`RadFi API error ${response.status}: ${text}`);
        
        if (this.tracker) {
          await this.tracker.logApiCall(endpoint, options.method || 'GET', response.status, responseTime, {
            error: text.slice(0, 500)
          });
        }
        
        throw error;
      }

      const data = await response.json();

      if (this.tracker) {
        await this.tracker.logApiCall(endpoint, options.method || 'GET', response.status, responseTime, {
          success: true,
          dataKeys: Object.keys(data)
        });
      }

      return data;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (this.tracker) {
        await this.tracker.logError(`API ${endpoint}`, error, { responseTime });
      }
      
      throw error;
    }
  }

  // Get pool info
  async getPool(poolId) {
    const data = await this.fetch('/api/pools');
    return data.data?.find(p => p._id === poolId);
  }

  // Get token price from pool or token API
  async getTokenPrice(poolId, tokenId = null) {
    // Try to get from pool reserves first
    const pool = await this.getPool(poolId);
    if (pool) {
      const btcReserve = parseFloat(pool.token0Reserve || 0);
      const tokenReserve = parseFloat(pool.token1Reserve || 0);
      
      if (btcReserve > 0 && tokenReserve > 0) {
        return btcReserve / tokenReserve;
      }
    }
    
    // Get the target token ID
    const targetTokenId = tokenId || (pool ? pool.token1Id : null);
    if (!targetTokenId || targetTokenId === '0:0') {
      return null; // Can't get price for BTC itself
    }
    
    // Get price from tokens list (more reliable than details endpoint)
    const tokensData = await this.fetch('/api/tokens?pageSize=100');
    const token = tokensData.data?.find(t => t.tokenId === targetTokenId);
    if (token && token.price) {
      return token.price;
    }
    
    return null;
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
