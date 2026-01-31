# RadFi Swap - Bitcoin Runes Trading Platform

A trading aggregator built on top of RadFi's AMM protocol for Bitcoin and Runes, with a 1% platform fee.

## Features

- **Token Trading**: Swap BTC for Runes and vice versa
- **1% Platform Fee**: Automatically deducted from swaps
- **Live Charts**: Price charts with anime money printer video background
- **Instant Buys**: Quick buy buttons for common amounts
- **Market Cap Display**: All prices shown in market cap format
- **Wallet Integration**: Supports Unisat, Xverse, and OKX wallets
- **Responsive Design**: Works on desktop and mobile

## Architecture

```
radfi-swap/
├── backend/
│   ├── server.js      # Express proxy server with fee logic
│   └── package.json   # Node.js dependencies
└── frontend/
    └── index.html     # Complete trading UI
```

### Backend

The backend is a Node.js/Express server that:
1. Proxies all requests to RadFi's API
2. Adds 1% platform fee to swap transactions
3. Serves the frontend static files
4. Handles CORS for browser requests

### Frontend

Single-page HTML application with:
- Real-time token prices from RadFi API
- Interactive price charts
- Swap interface with quote calculation
- Wallet connection modal
- Token selection modal
- Responsive design

## Setup

### 1. Configure Fee Wallet

Edit `backend/server.js` and set your BTC wallet address:

```javascript
const FEE_WALLET = 'YOUR_BTC_WALLET_ADDRESS_HERE';
```

### 2. Install Dependencies

```bash
cd backend
npm install
```

### 3. Run the Server

```bash
npm start
```

Server runs on `http://localhost:3000`

### 4. (Optional) Environment Variables

```bash
PORT=3000              # Server port
FEE_WALLET=bc1q...     # Your BTC fee collection address
```

## API Endpoints

### Public (No Auth)
- `GET /api/tokens` - List all tokens with prices
- `GET /api/tokens/details` - Get specific token info
- `GET /api/pools` - List liquidity pools
- `GET /api/histories` - Transaction history
- `GET /api/transactions/mempool-fee` - Current network fees
- `GET /api/platform` - Platform info and fee config

### Swap (With Quote)
- `POST /api/quote` - Get swap quote with platform fee
- `POST /api/transactions` - Create swap transaction
- `POST /api/transactions/sign` - Sign and broadcast

### Auth (Proxied)
- `POST /api/auth/authenticate` - BIP322 wallet auth
- `POST /api/auth/refresh-token` - Refresh JWT
- `POST /api/wallets` - Create trading wallet

## Fee Structure

- **Platform Fee**: 1% of swap input amount
- **Network Fee**: Varies based on Bitcoin mempool
- **RadFi Protocol Fee**: Built into pool rates

Example: Swapping 0.01 BTC
- Platform fee: 0.0001 BTC (1%)
- Net swap amount: 0.0099 BTC

## RadFi API Reference

This app uses the RadFi API at `https://staging.api.radfi.co`

Key endpoints used:
- `/api/tokens` - Token listings and prices
- `/api/pools` - Liquidity pool data
- `/api/transactions` - Transaction creation
- `/api/auth/authenticate` - BIP322 authentication

Full docs: https://docs.radfi.co/

## Security Notes

1. **Fee Wallet**: Set a secure cold storage address for fee collection
2. **API Keys**: RadFi uses BIP322 signature auth, no API keys needed
3. **CORS**: Backend handles CORS for frontend requests
4. **JWT**: Tokens stored in browser localStorage

## Production Deployment

1. Change API base to production: `https://api.radfi.co`
2. Set up SSL/HTTPS
3. Configure proper CORS origins
4. Use environment variables for sensitive config
5. Add rate limiting and logging

## TODO

- [ ] Set production BTC fee wallet address
- [ ] Add transaction history view
- [ ] Implement proper chart data from histories API
- [ ] Add price alerts
- [ ] Mobile app version
- [ ] Portfolio tracking

## License

MIT
