# RadLabs Testing Guide

**Updated:** February 1, 2026  
**Version:** 2.0 (with RadFi Trading Wallet Integration)

---

## Prerequisites

### Required
- ✅ Xverse wallet installed (Chrome extension)
- ✅ Bitcoin in your Xverse wallet
- ✅ Server running: `cd backend && node server.js`

### Bonus (for auto-sync testing)
- ✅ Previously used app.radfi.co with this wallet
- ✅ Created & funded RadFi trading wallet
- ✅ Have existing LP positions on RadFi

---

## Test 1: First-Time Connection (New User)

### Steps
1. Open http://localhost:3000
2. Click "Connect Wallet"
3. Select "Xverse"
4. Approve permission in Xverse popup
5. Sign authentication message
6. Wait for confirmation

### Expected Results
```
Toast Messages:
✅ "Creating RadFi trading wallet..."
✅ "Trading wallet ready: bc1p..."
ℹ️ "New trading wallet created. Fund it to start trading."

Header Shows:
[bc1p12...5678] [0.0000 BTC]
       ↑              ↑
  Connected      Zero balance
```

### Console Output
```
Session restored. Trading wallet: bc1p...
New trading wallet (no previous activity)
Checking for existing RadFi positions...
Found 0 existing LP positions
```

---

## Test 2: Existing RadFi User Connection

### Steps
1. Use Xverse wallet that was used on app.radfi.co
2. Open http://localhost:3000
3. Click "Connect Wallet"
4. Select "Xverse"
5. Sign authentication message
6. Wait for sync to complete

### Expected Results
```
Toast Messages:
✅ "Authenticating with RadFi..."
✅ "Synced existing RadFi wallet: bc1p..."
💰 "Trading wallet balance: 0.XXXX BTC"
✅ "Synced X existing position(s) from RadFi" (if you have positions)

Header Shows:
[bc1p12...5678] [0.XXXX BTC]
       ↑              ↑
  Connected      Your actual
                  balance
```

### Console Output
```
Existing RadFi wallet detected:
  Created: [date]
  First transaction: [date]
  Has LP positions: Yes/No

Checking for existing RadFi positions...
Found X existing LP positions
```

---

## Test 3: Wallet Details Modal

### Steps
1. After connecting, click the wallet address button in header
2. Read the modal

### Expected Results
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RadFi Trading Wallet Details
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Wallet (xverse):
[Your Xverse address]

Trading Wallet (2-of-2 multisig):
[Your RadFi trading wallet]

Balance: X.XXXXXXXX BTC
Created: [Date]
Status: [Previously used on RadFi / New wallet]

View on RadFi:
https://app.radfi.co
```

---

## Test 4: Balance Refresh

### Steps
1. Click the green balance badge in header
2. Wait for refresh

### Expected Results
```
Toast:
💰 "Trading wallet balance: X.XXXX BTC"

Or (if empty):
ℹ️ "Trading wallet is empty. Fund it to start trading."
```

---

## Test 5: Market Maker Position Sync

**Only if you have existing LP positions on RadFi**

### Steps
1. Connect wallet (with existing positions)
2. Navigate to "Market Maker" page
3. Check the positions table

### Expected Results
```
Positions Table Shows:
- Token name
- Deposited BTC amount
- Current value
- Fees earned
- IL %
- Total PnL
- APY
- Status: "active"

Toast:
✅ "Synced X existing position(s) from RadFi"
```

---

## Test 6: Session Persistence

### Steps
1. Connect wallet
2. Note balance shown
3. Refresh page (Cmd+R)
4. Check state

### Expected Results
```
After Refresh:
- Still shows "Connected"
- Still shows balance
- Still shows positions (if any)
- No need to reconnect

Console:
"Session restored. Trading wallet: bc1p..."
```

---

## Test 7: Market Maker Deposit

### Steps
1. Connect wallet with funded trading wallet
2. Navigate to "Market Maker" page
3. Select a token (e.g., PUPS)
4. Enter amount (e.g., 0.01)
5. Click "Deposit & Start MM"

### Expected Results
```
Toast Messages:
"Finding pool..."
"Calculating position..."
"Position created! Connect wallet to activate"

Positions Table:
- New row appears
- Status: "pending-auth"
- Shows deposited amount
- Shows token
```

---

## Test 8: Trading Wallet Details Inspection

### Open Browser DevTools (F12) → Console

Check these values:
```javascript
S.userAddress        // Your Xverse address
S.tradingAddress     // RadFi 2-of-2 multisig
S.tradingWalletBalance  // Balance in sats
S.hasWalletHistory   // true if used before
S.walletData         // Full wallet object
S.accessToken        // JWT token (should exist)
```

---

## Common Issues & Solutions

### Issue 1: "Failed to connect wallet"
**Cause:** Xverse not installed or popup blocked  
**Fix:** Install Xverse, allow popups

### Issue 2: Balance shows 0 but I have funds
**Cause:** Funds are in user wallet, not trading wallet  
**Fix:** Go to app.radfi.co and transfer to trading wallet

### Issue 3: Positions not syncing
**Cause:** Positions exist but tokens not loaded yet  
**Fix:** Wait 3 seconds, or refresh page

### Issue 4: "Authentication failed"
**Cause:** Wrong network or signature issue  
**Fix:** Make sure Xverse is on Bitcoin mainnet

### Issue 5: Modal shows "New wallet" but I used RadFi before
**Cause:** Different wallet address  
**Fix:** Make sure using same Xverse wallet you used on RadFi

---

## API Endpoints Hit (For Debugging)

### On Connect
1. `POST /api/auth/authenticate` - Creates/retrieves trading wallet
2. `GET /api/wallets/details/:address` - Gets balance
3. `GET /api/histories?userAddress=:address` - Checks history
4. `GET /api/positions?userAddress=:address` - Syncs positions

### On Balance Refresh
1. `GET /api/wallets/details/:address` - Re-fetches balance

### On Market Maker Deposit
1. `GET /api/pools` - Finds pool for token
2. `POST /api/market-maker/deploy` - Creates VM transaction (when auth ready)

---

## Success Criteria

### ✅ Connection Works
- [x] Xverse connects successfully
- [x] Trading wallet address shown
- [x] Balance displays (0 or actual)
- [x] No console errors

### ✅ Auto-Sync Works (Existing Users)
- [x] Detects existing wallet
- [x] Shows correct balance
- [x] Toast says "Synced existing RadFi wallet"
- [x] Positions appear if they exist

### ✅ Session Persists
- [x] Refresh doesn't disconnect
- [x] Balance survives refresh
- [x] Positions survive refresh

### ✅ UI is Correct
- [x] Header shows balance badge
- [x] Wallet details modal works
- [x] Click balance refreshes
- [x] Market Maker page loads

### ✅ Integration is Real
- [x] Uses actual RadFi API
- [x] Gets real wallet data
- [x] Shows real balances
- [x] Syncs real positions

---

## What to Report

### If Everything Works ✅
```
✅ Connected with Xverse
✅ Trading wallet: bc1p... (existing/new)
✅ Balance: X.XXXX BTC
✅ Synced X positions
✅ Session persists on refresh
✅ Ready for production
```

### If Something Breaks ❌
**Report:**
1. **What you did** - Step-by-step
2. **What you expected** - What should happen
3. **What actually happened** - Error message, wrong behavior
4. **Console output** - Copy full console log
5. **Network tab** - Check API responses (F12 → Network)

---

## Next Steps After Testing

### If Tests Pass
1. ✅ Mark integration complete
2. ✅ Deploy to production
3. ✅ Share with users

### If Tests Fail
1. Report findings
2. Debug specific issues
3. Re-test after fixes

---

## Useful Commands

### Start Server
```bash
cd ~/.openclaw/workspace/projects/radfi-swap/backend
node server.js
```

### Check Logs
```bash
# Server logs show API calls
# Browser console shows client-side activity
```

### Reset State (If Needed)
```javascript
// In browser console
localStorage.removeItem('radfi_auth');
localStorage.removeItem('mm_positions');
location.reload();
```

---

## Support

**Documentation:**
- `RADFI-TRADING-WALLET.md` - Trading wallet explanation
- `AUTO-SYNC-EXISTING-WALLET.md` - Auto-sync feature details
- `NO-PLACEHOLDERS.md` - Implementation completeness

**Code:**
- Frontend: `frontend/index.html` (search for "doConnect" or "fetchTradingWalletBalance")
- Backend: `backend/server.js` (search for "/api/auth/authenticate")

---

**Ready to test!** 🚀

Start the server and connect your Xverse wallet to see RadFi integration in action.
