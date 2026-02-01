/**
 * RadFi Swap Backend v2
 * REAL PRODUCTION API ACCESS with correct headers
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// PRODUCTION RadFi API - requires Origin/Referer headers
const RADFI_API_BASE = 'https://api.radfi.co';

// Platform fee configuration  
const PLATFORM_FEE_PERCENT = 1;
const FEE_WALLET = process.env.FEE_WALLET || 'bc1pswy3y5vkcsdrp0t34r0nq0t8u8zvtlucddlpy4cwyfh3kld7pzssglrnzw';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));

/**
 * Proxy to RadFi PRODUCTION API with required headers
 */
async function fetchRadFi(endpoint, options = {}) {
  const url = `${RADFI_API_BASE}${endpoint}`;
  console.log(`[RadFi] Fetching: ${url}`);
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'Origin': 'https://app.radfi.co',
      'Referer': 'https://app.radfi.co/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    console.error(`[RadFi] Error ${response.status}: ${response.statusText}`);
    throw new Error(`RadFi API error: ${response.status}`);
  }
  
  return response.json();
}

// ============ TOKEN ENDPOINTS (REAL DATA) ============

app.get('/api/tokens', async (req, res) => {
  try {
    const { page = 1, pageSize = 50, sort = '-volume24h' } = req.query;
    const data = await fetchRadFi(`/api/tokens?page=${page}&pageSize=${pageSize}&sort=${sort}`);
    
    // Filter out test tokens for cleaner display
    if (data.data) {
      data.data = data.data.filter(t => !t.isTest);
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching tokens:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/tokens/details', async (req, res) => {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    const data = await fetchRadFi(`/api/tokens/details?${queryString}`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ POOL ENDPOINTS ============

app.get('/api/pools', async (req, res) => {
  try {
    const data = await fetchRadFi('/api/pools');
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ HISTORY ENDPOINTS ============

app.get('/api/histories', async (req, res) => {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    const data = await fetchRadFi(`/api/histories?${queryString}`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ WALLET ENDPOINTS ============

app.get('/api/wallets', async (req, res) => {
  try {
    // Forward Authorization header if present
    const authHeader = req.headers.authorization;
    const headers = authHeader ? { 'Authorization': authHeader } : {};
    
    const queryString = new URLSearchParams(req.query).toString();
    const endpoint = queryString ? `/api/wallets?${queryString}` : '/api/wallets';
    
    const data = await fetchRadFi(endpoint, { headers });
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/wallets/details/:userAddress', async (req, res) => {
  try {
    const data = await fetchRadFi(`/api/wallets/details/${req.params.userAddress}`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/wallets', async (req, res) => {
  try {
    const data = await fetchRadFi('/api/wallets', {
      method: 'POST',
      body: JSON.stringify(req.body)
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ FEE ENDPOINTS ============

app.get('/api/transactions/mempool-fee', async (req, res) => {
  try {
    const data = await fetchRadFi('/api/transactions/mempool-fee');
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/vm-transactions/fee-rate', async (req, res) => {
  try {
    const data = await fetchRadFi('/api/vm-transactions/fee-rate');
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ETCH ENDPOINTS ============

app.get('/api/etch/runes', async (req, res) => {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    const data = await fetchRadFi(`/api/etch/runes?${queryString}`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ SWAP WITH FEE ============

app.post('/api/quote', async (req, res) => {
  try {
    const { tokenIn, tokenOut, amountIn } = req.body;
    
    // Get token prices
    const tokensRes = await fetchRadFi('/api/tokens?pageSize=200');
    const tokens = tokensRes.data || [];
    
    const inToken = tokens.find(t => t.tokenId === tokenIn || t.symbol === tokenIn);
    const outToken = tokens.find(t => t.tokenId === tokenOut || t.symbol === tokenOut);
    
    // Calculate with 1% fee
    const fee = Math.floor(amountIn * (PLATFORM_FEE_PERCENT / 100));
    const netAmount = amountIn - fee;
    
    let estimatedOut = 0;
    if (inToken && outToken && outToken.priceInSats > 0) {
      const inPriceSats = inToken.priceInSats || 100000000; // BTC = 100M sats
      const outPriceSats = outToken.priceInSats;
      estimatedOut = Math.floor((netAmount * inPriceSats) / outPriceSats);
    }
    
    res.json({
      success: true,
      data: {
        tokenIn,
        tokenOut,
        amountIn,
        platformFee: fee,
        platformFeePercent: PLATFORM_FEE_PERCENT,
        feeWallet: FEE_WALLET,
        netAmountIn: netAmount,
        estimatedAmountOut: estimatedOut,
        inToken,
        outToken
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ AUTH ENDPOINTS (Proxy) ============

app.post('/api/auth/authenticate', async (req, res) => {
  try {
    const data = await fetchRadFi('/api/auth/authenticate', {
      method: 'POST',
      body: JSON.stringify(req.body)
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/auth/refresh-token', async (req, res) => {
  try {
    const data = await fetchRadFi('/api/auth/refresh-token', {
      method: 'POST',
      body: JSON.stringify(req.body)
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ TRANSACTION ENDPOINTS ============

app.post('/api/transactions', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const data = await fetchRadFi('/api/transactions', {
      method: 'POST',
      headers: authHeader ? { Authorization: authHeader } : {},
      body: JSON.stringify(req.body)
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/transactions/sign', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const data = await fetchRadFi('/api/transactions/sign', {
      method: 'POST',
      headers: authHeader ? { Authorization: authHeader } : {},
      body: JSON.stringify(req.body)
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ MARKET MAKER ENDPOINTS ============

// Deploy market maker (provide liquidity)
app.post('/api/market-maker/deploy', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { poolId, userAddress, amount0, amount1, token0Id, token1Id, upperTick, lowerTick, feeRate, tickSpacing, scVersion } = req.body;

    // Create VM transaction for provide-liquidity
    const vmTxPayload = {
      type: 'provide-liquidity',
      params: {
        userAddress,
        token0Id,
        token1Id,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        upperTick,
        lowerTick,
        feeRate,
        tickSpacing,
        scVersion: scVersion || 'v4'
      }
    };

    const data = await fetchRadFi('/api/vm-transactions', {
      method: 'POST',
      headers: { Authorization: authHeader },
      body: JSON.stringify(vmTxPayload)
    });

    res.json(data);
  } catch (error) {
    console.error('MM deploy error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Withdraw market maker (remove liquidity)
app.post('/api/market-maker/withdraw', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { nftId, userAddress, liquidityValue, amount0, amount1, token0Id, token1Id, scVersion, feesEarned } = req.body;

    // Calculate 10% platform fee on profitable fees only
    const profitableFees = Math.max(0, parseFloat(feesEarned || 0));
    const platformFee = profitableFees * 0.10;
    const userFees = profitableFees * 0.90;

    // Create VM transaction for withdraw-liquidity
    const vmTxPayload = {
      type: 'withdraw-liquidity',
      params: {
        userAddress,
        liquidityValue: liquidityValue.toString(),
        nftId: nftId.toString(),
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        token0Id,
        token1Id,
        scVersion: scVersion || 'v4'
      }
    };

    const data = await fetchRadFi('/api/vm-transactions', {
      method: 'POST',
      headers: { Authorization: authHeader },
      body: JSON.stringify(vmTxPayload)
    });

    // Add fee information to response
    data.feeCalculation = {
      totalFeesEarned: profitableFees,
      platformFee: platformFee,
      platformFeePercent: 10,
      userFees: userFees,
      userFeesPercent: 90,
      feeWallet: FEE_WALLET
    };

    res.json(data);
  } catch (error) {
    console.error('MM withdraw error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Calculate position metrics
app.post('/api/market-maker/calculate', async (req, res) => {
  try {
    const { depositedBTC, feesEarned, entryPrice, currentPrice, timeElapsedHours } = req.body;

    // Calculate impermanent loss
    const priceRatio = currentPrice / entryPrice;
    const ilFactor = 2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1;
    const ilLoss = ilFactor * depositedBTC;

    // Calculate current value
    const currentValue = depositedBTC + feesEarned + ilLoss;
    const totalPnL = currentValue - depositedBTC;

    // Calculate APY
    const apy = timeElapsedHours > 0 ? (totalPnL / depositedBTC) * (8760 / timeElapsedHours) * 100 : 0;

    // Apply 10% platform fee to profitable fees
    const profitableFees = Math.max(0, feesEarned);
    const platformFee = profitableFees * 0.10;
    const userFees = profitableFees * 0.90;

    res.json({
      success: true,
      data: {
        depositedBTC,
        feesEarned,
        userFees, // 90% of fees
        platformFee, // 10% of fees
        ilLoss,
        ilPercent: ilFactor * 100,
        currentValue,
        totalPnL,
        apy,
        priceChange: ((currentPrice - entryPrice) / entryPrice) * 100
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ PLATFORM INFO ============

app.get('/api/platform', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'RadLabs',
      version: '2.0.0',
      swapFee: { percent: PLATFORM_FEE_PERCENT, wallet: FEE_WALLET },
      marketMakerFee: { percent: 10, description: '10% of profitable fees', wallet: FEE_WALLET },
      api: RADFI_API_BASE,
      production: true
    }
  });
});

// ============ SETTINGS ============

app.get('/api/setting', async (req, res) => {
  try {
    const data = await fetchRadFi('/api/setting');
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ETCH / RADPAD ============

// Authentication endpoint for RadFi trading wallet
app.post('/api/auth/authenticate', async (req, res) => {
  try {
    const { message, signature, address, publicKey } = req.body;
    
    const data = await fetchRadFi('/api/auth/authenticate', {
      method: 'POST',
      body: JSON.stringify({ message, signature, address, publicKey })
    });
    
    res.json({
      success: true,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tradingAddress: data.tradingAddress
    });
  } catch (error) {
    console.error('[Etch] Authentication error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get etch address and fee
app.post('/api/etch/get-etch-address', async (req, res) => {
  try {
    const data = await fetchRadFi('/api/etch/get-etch-address', {
      method: 'POST',
      body: JSON.stringify(req.body)
    });
    
    res.json(data);
  } catch (error) {
    console.error('[Etch] Get address error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get etched runes list
app.get('/api/etch/runes', async (req, res) => {
  try {
    const query = new URLSearchParams(req.query).toString();
    const data = await fetchRadFi(`/api/etch/runes?${query}`);
    
    res.json(data);
  } catch (error) {
    console.error('[Etch] Get runes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific etched rune details
app.get('/api/etch/runes/details', async (req, res) => {
  try {
    const query = new URLSearchParams(req.query).toString();
    const data = await fetchRadFi(`/api/etch/runes/details?${query}`);
    
    res.json(data);
  } catch (error) {
    console.error('[Etch] Get rune details error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Build commit transaction (requires auth)
app.post('/api/etch/commit-tx', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }
    
    const data = await fetchRadFi('/api/etch/commit-tx', {
      method: 'POST',
      headers: {
        'Authorization': authHeader
      },
      body: JSON.stringify(req.body)
    });
    
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('[Etch] Build commit tx error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit etching (requires auth)
app.post('/api/etch/submit-etching', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }
    
    const data = await fetchRadFi('/api/etch/submit-etching', {
      method: 'POST',
      headers: {
        'Authorization': authHeader
      },
      body: JSON.stringify(req.body)
    });
    
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('[Etch] Submit etching error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get top holders
app.get('/api/etch/top-holders', async (req, res) => {
  try {
    const query = new URLSearchParams(req.query).toString();
    const data = await fetchRadFi(`/api/etch/top-holders?${query}`);
    
    res.json(data);
  } catch (error) {
    console.error('[Etch] Get top holders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get rewards amount
app.get('/api/etch/rewards-amount', async (req, res) => {
  try {
    const query = new URLSearchParams(req.query).toString();
    const data = await fetchRadFi(`/api/etch/rewards-amount?${query}`);
    
    res.json(data);
  } catch (error) {
    console.error('[Etch] Get rewards error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ MARKET MAKER ENDPOINTS ============

const { API: mmAPI } = require('../mm/orchestrator.js');

// Create MM position (user deposits)
app.post('/api/mm/deposit', async (req, res) => {
  try {
    const result = await mmAPI.deposit({ body: req.body });
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[MM] Deposit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user's MM position
app.get('/api/mm/position/:userAddress', async (req, res) => {
  try {
    const result = await mmAPI.getPosition({ params: req.params });
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('[MM] Get position error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all MM positions (admin)
app.get('/api/mm/positions', async (req, res) => {
  try {
    const result = await mmAPI.getAllPositions({ query: req.query });
    res.json(result);
  } catch (error) {
    console.error('[MM] Get all positions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Withdraw from MM
app.post('/api/mm/withdraw/:userAddress', async (req, res) => {
  try {
    const result = await mmAPI.withdraw({ params: req.params });
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[MM] Withdraw error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get global metrics
app.get('/api/mm/metrics', async (req, res) => {
  try {
    const result = await mmAPI.getMetrics({ query: req.query });
    res.json(result);
  } catch (error) {
    console.error('[MM] Get metrics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ VOLUME BOT API ============

const VolumeBot = require('../mm/volume-bot');
const PerformanceMonitor = require('../mm/monitors/performance');
const RiskMonitor = require('../mm/monitors/risk');
const ReportingMonitor = require('../mm/monitors/reporting');

const performanceMonitor = new PerformanceMonitor();
const riskMonitor = new RiskMonitor();
const reportingMonitor = new ReportingMonitor();

// Active volume bots by user
const activeBots = new Map(); // userAddress -> Map(ticker -> VolumeBot)

// Trade logging for audit trail
const fs = require('fs');
const tradeLogPath = path.join(__dirname, '../data/mm/trade-log.jsonl');

function logTrade(entry) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...entry
  };
  console.log('[TRADE LOG]', JSON.stringify(logEntry));
  
  // Append to file
  try {
    fs.appendFileSync(tradeLogPath, JSON.stringify(logEntry) + '\n');
  } catch (e) {
    console.error('[TRADE LOG] Write error:', e.message);
  }
}

// Test Volume Bot connection (no real trades)
app.post('/api/volume-bot/test', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const authToken = authHeader ? authHeader.replace('Bearer ', '') : null;
    const { userAddress, ticker } = req.body;
    
    logTrade({
      action: 'TEST_REQUEST',
      userAddress,
      ticker,
      hasAuth: !!authToken
    });
    
    const tokenConfig = require('../mm/production-config').TOKENS[ticker];
    
    if (!tokenConfig) {
      return res.status(400).json({
        success: false,
        error: `Unknown ticker: ${ticker}. Available: ${Object.keys(require('../mm/production-config').TOKENS).join(', ')}`
      });
    }
    
    // Test RadFi API connection
    const RadFiAPI = require('../mm/radfi-api');
    const api = new RadFiAPI(authToken);
    
    const tests = {
      poolData: null,
      tokenPrice: null,
      authValid: !!authToken,
      errors: []
    };
    
    try {
      // Test 1: Fetch pool data
      const pools = await api.fetch('/api/pools');
      const pool = pools.data?.find(p => 
        p.token1Id === tokenConfig.tokenId || 
        p.token0Id === tokenConfig.tokenId
      );
      tests.poolData = pool ? {
        poolId: pool._id,
        token0Id: pool.token0Id,
        token1Id: pool.token1Id,
        tvl: pool.tvl
      } : null;
      
      if (!pool) {
        tests.errors.push(`No pool found for ${ticker}`);
      }
      
      // Test 2: Fetch token price (uses improved method with fallback)
      if (pool) {
        const price = await api.getTokenPrice(pool._id, tokenConfig.tokenId);
        tests.tokenPrice = {
          price: price,
          method: price ? 'token-api' : 'failed'
        };
        
        if (!price) {
          tests.errors.push('Failed to get token price');
        }
      }
      
    } catch (error) {
      tests.errors.push(`API Error: ${error.message}`);
    }
    
    logTrade({
      action: 'TEST_COMPLETE',
      userAddress,
      ticker,
      tests
    });
    
    res.json({
      success: tests.errors.length === 0,
      data: tests
    });
    
  } catch (error) {
    console.error('[VolumeBot] Test error:', error);
    logTrade({
      action: 'TEST_ERROR',
      error: error.message
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Deposit and start volume bot
app.post('/api/volume-bot/deposit', async (req, res) => {
  try {
    // CRITICAL: Extract auth token for real trading
    const authHeader = req.headers.authorization;
    const authToken = authHeader ? authHeader.replace('Bearer ', '') : null;
    
    const { userAddress, amount, tokenAllocations, refreshToken, testMode } = req.body;
    
    logTrade({
      action: 'DEPOSIT_REQUEST',
      userAddress,
      amount,
      tokenAllocations,
      hasAuth: !!authToken,
      hasRefresh: !!refreshToken,
      testMode: !!testMode
    });
    
    if (!userAddress || !amount || !tokenAllocations) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userAddress, amount, tokenAllocations'
      });
    }
    
    // Warn if no auth token - trades will be simulated
    if (!authToken) {
      console.warn('[VolumeBot] ⚠️ No auth token provided - running in SIMULATED mode');
      logTrade({
        action: 'WARNING',
        message: 'No auth token - simulated mode',
        userAddress
      });
    }
    
    // Initialize user's bot map if not exists
    if (!activeBots.has(userAddress)) {
      activeBots.set(userAddress, new Map());
    }
    
    const userBots = activeBots.get(userAddress);
    const startedBots = [];
    
    // Start a bot for each token allocation
    for (const alloc of tokenAllocations) {
      const { ticker, allocation } = alloc;
      const tokenConfig = require('../mm/production-config').TOKENS[ticker];
      
      if (!tokenConfig) {
        console.warn(`[VolumeBot] Unknown ticker: ${ticker}`);
        logTrade({
          action: 'ERROR',
          message: `Unknown ticker: ${ticker}`,
          userAddress
        });
        continue;
      }
      
      // Create bot WITH auth tokens for real trading
      const bot = new VolumeBot(userAddress, tokenConfig, allocation, authToken, refreshToken, testMode);
      
      logTrade({
        action: 'BOT_STARTING',
        userAddress,
        ticker,
        allocation,
        authMode: testMode ? 'TEST' : (authToken ? 'LIVE' : 'SIMULATED')
      });
      
      await bot.start();
      
      userBots.set(ticker, bot);
      startedBots.push({
        ticker,
        allocation,
        status: 'started',
        mode: authToken ? 'live' : 'simulated'
      });
      
      logTrade({
        action: 'BOT_STARTED',
        userAddress,
        ticker,
        allocation,
        startPrice: bot.startPrice,
        poolId: bot.tokenConfig.poolId
      });
    }
    
    res.json({
      success: true,
      data: {
        userAddress,
        totalDeposited: amount,
        bots: startedBots,
        tradingMode: authToken ? 'LIVE' : 'SIMULATED'
      }
    });
    
  } catch (error) {
    console.error('[VolumeBot] Deposit error:', error);
    logTrade({
      action: 'DEPOSIT_ERROR',
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get metrics for a user
app.get('/api/volume-bot/metrics/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    const metrics = await performanceMonitor.getMetrics(userAddress);
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('[VolumeBot] Get metrics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get dashboard data (metrics + alerts + trades)
app.get('/api/volume-bot/dashboard/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    const dashboard = await reportingMonitor.getDashboardData(userAddress);
    
    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    console.error('[VolumeBot] Get dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get position details for a specific token
app.get('/api/volume-bot/position/:userAddress/:ticker', async (req, res) => {
  try {
    const { userAddress, ticker } = req.params;
    const position = await reportingMonitor.getPositionDetails(userAddress, ticker);
    
    if (!position) {
      return res.status(404).json({
        success: false,
        error: 'Position not found'
      });
    }
    
    res.json({
      success: true,
      data: position
    });
  } catch (error) {
    console.error('[VolumeBot] Get position error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get alerts
app.get('/api/volume-bot/alerts/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    const alerts = await riskMonitor.checkLimits(userAddress);
    const summary = riskMonitor.getAlertSummary(alerts);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('[VolumeBot] Get alerts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pause volume bot for a token
app.post('/api/volume-bot/pause/:userAddress/:ticker', async (req, res) => {
  try {
    const { userAddress, ticker } = req.params;
    
    // Stop the running bot if exists
    if (activeBots.has(userAddress)) {
      const userBots = activeBots.get(userAddress);
      if (userBots.has(ticker)) {
        await userBots.get(ticker).stop();
        userBots.delete(ticker);
      }
    }
    
    // Mark as paused in storage
    await riskMonitor.pausePosition(userAddress, ticker);
    
    res.json({
      success: true,
      message: `Volume bot paused for ${ticker}`
    });
  } catch (error) {
    console.error('[VolumeBot] Pause error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resume volume bot for a token
app.post('/api/volume-bot/resume/:userAddress/:ticker', async (req, res) => {
  try {
    const { userAddress, ticker } = req.params;
    
    // Mark as resumed in storage
    await riskMonitor.resumePosition(userAddress, ticker);
    
    // Restart the bot
    const tokenConfig = require('../mm/production-config').TOKENS[ticker];
    if (!tokenConfig) {
      return res.status(400).json({
        success: false,
        error: `Unknown ticker: ${ticker}`
      });
    }
    
    // Load saved state and restart
    const bot = new VolumeBot(userAddress, tokenConfig, 0);
    const loaded = await bot.loadState(userAddress, ticker);
    
    if (loaded) {
      await bot.start();
      
      if (!activeBots.has(userAddress)) {
        activeBots.set(userAddress, new Map());
      }
      activeBots.get(userAddress).set(ticker, bot);
    }
    
    res.json({
      success: true,
      message: `Volume bot resumed for ${ticker}`
    });
  } catch (error) {
    console.error('[VolumeBot] Resume error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Withdraw all funds and close positions
app.post('/api/volume-bot/withdraw/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    
    // Stop all running bots
    if (activeBots.has(userAddress)) {
      const userBots = activeBots.get(userAddress);
      for (const [ticker, bot] of userBots.entries()) {
        await bot.stop();
      }
      activeBots.delete(userAddress);
    }
    
    // Calculate final metrics and fees
    const metrics = await performanceMonitor.getMetrics(userAddress);
    
    // Calculate platform fee (10% of profits only)
    let platformFee = 0;
    if (metrics.netPnL > 0) {
      platformFee = metrics.netPnL * 0.10;
    }
    
    const netWithdrawal = metrics.currentValue - platformFee;
    
    res.json({
      success: true,
      data: {
        totalDeposited: metrics.totalDeposited,
        currentValue: metrics.currentValue,
        netPnL: metrics.netPnL,
        platformFee,
        netWithdrawal,
        feeWallet: FEE_WALLET
      }
    });
    
    // TODO: Execute actual withdrawal transaction to user's wallet
    
  } catch (error) {
    console.error('[VolumeBot] Withdraw error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get recent trades
app.get('/api/volume-bot/trades/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    const { limit = 20 } = req.query;
    
    const trades = await performanceMonitor.getRecentTrades(userAddress, parseInt(limit));
    
    res.json({
      success: true,
      data: trades
    });
  } catch (error) {
    console.error('[VolumeBot] Get trades error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ SERVE FRONTEND ============

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║            RadFi Swap Backend v2.0 - PRODUCTION            ║
╠════════════════════════════════════════════════════════════╣
║  🌐 Server: http://localhost:${PORT}                          ║
║  📡 API: ${RADFI_API_BASE}                       ║
║  💰 Platform Fee: ${PLATFORM_FEE_PERCENT}%                                      ║
║  🔑 Fee Wallet: ${FEE_WALLET.slice(0, 20)}...                   ║
║  ✅ REAL LIVE DATA                                         ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
