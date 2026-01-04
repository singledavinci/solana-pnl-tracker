export default function handler(req, res) {
    // Return environment variables as JavaScript
    res.setHeader('Content-Type', 'application/javascript');

    const heliusKey = process.env.HELIUS_API_KEY || null;

    res.status(200).send(`
    // Environment configuration
    const HELIUS_API_KEY = ${heliusKey ? `"${heliusKey}"` : 'null'};
  `);
}
