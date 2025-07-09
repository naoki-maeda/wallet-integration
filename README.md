# Wallet Integration with CloudFlare Workers

This project implements a wallet integration system using CloudFlare Workers, featuring iframe-based authentication and secure API proxying.

## Architecture

- **Frontend Worker** (`app.wallet-integration.workers.dev`): Handles iframe authentication flow and receives IdentityAndKeyManager via postMessage
- **Backend Worker** (`api.wallet-integration.workers.dev`): Provides cookie-based authenticated API proxy to the target wallet service

## Setup

### Prerequisites

- Node.js 18+ and npm
- Wrangler CLI (installed via npm)
- CloudFlare account

### Installation

```bash
npm install
```

### Configuration

1. Update `wrangler-frontend.toml` and `wrangler-backend.toml` with your CloudFlare settings

Key configuration variables:

- `ALLOWED_ORIGIN`: The origin of the wallet service you're integrating with
- `TARGET_IFRAME_URL`: The login URL to load in the iframe
- `TARGET_API_URL`: The API endpoint of the wallet service
- `COOKIE_NAME`: The name of the authentication cookie

## Development

Run the frontend worker:

```bash
npm run dev:frontend
```

Run the backend worker in a separate terminal:

```bash
npm run dev:backend
```

## Deployment

Deploy both workers to CloudFlare:

```bash
npm run deploy:all
```

Or deploy individually:

```bash
npm run deploy:frontend
npm run deploy:backend
```

## Docker

### build

```sh
docker build -f Dockerfile.backend -t wallet-backend .
docker build -f Dockerfile.frontend -t wallet-frontend .
```

### run

```sh
cp .env.example .env

docker run --network host --env-file .env -p 3333:3333 wallet-frontend
docker run --network host --env-file .env -p 4444:4444 wallet-backend
```

## License

MIT
