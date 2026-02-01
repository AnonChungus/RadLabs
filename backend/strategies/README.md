# RadFi Market Making Strategies

## Overview
This directory contains market making strategies adapted for the RadFi ecosystem. Unlike traditional market making on Bitcoin L1 (expensive), these strategies leverage RadFi's efficient pool system for profitable automated trading.

## Key Differences from Traditional MM
- **No expensive BTC L1 transactions** - All trades happen within RadFi pools
- **Uses RadFi trading wallets** - Multi-sig wallets with efficient settlement
- **LP-based liquidity** - Provide liquidity to pools and earn fees
- **Lower gas costs** - Batched transactions and smart contract efficiency

## Strategies

### 1. Jane Street Style (`jane-street.js`)
**Approach:** Tight spreads, high frequency, mean reversion
- Maintains narrow bid-ask spreads
- Quick rebalancing on price movement
- Statistical arbitrage on mean reversion
- Target APY: 25-40%

### 2. Citadel Style (`citadel.js`)
**Approach:** Adaptive spreads, inventory management
- Dynamic spread adjustment based on volatility
- Active inventory risk management
- Hedging positions across multiple tokens
- Target APY: 30-50%

## RadFi Integration

### Required API Endpoints
From RadFi docs: https://staging.api.radfi.co/api/docs/openapi.yaml

1. **/api/pools** - Get pool information
2. **/api/transactions** - Create swap/liquidity transactions
3. **/api/wallets** - Manage trading wallets
4. **/api/tokens** - Get token prices and data
5. **/api/histories** - Track transaction history

### Authentication
Uses BIP322 signature verification with JWT tokens

### Transaction Flow
1. User deposits BTC to RadFi trading wallet
2. Strategy monitors price action
3. Executes trades via RadFi pool swaps
4. Rebalances liquidity positions
5. User can withdraw anytime

## Implementation TODO
- [ ] Fetch Jane Street strategy from skillsmp.com
- [ ] Fetch Citadel strategy from skillsmp.com
- [ ] Adapt strategies for RadFi API calls
- [ ] Implement wallet management
- [ ] Create position tracking
- [ ] Build P&L calculation
- [ ] Add risk management controls
