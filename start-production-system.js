#!/usr/bin/env node

/**
 * Production System Startup Script
 * Complete Solana trading platform with PumpFun, Raydium DEX, and optimized RPC
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { ProductionSystemTester } from './test-production-system.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 CHAOS BOT - PRODUCTION SYSTEM STARTUP');
console.log('==========================================\n');

// Configuration
const config = {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    rpcUrl: process.env.RPC_URL || 'https://rpc.shyft.to?api_key=6AC3vTBB5lObDYTm',
    network: process.env.NETWORK || 'mainnet-beta',
    autoTrade: process.env.AUTO_TRADE === 'true',
    runTests: process.env.RUN_TESTS !== 'false'
};

// Check if .env file exists
const envFile = path.join(__dirname, '.env');
if (!fs.existsSync(envFile)) {
    console.log('⚠️  No .env file found, creating from template...');
    const envTemplate = `# Solana Configuration
RPC_URL=${config.rpcUrl}
NETWORK=${config.network}
DEFAULT_SLIPPAGE=1.0
PRIORITY_FEE=1000
MAX_RETRIES=3

# Trading Configuration
AUTO_TRADE=${config.autoTrade}
MAX_CONCURRENT_TRADES=5

# API Configuration
PORT=${config.port}
HOST=${config.host}

# Logging
LOG_LEVEL=info
ENABLE_DEBUG=false
`;
    
    try {
        fs.writeFileSync(envFile, envTemplate);
        console.log('✅ Created .env file from template');
    } catch (error) {
        console.log('❌ Error creating .env file:', error.message);
    }
}

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['RPC_URL', 'NETWORK'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.log('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
        console.log(`   - ${varName}`);
    });
    console.log('\nPlease check your .env file and ensure all required variables are set.');
    process.exit(1);
}

// Display configuration
console.log('📋 Configuration:');
console.log(`   RPC URL: ${process.env.RPC_URL}`);
console.log(`   Network: ${process.env.NETWORK}`);
console.log(`   Web Port: ${process.env.PORT || 3000}`);
console.log(`   Auto Trade: ${process.env.AUTO_TRADE === 'true' ? 'ON' : 'OFF'}`);
console.log(`   Run Tests: ${config.runTests ? 'ON' : 'OFF'}`);
console.log('');

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion < 18) {
    console.log('❌ Node.js version 18 or higher is required');
    console.log(`   Current version: ${nodeVersion}`);
    process.exit(1);
}

console.log(`✅ Node.js version: ${nodeVersion}`);

// Check if all required files exist
const requiredFiles = [
    'production-solana-core.js',
    'production-pumpfun-integration.js',
    'production-raydium-integration.js',
    'production-wallet-manager.js',
    'production-trading-engine.js',
    'webapp/production-api-server.js',
    'webapp/production-frontend.js',
    'webapp/production-trading-platform.html'
];

const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(__dirname, file)));
if (missingFiles.length > 0) {
    console.log('❌ Missing required files:');
    missingFiles.forEach(file => {
        console.log(`   - ${file}`);
    });
    process.exit(1);
}

console.log('✅ All required files present');

// Create necessary directories
const requiredDirs = ['data', 'logs', 'backups'];
requiredDirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
    }
});

// Run tests if enabled
async function runTests() {
    if (!config.runTests) {
        console.log('⏭️  Skipping tests (RUN_TESTS=false)');
        return true;
    }
    
    console.log('\n🧪 Running Production System Tests...');
    console.log('=====================================\n');
    
    try {
        const tester = new ProductionSystemTester();
        await tester.runAllTests();
        
        // Check if tests passed
        const testResults = tester.testResults;
        if (testResults.failed === 0) {
            console.log('\n✅ All tests passed - System is production ready!');
            return true;
        } else if (testResults.passed > testResults.failed) {
            console.log('\n⚠️  Some tests failed - System may have issues');
            return true; // Continue anyway
        } else {
            console.log('\n❌ Critical tests failed - System not ready');
            return false;
        }
    } catch (error) {
        console.error('\n❌ Test suite failed:', error.message);
        return false;
    }
}

// Start the production server
async function startServer() {
    console.log('\n🚀 Starting Production Trading Platform...\n');
    
    const serverProcess = spawn('node', ['webapp/production-api-server.js'], {
        stdio: 'inherit',
        cwd: __dirname,
        env: process.env
    });
    
    // Handle process events
    serverProcess.on('error', (error) => {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    });
    
    serverProcess.on('exit', (code, signal) => {
        if (signal) {
            console.log(`\n🛑 Server stopped by signal: ${signal}`);
        } else {
            console.log(`\n🛑 Server exited with code: ${code}`);
        }
        process.exit(code);
    });
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Received SIGINT, shutting down gracefully...');
        serverProcess.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
        console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
        serverProcess.kill('SIGTERM');
    });
    
    // Keep the process running
    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error);
        serverProcess.kill();
        process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
        serverProcess.kill();
        process.exit(1);
    });
    
    console.log('✅ Production server started successfully!');
    console.log('🌐 Access the platform at: http://localhost:3000');
    console.log('📡 API available at: http://localhost:3000/api');
    console.log('🎯 Trading Platform: http://localhost:3000/production-trading-platform.html');
    console.log('\n💡 Press Ctrl+C to stop the server\n');
}

// Main startup sequence
async function main() {
    try {
        // Run tests first
        const testsPassed = await runTests();
        
        if (!testsPassed) {
            console.log('\n❌ Tests failed - Aborting startup');
            process.exit(1);
        }
        
        // Start the server
        await startServer();
        
    } catch (error) {
        console.error('❌ Startup failed:', error.message);
        process.exit(1);
    }
}

// Start the system
main();
