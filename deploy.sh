#!/bin/bash

echo "Deploying Wallet Integration Workers..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "Error: wrangler CLI is not installed. Please install it with 'npm install -g wrangler'"
    exit 1
fi

# Deploy frontend worker
echo "Deploying frontend worker..."
npm run deploy:frontend
if [ $? -ne 0 ]; then
    echo "Error: Frontend deployment failed"
    exit 1
fi

# Deploy backend worker
echo "Deploying backend worker..."
npm run deploy:backend
if [ $? -ne 0 ]; then
    echo "Error: Backend deployment failed"
    exit 1
fi

echo "Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Update your DNS settings if using custom domains"
echo "2. Configure environment variables in CloudFlare dashboard"
echo "3. Test the deployment with the provided URLs"
