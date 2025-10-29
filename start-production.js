#!/usr/bin/env node

/**
 * Production Startup Script for Chaos Bot
 * Comprehensive Solana trading platform
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('⚡ CHAOS BOT - PRODUCTION STARTUP');
console.log('=====================================\n');

// Check if .env file exists
const envFile = path.join(__dirname, '.env');
if (!fs.existsSync(envFile)) {
    console.log('⚠️  No .env file found, copying from env.production...');
    try {
        fs.copyFileSync(path.join(__dirname, 'env.production'), envFile);
        console.log('✅ Created .env file from template');
    } catch (error) {
        console.log('❌ Error creating .env file:', error.message);
        process.exit(1);
    }
}

// Check if required directories exist
const requiredDirs = ['data', 'logs', 'config'];
requiredDirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
    }
});

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
    'RPC_URL',
    'NETWORK'
];

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
console.log(`   Web Port: ${process.env.WEB_PORT || 3000}`);
console.log(`   Environment: ${process.env.NODE_ENV || 'production'}`);
console.log(`   Debug Mode: ${process.env.ENABLE_DEBUG === 'true' ? 'ON' : 'OFF'}`);
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
    'webapp/api-server-production.js',
    'webapp/trading-ui-production.html',
    'webapp/trading-ui-production.js',
    'jupiter-v6-integration.js',
    'raydium-dex-integration.js',
    'wallet-group-manager.js',
    'smart-sell-engine.js',
    'trade-tracker.js',
    'connection-pool-manager.js',
    'rate-limit-manager.js',
    'smart-cache-manager.js'
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

// Start the production server
console.log('\n🚀 Starting Chaos Bot Production Server...\n');

const serverProcess = spawn('node', ['webapp/api-server-production.js'], {
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
console.log('\n💡 Press Ctrl+C to stop the server\n');
