// Real Solana On-Chain Integration
// No fake data - 100% real blockchain interactions

class SolanaIntegration {
    constructor() {
        this.connection = null;
        this.wallet = null;
        this.wallets = []; // User's managed wallets
        this.rpcEndpoint = null;
        this.jitoEnabled = false;
        this.init();
    }

    async init() {
        // Initialize with public RPC (user can change in settings)
        this.rpcEndpoint = 'https://api.mainnet-beta.solana.com';
        const { Connection } = window.solanaWeb3;
        this.connection = new Connection(this.rpcEndpoint, 'confirmed');
        
        // Check if wallet adapter is available
        this.checkWalletAvailability();
        
        // Load saved wallets from localStorage
        this.loadSavedWallets();
        
        console.log('✅ Solana Integration initialized');
    }

    checkWalletAvailability() {
        if (window.solana && window.solana.isPhantom) {
            console.log('✅ Phantom wallet detected');
            return true;
        }
        if (window.solflare && window.solflare.isSolflare) {
            console.log('✅ Solflare wallet detected');
            return true;
        }
        console.log('⚠️ No Solana wallet detected');
        return false;
    }

    async connectWallet() {
        try {
            if (window.solana) {
                const resp = await window.solana.connect();
                this.wallet = window.solana;
                console.log('✅ Connected to wallet:', resp.publicKey.toString());
                return {
                    success: true,
                    publicKey: resp.publicKey.toString(),
                    balance: await this.getBalance(resp.publicKey.toString())
                };
            } else if (window.solflare) {
                await window.solflare.connect();
                this.wallet = window.solflare;
                console.log('✅ Connected to Solflare');
                return {
                    success: true,
                    publicKey: window.solflare.publicKey.toString(),
                    balance: await this.getBalance(window.solflare.publicKey.toString())
                };
            }
            throw new Error('No wallet found');
        } catch (error) {
            console.error('❌ Wallet connection error:', error);
            return { success: false, error: error.message };
        }
    }

    async disconnectWallet() {
        if (this.wallet && this.wallet.disconnect) {
            await this.wallet.disconnect();
            this.wallet = null;
            console.log('✅ Wallet disconnected');
        }
    }

    // Real balance fetching from blockchain
    async getBalance(publicKeyString) {
        try {
            const { PublicKey, LAMPORTS_PER_SOL } = window.solanaWeb3;
            const publicKey = new PublicKey(publicKeyString);
            const balance = await this.connection.getBalance(publicKey);
            return balance / LAMPORTS_PER_SOL;
        } catch (error) {
            console.error('Error fetching balance:', error);
            return 0;
        }
    }

    // Real SOL transfer
    async transferSOL(fromPrivateKey, toPublicKey, amount) {
        try {
            const { 
                Keypair, 
                PublicKey, 
                Transaction, 
                SystemProgram, 
                LAMPORTS_PER_SOL,
                sendAndConfirmTransaction
            } = window.solanaWeb3;

            // Convert private key string to Keypair
            const fromKeypair = Keypair.fromSecretKey(
                Uint8Array.from(JSON.parse(fromPrivateKey))
            );

            const toPubkey = new PublicKey(toPublicKey);
            const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: fromKeypair.publicKey,
                    toPubkey: toPubkey,
                    lamports: lamports,
                })
            );

            const signature = await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [fromKeypair]
            );

            console.log('✅ Transfer successful:', signature);
            return { success: true, signature };
        } catch (error) {
            console.error('❌ Transfer failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Create new wallet
    createWallet() {
        const { Keypair } = window.solanaWeb3;
        const keypair = Keypair.generate();
        
        return {
            publicKey: keypair.publicKey.toString(),
            privateKey: JSON.stringify(Array.from(keypair.secretKey)),
            mnemonic: null // Could add BIP39 mnemonic generation
        };
    }

    // Import wallet from private key
    importWallet(privateKeyString) {
        try {
            const { Keypair } = window.solanaWeb3;
            const secretKey = Uint8Array.from(JSON.parse(privateKeyString));
            const keypair = Keypair.fromSecretKey(secretKey);
            
            return {
                success: true,
                publicKey: keypair.publicKey.toString(),
                privateKey: privateKeyString
            };
        } catch (error) {
            console.error('Import error:', error);
            return { success: false, error: error.message };
        }
    }

    // Save wallet to managed wallets
    saveWallet(wallet) {
        this.wallets.push(wallet);
        this.saveToLocalStorage();
        return true;
    }

    // Load wallets from localStorage
    loadSavedWallets() {
        try {
            const saved = localStorage.getItem('chaosbot_wallets');
            if (saved) {
                this.wallets = JSON.parse(saved);
                console.log(`✅ Loaded ${this.wallets.length} saved wallets`);
            }
        } catch (error) {
            console.error('Error loading wallets:', error);
            this.wallets = [];
        }
    }

    // Save wallets to localStorage (only public keys, not private keys for security)
    saveToLocalStorage() {
        try {
            // Only save public data
            const publicData = this.wallets.map(w => ({
                name: w.name,
                publicKey: w.publicKey,
                tags: w.tags || [],
                // DO NOT save private keys in localStorage for security
            }));
            localStorage.setItem('chaosbot_wallets', JSON.stringify(publicData));
            console.log('✅ Wallets saved');
        } catch (error) {
            console.error('Error saving wallets:', error);
        }
    }

    // Get all wallets with real balances
    async getAllWalletsWithBalances() {
        const price = await this.getSolPrice();
        const walletsWithBalances = await Promise.all(
            this.wallets.map(async (wallet) => {
                const balance = await this.getBalance(wallet.publicKey);
                return {
                    ...wallet,
                    balance,
                    usdValue: balance * price
                };
            })
        );
        return walletsWithBalances;
    }

    // Real SOL price from API
    async getSolPrice() {
        const cacheKey = 'chaosbot_last_sol_price';
        const cacheWindow = 60_000; // 60 seconds

        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed && Date.now() - parsed.timestamp < cacheWindow) {
                    return parsed.price;
                }
            }
        } catch (error) {
            console.warn('Unable to read cached SOL price:', error);
        }

        try {
            const response = await fetch('https://price.jup.ag/v4/price?ids=SOL');
            const data = await response.json();
            const price = data?.data?.SOL?.price;
            if (typeof price === 'number' && !Number.isNaN(price)) {
                try {
                    localStorage.setItem(cacheKey, JSON.stringify({ price, timestamp: Date.now() }));
                } catch (error) {
                    console.warn('Unable to cache SOL price:', error);
                }
                return price;
            }
        } catch (error) {
            console.error('Error fetching SOL price from Jupiter API:', error);
        }

        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed && typeof parsed.price === 'number') {
                    return parsed.price;
                }
            }
        } catch (error) {
            console.warn('Unable to use cached SOL price:', error);
        }

        return 0;
    }

    // Real token balance fetching
    async getTokenBalance(walletAddress, mintAddress) {
        try {
            const { PublicKey } = window.solanaWeb3;
            const walletPubkey = new PublicKey(walletAddress);
            const mintPubkey = new PublicKey(mintAddress);
            
            // Get token accounts
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                walletPubkey,
                { mint: mintPubkey }
            );

            if (tokenAccounts.value.length === 0) {
                return 0;
            }

            const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            return balance;
        } catch (error) {
            console.error('Error fetching token balance:', error);
            return 0;
        }
    }

    // Real RPC health check
    async checkRPCHealth() {
        try {
            const blockHeight = await this.connection.getBlockHeight();
            const slot = await this.connection.getSlot();
            return {
                healthy: true,
                blockHeight,
                slot,
                endpoint: this.rpcEndpoint
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }

    // Change RPC endpoint
    setRPCEndpoint(endpoint) {
        const { Connection } = window.solanaWeb3;
        this.rpcEndpoint = endpoint;
        this.connection = new Connection(endpoint, 'confirmed');
        console.log('✅ RPC endpoint updated:', endpoint);
    }

    // Real transaction monitoring
    async monitorTransaction(signature) {
        try {
            const confirmation = await this.connection.confirmTransaction(signature);
            return {
                success: !confirmation.value.err,
                slot: confirmation.context.slot,
                signature
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get recent transactions for a wallet
    async getRecentTransactions(publicKeyString, limit = 10) {
        try {
            const { PublicKey } = window.solanaWeb3;
            const publicKey = new PublicKey(publicKeyString);
            
            const signatures = await this.connection.getSignaturesForAddress(
                publicKey,
                { limit }
            );

            const transactions = await Promise.all(
                signatures.map(async (sig) => {
                    const tx = await this.connection.getParsedTransaction(sig.signature);
                    return {
                        signature: sig.signature,
                        slot: sig.slot,
                        timestamp: sig.blockTime,
                        success: !sig.err,
                        fee: tx?.meta?.fee || 0
                    };
                })
            );

            return transactions;
        } catch (error) {
            console.error('Error fetching transactions:', error);
            return [];
        }
    }
}

// Export for use in the UI
window.SolanaIntegration = SolanaIntegration;

