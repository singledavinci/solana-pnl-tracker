import { NextResponse } from 'next/server';

// Token Position Tracker
class TokenPosition {
    constructor(mint, symbol) {
        this.mint = mint;
        this.symbol = symbol;
        this.totalBought = 0;
        this.totalSpent = 0;
        this.totalSold = 0;
        this.totalReceived = 0;
        this.remaining = 0;
        this.realizedPnL = 0;
        this.trades = [];
    }

    buy(amount, pricePerToken, timestamp, signature) {
        const cost = amount * pricePerToken;
        this.totalSpent += cost;
        this.totalBought += amount;
        this.remaining += amount;
        this.trades.push({ type: 'BUY', amount, price: pricePerToken, timestamp, signature });
    }

    sell(amount, pricePerToken, timestamp, signature) {
        const avgCost = this.totalBought > 0 ? this.totalSpent / this.totalBought : 0;
        const revenue = amount * pricePerToken;
        const cost = amount * avgCost;

        this.realizedPnL += (revenue - cost);
        this.totalSold += amount;
        this.totalReceived += revenue;
        this.remaining -= amount;
        this.trades.push({ type: 'SELL', amount, price: pricePerToken, timestamp, signature });
    }

    getAvgEntryPrice() {
        return this.totalBought > 0 ? this.totalSpent / this.totalBought : 0;
    }

    getAvgExitPrice() {
        return this.totalSold > 0 ? this.totalReceived / this.totalSold : 0;
    }

    getROI() {
        if (this.totalSpent === 0) return 0;
        return (this.realizedPnL / this.totalSpent) * 100;
    }
}

const BASE_TOKENS = {
    'So11111111111111111111111111111111111111112': 'SOL',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT'
};

function isBaseToken(mint) {
    return mint in BASE_TOKENS;
}

function detectTradeType(transaction, wallet) {
    const tokenTransfers = transaction.tokenTransfers || [];

    const baseTokenOut = tokenTransfers.find(t =>
        t.fromUserAccount === wallet && isBaseToken(t.mint)
    );

    const baseTokenIn = tokenTransfers.find(t =>
        t.toUserAccount === wallet && isBaseToken(t.mint)
    );

    if (baseTokenOut) return 'BUY';
    if (baseTokenIn) return 'SELL';
    return null;
}

function detectRelatedWallets(transactions, mainWallet) {
    const walletInteractions = new Map();

    for (const tx of transactions) {
        try {
            // Parse accountData to find interacting wallets
            if (tx.accountData && Array.isArray(tx.accountData)) {
                for (const account of tx.accountData) {
                    const address = account.account;
                    if (!address || address === mainWallet) continue;

                    if (!walletInteractions.has(address)) {
                        walletInteractions.set(address, {
                            address,
                            interactions: 0,
                            solTransferred: 0,
                            lastSeen: tx.timestamp || 0,
                            firstSeen: tx.timestamp || 0,
                        });
                    }

                    const data = walletInteractions.get(address);
                    data.interactions++;

                    // Track SOL transferred
                    if (account.nativeBalanceChange) {
                        data.solTransferred += Math.abs(account.nativeBalanceChange / 1e9);
                    }

                    // Update last seen
                    if (tx.timestamp && tx.timestamp > data.lastSeen) {
                        data.lastSeen = tx.timestamp;
                    }
                }
            }
        } catch (error) {
            continue;
        }
    }

    // Filter and score wallets
    const relatedWallets = [];
    const now = Date.now() / 1000;

    walletInteractions.forEach((data) => {
        // Only include wallets with at least 2 interactions
        if (data.interactions < 2) return;

        let riskScore = 0;

        // Score based on interaction count (max 40 points)
        if (data.interactions > 10) riskScore += 40;
        else if (data.interactions > 5) riskScore += 25;
        else riskScore += 10;

        // Score based on SOL transferred (max 30 points)
        if (data.solTransferred > 100) riskScore += 30;
        else if (data.solTransferred > 10) riskScore += 20;
        else riskScore += 10;

        // Score based on recency (max 20 points)
        const daysSinceLastInteraction = (now - data.lastSeen) / 86400;
        if (daysSinceLastInteraction < 1) riskScore += 20;
        else if (daysSinceLastInteraction < 7) riskScore += 10;

        // Score based on interaction frequency (max 10 points)
        const interactionPeriod = data.lastSeen - data.firstSeen;
        const interactionsPerDay = interactionPeriod > 0 ? data.interactions / (interactionPeriod / 86400) : 0;
        if (interactionsPerDay > 5) riskScore += 10;

        // Determine risk level
        let riskLevel = 'low';
        if (riskScore >= 70) riskLevel = 'high';
        else if (riskScore >= 40) riskLevel = 'medium';

        relatedWallets.push({
            address: data.address,
            interactions: data.interactions,
            solTransferred: data.solTransferred,
            riskScore,
            riskLevel,
            lastSeen: data.lastSeen
        });
    });

    // Sort by risk score and return top 10
    return relatedWallets
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 10);
}

function extractSwapDetails(transaction, wallet, tradeType) {
    const tokenTransfers = transaction.tokenTransfers || [];

    let targetToken, baseToken;

    if (tradeType === 'BUY') {
        baseToken = tokenTransfers.find(t =>
            t.fromUserAccount === wallet && isBaseToken(t.mint)
        );
        targetToken = tokenTransfers.find(t =>
            t.toUserAccount === wallet && !isBaseToken(t.mint)
        );
    } else {
        targetToken = tokenTransfers.find(t =>
            t.fromUserAccount === wallet && !isBaseToken(t.mint)
        );
        baseToken = tokenTransfers.find(t =>
            t.toUserAccount === wallet && isBaseToken(t.mint)
        );
    }

    if (!targetToken || !baseToken) return null;

    const targetAmount = targetToken.tokenAmount;
    const baseAmount = baseToken.tokenAmount;
    const pricePerToken = baseAmount / targetAmount;

    return {
        mint: targetToken.mint,
        symbol: targetToken.symbol || 'UNKNOWN',
        amount: targetAmount,
        pricePerToken,
        baseAmount,
        baseCurrency: BASE_TOKENS[baseToken.mint]
    };
}

export async function POST(request) {
    try {
        const { walletAddress, apiKey, timeframe } = await request.json();

        if (!walletAddress || !apiKey) {
            return NextResponse.json(
                { error: 'Missing wallet address or API key' },
                { status: 400 }
            );
        }

        // Fetch transactions from Helius (request more to ensure we get enough for different timeframes)
        const heliusUrl = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${apiKey}&limit=1000`;

        console.log(`Fetching transactions for timeframe: ${timeframe}`);
        const response = await fetch(heliusUrl);

        if (!response.ok) {
            return NextResponse.json(
                { error: `Helius API error: ${response.status}` },
                { status: response.status }
            );
        }

        const transactions = await response.json();
        console.log(`Total transactions fetched: ${transactions?.length || 0}`);

        if (!transactions || transactions.length === 0) {
            return NextResponse.json(
                { error: 'No transactions found' },
                { status: 404 }
            );
        }

        // Fetch wallet balance
        let balance = 0;
        try {
            const balanceUrl = `https://api.helius.xyz/v0/addresses/${walletAddress}/balances?api-key=${apiKey}`;
            const balanceResponse = await fetch(balanceUrl);
            if (balanceResponse.ok) {
                const balanceData = await balanceResponse.json();
                // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
                balance = (balanceData.nativeBalance || 0) / 1000000000;
            }
        } catch (err) {
            console.error('Balance fetch error:', err);
            // Continue even if balance fetch fails
        }

        // Filter by timeframe
        const now = Date.now() / 1000;
        const timeframeFilters = {
            '24h': now - 86400,
            '7d': now - 604800,
            '30d': now - 2592000,
            'all': 0
        };

        const filteredTxs = transactions.filter(tx =>
            (tx.timestamp || 0) >= timeframeFilters[timeframe]
        );

        console.log(`After ${timeframe} filter: ${filteredTxs.length} transactions remain`);

        // Process transactions
        const positions = new Map();
        const pnlHistory = [];
        let cumulativePnL = 0;

        filteredTxs.forEach(tx => {
            try {
                const tradeType = detectTradeType(tx, walletAddress);
                if (!tradeType) return;

                const swapDetails = extractSwapDetails(tx, walletAddress, tradeType);
                if (!swapDetails) return;

                if (!positions.has(swapDetails.mint)) {
                    positions.set(swapDetails.mint, new TokenPosition(swapDetails.mint, swapDetails.symbol));
                }

                const position = positions.get(swapDetails.mint);
                const timestamp = tx.timestamp || 0;

                if (tradeType === 'BUY') {
                    position.buy(swapDetails.amount, swapDetails.pricePerToken, timestamp, tx.signature);
                } else {
                    position.sell(swapDetails.amount, swapDetails.pricePerToken, timestamp, tx.signature);
                }

                cumulativePnL = Array.from(positions.values()).reduce((sum, p) => sum + p.realizedPnL, 0);

                pnlHistory.push({
                    timestamp: timestamp * 1000,
                    pnl: cumulativePnL,
                    date: new Date(timestamp * 1000).toLocaleDateString()
                });
            } catch (err) {
                console.error('Transaction processing error:', err);
            }
        });

        // Calculate statistics
        const positionsArray = Array.from(positions.values());
        const totalPnL = positionsArray.reduce((sum, p) => sum + p.realizedPnL, 0);
        const winners = positionsArray.filter(p => p.realizedPnL > 0).length;
        const losers = positionsArray.filter(p => p.realizedPnL < 0).length;
        const winRate = (winners + losers) > 0 ? (winners / (winners + losers)) * 100 : 0;
        const totalTrades = positionsArray.reduce((sum, p) => sum + p.trades.length, 0);
        const totalVolume = positionsArray.reduce((sum, p) => sum + p.totalSpent + p.totalReceived, 0);

        const bestPerformer = positionsArray.length > 0
            ? positionsArray.reduce((best, current) =>
                current.realizedPnL > best.realizedPnL ? current : best
            )
            : null;

        // Detect related wallets
        const relatedWallets = detectRelatedWallets(transactions, walletAddress);

        return NextResponse.json({
            balance,
            totalPnL,
            winRate,
            winners,
            losers,
            totalTrades,
            totalVolume,
            bestPerformer: bestPerformer ? {
                symbol: bestPerformer.symbol,
                realizedPnL: bestPerformer.realizedPnL
            } : null,
            positions: positionsArray
                .sort((a, b) => b.realizedPnL - a.realizedPnL)
                .map(p => ({
                    symbol: p.symbol,
                    trades: p.trades.length,
                    avgEntry: p.getAvgEntryPrice(),
                    avgExit: p.getAvgExitPrice(),
                    volume: p.totalSpent + p.totalReceived,
                    pnl: p.realizedPnL,
                    roi: p.getROI()
                })),
            pnlHistory: pnlHistory.reverse(),
            relatedWallets
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
