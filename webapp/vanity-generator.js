// Vanity Address Generator
// Generate custom Solana wallet addresses with specific prefixes/suffixes

class VanityGenerator {
    constructor() {
        this.isGenerating = false;
        this.generatedVanities = [];
        this.currentAttempts = 0;
        this.startTime = 0;
    }

    // Generate vanity address with specific pattern
    async generateVanity(config) {
        try {
            const {
                pattern,
                position = 'prefix', // 'prefix' or 'suffix'
                caseSensitive = false,
                maxAttempts = 1000000
            } = config;

            console.log(`🎯 Generating vanity address with pattern: ${pattern}`);

            this.isGenerating = true;
            this.currentAttempts = 0;
            this.startTime = Date.now();

            const targetPattern = caseSensitive ? pattern : pattern.toUpperCase();

            // Use Web Worker for better performance (if available)
            if (typeof Worker !== 'undefined') {
                return await this.generateWithWorker(targetPattern, position, maxAttempts);
            } else {
                return await this.generateSync(targetPattern, position, maxAttempts);
            }

        } catch (error) {
            console.error('Vanity generation error:', error);
            this.isGenerating = false;
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Synchronous generation (slower but works everywhere)
    async generateSync(pattern, position, maxAttempts) {
        const { Keypair } = window.solanaWeb3;

        for (let i = 0; i < maxAttempts; i++) {
            this.currentAttempts = i + 1;

            // Generate random keypair
            const keypair = Keypair.generate();
            const publicKey = keypair.publicKey.toString();

            // Check if matches pattern
            const matches = position === 'prefix'
                ? publicKey.startsWith(pattern)
                : publicKey.endsWith(pattern);

            if (matches) {
                const timeTaken = (Date.now() - this.startTime) / 1000;

                const vanity = {
                    publicKey: publicKey,
                    privateKey: JSON.stringify(Array.from(keypair.secretKey)),
                    pattern: pattern,
                    position: position,
                    attempts: this.currentAttempts,
                    timeTaken: timeTaken,
                    createdAt: Date.now()
                };

                this.generatedVanities.push(vanity);
                this.isGenerating = false;

                console.log(`✅ Vanity found after ${this.currentAttempts} attempts in ${timeTaken.toFixed(2)}s`);

                return {
                    success: true,
                    vanity: vanity
                };
            }

            // Update progress every 1000 attempts
            if (i % 1000 === 0 && i > 0) {
                const elapsed = (Date.now() - this.startTime) / 1000;
                const rate = i / elapsed;
                console.log(`⏳ ${i} attempts, ${rate.toFixed(0)} keys/sec`);

                // Allow UI to update
                await this.sleep(1);
            }
        }

        this.isGenerating = false;

        return {
            success: false,
            error: `Pattern not found after ${maxAttempts} attempts`
        };
    }

    // Worker-based generation (faster)
    async generateWithWorker(pattern, position, maxAttempts) {
        // TODO: Implement Web Worker for parallel generation
        console.log('⚠️ Web Worker generation not implemented yet, using sync');
        return await this.generateSync(pattern, position, maxAttempts);
    }

    // Stop current generation
    stopGeneration() {
        this.isGenerating = false;
        console.log('🛑 Vanity generation stopped');
    }

    // Get generation progress
    getProgress() {
        if (!this.isGenerating) {
            return null;
        }

        const elapsed = (Date.now() - this.startTime) / 1000;
        const rate = this.currentAttempts / elapsed;

        return {
            attempts: this.currentAttempts,
            elapsed: elapsed,
            rate: rate
        };
    }

    // Get all generated vanities
    getVanities() {
        return this.generatedVanities;
    }

    // Save vanity to wallet
    saveVanityAsWallet(vanity, name) {
        // This will be integrated with SolanaIntegration
        return {
            name: name || `Vanity-${vanity.pattern}`,
            publicKey: vanity.publicKey,
            privateKey: vanity.privateKey,
            tags: ['vanity'],
            pattern: vanity.pattern
        };
    }

    // Estimate difficulty and time
    estimateGeneration(pattern, position) {
        // Base58 characters: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
        const base58Chars = 58;
        const patternLength = pattern.length;

        // Probability: 1 / (58^length)
        const expectedAttempts = Math.pow(base58Chars, patternLength);

        // Assume 10,000 keys/sec (varies by hardware)
        const keysPerSecond = 10000;
        const estimatedSeconds = expectedAttempts / keysPerSecond;

        let timeEstimate;
        if (estimatedSeconds < 60) {
            timeEstimate = `${estimatedSeconds.toFixed(1)} seconds`;
        } else if (estimatedSeconds < 3600) {
            timeEstimate = `${(estimatedSeconds / 60).toFixed(1)} minutes`;
        } else if (estimatedSeconds < 86400) {
            timeEstimate = `${(estimatedSeconds / 3600).toFixed(1)} hours`;
        } else {
            timeEstimate = `${(estimatedSeconds / 86400).toFixed(1)} days`;
        }

        return {
            pattern: pattern,
            difficulty: this.getDifficultyLevel(patternLength),
            expectedAttempts: expectedAttempts,
            estimatedTime: timeEstimate,
            note: 'Actual time may vary based on hardware and luck'
        };
    }

    // Get difficulty level
    getDifficultyLevel(length) {
        if (length === 1) return 'Very Easy';
        if (length === 2) return 'Easy';
        if (length === 3) return 'Medium';
        if (length === 4) return 'Hard';
        if (length === 5) return 'Very Hard';
        return 'Extremely Hard';
    }

    // Helper
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export
window.VanityGenerator = VanityGenerator;

console.log('✅ Vanity Generator loaded');

