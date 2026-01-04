// API Service Layer - Handles all external API calls
// Supports both environment variables and user-provided API keys

class APIService {
    constructor() {
        this.heliusApiKey = null;
        this.useCustomKey = false;
    }

    // Initialize with API key (from env or user input)
    setApiKey(key) {
        this.heliusApiKey = key;
        this.useCustomKey = true;
    }

    getHeliusUrl() {
        if (this.heliusApiKey) {
            return `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;
        }
        // Fallback to public RPC (rate limited)
        return 'https://api.mainnet-beta.solana.com';
    }

    // Fetch enhanced transactions from Helius (via proxy)
    async fetchEnhancedTransactions(walletAddress, options = {}) {
        const limit = options.limit || 100;
        const before = options.before || null;
        const type = options.type || 'SWAP';

        try {
            const params = new URLSearchParams({
                wallet: walletAddress,
                limit: limit.toString(),
                type
            });

            if (before) params.append('before', before);

            console.log(`📡 Calling local Helius proxy: /api/helius?${params.toString()}`);
            const response = await fetch(`/api/helius?${params}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Proxy Error (${response.status}):`, errorText);
                throw new Error(`Proxy error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Enhanced transaction fetch failed:', error);
            // Fallback to basic RPC (this might still face CORS but at least we try)
            return await this.fetchBasicTransactions(walletAddress, limit);
        }
    }

    // Fallback: Basic RPC transaction signatures
    async fetchBasicTransactions(walletAddress, limit = 1000) {
        const response = await fetch(this.getHeliusUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getSignaturesForAddress',
                params: [
                    walletAddress,
                    { limit }
                ]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        return data.result || [];
    }

    // Fetch detailed transaction data
    async fetchTransactionDetails(signature) {
        const response = await fetch(this.getHeliusUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: [
                    signature,
                    {
                        encoding: 'jsonParsed',
                        maxSupportedTransactionVersion: 0
                    }
                ]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        return data.result;
    }

    // Fetch current token prices from Jupiter (via proxy)
    async fetchTokenPrices(tokenMints) {
        if (tokenMints.length === 0) return {};
        try {
            const ids = tokenMints.join(',');
            const response = await fetch(`/api/jupiter?ids=${ids}`);

            if (!response.ok) {
                throw new Error('Jupiter proxy fetch failed');
            }

            const data = await response.json();
            return data.data || {};
        } catch (error) {
            console.error('Price fetch failed:', error);
            return {};
        }
    }

    // Fetch token metadata
    async fetchTokenMetadata(tokenMint) {
        try {
            const response = await fetch(this.getHeliusUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getAccountInfo',
                    params: [
                        tokenMint,
                        { encoding: 'jsonParsed' }
                    ]
                })
            });

            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('Metadata fetch failed:', error);
            return null;
        }
    }

    // Parse Helius enhanced transaction for swaps
    parseEnhancedTransaction(tx, walletAddress) {
        // Broaden swap detection
        const isSwap = tx.type === 'SWAP' ||
            (tx.description && tx.description.toLowerCase().includes('swap')) ||
            (tx.events && tx.events.swap);

        if (!isSwap) return null;

        // If Helius already parsed the swap event, use it!
        if (tx.events && tx.events.swap) {
            const swap = tx.events.swap;
            return {
                signature: tx.signature,
                timestamp: tx.timestamp,
                tokenIn: {
                    symbol: swap.nativeInput ? 'SOL' : (swap.tokenInputs[0]?.tokenSymbol || 'UNKNOWN'),
                    amount: swap.nativeInput ? swap.nativeInput.amount / 1e9 : (swap.tokenInputs[0]?.tokenAmount || 0),
                    mint: swap.nativeInput ? 'So11111111111111111111111111111111111111112' : (swap.tokenInputs[0]?.mint || '')
                },
                tokenOut: {
                    symbol: swap.nativeOutput ? 'SOL' : (swap.tokenOutputs[0]?.tokenSymbol || 'UNKNOWN'),
                    amount: swap.nativeOutput ? swap.nativeOutput.amount / 1e9 : (swap.tokenOutputs[0]?.tokenAmount || 0),
                    mint: swap.nativeOutput ? 'So11111111111111111111111111111111111111112' : (swap.tokenOutputs[0]?.mint || '')
                },
                fee: tx.fee,
                success: !tx.err
            };
        }

        // Fallback: Manual extraction from transfers
        const transfers = tx.tokenTransfers || [];
        const nativeTransfers = tx.nativeTransfers || [];

        // Find what left the wallet
        const tokenOut = transfers.find(t => t.fromUserAccount === walletAddress);
        const solOut = nativeTransfers.find(t => t.fromUserAccount === walletAddress);

        // Find what entered the wallet
        const tokenIn = transfers.find(t => t.toUserAccount === walletAddress);
        const solIn = nativeTransfers.find(t => t.toUserAccount === walletAddress);

        if ((tokenOut || solOut) && (tokenIn || solIn)) {
            return {
                signature: tx.signature,
                timestamp: tx.timestamp,
                tokenIn: tokenOut ? {
                    symbol: tokenOut.tokenSymbol || 'TOKEN',
                    amount: tokenOut.tokenAmount,
                    mint: tokenOut.mint
                } : {
                    symbol: 'SOL',
                    amount: solOut.amount / 1e9,
                    mint: 'So11111111111111111111111111111111111111112'
                },
                tokenOut: tokenIn ? {
                    symbol: tokenIn.tokenSymbol || 'TOKEN',
                    amount: tokenIn.tokenAmount,
                    mint: tokenIn.mint
                } : {
                    symbol: 'SOL',
                    amount: solIn.amount / 1e9,
                    mint: 'So11111111111111111111111111111111111111112'
                },
                fee: tx.fee,
                success: !tx.err
            };
        }

        return null;
    }

    // Parse basic RPC transaction
    async parseBasicTransaction(txData, walletAddress) {
        if (!txData) return null;

        try {
            const meta = txData.meta;
            const transaction = txData.transaction;

            // Extract token balances
            const preBalances = meta.preTokenBalances || [];
            const postBalances = meta.postTokenBalances || [];

            // Find balance changes for this wallet
            const changes = this.calculateBalanceChanges(
                preBalances,
                postBalances,
                walletAddress
            );

            if (changes.length < 2) return null; // Not a swap

            return {
                signature: transaction.signatures[0],
                timestamp: txData.blockTime,
                changes,
                fee: meta.fee,
                success: !meta.err
            };
        } catch (error) {
            console.error('Transaction parse error:', error);
            return null;
        }
    }

    calculateBalanceChanges(preBalances, postBalances, walletAddress) {
        const changes = [];

        postBalances.forEach(post => {
            const pre = preBalances.find(
                p => p.accountIndex === post.accountIndex
            );

            if (pre && pre.owner === walletAddress) {
                const preAmount = parseFloat(pre.uiTokenAmount.uiAmountString || 0);
                const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || 0);
                const change = postAmount - preAmount;

                if (change !== 0) {
                    changes.push({
                        mint: post.mint,
                        change,
                        decimals: post.uiTokenAmount.decimals
                    });
                }
            }
        });

        return changes;
    }
}

// Create singleton instance
const apiService = new APIService();

// Export for use in app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = apiService;
}
