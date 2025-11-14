/**
 * Production System Test Suite
 * Comprehensive testing of all trading functionality
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { ProductionTradingEngine } from './production-trading-engine.js';
import { ProductionSolanaCore } from './production-solana-core.js';
import { ProductionPumpFunIntegration } from './production-pumpfun-integration.js';
import { ProductionRaydiumIntegration } from './production-raydium-integration.js';
import { ProductionWalletManager } from './production-wallet-manager.js';

class ProductionSystemTester {
    constructor() {
        this.tradingEngine = null;
        this.testResults = {
            passed: 0,
            failed: 0,
            total: 0,
            tests: []
        };
    }

    async runAllTests() {
        console.log('🧪 Starting Production System Tests...\n');
        
        try {
            // Initialize trading engine
            await this.initializeTradingEngine();
            
            // Run all test suites
            await this.testSolanaCore();
            await this.testPumpFunIntegration();
            await this.testRaydiumIntegration();
            await this.testWalletManager();
            await this.testTradingEngine();
            await this.testAPIIntegration();
            
            // Print results
            this.printResults();
            
        } catch (error) {
            console.error('❌ Test suite failed:', error.message);
        }
    }

    async initializeTradingEngine() {
        console.log('🔧 Initializing Trading Engine...');
        
        try {
            this.tradingEngine = new ProductionTradingEngine({
                autoTrade: false,
                maxConcurrentTrades: 3,
                defaultSlippage: 1.0,
                priorityFee: 1000,
                maxRetries: 2
            });
            
            console.log('✅ Trading Engine Initialized\n');
        } catch (error) {
            throw new Error(`Failed to initialize trading engine: ${error.message}`);
        }
    }

    async testSolanaCore() {
        console.log('🔌 Testing Solana Core...');
        
        const tests = [
            {
                name: 'RPC Connection Health',
                test: async () => {
                    const health = await this.tradingEngine.solanaCore.healthCheck();
                    return health.length > 0 && health.some(conn => conn.healthy);
                }
            },
            {
                name: 'Token Price Fetch',
                test: async () => {
                    const price = await this.tradingEngine.solanaCore.getTokenPrice('So11111111111111111111111111111111111111112');
                    return price.success;
                }
            },
            {
                name: 'Wallet Info Fetch',
                test: async () => {
                    // Test with a known wallet address
                    const walletInfo = await this.tradingEngine.solanaCore.getWalletInfo('11111111111111111111111111111111');
                    return walletInfo.success;
                }
            }
        ];
        
        await this.runTestSuite('Solana Core', tests);
    }

    async testPumpFunIntegration() {
        console.log('🎯 Testing PumpFun Integration...');
        
        const tests = [
            {
                name: 'Token Info Fetch',
                test: async () => {
                    const tokenInfo = await this.tradingEngine.pumpFun.getTokenInfo('So11111111111111111111111111111111111111112');
                    return tokenInfo.success;
                }
            },
            {
                name: 'Trending Tokens',
                test: async () => {
                    const trending = await this.tradingEngine.pumpFun.getTrendingTokens(5);
                    return trending.success;
                }
            },
            {
                name: 'Token Search',
                test: async () => {
                    const search = await this.tradingEngine.pumpFun.searchTokens('SOL', 5);
                    return search.success;
                }
            },
            {
                name: 'Price Calculation',
                test: async () => {
                    const price = await this.tradingEngine.pumpFun.getTokenPrice('So11111111111111111111111111111111111111112');
                    return price.success;
                }
            }
        ];
        
        await this.runTestSuite('PumpFun Integration', tests);
    }

    async testRaydiumIntegration() {
        console.log('🔄 Testing Raydium Integration...');
        
        const tests = [
            {
                name: 'Token List Fetch',
                test: async () => {
                    const tokenList = await this.tradingEngine.raydium.getTokenList();
                    return tokenList.success;
                }
            },
            {
                name: 'Popular Tokens',
                test: async () => {
                    const popular = await this.tradingEngine.raydium.getPopularTokens(5);
                    return popular.success;
                }
            },
            {
                name: 'Token Search',
                test: async () => {
                    const search = await this.tradingEngine.raydium.searchTokens('SOL', 5);
                    return search.success;
                }
            },
            {
                name: 'Quote Generation',
                test: async () => {
                    const solMint = 'So11111111111111111111111111111111111111112';
                    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
                    const quote = await this.tradingEngine.raydium.getQuote(solMint, usdcMint, 1000000);
                    return quote.success;
                }
            }
        ];
        
        await this.runTestSuite('Raydium Integration', tests);
    }

    async testWalletManager() {
        console.log('👛 Testing Wallet Manager...');
        
        const tests = [
            {
                name: 'Wallet Generation',
                test: async () => {
                    const wallet = this.tradingEngine.walletManager.generateWallet('Test Wallet', 'test');
                    return wallet && wallet.address && wallet.privateKey;
                }
            },
            {
                name: 'Wallet Import',
                test: async () => {
                    // Generate a test wallet first
                    const testWallet = this.tradingEngine.walletManager.generateWallet('Import Test', 'test');
                    const importedWallet = this.tradingEngine.walletManager.importWallet(testWallet.privateKey, 'Imported Wallet', 'test');
                    return importedWallet && importedWallet.address === testWallet.address;
                }
            },
            {
                name: 'Group Creation',
                test: async () => {
                    const group = this.tradingEngine.walletManager.createGroup('test-group', 'Test Group', 'Test group description');
                    return group && group.id === 'test-group';
                }
            },
            {
                name: 'Wallet Search',
                test: async () => {
                    const results = await this.tradingEngine.walletManager.searchWallets('Test');
                    return Array.isArray(results);
                }
            },
            {
                name: 'Wallet Filtering',
                test: async () => {
                    const filtered = await this.tradingEngine.walletManager.filterWallets({ group: 'test' });
                    return Array.isArray(filtered);
                }
            }
        ];
        
        await this.runTestSuite('Wallet Manager', tests);
    }

    async testTradingEngine() {
        console.log('🚀 Testing Trading Engine...');
        
        const tests = [
            {
                name: 'Token Info Integration',
                test: async () => {
                    const tokenInfo = await this.tradingEngine.getTokenInfo('So11111111111111111111111111111111111111112');
                    return tokenInfo.success;
                }
            },
            {
                name: 'Token Price Integration',
                test: async () => {
                    const price = await this.tradingEngine.getTokenPrice('So11111111111111111111111111111111111111112');
                    return price.success;
                }
            },
            {
                name: 'Token Search Integration',
                test: async () => {
                    const search = await this.tradingEngine.searchTokens('SOL', 5);
                    return search.success;
                }
            },
            {
                name: 'Trending Tokens Integration',
                test: async () => {
                    const trending = await this.tradingEngine.getTrendingTokens(5);
                    return trending.success;
                }
            },
            {
                name: 'Wallet Info Integration',
                test: async () => {
                    // Create a test wallet first
                    const testWallet = this.tradingEngine.walletManager.generateWallet('Test Wallet', 'test');
                    const walletInfo = await this.tradingEngine.getWalletInfo(testWallet.address);
                    return walletInfo.success;
                }
            },
            {
                name: 'Group Info Integration',
                test: async () => {
                    // Create a test group first
                    this.tradingEngine.walletManager.createGroup('test-group', 'Test Group', 'Test group description');
                    const groupInfo = await this.tradingEngine.getGroupInfo('test-group');
                    return groupInfo.success;
                }
            }
        ];
        
        await this.runTestSuite('Trading Engine', tests);
    }

    async testAPIIntegration() {
        console.log('🌐 Testing API Integration...');
        
        const tests = [
            {
                name: 'Health Check',
                test: async () => {
                    const response = await fetch('http://localhost:3000/api/health');
                    const data = await response.json();
                    return data.success && data.status === 'healthy';
                }
            },
            {
                name: 'Wallets API',
                test: async () => {
                    const response = await fetch('http://localhost:3000/api/wallets');
                    const data = await response.json();
                    return data.success && Array.isArray(data.wallets);
                }
            },
            {
                name: 'Tokens API',
                test: async () => {
                    const response = await fetch('http://localhost:3000/api/tokens?type=trending&limit=5');
                    const data = await response.json();
                    return data.success && Array.isArray(data.tokens);
                }
            },
            {
                name: 'Search API',
                test: async () => {
                    const response = await fetch('http://localhost:3000/api/search?q=SOL&limit=5');
                    const data = await response.json();
                    return data.success && Array.isArray(data.tokens);
                }
            },
            {
                name: 'Price API',
                test: async () => {
                    const response = await fetch('http://localhost:3000/api/price?mint=So11111111111111111111111111111111111111112');
                    const data = await response.json();
                    return data.success;
                }
            }
        ];
        
        await this.runTestSuite('API Integration', tests);
    }

    async runTestSuite(suiteName, tests) {
        console.log(`  Running ${tests.length} tests...`);
        
        for (const test of tests) {
            await this.runTest(suiteName, test.name, test.test);
        }
        
        console.log(`  ✅ ${suiteName} tests completed\n`);
    }

    async runTest(suiteName, testName, testFunction) {
        this.testResults.total++;
        
        try {
            const startTime = Date.now();
            const result = await testFunction();
            const duration = Date.now() - startTime;
            
            if (result) {
                this.testResults.passed++;
                this.testResults.tests.push({
                    suite: suiteName,
                    name: testName,
                    status: 'PASSED',
                    duration: duration
                });
                console.log(`    ✅ ${testName} (${duration}ms)`);
            } else {
                this.testResults.failed++;
                this.testResults.tests.push({
                    suite: suiteName,
                    name: testName,
                    status: 'FAILED',
                    duration: duration,
                    error: 'Test returned false'
                });
                console.log(`    ❌ ${testName} (${duration}ms) - Test returned false`);
            }
        } catch (error) {
            this.testResults.failed++;
            this.testResults.tests.push({
                suite: suiteName,
                name: testName,
                status: 'FAILED',
                duration: 0,
                error: error.message
            });
            console.log(`    ❌ ${testName} - ${error.message}`);
        }
    }

    printResults() {
        console.log('\n📊 Test Results Summary');
        console.log('========================');
        console.log(`Total Tests: ${this.testResults.total}`);
        console.log(`Passed: ${this.testResults.passed} ✅`);
        console.log(`Failed: ${this.testResults.failed} ❌`);
        console.log(`Success Rate: ${((this.testResults.passed / this.testResults.total) * 100).toFixed(1)}%`);
        
        if (this.testResults.failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.testResults.tests
                .filter(test => test.status === 'FAILED')
                .forEach(test => {
                    console.log(`  - ${test.suite}: ${test.name} - ${test.error}`);
                });
        }
        
        console.log('\n🎯 Production System Status:');
        if (this.testResults.failed === 0) {
            console.log('✅ ALL TESTS PASSED - System is production ready!');
        } else if (this.testResults.passed > this.testResults.failed) {
            console.log('⚠️  MOSTLY WORKING - Some issues need attention');
        } else {
            console.log('❌ SYSTEM NOT READY - Major issues detected');
        }
    }
}

// Run tests if called directly
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const tester = new ProductionSystemTester();
    tester.runAllTests().catch(console.error);
}

export { ProductionSystemTester };
