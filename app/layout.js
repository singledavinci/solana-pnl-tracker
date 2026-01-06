import './globals.css'

export const metadata = {
    title: 'Solana P&L Tracker',
    description: 'Analyze your Solana wallet performance with accurate P&L tracking',
}

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
