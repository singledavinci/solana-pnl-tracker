export default async function handler(req, res) {
    const { wallet, type, limit, before } = req.query;
    const apiKey = process.env.HELIUS_API_KEY;

    if (!wallet) {
        return res.status(400).json({ error: 'Wallet address is required' });
    }

    try {
        const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions`;
        const params = new URLSearchParams({
            'api-key': apiKey,
            limit: Math.min(parseInt(limit || '100'), 100).toString()
        });

        if (type) params.append('type', type);
        if (before) params.append('before', before);

        const response = await fetch(`${url}?${params}`);
        const data = await response.json();

        if (!response.ok) {
            // If Helius returns 404 because no SWAP events found, return empty array
            if (response.status === 404 && data.error && data.error.includes('Failed to find events')) {
                return res.status(200).json([]);
            }
            return res.status(response.status).json(data);
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Helius Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
