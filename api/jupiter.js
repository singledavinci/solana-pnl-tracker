export default async function handler(req, res) {
    const { ids } = req.query;

    if (!ids) {
        return res.status(400).json({ error: 'Token IDs (mints) are required' });
    }

    try {
        const response = await fetch(`https://price.jup.ag/v4/price?ids=${ids}`);
        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Jupiter Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
