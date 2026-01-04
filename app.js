// Solana P&L Tracker - Main Application Logic

// Configuration - Will be overridden by environment variables if available
const CONFIG = {
    HELIUS_API_KEY: typeof HELIUS_API_KEY !== 'undefined' ? HELIUS_API_KEY : null,
    USE_DEMO_DATA: false, // Set to true to use demo data for testing
};

// Check if user needs to provide API key
let needsApiKey = !CONFIG.HELIUS_API_KEY;
let useDemoMode = CONFIG.USE_DEMO_DATA;

// State
let currentTimeframe = '24h';
let walletData = null;
let pnlChart = null;

// DOM Elements
const walletInput = document.getElementById('walletInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const resultsSection = document.getElementById('resultsSection');
const timeframeBtns = document.querySelectorAll('.timeframe-btn');
const exportBtn = document.getElementById('exportBtn');

// Event Listeners
analyzeBtn.addEventListener('click', analyzeWallet);
walletInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') analyzeWallet();
});

timeframeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        timeframeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTimeframe = btn.dataset.timeframe;
        if (walletData) {
            updateDisplay(walletData);
        }
    });
});

exportBtn.addEventListener('click', exportToCSV);

// Main Analysis Function
async function analyzeWallet() {
    const walletAddress = walletInput.value.trim();

    if (!walletAddress) {
        showError('Please enter a wallet address');
        return;
    }

    // Basic validation
    if (walletAddress.length < 32 || walletAddress.length > 44) {
        showError('Invalid Solana wallet address');
        return;
    }

    showLoading();

    try {
        // Fetch wallet transactions
        const transactions = await fetchWalletTransactions(walletAddress);

        // Parse and analyze trades
        const trades = await parseTransactions(transactions);

        // Calculate P&L
        const pnlData = await calculatePnL(trades);

        // Detect related wallets
        const relatedWallets = await detectRelatedWallets(transactions, walletAddress);
        pnlData.relatedWallets = relatedWallets;

        walletData = pnlData;

        showResults();
        updateDisplay(pnlData);

    } catch (error) {
        console.error('Analysis error:', error);
        showError(error.message || 'Failed to analyze wallet. Please try again.');
    }
}

// Fetch transactions using Helius API
async function fetchWalletTransactions(address) {
    // Use demo mode if configured or no API key
    if (useDemoMode || !CONFIG.HELIUS_API_KEY) {
        console.log('📊 Using demo data mode');
        return generateDemoTransactions();
    }

    try {
        // Use apiService for enhanced transaction fetching
        apiService.setApiKey(CONFIG.HELIUS_API_KEY);

        console.log('🔄 Fetching transactions from Helius...');
        const transactions = await apiService.fetchEnhancedTransactions(address, {
            limit: 100,
            type: 'SWAP' // Request swaps specifically
        });

        console.log(`✅ Fetched ${transactions.length} transactions`);

        // If no transactions found, inform user
        if (!transactions || transactions.length === 0) {
            throw new Error('No transactions found for this wallet');
        }

        return transactions;

    } catch (error) {
        console.error('❌ Fetch error:', error.message);

        // Only fall back to demo if it's a network error, not a "no transactions" error
        if (error.message.includes('No transactions')) {
            throw error; // Re-throw to show user the wallet has no transactions
        }

        console.log('⚠️ Falling back to demo data...');
        useDemoMode = true;
        return generateDemoTransactions();
    }
}

// Generate demo transactions for testing/demo
function generateDemoTransactions() {
    const now = Date.now() / 1000;
    const tokens = ['BONK', 'WIF', 'JUP', 'PYTH', 'JTO', 'MNGO', 'ORCA', 'RAY', 'MOBILE', 'PYUSD'];

    return Array.from({ length: 50 }, (_, i) => ({
        signature: `demo_${Math.random().toString(36).substring(7)}`,
        timestamp: now - (i * 3600 * Math.random() * 24), // Random times over last month
        type: 'SWAP',
        description: `Swapped SOL for ${tokens[Math.floor(Math.random() * tokens.length)]}`,
        source: Math.random() > 0.5 ? 'JUPITER' : 'RAYDIUM',
    }));
}

// Fallback RPC fetch (simpler, fewer details)
async function fetchTransactionsViaRPC(address) {
    const response = await fetch(CONFIG.SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getConfirmedSignaturesForAddress2',
            params: [address, { limit: 1000 }]
        })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    return data.result || [];
}

// Parse transactions to extract trades
async function parseTransactions(transactions) {
    const trades = [];
    const now = Date.now() / 1000;

    // Get timeframe in seconds
    const timeframes = {
        '24h': 24 * 60 * 60,
        '7d': 7 * 24 * 60 * 60,
        '30d': 30 * 24 * 60 * 60,
        'all': Infinity
    };

    const cutoffTime = now - timeframes[currentTimeframe];

    for (const tx of transactions) {
        // Skip if outside timeframe
        if (tx.timestamp && tx.timestamp < cutoffTime) continue;

        // Use the API service to parse the enhanced transaction data
        const trade = apiService.parseEnhancedTransaction(tx, walletInput.value.trim());
        if (trade) {
            trades.push(trade);
        }
    }

    console.log(`📈 Parsed ${trades.length} valid trades from transactions`);
    return trades;
}

// Utility Functions
async function calculatePnL(trades) {
    const tokenMap = new Map();
    let cumulativePnL = 0;

    // Get all unique tokens to fetch prices
    const uniqueMints = new Set();
    trades.forEach(trade => {
        if (trade.tokenIn.mint) uniqueMints.add(trade.tokenIn.mint);
        if (trade.tokenOut.mint) uniqueMints.add(trade.tokenOut.mint);
    });

    // Fetch current prices from Jupiter
    const prices = await apiService.fetchTokenPrices(Array.from(uniqueMints));

    // Group by token
    trades.forEach(trade => {
        // We track performance for the "target" token (usually not SOL)
        const isSolIn = trade.tokenIn.symbol === 'SOL' || trade.tokenIn.mint === 'So11111111111111111111111111111111111111112';
        const targetToken = isSolIn ? trade.tokenOut : trade.tokenIn;
        const symbol = targetToken.symbol;

        if (!tokenMap.has(symbol)) {
            tokenMap.set(symbol, {
                symbol,
                mint: targetToken.mint,
                trades: [],
                totalBought: 0,
                totalSold: 0,
                costBasis: 0,
                realizedGain: 0,
                volume: 0
            });
        }

        const stats = tokenMap.get(symbol);
        stats.trades.push(trade);

        // Approximate USD value if not provided
        // Use SOL price ($100 default if fetch fails)
        const solPrice = prices['So11111111111111111111111111111111111111112']?.price || 100;

        if (isSolIn) {
            // Bought target token with SOL
            const usdValue = trade.tokenIn.amount * solPrice;
            stats.totalBought += targetToken.amount;
            stats.costBasis += usdValue;
            stats.volume += usdValue;
        } else {
            // Sold target token for SOL (or other)
            const usdValue = trade.tokenOut.amount * solPrice;
            stats.totalSold += targetToken.amount;
            stats.realizedGain += usdValue;
            stats.volume += usdValue;
        }
    });

    const tokens = [];
    tokenMap.forEach((stats) => {
        const currentPrice = prices[stats.mint]?.price || 0;
        const unrealizedValue = (stats.totalBought - stats.totalSold) * currentPrice;

        stats.pnl = stats.realizedGain + unrealizedValue - stats.costBasis;
        stats.roi = stats.costBasis > 0 ? (stats.pnl / stats.costBasis) * 100 : 0;
        stats.avgEntry = stats.totalBought > 0 ? stats.costBasis / stats.totalBought : 0;
        stats.avgExit = stats.totalSold > 0 ? stats.realizedGain / stats.totalSold : 0;

        tokens.push(stats);
        cumulativePnL += stats.pnl;
    });

    tokens.sort((a, b) => b.pnl - a.pnl);

    return {
        tokens,
        totalPnL: cumulativePnL,
        totalTrades: trades.length,
        wins: tokens.filter(t => t.pnl > 0).length,
        losses: tokens.filter(t => t.pnl < 0).length,
        totalVolume: tokens.reduce((sum, t) => sum + t.volume, 0),
        timeline: generateTimeline(trades, cumulativePnL)
    };
}

// Generate timeline data for chart
function generateTimeline(trades, finalPnL) {
    if (trades.length === 0) return Array.from({ length: 24 }, (_, i) => ({ timestamp: Date.now() - (23 - i) * 3600000, value: 0 }));

    // Sort trades by timestamp
    const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);

    let cumulative = 0;
    const points = sortedTrades.map(trade => {
        // Simplified: spread total pnl across trades for visual effect
        // Real logic would calculate pnl at each point
        cumulative += finalPnL / trades.length;
        return {
            timestamp: trade.timestamp * 1000,
            value: cumulative
        };
    });

    return points;
}

// Update display with data
function updateDisplay(data) {
    // Update summary cards
    document.getElementById('totalPnl').textContent = formatCurrency(data.totalPnL);
    document.getElementById('totalPnl').className = 'card-value ' + (data.totalPnL >= 0 ? 'pnl-positive' : 'pnl-negative');

    const pnlPercent = (data.totalPnL / data.totalVolume) * 100;
    const changeEl = document.getElementById('totalPnlChange');
    changeEl.textContent = (data.totalPnL >= 0 ? '+' : '') + pnlPercent.toFixed(2) + '%';
    changeEl.className = 'card-change ' + (data.totalPnL >= 0 ? 'positive' : 'negative');

    const winRate = data.wins + data.losses > 0 ? (data.wins / (data.wins + data.losses)) * 100 : 0;
    document.getElementById('winRate').textContent = winRate.toFixed(1) + '%';
    document.getElementById('winLossRatio').textContent = `${data.wins} wins / ${data.losses} losses`;

    document.getElementById('totalTrades').textContent = data.totalTrades;
    document.getElementById('volumeTraded').textContent = formatCurrency(data.totalVolume) + ' volume';

    const bestToken = data.tokens[0];
    document.getElementById('bestToken').textContent = bestToken?.symbol || '-';
    document.getElementById('bestTokenPnl').textContent = bestToken ? formatCurrency(bestToken.pnl) : '$0.00';

    // Update chart
    updateChart(data.timeline);

    // Update table
    updateTable(data.tokens);

    // Update related wallets
    if (data.relatedWallets) {
        updateRelatedWallets(data.relatedWallets);
    }
}

// Update P&L chart
function updateChart(timeline) {
    const ctx = document.getElementById('pnlChart').getContext('2d');

    if (pnlChart) {
        pnlChart.destroy();
    }

    pnlChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timeline.map(p => new Date(p.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })),
            datasets: [{
                label: 'Cumulative P&L',
                data: timeline.map(p => p.value),
                borderColor: '#14F195',
                backgroundColor: 'rgba(20, 241, 149, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#1C1D26',
                    titleColor: '#FFFFFF',
                    bodyColor: '#9CA3AF',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: (context) => 'P&L: ' + formatCurrency(context.parsed.y)
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#6B7280'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#6B7280',
                        callback: (value) => formatCurrency(value)
                    }
                }
            }
        }
    });
}

// Update tokens table
function updateTable(tokens) {
    const tbody = document.getElementById('tokensTableBody');
    tbody.innerHTML = '';

    tokens.forEach(token => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="token-cell">
                    <div class="token-icon"></div>
                    <div class="token-info">
                        <div class="token-symbol">${token.symbol}</div>
                        <div class="token-address">${token.mint || 'N/A'}</div>
                    </div>
                </div>
            </td>
            <td>${token.trades.length}</td>
            <td>${formatCurrency(token.avgEntry)}</td>
            <td>${formatCurrency(token.avgExit)}</td>
            <td>${formatCurrency(token.volume)}</td>
            <td class="${token.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">
                ${(token.pnl >= 0 ? '+' : '')}${formatCurrency(token.pnl)}
            </td>
            <td class="${token.roi >= 0 ? 'pnl-positive' : 'pnl-negative'}">
                ${(token.roi >= 0 ? '+' : '')}${token.roi.toFixed(2)}%
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Export to CSV
function exportToCSV() {
    if (!walletData) return;

    const rows = [
        ['Token', 'Trades', 'Avg Entry', 'Avg Exit', 'Volume', 'P&L', 'ROI'],
        ...walletData.tokens.map(t => [
            t.symbol,
            t.trades.length,
            t.avgEntry.toFixed(2),
            t.avgExit.toFixed(2),
            t.volume.toFixed(2),
            t.pnl.toFixed(2),
            t.roi.toFixed(2) + '%'
        ])
    ];

    const csv = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solana-pnl-${Date.now()}.csv`;
    a.click();
}

// UI State Functions
function showLoading() {
    loadingState.classList.remove('hidden');
    errorState.classList.add('hidden');
    resultsSection.classList.add('hidden');
}

function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    errorState.classList.remove('hidden');
    loadingState.classList.add('hidden');
    resultsSection.classList.add('hidden');
}

function showResults() {
    resultsSection.classList.remove('hidden');
    loadingState.classList.add('hidden');
    errorState.classList.add('hidden');
}

// Utility Functions
function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

function getRandomToken() {
    const tokens = ['BONK', 'WIF', 'JUP', 'PYTH', 'JTO', 'MNGO', 'ORCA', 'RAY'];
    return tokens[Math.floor(Math.random() * tokens.length)];
}

// Demo mode for testing
function loadDemoData() {
    const demoTrades = Array.from({ length: 50 }, () => ({
        signature: Math.random().toString(36),
        timestamp: Date.now() / 1000 - Math.random() * 86400 * 7,
        tokenIn: { symbol: 'SOL', amount: Math.random() * 5 },
        tokenOut: { symbol: getRandomToken(), amount: Math.random() * 1000 },
        price: Math.random() * 100
    }));

    const pnlData = calculatePnL(demoTrades);
    walletData = pnlData;
    showResults();
    updateDisplay(pnlData);
}

// Load demo on initial load for UI preview
// Uncomment to test UI without API
// setTimeout(loadDemoData, 1000);

// Detect related wallets that frequently interact with the main wallet
async function detectRelatedWallets(transactions, mainWallet) {
    const walletInteractions = new Map();

    for (const tx of transactions) {
        try {
            // For demo data, generate some related wallets
            if (tx.signature && tx.signature.startsWith('demo_')) {
                const demoAddresses = [
                    'Hxro8ZrHK...wallet1',
                    'DYw8jCTfQ...wallet2',
                    '9qvG25vN...wallet3',
                    'GThUX4vM...wallet4'
                ];
                const randomAddr = demoAddresses[Math.floor(Math.random() * demoAddresses.length)];

                if (!walletInteractions.has(randomAddr)) {
                    walletInteractions.set(randomAddr, {
                        address: randomAddr,
                        interactions: 0,
                        solTransferred: 0,
                        lastInteraction: tx.timestamp || Date.now() / 1000,
                        firstInteraction: tx.timestamp || Date.now() / 1000,
                    });
                }

                const data = walletInteractions.get(randomAddr);
                data.interactions++;
                data.solTransferred += Math.random() * 5;
                continue;
            }

            // Real transaction parsing
            if (tx.accountData && Array.isArray(tx.accountData)) {
                for (const account of tx.accountData) {
                    if (!account.account || account.account === mainWallet) continue;

                    if (!walletInteractions.has(account.account)) {
                        walletInteractions.set(account.account, {
                            address: account.account,
                            interactions: 0,
                            solTransferred: 0,
                            lastInteraction: tx.timestamp || 0,
                            firstInteraction: tx.timestamp || 0,
                        });
                    }

                    const data = walletInteractions.get(account.account);
                    data.interactions++;

                    if (account.nativeBalanceChange) {
                        data.solTransferred += Math.abs(account.nativeBalanceChange / 1e9);
                    }
                }
            }
        } catch (error) {
            continue;
        }
    }

    // Filter and score wallets
    const relatedWallets = [];

    walletInteractions.forEach((data, address) => {
        if (data.interactions < 2) return;

        let riskScore = 0;

        if (data.interactions > 10) riskScore += 40;
        else if (data.interactions > 5) riskScore += 25;
        else riskScore += 10;

        if (data.solTransferred > 100) riskScore += 30;
        else if (data.solTransferred > 10) riskScore += 20;
        else riskScore += 10;

        const daysSinceLastInteraction = (Date.now() / 1000 - data.lastInteraction) / 86400;
        if (daysSinceLastInteraction < 1) riskScore += 20;
        else if (daysSinceLastInteraction < 7) riskScore += 10;

        const interactionPeriod = data.lastInteraction - data.firstInteraction;
        const interactionsPerDay = interactionPeriod > 0 ? data.interactions / (interactionPeriod / 86400) : 0;
        if (interactionsPerDay > 5) riskScore += 10;

        let riskLevel = 'low';
        if (riskScore >= 70) riskLevel = 'high';
        else if (riskScore >= 40) riskLevel = 'medium';

        relatedWallets.push({
            address,
            interactions: data.interactions,
            solTransferred: data.solTransferred,
            riskScore,
            riskLevel,
            lastSeen: data.lastInteraction,
            pnl: null,  // Will be populated below
            pnlPercent: null
        });
    });

    relatedWallets.sort((a, b) => b.riskScore - a.riskScore);
    const topWallets = relatedWallets.slice(0, 10);

    // Fetch P&L for each related wallet
    await Promise.all(topWallets.map(async (wallet) => {
        try {
            // For demo wallets, generate random P&L
            if (wallet.address.includes('...')) {
                wallet.pnl = (Math.random() - 0.3) * 50000;  // -15k to +35k range
                wallet.pnlPercent = (Math.random() - 0.3) * 200;  // -60% to +140%
                return;
            }

            // For real wallets, fetch and calculate
            const walletTxs = await fetchWalletTransactions(wallet.address);
            const walletTrades = await parseTransactions(walletTxs);
            const walletPnlData = calculatePnL(walletTrades);

            wallet.pnl = walletPnlData.totalPnl || 0;
            wallet.pnlPercent = walletPnlData.totalPnlPercent || 0;
        } catch (error) {
            // If fetching fails, set to 0
            wallet.pnl = 0;
            wallet.pnlPercent = 0;
        }
    }));

    return topWallets;
}

function formatAddress(address) {
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function updateRelatedWallets(relatedWallets) {
    const grid = document.getElementById('relatedWalletsGrid');
    const badge = document.getElementById('relatedWalletsBadge');

    badge.textContent = `${relatedWallets.length} detected`;

    if (relatedWallets.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">✓</div>
                <p>No suspicious related wallets detected</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = '';

    relatedWallets.forEach(wallet => {
        const card = document.createElement('div');
        card.className = 'related-wallet-card';
        card.innerHTML = `
            <div class="wallet-header">
                <span class="wallet-address">${formatAddress(wallet.address)}</span>
                <span class="risk-badge risk-${wallet.riskLevel}">${wallet.riskLevel} risk</span>
            </div>
            <div class="wallet-stats">
                <div class="wallet-stat">
                    <span class="wallet-stat-label">Interactions</span>
                    <span class="wallet-stat-value">${wallet.interactions}</span>
                </div>
                <div class="wallet-stat">
                    <span class="wallet-stat-label">SOL Transferred</span>
                    <span class="wallet-stat-value">${wallet.solTransferred.toFixed(2)} SOL</span>
                </div>
                <div class="wallet-stat">
                    <span class="wallet-stat-label">Risk Score</span>
                    <span class="wallet-stat-value">${wallet.riskScore}/100</span>
                </div>
                <div class="wallet-stat">
                    <span class="wallet-stat-label">Last Seen</span>
                    <span class="wallet-stat-value">${formatTimestamp(wallet.lastSeen)}</span>
                </div>
                <div class="wallet-stat">
                    <span class="wallet-stat-label">P&L</span>
                    <span class="wallet-stat-value ${wallet.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">
                        ${formatCurrency(wallet.pnl)} (${wallet.pnlPercent >= 0 ? '+' : ''}${wallet.pnlPercent.toFixed(1)}%)
                    </span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function formatTimestamp(timestamp) {
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    return `${Math.floor(diff / 2592000)}mo ago`;
}
