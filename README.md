# 🚀 Solana P&L Tracker

A beautiful, real-time profit and loss tracker for Solana wallets with related wallet detection.

![Solana P&L Tracker](https://img.shields.io/badge/Solana-P%26L%20Tracker-14F195?style=for-the-badge&logo=solana)

## ✨ Features

- 📊 **Real-time P&L Analysis** - Track profit/loss across all token trades
- 🔍 **Related Wallets Detection** - Identify potentially related wallets with P&L tracking
- 📈 **Interactive Charts** - Visualize cumulative P&L over time
- 🎯 **Token Performance** - Detailed breakdown by token with ROI metrics
- ⏱️ **Multiple Timeframes** - 24h, 7d, 30d, and all-time analysis
- 💾 **CSV Export** - Export data for further analysis
- 🎨 **Beautiful UI** - Modern glassmorphic design with Solana branding

## 🔧 Setup

### 1. Get a Free Helius API Key

1. Go to [helius.dev](https://helius.dev)
2. Sign up for a free account
3. Create a new API key (free tier includes 100k requests/month)
4. Copy your API key

### 2. Local Development

1. Clone or download this repository
2. Create a `.env` file in the root directory:
   ```bash
   HELIUS_API_KEY=your_helius_api_key_here
   ```
3. Open `index.html` in your browser

**Note:** For local development, you can also test with demo data by setting `USE_DEMO_DATA: true` in `app.js`.

## 🌐 Deploy to Vercel

### Quick Deploy (Recommended)

Click the button below to deploy to Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=YOUR_GITHUB_REPO_URL)

### Manual Deployment

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Navigate to the project directory:
   ```bash
   cd solana-pnl-tracker
   ```

3. Deploy:
   ```bash
   vercel
   ```

4. Follow the prompts and set up your environment variable:
   - **Environment Variable Name:** `HELIUS_API_KEY`
   - **Value:** Your Helius API key
   - **Environments:** Production, Preview, Development

### Environment Variables on Vercel

After deployment, add your API key in the Vercel dashboard:

1. Go to your project dashboard
2. Click "Settings" → "Environment Variables"
3. Add:
   - **Name:** `HELIUS_API_KEY`
   - **Value:** Your Helius API key
   - **Environments:** Check all (Production, Preview, Development)
4. Redeploy your application

## 📖 Usage

1. **Enter a Solana wallet address** in the search box
   - Example: `9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM`

2. **Click "Analyze Wallet"** to fetch and analyze transactions

3. **View Results:**
   - Total P&L and win rate
   - Related wallets with P&L tracking
   - Token performance breakdown
   - Interactive P&L chart

4. **Export Data:** Click the export button to download CSV

## 🔒 Privacy & Security

- **API keys are never exposed** in the frontend code
- All API calls are made client-side to Helius
- No wallet private keys are required
- No user data is stored or transmitted to third parties

## 🛠️ Technical Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Charts:** Chart.js
- **APIs:** 
  - Helius Enhanced Transactions API
  - Jupiter Price API
  - Solana RPC (fallback)
- **Deployment:** Vercel
- **Styling:** Custom CSS with glassmorphism and gradients

## 📊 API Limits

### Helius Free Tier
- 100,000 requests/month
- Enhanced transaction parsing
- Real-time data

For higher limits, upgrade your Helius plan at [helius.dev/pricing](https://helius.dev/pricing).

## 🐛 Troubleshooting

### "No transactions found"
- Make sure the wallet address is correct
- Check if the wallet has any swap transactions
- Try with a different wallet address

### API Errors
- Verify your Helius API key is correct
- Check API rate limits
- Try again in a few moments

### Demo Data Fallback
If the app can't fetch real data, it automatically falls back to demo data so you can still test the functionality.

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## 📄 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🙏 Acknowledgments

- Built on Solana blockchain
- Powered by Helius API
- Price data from Jupiter Aggregator
- Icons and design inspiration from Solana ecosystem

---

**Made with ❤️ for the Solana community**
