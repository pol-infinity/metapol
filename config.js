// MetaPOL DApp Configuration
const CONFIG = {
    // Contract details
    CONTRACT_ADDRESS: "0x9820ea1ad8bbff1f6a8a8efe26a20b4447ecb1ab",
    
    // Polygon Mainnet (Chain ID 137)
    CHAIN_ID: "0x89", // Hex representation of 137
    CHAIN_ID_DECIMAL: 137,
    CHAIN_NAME: "Polygon Mainnet",
    RPC_URL: "https://polygon-rpc.com",
    BLOCK_EXPLORER: "https://polygonscan.com",
    NATIVE_CURRENCY: {
        name: "POL",
        symbol: "POL",
        decimals: 18
    },

    // Default Settings
    DEFAULT_SPONSOR_ID: 1, // Fallback sponsor (Owner Wallet)
    
    // App constants from contract
    REGISTRATION_FEE: "5.0", // 5 POL
    LEVEL_PRICES: [
        "10.0",   // Slot 1
        "20.0",   // Slot 2
        "40.0",   // Slot 3
        "80.0",   // Slot 4
        "160.0",  // Slot 5
        "320.0",  // Slot 6
        "640.0",  // Slot 7
        "1280.0", // Slot 8
        "2560.0", // Slot 9
        "5120.0", // Slot 10
        "10240.0",// Slot 11
        "20480.0" // Slot 12
    ],
    
    LEVEL_THRESHOLDS: [3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    
    // Mining Constants
    MINING_PCT: 20,         // 20% of slot price goes to mining capital
    MINING_CAP_MULT: 5,     // 5x mining cap multiplier
    DAILY_RATE_X1e12: 1500000000n, // BigInt representation of 1_500_000_000
    SECONDS_PER_DAY: 86400,

    // Social Sharing Messages for Referral Links
    SHARE_TEMPLATES: {
        whatsapp: "Join MetaPOL, the ultimate decentralized Matrix + Passive Mining ecosystem on Polygon! Earn 1.5% daily mining rewards and cycle bonuses. Register here: ",
        telegram: "🚀 Join MetaPOL - Decentralized Matrix + Passive Mining ecosystem on Polygon! \n💎 1.5% Daily Mining Rewards\n💎 Auto-cycling Matrix Spillover\n\nRegister now using my link: ",
        twitter: "Discover MetaPOL: a decentralized Matrix and Passive Mining system on #Polygon! 💎 Earn passive income with daily mining rewards. Start here: ",
        facebook: "MetaPOL is a next-generation decentralized Matrix + Passive Mining platform built on Polygon. Get 1.5% daily passive returns on your slots plus team spillover matrix profits. Join today: "
    }
};

// Expose CONFIG globally
window.CONFIG = CONFIG;
