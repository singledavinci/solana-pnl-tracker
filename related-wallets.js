// Detect related wallets that frequently interact with the main wallet
function detectRelatedWallets(transactions, mainWallet) {
    const walletInteractions = new Map();

    for (const tx of transactions) {
        try {
            // Skip if no account data
            if (!tx.accountData || !Array.isArray(tx.accountData)) {
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
            }

            // Real transaction parsing
            if (tx.accountData) {
                for (const account of tx.accountData) {
                    // Skip if it's the main wallet
                    if (account.account === mainWallet) continue;

                    // Track this wallet
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

                    // Track SOL transfers
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
        // Only include wallets with multiple interactions
        if (data.interactions < 2) return;

        // Calculate risk score (0-100)
        let riskScore = 0;

        // High interaction count = higher risk
        if (data.interactions > 10) riskScore += 40;
        else if (data.interactions > 5) riskScore += 25;
        else riskScore += 10;

        // High SOL transfer volume = higher risk  
        if (data.solTransferred > 100) riskScore += 30;
        else if (data.solTransferred > 10) riskScore += 20;
        else riskScore += 10;

        // Recent interactions = higher risk
        const daysSinceLastInteraction = (Date.now() / 1000 - data.lastInteraction) / 86400;
        if (daysSinceLastInteraction < 1) riskScore += 20;
        else if (daysSinceLastInteraction < 7) riskScore += 10;

        // Frequent interactions in short time = very suspicious
        const interactionPeriod = data.lastInteraction - data.firstInteraction;
        const interactionsPerDay = interactionPeriod > 0 ? data.interactions / (interactionPeriod / 86400) : 0;
        if (interactionsPerDay > 5) riskScore += 10;

        // Determine risk level
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
        });
    });

    // Sort by risk score (highest first)
    relatedWallets.sort((a, b) => b.riskScore - a.riskScore);

    // Return top 10
    return relatedWallets.slice(0, 10);
}

// Format wallet address for display (shorten)
function formatAddress(address) {
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// Update display to include related wallets
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
            </div>
        `;
        grid.appendChild(card);
    });
}

// Format timestamp to relative time
function formatTimestamp(timestamp) {
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    return `${Math.floor(diff / 2592000)}mo ago`;
}
