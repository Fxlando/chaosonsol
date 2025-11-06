# API Documentation

## Production API Server

The API server provides a RESTful interface to all backend functionality.

### Starting the Server

```bash
npm run api
# or for development with auto-reload
npm run api:dev
```

Server runs on: `http://localhost:3000`

## API Endpoints

### Health Check

**GET** `/health`

Returns server health status.

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "network": "mainnet-beta"
}
```

### Initialize App

**POST** `/api/initialize`

Initializes the Chaos Bot application.

**Request Body:**
```json
{
  "config": {
    "network": "mainnet-beta",
    "trading": { "defaultSlippage": 1.0 }
  }
}
```

**Response:**
```json
{
  "success": true,
  "status": { ... }
}
```

### Wallets

#### Create Wallet

**POST** `/api/wallets/create`

**Request Body:**
```json
{
  "name": "My Wallet",
  "tags": ["trading"]
}
```

**Response:**
```json
{
  "success": true,
  "wallet": {
    "id": "wallet_123",
    "name": "My Wallet",
    "publicKey": "...",
    "tags": ["trading"]
  }
}
```

#### Import Wallet

**POST** `/api/wallets/import`

**Request Body:**
```json
{
  "privateKey": "...",
  "name": "Imported Wallet",
  "tags": []
}
```

#### Get All Wallets

**GET** `/api/wallets`

Returns all wallets with balances.

#### Get Wallet

**GET** `/api/wallets/:walletId`

Returns specific wallet with balance.

### Trading

#### Buy Token

**POST** `/api/trading/buy`

**Request Body:**
```json
{
  "walletId": "wallet_123",
  "tokenMint": "TokenMintAddress",
  "solAmount": 0.1,
  "options": {
    "slippage": 1.0
  }
}
```

**Response:**
```json
{
  "success": true,
  "signature": "transaction_signature",
  "tokenAmount": 1000000,
  "solAmount": 0.1,
  "priceImpact": 0.5
}
```

#### Sell Token

**POST** `/api/trading/sell`

**Request Body:**
```json
{
  "walletId": "wallet_123",
  "tokenMint": "TokenMintAddress",
  "tokenAmount": 1000000,
  "options": {
    "slippage": 1.0
  }
}
```

#### Swap Tokens

**POST** `/api/trading/swap`

**Request Body:**
```json
{
  "walletId": "wallet_123",
  "inputMint": "InputTokenMint",
  "outputMint": "OutputTokenMint",
  "inputAmount": 1000000,
  "options": {}
}
```

#### Get Quote

**GET** `/api/trading/quote?inputMint=...&outputMint=...&amount=...`

Get swap quote without executing.

#### Get Token Price

**GET** `/api/trading/price/:tokenMint`

Get current token price.

### Token Launch

#### Launch Token

**POST** `/api/tokens/launch`

**Request Body:**
```json
{
  "walletId": "wallet_123",
  "metadata": {
    "name": "My Token",
    "symbol": "TOKEN",
    "description": "Token description",
    "image": "https://example.com/image.png",
    "twitter": "https://twitter.com/token",
    "telegram": "https://t.me/token",
    "website": "https://token.com"
  },
  "initialBuy": 0.1,
  "options": {}
}
```

**Response:**
```json
{
  "success": true,
  "tokenMint": "TokenMintAddress",
  "signature": "transaction_signature",
  "metadataUri": "ipfs://...",
  "initialBuy": {
    "success": true,
    "signature": "..."
  }
}
```

#### Create Token

**POST** `/api/tokens/create`

Create token without initial buy.

### Smart Sell

#### Add Position

**POST** `/api/smartsell/add`

**Request Body:**
```json
{
  "walletId": "wallet_123",
  "tokenMint": "TokenMintAddress",
  "entryPrice": 0.001,
  "amount": 1000000,
  "options": {
    "profitTarget": 30,
    "stopLoss": -15,
    "trailingStop": 10
  }
}
```

#### Get Positions

**GET** `/api/smartsell/positions`

Returns all monitored positions.

#### Remove Position

**DELETE** `/api/smartsell/positions/:walletId/:tokenMint`

### Volume Bot

#### Start Session

**POST** `/api/volumebot/start`

**Request Body:**
```json
{
  "walletIds": ["wallet_1", "wallet_2"],
  "tokenMint": "TokenMintAddress",
  "config": {
    "totalVolume": 1.0,
    "cycles": 10,
    "continuous": false
  }
}
```

#### Get Sessions

**GET** `/api/volumebot/sessions`

#### Stop Session

**POST** `/api/volumebot/stop/:sessionId`

### Status

#### Get Status

**GET** `/api/status`

Returns application status and RPC stats.

### PumpFun

#### Get Token Info

**GET** `/api/pumpfun/token/:tokenMint`

#### Get Trending Tokens

**GET** `/api/pumpfun/trending?limit=20`

### Jupiter

#### Get Token List

**GET** `/api/jupiter/tokens`

## WebSocket Events

Connect to WebSocket for real-time updates:

```javascript
const socket = io('http://localhost:3000');

socket.on('trade', (data) => {
  console.log('Trade executed:', data);
});

socket.on('token-launch', (data) => {
  console.log('Token launched:', data);
});

// Subscribe to channels
socket.emit('subscribe', 'trades');
socket.emit('subscribe', 'token-launches');
```

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message"
}
```

Status codes:
- `200` - Success
- `400` - Bad Request
- `404` - Not Found
- `500` - Internal Server Error

