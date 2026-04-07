#!/bin/bash
set -euo pipefail
exec > /var/log/bitsage-setup.log 2>&1

echo "=== BitSage Validator Dashboard EC2 Setup ==="
echo "Started: $(date)"

# System updates
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git nginx certbot python3-certbot-nginx

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Create app user
useradd -m -s /bin/bash bitsage || true

# Clone repository
cd /home/bitsage
sudo -u bitsage git clone https://github.com/Bitsage-Network/Bitsage-Validators.git app
cd /home/bitsage/app

# Create .env.local with production env vars
sudo -u bitsage cat > .env.local << 'ENVEOF'
NEXT_PUBLIC_STARKNET_NETWORK=sepolia
NEXT_PUBLIC_ENABLE_TESTNETS=true
NEXT_PUBLIC_RPC_URL=https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/demo
NEXT_PUBLIC_API_URL=https://api.sepolia.bitsage.network
NEXT_PUBLIC_WS_URL=wss://api.sepolia.bitsage.network/ws
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_SAGE_TOKEN_ADDRESS=0x072349097c8a802e7f66dc96b95aca84e4d78ddad22014904076c76293a99850
NEXT_PUBLIC_OTC_ORDERBOOK_ADDRESS=0x7b2b59d93764ccf1ea85edca2720c37bba7742d05a2791175982eaa59cedef0
NEXT_PUBLIC_PRIVACY_POOLS_ADDRESS=0xd85ad03dcd91a075bef0f4226149cb7e43da795d2c1d33e3227c68bfbb78a7
NEXT_PUBLIC_CONFIDENTIAL_SWAP_ADDRESS=0x056b76b42487b943a0d33f5787437ee08af9fd61e1926de9602b3cfb5392f1d6
NEXT_PUBLIC_FAUCET_ADDRESS=0x62d3231450645503345e2e022b60a96aceff73898d26668f3389547a61471d3
NEXT_PUBLIC_JOB_MANAGER_ADDRESS=0x355b8c5e9dd3310a3c361559b53cfcfdc20b2bf7d5bd87a84a83389b8cbb8d3
NEXT_PUBLIC_REPUTATION_MANAGER_ADDRESS=0x4ef80990256fb016381f57c340a306e37376c1de70fa11147a4f1fc57a834de
NEXT_PUBLIC_PROVER_STAKING_ADDRESS=0x3287a0af5ab2d74fbf968204ce2291adde008d645d42bc363cb741ebfa941b
NEXT_PUBLIC_CONFIDENTIAL_TRANSFER_ADDRESS=0x07ab4e4cf7ec2fca487573efe4573aee7e24c60a3aee080befc763cc0f400e86
ENVEOF

# Copy env to each app
cp .env.local apps/validator/.env.local
cp .env.local apps/faucet/.env.local
cp .env.local apps/governance/.env.local

# Install dependencies
sudo -u bitsage npm install

# Build root app (validator dashboard)
sudo -u bitsage npx next build || true

# Build validator app
cd /home/bitsage/app/apps/validator
sudo -u bitsage npx next build || true

# Build faucet app
cd /home/bitsage/app/apps/faucet
sudo -u bitsage npx next build || true

# Build governance app
cd /home/bitsage/app/apps/governance
sudo -u bitsage npx next build || true

# PM2 ecosystem config
cd /home/bitsage/app
sudo -u bitsage cat > ecosystem.config.js << 'PM2EOF'
module.exports = {
  apps: [
    {
      name: 'validator',
      cwd: '/home/bitsage/app',
      script: 'node_modules/.bin/next',
      args: 'start --port 3000',
      env: { NODE_ENV: 'production', PORT: 3000 },
    },
    {
      name: 'faucet',
      cwd: '/home/bitsage/app/apps/faucet',
      script: 'node_modules/.bin/next',
      args: 'start --port 3001',
      env: { NODE_ENV: 'production', PORT: 3001 },
    },
    {
      name: 'governance',
      cwd: '/home/bitsage/app/apps/governance',
      script: 'node_modules/.bin/next',
      args: 'start --port 3002',
      env: { NODE_ENV: 'production', PORT: 3002 },
    },
  ],
};
PM2EOF

# Start all apps with PM2
sudo -u bitsage pm2 start ecosystem.config.js
sudo -u bitsage pm2 save

# PM2 startup on boot
env PATH=$PATH:/usr/bin pm2 startup systemd -u bitsage --hp /home/bitsage
sudo -u bitsage pm2 save

# Nginx configuration
cat > /etc/nginx/sites-available/bitsage-validators << 'NGINXEOF'
# Security headers (shared)
map $uri $csp_header {
    default "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss://*.bitsage.network https://*.bitsage.network https://*.alchemy.com https://*.starknet.io; img-src 'self' data:; font-src 'self' data:;";
}

# Validator Dashboard
server {
    listen 80;
    server_name validators.bitsage.network;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy $csp_header always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Faucet
server {
    listen 80;
    server_name faucet.bitsage.network;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Governance
server {
    listen 80;
    server_name governance.bitsage.network;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/bitsage-validators /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo "=== Setup complete: $(date) ==="
echo "Validator: http://validators.bitsage.network (port 3000)"
echo "Faucet: http://faucet.bitsage.network (port 3001)"
echo "Governance: http://governance.bitsage.network (port 3002)"
