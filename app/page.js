'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import {
    TrendingUp, TrendingDown, Search, Loader2, ExternalLink,
    Wallet, Users, Copy, Check, AlertCircle, Download, Zap, GitCompare, Trophy,
    Clock, Activity, Target, ShieldCheck, Flame, Network
} from 'lucide-react';

const TIMEFRAMES = [
    { label: '24H', value: '24h' },
    { label: '7D', value: '7d' },
    { label: '30D', value: '30d' },
    { label: 'All', value: 'all' },
];

function getTimeframeCutoff(tf) {
    const now = Math.floor(Date.now() / 1000);
    if (tf === '24h') return now - 86400;
    if (tf === '7d') return now - 604800;
    if (tf === '30d') return now - 2592000;
    return 0;
}

// ─── Stats Engine ────────────────────────────────────────────────────────────
function calcStats(trades, timeframe, currentPrices) {
    const cutoff = getTimeframeCutoff(timeframe);
    const filtered = trades.filter(t => t.timestamp >= cutoff);

    const posMap = new Map();
    const sellTradeEvents = [];
    
    let totalWinStreak = 0;
    let currentWinStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currLossStreak = 0;
    let totalHoldTimeSeconds = 0;
    let closedTradesCount = 0;
    let pumpFunSnipes = 0;

    for (const trade of filtered) {
        if (!posMap.has(trade.mint)) {
            posMap.set(trade.mint, {
                mint: trade.mint,
                symbol: trade.symbol || trade.mint.slice(0, 6) + '…',
                name: trade.name || null,
                logoURI: trade.logoURI || null,
                lots: [],
                totalSpent: 0,
                totalReceived: 0,
                totalBought: 0,
                totalSold: 0,
                realizedPnL: 0,
                tradeCount: 0,
                firstBuyTimestamp: trade.type === 'BUY' ? trade.timestamp : null,
                isPumpFun: trade.isPumpFun
            });
        }

        const pos = posMap.get(trade.mint);
        pos.tradeCount++;
        if (trade.isPumpFun) pos.isPumpFun = true;
        if (!pos.firstBuyTimestamp && trade.type === 'BUY') {
            pos.firstBuyTimestamp = trade.timestamp;
        }

        if (trade.type === 'BUY') {
            pos.lots.push({ amount: trade.amount, costPerToken: trade.pricePerToken });
            pos.totalSpent += trade.baseAmount;
            pos.totalBought += trade.amount;
        } else {
            // FIFO sell
            const revenue = trade.baseAmount;
            let remaining = trade.amount;
            let costBasis = 0;
            const updatedLots = [];

            for (const lot of pos.lots) {
                if (remaining <= 1e-9) { updatedLots.push(lot); continue; }
                const fromLot = Math.min(remaining, lot.amount);
                costBasis += fromLot * lot.costPerToken;
                remaining -= fromLot;
                const leftover = lot.amount - fromLot;
                if (leftover > 1e-9) updatedLots.push({ ...lot, amount: leftover });
            }

            pos.lots = updatedLots;
            const sellPnl = revenue - costBasis;
            pos.realizedPnL += sellPnl;
            pos.totalSold += trade.amount;
            pos.totalReceived += revenue;
            
            sellTradeEvents.push({
                mint: trade.mint, symbol: pos.symbol, name: pos.name, logoURI: pos.logoURI,
                timestamp: trade.timestamp, costBasis, revenue,
                pnl: sellPnl, roi: costBasis > 0 ? (sellPnl / costBasis) * 100 : 0,
                signature: trade.signature, baseCurrency: trade.baseCurrency,
            });

            // Streaks
            if (sellPnl > 0) {
                currentWinStreak++; currLossStreak = 0;
                if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
            } else if (sellPnl < 0) {
                currLossStreak++; currentWinStreak = 0;
                if (currLossStreak > maxLossStreak) maxLossStreak = currLossStreak;
            }

            // Hold Time
            if (pos.firstBuyTimestamp) {
                totalHoldTimeSeconds += (trade.timestamp - pos.firstBuyTimestamp);
                closedTradesCount++;
            }
        }
    }

    // Chart Data
    let cumulativePnL = 0;
    const dailyMap = new Map();
    for (const event of sellTradeEvents) {
        cumulativePnL += event.pnl;
        const dateKey = new Date(event.timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dailyMap.set(dateKey, { date: dateKey, pnl: cumulativePnL, ts: event.timestamp });
    }
    const chartData = [...dailyMap.values()].sort((a, b) => a.ts - b.ts);

    // Enrich Positions
    const posArray = Array.from(posMap.values()).map(pos => {
        const remainingAmt = pos.lots.reduce((s, l) => s + l.amount, 0);
        const weightedCost = pos.lots.reduce((s, l) => s + l.amount * l.costPerToken, 0);
        const avgCostRemaining = remainingAmt > 0 ? weightedCost / remainingAmt : 0;
        const priceData = currentPrices?.[pos.mint];
        const currentPrice = priceData?.price ? Number(priceData.price) : null;
        const unrealizedPnL = currentPrice !== null && remainingAmt > 1e-9 ? (currentPrice - avgCostRemaining) * remainingAmt : null;
        
        if (pos.isPumpFun) pumpFunSnipes++;

        return {
            ...pos,
            remainingAmt,
            avgCostRemaining,
            currentPrice,
            unrealizedPnL,
            currentPortfolioValueUsd: currentPrice !== null && remainingAmt > 1e-9 ? remainingAmt * currentPrice : 0,
            avgEntry: pos.totalBought > 0 ? pos.totalSpent / pos.totalBought : 0,
            avgExit: pos.totalSold > 0 ? pos.totalReceived / pos.totalSold : 0,
            roi: pos.totalSpent > 0 ? (pos.realizedPnL / pos.totalSpent) * 100 : 0,
        };
    });

    const sorted = posArray.sort((a, b) => b.realizedPnL - a.realizedPnL);
    const totalPnL = sorted.reduce((s, p) => s + p.realizedPnL, 0);
    const winners = sorted.filter(p => p.realizedPnL > 0).length;
    const losers = sorted.filter(p => p.realizedPnL < 0).length;
    const winRate = (winners + losers) > 0 ? (winners / (winners + losers)) * 100 : 0;
    const totalVolume = sorted.reduce((s, p) => s + p.totalSpent + p.totalReceived, 0);
    const topTrades = [...sellTradeEvents].sort((a, b) => b.roi - a.roi).slice(0, 10);
    const avgHoldSeconds = closedTradesCount > 0 ? totalHoldTimeSeconds / closedTradesCount : 0;

    return {
        positions: sorted,
        openPositions: sorted.filter(p => p.remainingAmt > 1e-9),
        closedPositions: sorted.filter(p => p.remainingAmt <= 1e-9 && p.totalSold > 0),
        pnlHistory: chartData,
        totalPnL, winners, losers, winRate,
        totalTrades: filtered.length,
        totalVolume, bestPerformer: sorted[0] || null, topTrades,
        maxWinStreak, maxLossStreak, currentWinStreak, avgHoldSeconds, pumpFunSnipes
    };
}

// ─── Format UI Helpers ───────────────────────────────────────────────────────
function fmt(n) { return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtUsd(n) { return (n < 0 ? '-$' : '$') + Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function shortAddr(addr) { return addr ? addr.slice(0, 4) + '…' + addr.slice(-4) : ''; }
function timeAgo(ts) {
    if (!ts) return '—';
    const d = Math.floor(Date.now() / 1000) - ts;
    if (d < 60) return `${d}s ago`;
    if (d < 3600) return `${Math.floor(d / 60)}m ago`;
    if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
    return `${Math.floor(d / 86400)}d ago`;
}
function formatDuration(sec) {
    if (sec < 60) return `${Math.floor(sec)} sec`;
    if (sec < 3600) return `${Math.floor(sec / 60)} min`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} hrs`;
    return `${Math.floor(sec / 86400)} days`;
}

// ─── UI Components ───────────────────────────────────────────────────────────
function CopyBtn({ text, small }) {
    const [done, setDone] = useState(false);
    return (
        <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: done ? '#14F195' : 'rgba(255,255,255,0.4)', padding: 2 }}>
            {done ? <Check size={small ? 12 : 14} /> : <Copy size={small ? 12 : 14} />}
        </button>
    );
}

function StatCard({ label, value, sub, icon: Icon, color = '#14F195', glow }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 24px', boxShadow: glow ? `0 0 24px ${color}22` : 'none', flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 10, fontWeight: 600, textTransform: 'uppercase' }}>
                {Icon && <Icon size={14} />}{label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{sub}</div>}
        </div>
    );
}

// ─── D3 Cluster Graph Component ──────────────────────────────────────────────
function ClusterGraph({ mainWallet, relatedWallets, onNodeClick }) {
    const svgRef = useRef(null);

    useEffect(() => {
        if (!svgRef.current || !mainWallet || !relatedWallets) return;
        
        const width = svgRef.current.parentElement.clientWidth;
        const height = 560;
        
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        
        // Define Nodes
        const nodes = [
            { id: mainWallet, isMain: true, radius: 24 },
            ...relatedWallets.map(rw => ({
                id: rw.address,
                isMain: false,
                radius: Math.max(8, Math.min(20, 6 + rw.interactions * 1.5)),
                interactions: rw.interactions,
                volume: rw.solSent + rw.solReceived
            }))
        ];
        
        // Define Links (Main to Related)
        const links = relatedWallets.map(rw => ({
            source: mainWallet,
            target: rw.address,
            value: rw.interactions
        }));
        
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(140).strength(0.6))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide().radius(d => d.radius + 15));

        const g = svg.append('g');
        const zoom = d3.zoom().scaleExtent([0.3, 3]).on('zoom', e => g.attr('transform', e.transform));
        svg.call(zoom);

        const link = g.append('g').selectAll('line').data(links).join('line')
            .attr('stroke', 'rgba(255,255,255,0.1)')
            .attr('stroke-width', d => Math.min(4, d.value));

        const node = g.append('g').selectAll('circle').data(nodes).join('circle')
            .attr('r', d => d.radius)
            .attr('fill', d => d.isMain ? '#7c6fff' : '#2a2a50')
            .attr('stroke', d => d.isMain ? 'rgba(124,111,255,0.4)' : 'rgba(255,255,255,0.1)')
            .attr('stroke-width', 6)
            .attr('cursor', 'pointer')
            .call(d3.drag()
                .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
            )
            .on('click', (e, d) => { if (!d.isMain) onNodeClick(d.id); });

        const labels = g.append('g').selectAll('text').data(nodes).join('text')
            .text(d => d.isMain ? 'SEED' : d.id.slice(0, 4) + '…' + d.id.slice(-4))
            .attr('font-size', d => d.isMain ? '12px' : '10px')
            .attr('font-weight', d => d.isMain ? '700' : '400')
            .attr('fill', d => d.isMain ? '#7c6fff' : 'rgba(255,255,255,0.5)')
            .attr('text-anchor', 'middle')
            .attr('dy', d => d.radius + 16)
            .style('pointer-events', 'none');

        // Tooltip
        let tooltip = d3.select('#graph-tooltip');
        if (tooltip.empty()) {
            tooltip = d3.select('body').append('div')
                .attr('id', 'graph-tooltip')
                .style('position', 'absolute').style('background', 'rgba(10,10,16,0.95)')
                .style('border', '1px solid rgba(255,255,255,0.1)').style('border-radius', '8px')
                .style('padding', '10px 14px').style('color', '#fff').style('font-size', '12px')
                .style('pointer-events', 'none').style('opacity', 0).style('z-index', 100).style('backdrop-filter', 'blur(10px)');
        }

        node.on('mouseover', (e, d) => {
            tooltip.transition().duration(200).style('opacity', 1);
            tooltip.html(
                d.isMain ? `<div style="color:#7c6fff;margin-bottom:4px;font-size:10px;font-weight:700">PRIMARY WALLET</div>
                            <div style="font-family:monospace;color:white">${d.id}</div>` 
                : `<div style="color:rgba(255,255,255,0.5);margin-bottom:4px;font-size:10px;font-weight:700">RELATED WALLET</div>
                   <div style="font-family:monospace;color:white;margin-bottom:6px">${d.id}</div>
                   <div style="color:#aaa">Interactions: <span style="color:white">${d.interactions}</span></div>
                   <div style="color:#aaa">SOL Volume: <span style="color:#14F195">${d.volume.toFixed(2)} SOL</span></div>`
            )
            .style('left', (e.pageX + 20) + 'px').style('top', (e.pageY - 20) + 'px');
        }).on('mousemove', e => {
            tooltip.style('left', (e.pageX + 20) + 'px').style('top', (e.pageY - 20) + 'px');
        }).on('mouseout', () => {
            tooltip.transition().duration(500).style('opacity', 0);
        });

        simulation.on('tick', () => {
            link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
            node.attr('cx', d => d.x).attr('cy', d => d.y);
            labels.attr('x', d => d.x).attr('y', d => d.y);
        });

        return () => {
            simulation.stop();
            d3.select('#graph-tooltip').remove();
        };
    }, [mainWallet, relatedWallets, onNodeClick]);

    return (
        <div style={{ width: '100%', position: 'relative' }}>
            <svg ref={svgRef} style={{ width: '100%', height: 560 }} />
            <div style={{ position: 'absolute', bottom: 20, left: 24, display: 'flex', gap: 16, background: 'rgba(0,0,0,0.5)', padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: '#7c6fff' }}/> Primary Seed</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2a2a50' }}/> Related Node</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}><div style={{ width: 24, height: 2, background: 'rgba(255,255,255,0.2)' }}/> Funding Link</div>
            </div>
            <div style={{ position: 'absolute', right: 24, bottom: 20, textAlign: 'right', color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Scroll to zoom. Drag nodes to move.<br/>Click node to deeply analyze.</div>
        </div>
    );
}


// ─── Main View ───────────────────────────────────────────────────────────────
export default function Home() {
    const [wallet, setWallet] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [rawData, setRawData] = useState(null);
    const [timeframe, setTimeframe] = useState('all');
    const [stats, setStats] = useState(null);
    const [tab, setTab] = useState('all'); // Toggles Table: all/open/closed
    const [mainView, setMainView] = useState('dashboard'); // Toggles View: dashboard/network
    const [toast, setToast] = useState(null);

    useEffect(() => { if (rawData) setStats(calcStats(rawData.trades, timeframe, rawData.currentPrices)); }, [rawData, timeframe]);

    const showToast = useCallback((msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    }, []);

    const fetchWallet = async (addr) => {
        const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ walletAddress: addr.trim() }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Analysis failed');
        return data;
    };

    const analyze = async (targetWallet = wallet) => {
        if (!targetWallet.trim()) return setError('Enter wallet address');
        setWallet(targetWallet);
        setLoading(true); setError(null); setRawData(null); setStats(null);
        try {
            const data = await fetchWallet(targetWallet);
            setRawData({ ...data, analyzedAddress: targetWallet });
            setMainView('dashboard');
            showToast(`Fetched ${data.transactionCount} txns ✓`);
        } catch (err) { setError(err.message); } finally { setLoading(false); }
    };

    // Calculate Portfolio Allocation (Pie chart data)
    const pieData = useMemo(() => {
        if (!stats) return [];
        return stats.openPositions
            .filter(p => p.currentPortfolioValueUsd > 1) // Ignore dust
            .sort((a,b) => b.currentPortfolioValueUsd - a.currentPortfolioValueUsd)
            .slice(0, 5) // Top 5 holdings
            .map((p, i) => ({ name: p.symbol, value: p.currentPortfolioValueUsd, color: ['#14F195', '#9945FF', '#60A5FA', '#FBBF24', '#FF6B6B'][i] }));
    }, [stats]);

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a10', color: 'white', fontFamily: "'Inter', sans-serif" }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
                * { box-sizing: border-box; }
                input::placeholder { color: rgba(255,255,255,0.25); } input:focus { outline: none; }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
            `}</style>

            <div style={{ maxWidth: 1300, margin: '0 auto', padding: '40px 24px' }}>
                {/* Header Navbar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #14F195, #9945FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>◎</div>
                        <div>
                            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '0.05em' }}>SOLSCAN.ALPHA</h1>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Memecoin Intelligence</div>
                        </div>
                    </div>
                    
                    {rawData && (
                        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
                            <button onClick={() => setMainView('dashboard')} style={{ padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: mainView === 'dashboard' ? 'rgba(255,255,255,0.1)' : 'transparent', color: mainView === 'dashboard' ? '#fff' : 'rgba(255,255,255,0.4)' }}>Dashboard</button>
                            <button onClick={() => setMainView('network')} style={{ padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6, background: mainView === 'network' ? 'rgba(255,255,255,0.1)' : 'transparent', color: mainView === 'network' ? '#fff' : 'rgba(255,255,255,0.4)' }}><Network size={14}/> Network</button>
                        </div>
                    )}
                </div>

                {/* Scan Control Panel */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24, marginBottom: 32 }}>
                    <div style={{ marginBottom: 16 }}>
                        <input value={wallet} onChange={e => setWallet(e.target.value)} onKeyDown={e => e.key === 'Enter' && analyze()} placeholder="Solana Wallet Address" style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: 'white', padding: '14px 16px', fontSize: 14 }} />
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {TIMEFRAMES.map(tf => (
                                <button key={tf.value} onClick={() => setTimeframe(tf.value)} style={{ padding: '8px 18px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', background: timeframe === tf.value ? 'rgba(20,241,149,0.1)' : 'rgba(255,255,255,0.03)', color: timeframe === tf.value ? '#14F195' : 'rgba(255,255,255,0.5)', border: timeframe === tf.value ? '1px solid rgba(20,241,149,0.3)' : '1px solid rgba(255,255,255,0.05)' }}>{tf.label}</button>
                            ))}
                        </div>
                        <button onClick={() => analyze(wallet)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 28px', background: loading ? 'rgba(255,255,255,0.1)' : '#14F195', borderRadius: 12, color: '#000', fontWeight: 700, cursor: loading ? 'default' : 'pointer', border: 'none', transition: 'all 0.2s' }}>
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} {loading ? 'Scanning Blockchain...' : 'Extract Alpha'}
                        </button>
                    </div>
                </div>

                {error && <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 12, padding: 14, color: '#FF6B6B', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}><AlertCircle size={18} /> {error}</div>}

                {/* Dashboard View */}
                {stats && !loading && mainView === 'dashboard' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn 0.3s ease-in' }}>
                        
                        {/* Trader Profile Badges */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {stats.avgHoldSeconds > 0 && stats.avgHoldSeconds < 1800 && <div style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24', padding: '6px 14px', borderRadius: 100, fontSize: 12, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid currentColor' }}><Flame size={13}/> Scalper (Avg Hold: {formatDuration(stats.avgHoldSeconds)})</div>}
                            {stats.avgHoldSeconds > 86400 && <div style={{ background: 'rgba(153,69,255,0.15)', color: '#9945FF', padding: '6px 14px', borderRadius: 100, fontSize: 12, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid currentColor' }}><ShieldCheck size={13}/> Diamond Hands</div>}
                            {stats.pumpFunSnipes > 5 && <div style={{ background: 'rgba(20,241,149,0.15)', color: '#14F195', padding: '6px 14px', borderRadius: 100, fontSize: 12, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid currentColor' }}><Target size={13}/> Pump.fun Sniper ({stats.pumpFunSnipes} hits)</div>}
                            {stats.maxWinStreak > 4 && <div style={{ background: 'rgba(96,165,250,0.15)', color: '#60A5FA', padding: '6px 14px', borderRadius: 100, fontSize: 12, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid currentColor' }}><TrendingUp size={13}/> Top Streak: {stats.maxWinStreak}W</div>}
                            {stats.currentWinStreak >= 3 && <div style={{ background: 'rgba(255,107,107,0.15)', color: '#FF6B6B', padding: '6px 14px', borderRadius: 100, fontSize: 12, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid currentColor' }}>🔥 Boiling Hot ({stats.currentWinStreak}W Active)</div>}
                        </div>

                        {/* Top Stats Array */}
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            <StatCard label="Realized P&L" icon={stats.totalPnL >= 0 ? TrendingUp : TrendingDown} value={fmtUsd(stats.totalPnL)} color={stats.totalPnL >= 0 ? '#14F195' : '#FF6B6B'} glow />
                            <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} sub={`${stats.winners}W / ${stats.losers}L`} color="#9945FF" />
                            <StatCard label="Hold Time" value={formatDuration(stats.avgHoldSeconds)} sub="Average round trip" icon={Clock} color="#60A5FA" />
                            <StatCard label="Total Volume" value={fmtUsd(stats.totalVolume)} sub={`${stats.totalTrades} total trades`} icon={Wallet} color="#14F195" />
                        </div>

                        {/* Charts Area */}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
                            {/* PnL History Area Chart */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '24px 24px 20px' }}>
                                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20, color: 'rgba(255,255,255,0.8)' }}>Cumulative Realized Flow</div>
                                <ResponsiveContainer width="100%" height={240}>
                                    <AreaChart data={stats.pnlHistory}>
                                        <defs>
                                            <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#14F195" stopOpacity={0.3}/><stop offset="95%" stopColor="#14F195" stopOpacity={0}/></linearGradient>
                                        </defs>
                                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                                        <YAxis stroke="rgba(255,255,255,0.2)" tick={{fontSize: 10}} tickFormatter={v=>`$${v}`} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={{background:'rgba(10,10,16,0.9)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, fontSize:12}} itemStyle={{color:'#14F195', fontWeight:700}}/>
                                        <Area type="monotone" dataKey="pnl" stroke="#14F195" strokeWidth={2} fill="url(#pg)" activeDot={{r: 5, fill: '#fff', stroke: '#14F195'}}/>
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Portfolio Allocation Pie */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '24px 24px 20px', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: 'rgba(255,255,255,0.8)' }}>Live Portfolio Bags</div>
                                {pieData.length > 0 ? (
                                    <>
                                        <ResponsiveContainer width="100%" height={150}>
                                            <PieChart>
                                                <Pie data={pieData} innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value" stroke="none">
                                                    {pieData.map((d,i) => <Cell key={i} fill={d.color} />)}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div style={{ display: 'grid', gap: 6, marginTop: 16 }}>
                                            {pieData.map((d,i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color}}/> {d.name}</div>
                                                    <div style={{ fontWeight: 700 }}>{fmtUsd(d.value)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center' }}>No active dollar bags<br/>held on chain.</div>}
                            </div>
                        </div>

                        {/* Positions Table */}
                        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'clip' }}>
                            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 6 }}>
                                {['all', 'open', 'closed'].map(v => (
                                    <button key={v} onClick={()=>setTab(v)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: tab===v ? 'rgba(153,69,255,0.1)' : 'transparent', color: tab===v ? '#9945FF' : 'rgba(255,255,255,0.4)', border: `1px solid ${tab===v ? 'rgba(153,69,255,0.3)' : 'transparent'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
                                        {v.toUpperCase()} ({v==='all'?stats.positions.length : v==='open'?stats.openPositions.length : stats.closedPositions.length})
                                    </button>
                                ))}
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, minWidth: 700 }}>
                                    <thead>
                                        <tr style={{ color: 'rgba(255,255,255,0.4)' }}>
                                            {['Token', 'Contract', 'Avg Entry', 'Avg Exit', 'P&L', 'ROI', 'Remaining'].map((h, i) => <th key={i} style={{ padding: '14px 20px', fontWeight: 600, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>{h}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(tab==='all'?stats.positions : tab==='open'?stats.openPositions : stats.closedPositions).map((p,i) => (
                                            <tr key={p.mint} style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)', background: 'transparent', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <td style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    {p.logoURI ? <img src={p.logoURI} style={{ width: 28, height: 28, borderRadius: '50%' }} /> : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }}/>}
                                                    <div>
                                                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>{p.symbol} {p.isPumpFun && <span style={{fontSize: 9, padding: '2px 5px', background: 'rgba(20,241,149,0.1)', color: '#14F195', borderRadius: 4, transform: 'translateY(-1px)'}}>PUMP</span>}</div>
                                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{p.tradeCount} trades</div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '14px 20px', fontFamily: 'monospace', color: '#60A5FA', fontSize: 12 }}><a href={`https://solscan.io/token/${p.mint}`} target="_blank" style={{ color: 'inherit', textDecoration: 'none' }}>{shortAddr(p.mint)}</a> <CopyBtn text={p.mint} small/></td>
                                                <td style={{ padding: '14px 20px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>${p.avgEntry.toFixed(5)}</td>
                                                <td style={{ padding: '14px 20px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{p.avgExit>0?`$${p.avgExit.toFixed(5)}`:'—'}</td>
                                                <td style={{ padding: '14px 20px', fontWeight: 700, color: p.realizedPnL>=0?'#14F195':'#FF6B6B'}}>{fmtUsd(p.realizedPnL)}</td>
                                                <td style={{ padding: '14px 20px', fontWeight: 700, color: p.roi>=0?'#14F195':'#FF6B6B'}}>{p.roi>=0?'+':''}{p.roi.toFixed(1)}%</td>
                                                <td style={{ padding: '14px 20px', color: p.unrealizedPnL!==null ? (p.unrealizedPnL>=0?'#14F195':'#FF6B6B') : 'rgba(255,255,255,0.4)' }}>{p.remainingAmt>1e-9 ? (p.unrealizedPnL!==null? `${fmtUsd(p.unrealizedPnL)} unrlz` : `${fmt(p.remainingAmt)} tkns`) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Network View (D3 Cluster) */}
                {stats && !loading && mainView === 'network' && (
                    <div style={{ animation: 'fadeIn 0.3s ease-in' }}>
                        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div>
                                <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px 0' }}>D3 Cluster Graph</h2>
                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Force-directed view mapping SOL transfers between the seed wallet and counterparties.</div>
                            </div>
                            <div style={{ fontSize: 12, background: 'rgba(153,69,255,0.1)', color: '#9945FF', padding: '6px 12px', borderRadius: 8, fontWeight: 600, border: '1px solid rgba(153,69,255,0.2)' }}>
                                {rawData.relatedWallets?.length || 0} Connected Nodes
                            </div>
                        </div>
                        
                        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
                            <ClusterGraph 
                                mainWallet={rawData.analyzedAddress} 
                                relatedWallets={rawData.relatedWallets || []} 
                                onNodeClick={(target) => {
                                    showToast(`Scanning related wallet: ${shortAddr(target)}...`, 'loading');
                                    analyze(target);
                                }} 
                            />
                        </div>
                    </div>
                )}
            </div>
            {toast && <div style={{ position: 'fixed', bottom: 20, right: 20, background: 'rgba(20,241,149,0.1)', border: '1px solid rgba(20,241,149,0.5)', color: '#14F195', padding: '12px 20px', borderRadius: 12, fontWeight: 600, backdropFilter: 'blur(10px)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>{toast.msg}</div>}
        </div>
    );
}
