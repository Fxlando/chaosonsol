# API Server - Production Backend

## Overview

The API Server provides a RESTful API and WebSocket interface to all backend functionality.

## Starting the Server

```bash
# Production
npm run api

# Development (with auto-reload)
npm run api:dev
```

## Environment Variables

```env
PORT=3000
NETWORK=mainnet-beta
HELIUS_API_KEY=your_key
QUICKNODE_ENDPOINT=your_endpoint
TRITON_ENDPOINT=your_endpoint
```

## API Base URL

- Development: `http://localhost:3000`
- Production: Configure based on deployment

## Features

- ✅ RESTful API for all operations
- ✅ WebSocket for real-time updates
- ✅ CORS enabled
- ✅ Error handling
- ✅ Request logging
- ✅ Graceful shutdown

## Integration with Webapp

The webapp uses `services/api-client.js` to connect to this API server.

## Documentation

See `API-DOCUMENTATION.md` for complete API reference.

