# MetaPOL Decentralized Matrix & Passive Mining Ecosystem

MetaPOL is a premium, international-grade Web3 decentralized matrix and passive mining application built on the **Polygon Mainnet**. This repository contains the complete frontend codebase. It communicates directly with the Polygon blockchain using Ethers.js, requiring no database or backend servers.

## Tech Stack
* **HTML5** & **Vanilla CSS3** (Sleek Glassmorphic Dark UI)
* **Vanilla JavaScript** (Ethers.js v6 integration)
* **FontAwesome** (UI icons)
* **Google Fonts** (Outfit & Inter typographies)

---

## File Structure

```text
├── assets/
│   ├── logo.jpg               # MetaPOL Project Brand Logo
│   └── MetaPOL.pdf            # MetaPOL Presentation PDF Slide
├── index.html                 # Marketing Homepage with ROI Calculator
├── register.html              # Account Onboarding Sponsor Registrations
├── dashboard.html             # Client Portal Dashboard Tab-Terminal
├── admin.html                 # Secured owner-only Founder Grant Panel
├── style.css                  # Core Glassmorphic Style rules & animations
├── app.js                     # Core Web3 Wallet connection & routing logic
├── dashboard.js               # Client Portal data updates & live ROI ticker
├── admin.js                   # Back-office statistics scanner
├── abi.js                     # Smart Contract ABI array configurations
├── config.js                  # Deployment configurations (RPC, Contracts, etc.)
└── README.md                  # Deployment Guide Documentation
```

---

## Smart Contract Details
* **Contract Address**: `0x9820ea1ad8bbff1f6a8a8efe26a20b4447ecb1ab`
* **Ecosystem Fee Allocations**:
  * **Matrix Pools**: 72%
  * **Passive Mining Capital**: 20%
  * **System Admin Fee**: 8%
* **Registration Cost**: 5.0 POL
* **Ecosystem Levels**: 12 Slot levels (ranging from 10 POL to 20,480 POL)
* **Mining Yield**: 1.5% daily passive returns on mining capital (capped at 5x multiplier = original slot price).

---

## Configuration & Customization
All contract variables and network targets are configured in [config.js](config.js):
```javascript
const CONFIG = {
    CONTRACT_ADDRESS: "0x9820ea1ad8bbff1f6a8a8efe26a20b4447ecb1ab",
    CHAIN_ID: "0x89", // Hex representation of 137 (Polygon Mainnet)
    RPC_URL: "https://polygon-rpc.com",
    BLOCK_EXPLORER: "https://polygonscan.com",
    DEFAULT_SPONSOR_ID: 1, // Fallback sponsor ID
    ...
};
```
To target a testnet like Polygon Amoy, update `CONTRACT_ADDRESS`, `CHAIN_ID` to `"0x13882"`, and `RPC_URL`/`BLOCK_EXPLORER` accordingly.

---

## Local Verification
Since this application uses vanilla assets, you can run it directly by hosting it on any local HTTP server.

For example, using Python:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in your web browser with MetaMask, Coinbase Wallet, or Trust Wallet browser.

---

## Production Deployment

### 1. Upload to GitHub
1. Create a new repository on your GitHub account (e.g. `metapol-dapp`).
2. Initialize git and commit all files in this workspace:
   ```bash
   git init
   git add .
   git commit -m "Initialize MetaPOL Web3 DApp"
   ```
3. Push to your GitHub repository:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/metapol-dapp.git
   git branch -M main
   git push -u origin main
   ```

### 2. Deploy on Vercel
1. Go to [Vercel](https://vercel.com) and log in with your GitHub account.
2. Click **Add New** > **Project**.
3. Select your `metapol-dapp` repository from the list.
4. Keep the default settings (Vercel automatically detects HTML/CSS/JS applications and requires no build configurations).
5. Click **Deploy**.
6. Once deployed, Vercel will provide a secure HTTPS URL (e.g., `https://metapol-dapp.vercel.app`).

### 3. Setup Custom Domain (Optional)
Inside the Vercel dashboard:
1. Navigate to **Project Settings** > **Domains**.
2. Add your custom domain (e.g., `metapol.io`).
3. Set up the CNAME/A records in your DNS manager (like Cloudflare or GoDaddy) pointing to Vercel's nameservers as instructed.

---

## Security & Features
* **Automatic Route Interceptor**: Checks if a wallet is connected. If connected, it queries the contract:
  * If unregistered, redirects to `register.html`.
  * If registered, redirects to `dashboard.html` (interlocking landing/onboarding pages).
* **Live ROI Ticker**: Simulates block time locally using high-frequency Javascript intervals synced with contract parameters. Updates every 100ms for continuous decimal increments.
* **Gas-Limit Estimation**: Before sending registrations or upgrades, the app automatically estimates gas limits on the connected chain and adds a 20% safety margin to ensure success.
* **Network Enforcer**: Auto-switches network to Polygon Mainnet if connected to Ethereum, BNB Chain, etc.
