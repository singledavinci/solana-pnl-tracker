import { NextResponse } from 'next/server';

// ─── Known Programs ───────────────────────────────────────────────────────────
const KNOWN_PROGRAMS = new Set([
    '11111111111111111111111111111111',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bBp',
    'ComputeBudget111111111111111111111111111111',
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    'routeUGWgpok6Csuf1YFKdsMb6RpCCGogGJBZPHWndC',
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
    '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
    'SSwpkEEd8CmqXEPnhCFMkQUoeZMLm4DmMibdEYrqFEPF',
    'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX',
    'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY',
    'MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2pgJqe',
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
    'p1exdMJcjVao65QdewkaZRUnU6VPSXhus9n2GzWfh98',
    'So11111111111111111111111111111111111111112',
]);

const PUMP_FUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfX4l...'; // Pump.fun bonding curve program

const BASE_TOKENS = {
    'So11111111111111111111111111111111111111112': 'SOL',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
};

const HELIUS_KEYS = [
    'f3ac9d10-c200-4f1f-87d6-481260a0e19f',
    '3e096acf-ebcf-4b00-b733-c8d554d2c198',
    '12c81d6f-9d31-4c46-ac73-8e49c05cd97a',
    '3e6d2253-1502-4349-aa80-a1818fc6610e',
    '81b87cb0-2d25-4e19-8236-c0d95f9b78f5'
];
let keyIndex = 0;

function getNextKey() {
    const key = HELIUS_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % HELIUS_KEYS.length;
    return key;
}

const MAX_TRANSACTIONS = 500;

function isBaseToken(mint) { return mint in BASE_TOKENS; }
function isKnownProgram(address) { return KNOWN_PROGRAMS.has(address); }
function isValidSolanaAddress(address) {
    return typeof address === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// ─── Paginated Transaction Fetch ──────────────────────────────────────────────
async function fetchAllTransactions(walletAddress) {
    const allTxs = [];
    let cursor = null;

    while (allTxs.length < MAX_TRANSACTIONS) {
        const apiKey = getNextKey();
        const url = new URL(`https://api.helius.xyz/v0/addresses/${walletAddress}/transactions`);
        url.searchParams.set('api-key', apiKey);
        url.searchParams.set('limit', '100');
        if (cursor) url.searchParams.set('before', cursor);

        const res = await fetch(url.toString());
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || `Helius API error: ${res.status}`);
        }

        const txs = await res.json();
        if (!Array.isArray(txs) || txs.length === 0) break;

        allTxs.push(...txs);
        if (txs.length < 100) break; // reached end of history
        cursor = txs[txs.length - 1].signature;
    }

    return allTxs;
}

// ─── Trade Extraction ─────────────────────────────────────────────────────────
function extractTrades(transactions, walletAddress) {
    const trades = [];

    for (const tx of transactions) {
        try {
            const transfers = tx.tokenTransfers || [];
            if (!transfers.length) continue;

            const baseOut = transfers.find(t => t.fromUserAccount === walletAddress && isBaseToken(t.mint));
            const baseIn = transfers.find(t => t.toUserAccount === walletAddress && isBaseToken(t.mint));

            let tradeType, baseTransfer, targetTransfer;

            if (baseOut) {
                tradeType = 'BUY';
                baseTransfer = baseOut;
                targetTransfer = transfers.find(t => t.toUserAccount === walletAddress && !isBaseToken(t.mint));
            } else if (baseIn) {
                tradeType = 'SELL';
                baseTransfer = baseIn;
                targetTransfer = transfers.find(t => t.fromUserAccount === walletAddress && !isBaseToken(t.mint));
            } else {
                continue;
            }

            if (!targetTransfer || !baseTransfer) continue;

            const targetAmt = Number(targetTransfer.tokenAmount);
            const baseAmt = Number(baseTransfer.tokenAmount);
            if (!targetAmt || !baseAmt || targetAmt === 0) continue;

            // Detect Pump.fun interaction directly from accountData or instructions
            let isPumpFun = false;
            // Native way to check if program was called
            if (tx.accountData && tx.accountData.some(acc => acc.account === '6EF8rrecthR5Dkzon8Nwu78hRvfX4l')) {
                isPumpFun = true;
            }

            trades.push({
                type: tradeType,
                mint: targetTransfer.mint,
                symbol: targetTransfer.symbol || targetTransfer.mint.slice(0, 8),
                amount: targetAmt,
                pricePerToken: baseAmt / targetAmt, // denominated in BASE (SOL/USDC)
                baseAmount: baseAmt,
                baseCurrency: BASE_TOKENS[baseTransfer.mint],
                timestamp: tx.timestamp || 0,
                signature: tx.signature,
                isPumpFun
            });
        } catch {
            continue;
        }
    }

    // Return in chronological order for FIFO
    return trades.sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Jupiter API (100% Free, NO KEY) ──────────────────────────────────────────
async function fetchJupiterTokens() {
    try {
        const res = await fetch('https://token.jup.ag/strict');
        if (!res.ok) return {};
        const data = await res.json();
        const map = {};
        for (const token of data) {
            map[token.address] = {
                symbol: token.symbol,
                name: token.name,
                logoURI: token.logoURI
            };
        }
        return map;
    } catch { return {}; }
}

// ─── DexScreener API (100% Free, NO KEY) ─────────────────────────────────────
async function fetchDexScreenerMetaData(mints) {
    if (!mints.length) return {};
    try {
        // DexScreener allows max 30 tokens per request
        const sliced = mints.slice(0, 30);
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${sliced.join(',')}`);
        if (!res.ok) return {};
        const data = await res.json();
        
        const map = {};
        if (data.pairs) {
            for (const pair of data.pairs) {
                // Keep the pair with the highest liquidity
                const tokenAddr = pair.baseToken.address;
                if (!map[tokenAddr] || (pair.liquidity?.usd > (map[tokenAddr].liquidity || 0))) {
                    map[tokenAddr] = {
                        symbol: pair.baseToken.symbol,
                        name: pair.baseToken.name,
                        logoURI: pair.info?.imageUrl || null,
                        liquidity: pair.liquidity?.usd || 0,
                        fdv: pair.fdv || 0,
                        dexId: pair.dexId
                    };
                }
            }
        }
        return map;
    } catch { return {}; }
}

async function fetchCurrentPrices(mints) {
    if (!mints.length) return {};
    try {
        const ids = mints.slice(0, 50).join(',');
        const res = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`);
        if (!res.ok) return {};
        const data = await res.json();
        return data.data || {};
    } catch { return {}; }
}

// ─── Related Wallets ─────────────────────────────────────────────────────────
function detectRelatedWallets(transactions, mainWallet) {
    const walletMap = new Map();

    for (const tx of transactions) {
        for (const transfer of (tx.nativeTransfers || [])) {
            const { fromUserAccount: from, toUserAccount: to, amount } = transfer;
            if (!from || !to || !amount) continue;

            let counterparty = null;
            let direction = null;

            if (from === mainWallet && to !== mainWallet && !isKnownProgram(to)) {
                counterparty = to;
                direction = 'sent';
            } else if (to === mainWallet && from !== mainWallet && !isKnownProgram(from)) {
                counterparty = from;
                direction = 'received';
            }

            if (!counterparty) continue;

            if (!walletMap.has(counterparty)) {
                walletMap.set(counterparty, {
                    address: counterparty,
                    solSent: 0,
                    solReceived: 0,
                    interactions: 0,
                    lastSeen: 0,
                });
            }

            const w = walletMap.get(counterparty);
            w.interactions++;
            if (direction === 'sent') w.solSent += amount / 1e9;
            else w.solReceived += amount / 1e9;
            if ((tx.timestamp || 0) > w.lastSeen) w.lastSeen = tx.timestamp;
        }
    }

    return Array.from(walletMap.values())
        .sort((a, b) => (b.solSent + b.solReceived) - (a.solSent + a.solReceived))
        .slice(0, 15);
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function POST(request) {
    try {
        const { walletAddress } = await request.json();

        if (!walletAddress) {
            return NextResponse.json({ error: 'Missing wallet address' }, { status: 400 });
        }
        if (!isValidSolanaAddress(walletAddress)) {
            return NextResponse.json({ error: 'Invalid Solana wallet address format' }, { status: 400 });
        }

        const transactions = await fetchAllTransactions(walletAddress);

        if (!transactions.length) {
            return NextResponse.json({ error: 'No transactions found for this wallet' }, { status: 404 });
        }

        let balance = 0;
        try {
            const balRes = await fetch(`https://api.helius.xyz/v0/addresses/${walletAddress}/balances?api-key=${getNextKey()}`);
            if (balRes.ok) {
                const balData = await balRes.json();
                balance = (balData.nativeBalance || 0) / 1e9;
            }
        } catch { /* balance is optional */ }

        const trades = extractTrades(transactions, walletAddress);
        const uniqueMints = [...new Set(trades.map(t => t.mint))];

        // Fetch free rich data in parallel (prices via Jupiter, metadata via Jup Strict List & DexScreener)
        const [currentPrices, jupiterTokens, dexScreenerTokens] = await Promise.all([
            fetchCurrentPrices(uniqueMints),
            fetchJupiterTokens(),
            fetchDexScreenerMetaData(uniqueMints)
        ]);

        // Enrich trades with metadata cascading priority: DexScreener params > Jupiter List > Helius transaction info
        for (const trade of trades) {
            const dexMeta = dexScreenerTokens[trade.mint];
            const jupMeta = jupiterTokens[trade.mint];

            if (dexMeta) {
                trade.symbol = dexMeta.symbol || trade.symbol;
                trade.name = dexMeta.name || trade.name;
                trade.logoURI = dexMeta.logoURI || null;
                trade.fdv = dexMeta.fdv;
                trade.liquidity = dexMeta.liquidity;
                if (!trade.isPumpFun && dexMeta.dexId === 'pump') trade.isPumpFun = true;
            } else if (jupMeta) {
                trade.symbol = jupMeta.symbol || trade.symbol;
                trade.name = jupMeta.name || trade.name;
                trade.logoURI = jupMeta.logoURI || null;
            }
        }

        const relatedWallets = detectRelatedWallets(transactions, walletAddress);

        return NextResponse.json({
            balance,
            trades,
            relatedWallets,
            currentPrices,
            transactionCount: transactions.length,
        });

    } catch (error) {
        console.error('Analyze API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
