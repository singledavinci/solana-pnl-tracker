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

    // Fetch enhanced transactions from Helius
    async fetchEnhancedTransactions(walletAddress, options = {}) {
        const limit = options.limit || 1000;
        const before = options.before || null;

        try {
            if (!this.heliusApiKey) {
                console.warn('No Helius API key provided. Some features may be limited.');
                return await this.fetchBasicTransactions(walletAddress, limit);
            }

            const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions`;
            const params = new URLSearchParams({
                'api-key': this.heliusApiKey,
                limit: limit.toString(),
                type: 'SWAP' // Focus on swap transactions
            });

            if (before) params.append('before', before);

            const response = await fetch(`${url}?${params}`);

            if (!response.ok) {
                throw new Error(`Helius API error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Enhanced transaction fetch failed:', error);
            // Fallback to basic RPC
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

    // Fetch current token prices from Jupiter
    async fetchTokenPrices(tokenMints) {
        try {
            const ids = tokenMints.join(',');
            const response = await fetch(
                `https://price.jup.ag/v4/price?ids=${ids}`
            );

            if (!response.ok) {
                throw new Error('Jupiter price fetch failed');
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
    parseEnhancedTransaction(tx) {
        if (!tx || tx.type !== 'SWAP') return null;

        const swapInfo = tx.tokenTransfers || [];

        // Extract swap details
        const tokenIn = swapInfo.find(t => t.fromUserAccount === tx.feePayer);
        const tokenOut = swapInfo.find(t => t.toUserAccount === tx.feePayer);

        if (!tokenIn || !tokenOut) return null;

        return {
            signature: tx.signature,
            timestamp: tx.timestamp,
            tokenIn: {
                mint: tokenIn.mint,
                amount: tokenIn.tokenAmount,
                symbol: tokenIn.tokenSymbol || 'UNKNOWN'
            },
            tokenOut: {
                mint: tokenOut.mint,
                amount: tokenOut.tokenAmount,
                symbol: tokenOut.tokenSymbol || 'UNKNOWN'
            },
            fee: tx.fee,
            success: !tx.err
        };
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
