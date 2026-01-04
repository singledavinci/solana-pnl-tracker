# 🚀 Deployment Guide - Solana P&L Tracker

Your Solana P&L Tracker is ready to deploy with real on-chain integration!

## ✅ What's been set up:

1. **Real API Integration** using Helius
2. **Serverless function** for environment variables
3. **Git repository** initialized and committed
4. **Vercel CLI** installed
5. **Project configured** for deployment

## 📋 Pre-Deployment Checklist

Before deploying, you'll need:

✅ A **Helius API Key** (free at [helius.dev](https://helius.dev))
   - Sign up for free
   - Create a new API key
   - Free tier: 100,000 requests/month

✅ A **Vercel Account** (free at [vercel.com](https://vercel.com))
   - Sign up with GitHub, GitLab, or email
   - Free tier includes unlimited deployments

## 🎯 Deployment Options

### Option 1: Deploy via Vercel Dashboard (RECOMMENDED - Easiest)

1. **Push to GitHub:**
   ```bash
   # Create a new repository on github.com
   # Then run:
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin master
   ```

2. **Import to Vercel:**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Click "Import Git Repository"
   - Select your repository
   - Click "Import"

3. **Add Environment Variable:**
   - In the import screen, expand "Environment Variables"
   - Add:
     - **Name:** `HELIUS_API_KEY`
     - **Value:** Your Helius API key
   - Click "Deploy"

4. **Done!** Your app will be live in ~30 seconds

### Option 2: Deploy via Vercel CLI

1. **Login to Vercel:**
   ```bash
   vercel login
   ```
   Follow the prompts to authenticate.

2. **Deploy:**
   ```bash
   cd C:\Users\abdul\.gemini\antigravity\scratch\solana-pnl-tracker
   vercel
   ```
   
3. **Answer the prompts:**
   - Set up and deploy? **Y**
   - Which scope? **[Your account]**
   - Link to existing project? **N**
   - What's your project's name? **solana-pnl-tracker**
   - In which directory is your code located? **.**
   - Want to override the settings? **N**

4. **Add Environment Variable:**
   ```bash
   vercel env add HELIUS_API_KEY
   ```
   Paste your Helius API key when prompted.
   Select: **Production**, **Preview**, **Development**

5. **Redeploy with env vars:**
   ```bash
   vercel --prod
   ```

6. **Done!** You'll get a production URL

## 🔐 Setting Up Your Helius API Key

1. Visit [dev.helius.xyz](https://dev.helius.xyz)
2. Click "Sign Up" (free account)
3. Verify your email
4. Go to "API Keys" in dashboard
5. Click "Create New API Key"
6. Name it "Solana PnL Tracker"
7. Copy the API key

## 🧪 Testing After Deployment

Once deployed, test with these steps:

1. **Visit your deployed URL**
2. **Enter a test wallet address:**
   - `9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM` (demo wallet)
3. **Click "Analyze Wallet"**
4. **Check developer console** for API calls (F12)
5. **Verify data is loading** from Helius API

## 🔧 Troubleshooting

### "Demo data" appears instead of real data
- Check that `HELIUS_API_KEY` environment variable is set
- Redeploy after adding environment variables
- Check console for API errors

### API Errors
- Verify API key is correct (no extra spaces)
- Check Helius API usage limits
- Try a different wallet address

### Deployment Fails
- Make sure all files are committed to git
- Check ver cel.json is valid JSON
- Try deploying from GitHub instead of CLI

## 📊 Monitor Usage

Track your API usage:
- Visit [dev.helius.xyz/dashboard](https://dev.helius.xyz/dashboard)
- View requests per day/month
- Upgrade if you hit limits

## 🎉 After Deployment

Your app will be available at a URL like:
```
https://solana-pnl-tracker-username.vercel.app
```

You can:
- ✅ Share the URL with anyone
- ✅ Set a custom domain (in Vercel dashboard)
- ✅ Enable analytics (in Vercel dashboard)
- ✅ Set up automatic deployments from GitHub

## 🔄 Making Updates

To update your deployed app:

1. **Make changes locally**
2. **Commit changes:**
   ```bash
   git add .
   git commit -m "Your change description"
   ```
3. **Deploy:**
   - If linked to GitHub: `git push` (auto-deploys)
   - If using CLI: `vercel --prod`

---

## 🆘 Need Help?

- **Vercel Docs:** [vercel.com/docs](https://vercel.com/docs)
- **Helius Docs:** [docs.helius.dev](https://docs.helius.dev)
- **Check Console:** Press F12 in browser to see errors

---

**Ready to deploy? Follow Option 1 or Option 2 above! 🚀**
