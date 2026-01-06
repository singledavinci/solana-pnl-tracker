'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, AlertCircle, Search, Loader2, ExternalLink, Wallet, Users } from 'lucide-react';

export default function Home() {
    const [walletAddress, setWalletAddress] = useState('');
    const [apiKey, setApiKey] = useState('3e096acf-ebcf-4b00-b733-c8d554d2c198');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null);
    const [timeframe, setTimeframe] = useState('all');

    const analyzeWallet = async () => {
        if (!walletAddress || !apiKey) {
            setError('Please enter both wallet address and Helius API key');
            return;
        }

        setLoading(true);
        setError(null);
        setResults(null);

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    walletAddress,
                    apiKey,
                    timeframe
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Analysis failed');
            }

            const data = await response.json();
            setResults(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Re-analyze when timeframe changes (if we already have results)
    useEffect(() => {
        if (results && walletAddress && apiKey) {
            analyzeWallet();
        }
    }, [timeframe]); // Only re-run when timeframe changes

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-6xl font-bold mb-3 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                        Solana P&L Tracker
                    </h1>
                    <p className="text-purple-200 text-lg">Accurate wallet performance analysis with enhanced transaction tracking</p>
                </div>

                {/* Input Section */}
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20 shadow-2xl">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2 text-purple-200">Wallet Address</label>
                            <input
                                type="text"
                                value={walletAddress}
                                onChange={(e) => setWalletAddress(e.target.value)}
                                placeholder="Enter Solana wallet address..."
                                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2 text-purple-200">
                                Helius API Key
                                <a
                                    href="https://dev.helius.xyz"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-2 text-purple-400 hover:text-purple-300 inline-flex items-center gap-1 text-xs"
                                >
                                    Get free key <ExternalLink size={12} />
                                </a>
                            </label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Enter your Helius API key..."
                                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                            />
                        </div>

                        {/* Timeframe Buttons */}
                        <div>
                            <label className="block text-sm font-medium mb-2 text-purple-200">Timeframe</label>
                            <div className="flex gap-2 flex-wrap">
                                {['24h', '7d', '30d', 'all'].map(tf => (
                                    <button
                                        key={tf}
                                        onClick={() => setTimeframe(tf)}
                                        className={`px-4 py-2 rounded-lg font-medium transition-all ${timeframe === tf
                                            ? 'bg-purple-600 shadow-lg shadow-purple-500/50'
                                            : 'bg-white/5 hover:bg-white/10'
                                            }`}
                                    >
                                        {tf === 'all' ? 'All Time' : tf.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Analyze Button */}
                        <button
                            onClick={analyzeWallet}
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} />
                                    Analyzing Wallet...
                                </>
                            ) : (
                                <>
                                    <Search size={20} />
                                    Analyze Wallet
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6 backdrop-blur-lg animate-pulse">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="text-red-400" />
                            <span className="text-red-200">{error}</span>
                        </div>
                    </div>
                )}

                {/* Results Section */}
                {results && (
                    <div className="space-y-6 animate-fadeIn">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 shadow-lg hover:shadow-purple-500/30 transition-all">
                                <div className="text-sm text-purple-200 mb-2 flex items-center gap-2">
                                    {results.totalPnL >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                    Total P&L
                                </div>
                                <div className={`text-3xl font-bold ${results.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {results.totalPnL >= 0 ? '+' : ''}${results.totalPnL.toFixed(2)}
                                </div>
                            </div>

                            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 shadow-lg hover:shadow-blue-500/30 transition-all">
                                <div className="text-sm text-purple-200 mb-2">Win Rate</div>
                                <div className="text-3xl font-bold text-blue-400">{results.winRate.toFixed(1)}%</div>
                                <div className="text-xs text-purple-300 mt-1">{results.winners}W / {results.losers}L</div>
                            </div>

                            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 shadow-lg hover:shadow-pink-500/30 transition-all">
                                <div className="text-sm text-purple-200 mb-2">Total Trades</div>
                                <div className="text-3xl font-bold text-pink-400">{results.totalTrades}</div>
                                <div className="text-xs text-purple-300 mt-1">${(results.totalVolume || 0).toFixed(2)} volume</div>
                            </div>

                            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 shadow-lg hover:shadow-yellow-500/30 transition-all">
                                <div className="text-sm text-purple-200 mb-2">Best Performer</div>
                                <div className="text-2xl font-bold text-yellow-400">{results.bestPerformer?.symbol || 'N/A'}</div>
                                {results.bestPerformer && (
                                    <div className="text-xs text-green-400 mt-1">+${results.bestPerformer.realizedPnL.toFixed(2)}</div>
                                )}
                            </div>

                            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 shadow-lg hover:shadow-cyan-500/30 transition-all">
                                <div className="text-sm text-purple-200 mb-2 flex items-center gap-2">
                                    <Wallet size={16} />
                                    Wallet Balance
                                </div>
                                <div className="text-3xl font-bold text-cyan-400">
                                    {results.balance?.toFixed(4) || '0.0000'} SOL
                                </div>
                                <div className="text-xs text-purple-300 mt-1">Current holdings</div>
                            </div>
                        </div>

                        {/* P&L Chart */}
                        {results.pnlHistory && results.pnlHistory.length > 0 && (
                            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 shadow-lg">
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <TrendingUp className="text-green-400" />
                                    P&L Over Time
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={results.pnlHistory}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis
                                            dataKey="date"
                                            stroke="rgba(255,255,255,0.5)"
                                            style={{ fontSize: '12px' }}
                                        />
                                        <YAxis
                                            stroke="rgba(255,255,255,0.5)"
                                            style={{ fontSize: '12px' }}
                                            tickFormatter={(value) => `$${value.toFixed(0)}`}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'rgba(0,0,0,0.8)',
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                borderRadius: '8px'
                                            }}
                                            labelStyle={{ color: '#fff' }}
                                            formatter={(value) => [`$${value.toFixed(2)}`, 'P&L']}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="pnl"
                                            stroke="#10b981"
                                            strokeWidth={3}
                                            dot={{ fill: '#10b981', r: 4 }}
                                            activeDot={{ r: 6 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Token Performance Table */}
                        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 shadow-lg">
                            <h3 className="text-xl font-bold mb-4">Token Performance</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-white/20 text-purple-200">
                                            <th className="text-left py-3 px-2">Token</th>
                                            <th className="text-right py-3 px-2">Trades</th>
                                            <th className="text-right py-3 px-2">Avg Entry</th>
                                            <th className="text-right py-3 px-2">Avg Exit</th>
                                            <th className="text-right py-3 px-2">P&L</th>
                                            <th className="text-right py-3 px-2">ROI</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.positions.map((pos, i) => (
                                            <tr key={i} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                                                <td className="py-3 px-2 font-medium">{pos.symbol}</td>
                                                <td className="text-right py-3 px-2">{pos.trades}</td>
                                                <td className="text-right py-3 px-2 text-purple-300">${pos.avgEntry.toFixed(4)}</td>
                                                <td className="text-right py-3 px-2 text-purple-300">
                                                    {pos.avgExit > 0 ? `$${pos.avgExit.toFixed(4)}` : '-'}
                                                </td>
                                                <td className={`text-right py-3 px-2 font-bold ${pos.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                                                </td>
                                                <td className={`text-right py-3 px-2 font-bold ${pos.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {pos.roi >= 0 ? '+' : ''}{pos.roi.toFixed(1)}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Related Wallets Section */}
                        {results.relatedWallets && results.relatedWallets.length > 0 && (
                            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 shadow-lg">
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <Users className="text-blue-400" />
                                    Related Wallets
                                    <span className="text-sm font-normal text-purple-300 ml-2">
                                        ({results.relatedWallets.length} detected)
                                    </span>
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {results.relatedWallets.map((wallet, i) => (
                                        <div key={i} className="bg-white/5 rounded-lg p-4 border border-white/10 hover:border-purple-500/50 transition-all">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="font-mono text-sm text-purple-200 truncate flex-1">
                                                    {wallet.address.slice(0, 4)}...{wallet.address.slice(-4)}
                                                </div>
                                                <a
                                                    href={`https://solscan.io/account/${wallet.address}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-2 text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                                    title="View on Solscan"
                                                >
                                                    <ExternalLink size={14} />
                                                </a>
                                            </div>
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${wallet.riskLevel === 'high'
                                                    ? 'bg-red-500/20 text-red-300 border border-red-500/50'
                                                    : wallet.riskLevel === 'medium'
                                                        ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50'
                                                        : 'bg-green-500/20 text-green-300 border border-green-500/50'
                                                    }`}>
                                                    {wallet.riskLevel} risk
                                                </span>
                                                <span className="text-xs text-purple-400">
                                                    Score: {wallet.riskScore}/100
                                                </span>
                                            </div>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-purple-300">Interactions:</span>
                                                    <span className="text-white font-medium">{wallet.interactions}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-purple-300">SOL Transferred:</span>
                                                    <span className="text-white font-medium">{wallet.solTransferred.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-purple-300">Last Seen:</span>
                                                    <span className="text-white font-medium">
                                                        {formatTimestamp(wallet.lastSeen)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="text-center mt-8 text-purple-300 text-sm">
                    <p>Built with Next.js • Powered by Helius API</p>
                </div>
            </div>
        </div>
    );
}

// Helper function to format timestamps
function formatTimestamp(timestamp) {
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    return `${Math.floor(diff / 2592000)}mo ago`;
}
