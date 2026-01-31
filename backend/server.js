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
const FEE_WALLET = process.env.FEE_WALLET || 'YOUR_BTC_WALLET_ADDRESS_HERE';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

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

// ============ PLATFORM INFO ============

app.get('/api/platform', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'RadFi Swap',
      version: '2.0.0',
      fee: { percent: PLATFORM_FEE_PERCENT, wallet: FEE_WALLET },
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
