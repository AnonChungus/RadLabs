# RadLabs Volume Bot - Quick Start Guide

**Status:** ✅ Core implementation complete, ready for frontend integration  
**Commit:** 9345857  
**Tag:** v1.0-volume-bot-baseline  
**Backup:** `~/.openclaw/workspace/radfi-swap-baseline-20260201-022440.tar.gz` (9.2MB)

---

## 🚀 Start the Server

```bash
cd ~/.openclaw/workspace/projects/radfi-swap/backend
node server.js
```

**Expected output:**
```
╔════════════════════════════════════════════════════════════╗
║            RadFi Swap Backend v2.0 - PRODUCTION            ║
╠════════════════════════════════════════════════════════════╣
║  🌐 Server: http://localhost:3000                          ║
║  📡 API: https://api.radfi.co                              ║
║  💰 Platform Fee: 1%                                       ║
║  🔑 Fee Wallet: YOUR_BTC_WALLET_ADDRESS_HERE...            ║
║  ✅ REAL LIVE DATA                                         ║
╚════════════════════════════════════════════════════════════╝
```

---

## 🧪 Test Volume Bot API (Simulated Mode)

### 1. Deposit & Start Bots

```bash
curl -X POST http://localhost:3000/api/volume-bot/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "bc1qtest123",
    "amount": 0.0127,
    "tokenAllocations": [
      { "ticker": "RAD", "allocation": 0.00635 },
      { "ticker": "BOTT", "allocation": 0.00635 }
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userAddress": "bc1qtest123",
    "totalDeposited": 0.0127,
    "bots": [
      { "ticker": "RAD", "allocation": 0.00635, "status": "started" },
      { "ticker": "BOTT", "allocation": 0.00635, "status": "started" }
    ]
  }
}
```

### 2. Check Metrics (Wait 30 Seconds)

```bash
curl http://localhost:3000/api/volume-bot/metrics/bc1qtest123 | jq
```

### 3. Get Full Dashboard

```bash
curl http://localhost:3000/api/volume-bot/dashboard/bc1qtest123 | jq
```

### 4. Check Alerts

```bash
curl http://localhost:3000/api/volume-bot/alerts/bc1qtest123 | jq
```

### 5. Get Recent Trades

```bash
curl http://localhost:3000/api/volume-bot/trades/bc1qtest123?limit=10 | jq
```

### 6. Pause a Bot

```bash
curl -X POST http://localhost:3000/api/volume-bot/pause/bc1qtest123/RAD
```

### 7. Resume a Bot

```bash
curl -X POST http://localhost:3000/api/volume-bot/resume/bc1qtest123/RAD
```

### 8. Withdraw All

```bash
curl -X POST http://localhost:3000/api/volume-bot/withdraw/bc1qtest123 | jq
```

---

## 📁 Check State Files

```bash
ls -lh ~/.openclaw/workspace/projects/radfi-swap/data/mm/

# Expected:
# bc1qtest123-RAD.json
# bc1qtest123-BOTT.json
```

**View state:**
```bash
cat ~/.openclaw/workspace/projects/radfi-swap/data/mm/bc1qtest123-RAD.json | jq
```

---

## 🌐 Access Frontend

```
http://localhost:3000/#volume-bot
```

**Current state:**
- ✅ Page loads
- ✅ Token selector populated
- ✅ Deposit form visible
- ⚠️ Deposit button NOT wired to API yet
- ⚠️ Positions section NOT showing live data yet

---

## 🔧 Next Steps (Frontend Integration)

### Update depositToMM() Function

**File:** `frontend/index.html` (search for `function depositToMM()`)

**Replace with:**
```javascript
async function depositToMM() {
  const tokenSymbol = document.getElementById('mmTokenSelect').value;
  const depositAmount = parseFloat(document.getElementById('mmDepositAmount').value);
  
  if (!tokenSymbol || !depositAmount) {
    alert('Please select a token and enter deposit amount');
    return;
  }
  
  if (!S.tradingAddress) {
    alert('Please connect your RadFi trading wallet first');
    return;
  }
  
  try {
    const response = await fetch('/api/volume-bot/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress: S.tradingAddress,
        amount: depositAmount,
        tokenAllocations: [
          { ticker: tokenSymbol, allocation: depositAmount }
        ]
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert(`Volume bot started for ${tokenSymbol}!`);
      await loadVolumeBotPositions();
    } else {
      alert(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error('Deposit error:', error);
    alert('Deposit failed. Check console.');
  }
}
```

### Add loadVolumeBotPositions() Function

**Add after depositToMM():**
```javascript
async function loadVolumeBotPositions() {
  if (!S.tradingAddress) return;
  
  try {
    const response = await fetch(`/api/volume-bot/dashboard/${S.tradingAddress}`);
    const result = await response.json();
    
    if (result.success) {
      updateVolumeBotUI(result.data);
    }
  } catch (error) {
    console.error('Failed to load positions:', error);
  }
}

function updateVolumeBotUI(dashboard) {
  const { performance, alerts, recentTrades } = dashboard;
  
  // Update positions section
  const positionsDiv = document.getElementById('mmPositions');
  if (performance.tokenAllocations.length === 0) {
    positionsDiv.innerHTML = `
      <div class="mm-empty-state">
        <span style="font-size:3rem">🤖</span>
        <p>No active volume bot positions</p>
      </div>
    `;
  } else {
    positionsDiv.innerHTML = performance.tokenAllocations.map(token => `
      <div class="mm-position-card" style="padding: 1.5rem; background: rgba(255,255,255,0.03); border-radius: 12px; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0;">${token.ticker}</h3>
          <span style="color: ${token.running ? 'var(--green)' : 'var(--miami-orange)'}">
            ${token.running ? '🟢 Active' : '🔴 Paused'}
          </span>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
          <div>
            <div style="color: var(--text-secondary); font-size: 0.85rem;">Allocation</div>
            <div style="font-weight: 600;">${token.allocation.toFixed(8)} BTC</div>
          </div>
          <div>
            <div style="color: var(--text-secondary); font-size: 0.85rem;">Current Value</div>
            <div style="font-weight: 600;">${token.currentValue.toFixed(8)} BTC</div>
          </div>
          <div>
            <div style="color: var(--text-secondary); font-size: 0.85rem;">P&L</div>
            <div style="font-weight: 600; color: ${token.pnlPercent >= 0 ? 'var(--green)' : 'var(--red)'}">
              ${token.pnlPercent >= 0 ? '+' : ''}${token.pnlPercent.toFixed(2)}%
            </div>
          </div>
          <div>
            <div style="color: var(--text-secondary); font-size: 0.85rem;">Volume 24h</div>
            <div style="font-weight: 600;">$${token.volumeGenerated24h.toFixed(0)}</div>
          </div>
          <div>
            <div style="color: var(--text-secondary); font-size: 0.85rem;">Trades</div>
            <div style="font-weight: 600;">${token.trades}</div>
          </div>
          <div>
            <div style="color: var(--text-secondary); font-size: 0.85rem;">Token Appreciation</div>
            <div style="font-weight: 600; color: ${token.tokenAppreciationPercent >= 0 ? 'var(--green)' : 'var(--red)'}">
              ${token.tokenAppreciationPercent >= 0 ? '+' : ''}${token.tokenAppreciationPercent.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }
}

// Start polling when on volume bot page
if (window.location.hash === '#volume-bot') {
  loadVolumeBotPositions();
  setInterval(loadVolumeBotPositions, 5000);
}
```

---

## 📊 Expected Simulated Behavior

**After depositing $1000 (0.0127 BTC):**

1. Two VolumeBot instances start (RAD + BOTT)
2. Every 30 seconds, bots place 10 ladder orders (5 bids + 5 asks each)
3. ~1% chance of fill per tick
4. When filled, ping-pong trade executes immediately
5. Volume accumulates in metrics
6. State saved to `data/mm/` every tick

**Expected fills in 24 hours:**
- Ticks: 2,880 (86,400 seconds / 30)
- Fills: ~29 (1% of 2,880)
- Volume generated: ~$1,150 (29 fills * 2x ping-pong * ~$20 avg)

---

## 🐛 Troubleshooting

### "Cannot find module '../mm/volume-bot'"
```bash
cd ~/.openclaw/workspace/projects/radfi-swap/backend
ls -la ../mm/volume-bot.js
# Should exist (15KB file)
```

### "ENOENT: no such file or directory, mkdir 'data/mm'"
Normal on first run. Directory is created automatically.

### Bots not starting
Check backend console for errors. Should see:
```
[VolumeBot] Starting for RAD, allocation: 0.00635 BTC
[VolumeBot] Initial purchase: 0.003175 BTC → XXX RAD
[VolumeBot] Placed BID: 0.000635 BTC @ $X.XXXXXXXX
...
```

### No fills after 5 minutes
Expected! Fill rate is only 1% per 30s tick. Average time to first fill: ~25 minutes.

---

## 📚 Documentation

- **Complete reference:** `memory/radlabs-volume-bot.md` (21KB)
- **Implementation summary:** `memory/2026-02-01-volume-bot-ready-to-start.md` (14KB)
- **Transformation log:** `memory/2026-02-01-volume-bot-transformation.md` (11KB)

---

## 🔄 Restore from Baseline

If anything breaks:

```bash
cd ~/.openclaw/workspace
tar -xzf radfi-swap-baseline-20260201-022440.tar.gz -C projects/radfi-swap-restored/
cd projects/radfi-swap-restored/backend
npm install
node server.js
```

Or revert to git tag:
```bash
cd projects/radfi-swap
git checkout v1.0-volume-bot-baseline
```

---

**Everything is ready. Let's wire the frontend and watch it run! 🚀**
