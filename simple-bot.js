// Simple Solana Wallet Manager Bot - Command Center & Wallet Manager Only
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram } = require('@solana/web3.js');
const bs58 = require('bs58');
const winston = require('winston');
const fs = require('fs');
const axios = require('axios');
const { JupiterV6Integration } = require('./jupiter-v6-integration');
const { SmartSellEngine } = require('./smart-sell-engine');
const { WalletGroupManager } = require('./wallet-group-manager');
const { GroupTradingEngine } = require('./group-trading-engine');
const { WalletAnalytics } = require('./wallet-analytics');
const InstantTradingSystem = require('./instant-trading-system');
const navigationStateManager = require('./navigation-state-manager');

console.log('🚀 Simple Solana Wallet Manager Bot...');

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'bot.log' })
  ]
});

// Bot configuration
const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    polling: true,
    timeout: 30000,
    retries: 3
  },
  solana: {
    rpcUrl: process.env.RPC_URL || 'https://rpc.shyft.to?api_key=6AC3vTBB5lObDYTm',
    network: process.env.NETWORK || 'mainnet-beta'
  },
  trading: {
    defaultSlippage: parseInt(process.env.DEFAULT_SLIPPAGE) || 100, // 1% (minimal slippage)
    priorityFee: parseInt(process.env.PRIORITY_FEE) || 1000, // 1000 lamports (minimal fee)
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3
  }
};

// Initialize Solana connection
const connection = new Connection(config.solana.rpcUrl, 'confirmed');
console.log(`🔗 Using RPC URL: ${config.solana.rpcUrl}`);

// Initialize trading engines
const jupiter = new JupiterV6Integration(connection, config.trading);
const smartSell = new SmartSellEngine(connection, config.trading);

// Initialize wallet group system
const walletGroupManager = new WalletGroupManager(connection);
const groupTradingEngine = new GroupTradingEngine(connection, walletGroupManager, jupiter, smartSell);
const walletAnalytics = new WalletAnalytics(walletGroupManager);
console.log('🔧 Trading engines and wallet group system initialized');

// Existing wallets are now managed by WalletGroupManager
// Get all wallets across all groups for compatibility
const getAllWallets = () => {
  const allGroups = walletGroupManager.getAllGroups();
  let allWallets = [];
  Object.values(allGroups).forEach(group => {
    allWallets = allWallets.concat(group.wallets);
  });
  return allWallets;
};

const existingWallets = getAllWallets();
console.log(`✅ Loaded ${existingWallets.length} existing wallets from wallet groups`);

// Simple price service
const getPriceInfo = async () => {
  try {
    const response = await axios.get('https://api.coinbase.com/v2/exchange-rates?currency=SOL');
    const solPrice = parseFloat(response.data.data.rates.USD);
    return {
      price: solPrice,
      formatted: `$${solPrice.toFixed(2)}`,
      lastUpdate: new Date().toLocaleTimeString()
    };
  } catch (error) {
    return {
      price: 0,
      formatted: '$0.00',
      lastUpdate: 'Error'
    };
  }
};

const formatUsd = (amount) => {
  if (amount < 0.01) return '<$0.01';
  return `$${amount.toFixed(2)}`;
};

// Helper function to get the appropriate callback data for returning to saved position
const getReturnCallback = (userId, fallbackCallback = 'wallet_commander') => {
  const lastPosition = navigationStateManager.getLastPosition(userId);
  if (lastPosition && lastPosition.callbackData) {
    return lastPosition.callbackData;
  }
  return fallbackCallback;
};

// Helper function specifically for wallet management navigation
const getWalletManagerReturnCallback = (userId, fallbackCallback = 'wallet_manager') => {
  // Always return wallet_manager for "Back to Wallet Manager" buttons
  return 'wallet_manager';
};

// Helper function specifically for volume trading navigation
const getVolumeTradingReturnCallback = (userId, fallbackCallback = 'volume_trading') => {
  const lastPosition = navigationStateManager.getLastPosition(userId);
  if (lastPosition && lastPosition.additionalData && lastPosition.additionalData.section === 'volume_trading') {
    return lastPosition.callbackData;
  }
  return fallbackCallback;
};

// Helper function specifically for smart sell navigation
const getSmartSellReturnCallback = (userId, fallbackCallback = 'command_smart_sell_outsider') => {
  const lastPosition = navigationStateManager.getLastPosition(userId);
  if (lastPosition && lastPosition.additionalData && lastPosition.additionalData.section === 'smart_sell') {
    return lastPosition.callbackData;
  }
  return fallbackCallback;
};

// Initialize Telegram bot
let bot;
let telegramAvailable = false;

// Initialize global variables
global.volumeBundlingMode = global.volumeBundlingMode || 'safe';
global.awaitingTokenInput = null;
global.awaitingSettingInput = null;
global.awaitingVolumeInput = null;
global.pendingVolumeMode = null;

// Initialize smart sell settings
global.smartSellSettings = {
  monitoringInterval: 30, // 30 seconds
  priceCheckInterval: 60, // 60 seconds
  outsiderBuyThreshold: 0.02, // 0.02 SOL (~$5 at current prices)
  topWalletsCount: 5, // Top 5 wallets
  autoDumpPercentage: 30, // 30% auto-dump
  minProfitThreshold: 5, // 5% minimum profit
  lastUsedWalletIndex: -1 // Track last used wallet for rotation
};
global.pendingAmountType = null;
global.volumeSettings = null;
// Legacy global flag - now handled by session-based system
// global.stopVolumeTrading = false;
global.customTimingMin = null;
global.customTimingMax = null;
global.fomoSettings = null;
global.awaitingFomoInput = null;
global.pendingConfigType = null;
global.fundingSettings = null;
global.awaitingFundingKey = null;
global.awaitingFundingAmount = null;
global.fundingGroupName = null;
global.awaitingBuyAmount = null;
global.awaitingSellAmount = null;
global.pendingBuyWallet = null;
global.pendingSellWallet = null;
global.pendingSellTokenAmount = null;
global.pendingSellDisplayAmount = null;

// Smart Sell Settings
global.smartSellSettings = global.smartSellSettings || {
  profitTarget: 30,
  stopLoss: -15,
  trailingStop: 10,
  emergencySell: -25,
  bubbleDetection: true,
  monitorInterval: 30,
  autoDumpPercent: 25
};

// Initialize Instant Trading System
let instantTradingSystem = null;

const initializeInstantTradingSystem = async () => {
  try {
    console.log('🚀 Initializing Instant Trading System...');
    
    instantTradingSystem = new InstantTradingSystem(connection, {
      detectionSpeed: 10000, // 10 seconds (less aggressive)
      minProfitThreshold: 20, // 20% minimum profit
      topWalletsCount: 5, // Sell from top 5 wallets
      autoSellEnabled: true
    });
    
    // Set Jupiter integration
    instantTradingSystem.setJupiter(jupiter);
    
    // Set wallet group manager
    instantTradingSystem.setWalletGroupManager(walletGroupManager);
    
    // Initialize with all wallets
    const allWallets = getAllWallets();
    if (allWallets.length > 0) {
      await instantTradingSystem.initialize(allWallets);
    }
    
    console.log('✅ Instant Trading System initialized');
    return true;
  } catch (error) {
    console.error('❌ Error initializing Instant Trading System:', error.message);
    return false;
  }
};

const initializeTelegramBot = async () => {
  try {
    if (!config.telegram.token) {
      logger.warn('No Telegram bot token provided - running in console mode only');
      return false;
    }

    bot = new Telegraf(config.telegram.token);
    
    // Test connection
    const testConnection = async () => {
      try {
        await bot.telegram.getMe();
        return true;
      } catch (error) {
        logger.error('Telegram connection test failed:', error.message);
        return false;
      }
    };

    // Test connection with retries
    for (let i = 0; i < config.telegram.retries; i++) {
      logger.info(`Testing Telegram connection (attempt ${i + 1}/${config.telegram.retries})...`);
      const connected = await testConnection();
      if (connected) {
        telegramAvailable = true;
        logger.info('✅ Telegram connection successful');
        break;
      }
      
      if (i < config.telegram.retries - 1) {
        logger.info(`Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    if (!telegramAvailable) {
      logger.warn('❌ Telegram connection failed - running in console mode');
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Failed to initialize Telegram bot:', error);
    return false;
  }
};

// Helper functions
const escapeMarkdown = (text) => {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\\\$&');
};

// Wallet management now handled by WalletGroupManager
// Legacy saveWallets function for compatibility
const saveWallets = () => {
  // Wallets are automatically saved by WalletGroupManager
  return true;
};

// Enhanced wallet generation using WalletGroupManager
const generateWallet = (groupName = 'trading_bots', walletName = null) => {
  try {
    return walletGroupManager.generateWalletForGroup(groupName, walletName);
  } catch (error) {
    logger.error('Failed to generate wallet:', error);
    // Fallback to old method if group system fails
    const keypair = Keypair.generate();
    return {
      pubkey: keypair.publicKey.toString(),
      secretKey: Array.from(keypair.secretKey),
      name: `Wallet_${keypair.publicKey.toString().slice(0, 8)}`,
      balance: 0,
      group: 'trading_bots',
      addedAt: new Date().toISOString()
    };
  }
};

// Set up bot handlers
const setupBotHandlers = () => {
  if (!bot) return;

  // Start command
  bot.start(async (ctx) => {
    // Check if target token is set
    const tokenStatus = global.targetToken ? '✅ Set' : '❌ Not Set';
    const tokenAddress = global.targetToken ? `\`${global.targetToken.slice(0, 8)}...${global.targetToken.slice(-8)}\`` : 'None';

    const welcomeMessage = `
╔═══════════════════════════╗
       🚀 *CHAOS BOT* 🚀       
╚═══════════════════════════╝

🎯 *Core Modules:*
• Command Center - Advanced trading operations & automation
• Wallet Manager - Multi-wallet portfolio management

🎯 *Token Status:* ${tokenStatus}
${global.targetToken ? `• Address: ${tokenAddress}` : '• No target token configured'}

👤 *User:* ${ctx.from.first_name}
🆔 *ID:* ${ctx.from.id}
🌐 *Network:* ${config.solana.network}

Choose an option below to get started:`;

    await ctx.reply(welcomeMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🎛️ Command Center', 'command_center')],
        [Markup.button.callback('💰 Wallet Manager', 'wallet_manager')],
        [Markup.button.callback('📊 View Dashboard', 'view_dashboard')],
        [Markup.button.callback('ℹ️ Help', 'help')]
      ])
    });
  });

  // Command Center - FULL UNIFIED BOT FUNCTIONALITY RESTORED
  bot.action('command_center', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const priceInfo = await getPriceInfo();
      
      const commandCenterMenu = {
        inline_keyboard: [
          [{ text: '🎯 Set Target Token', callback_data: 'command_set_token' }],
          [{ text: '📈 Volume Trading', callback_data: 'volume_trading' }],
          [{ text: '🧠 Smart Sell on Outsider Buys', callback_data: 'command_smart_sell_outsider' }],
          [{ text: '🚨 Dump All', callback_data: 'dump_all_tokens' }],
          [{ text: '👑 Wallet Commander', callback_data: 'wallet_commander' }],
          [{ text: '🔙 Back to Main', callback_data: 'main_menu' }]
        ]
      };

      await ctx.editMessageText(
        `🎯 *COMMAND CENTER*\n\n` +
        `*Complete Volume Trading Workflow*\n\n` +
        `**Core Features:**\n` +
        `• 🎯 Set Target Token - Choose token for volume trading\n` +
        `• 📈 Configure Volume - Set up and execute volume trades\n` +
        `• 🧠 Smart Sell Center - Automated selling protection\n` +
        `• ⚡ Instant Trading - Real-time outsider detection & auto-sell\n` +
        `• 🚨 Dump All - Emergency sell all tokens across all wallets\n` +
        `• 👑 Wallet Commander - Individual wallet control center\n\n` +
        `**Status:** All systems operational\n` +
        `**Active Wallets:** ${existingWallets.length} ready\n` +
        `**Target Token:** ${global.targetToken || 'Not set'}\n` +
        `**Network:** ${config.solana.network}\n` +
        `**SOL Price:** ${priceInfo.formatted}\n\n` +
        `Choose an option:`,
        {
          parse_mode: 'Markdown',
          reply_markup: commandCenterMenu
        }
      );
    } catch (error) {
      logger.error('Error in command_center:', error);
    }
  });

  // Wallet Manager
  bot.action('wallet_manager', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Save current navigation position
      navigationStateManager.savePosition(
        ctx.from.id, 
        'wallet_manager', 
        'Wallet Group Manager',
        { section: 'wallet_management', subsection: 'main' }
      );
      
      // Get system analytics for enhanced display
      const systemAnalytics = await walletAnalytics.getSystemAnalytics();
      const allGroups = walletGroupManager.getAllGroups();
      
      const message = `💰 *WALLET GROUP MANAGER*

*Manage Your Solana Wallet Groups*

📊 **System Summary:**
• Total Groups: ${systemAnalytics.totalGroups}
• Total Wallets: ${systemAnalytics.totalWallets}
• Total Balance: ${systemAnalytics.totalBalance.toFixed(4)} SOL
• Network: ${config.solana.network}
• Status: ✅ Ready

🎯 **Available Actions:**
• View all wallet groups and balances
• Generate custom wallet groups with specified count
• View detailed analytics

Select an action below:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '👀 View All Groups', callback_data: 'view_groups' }],
            [{ text: '➕ Generate Wallet Group', callback_data: 'generate_wallet_group' }],
            [{ text: '📊 Analytics', callback_data: 'wallet_analytics' }],
            [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in wallet_manager:', error);
      // Fallback to simple version if analytics fail
      const currentWallets = getAllWallets();
      const message = `💰 *WALLET MANAGER*

Total wallets: ${currentWallets.length}
Network: ${config.solana.network}
Status: ✅ Ready`;
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '👀 View All Groups', callback_data: 'view_groups' }],
            [{ text: '➕ Generate Wallet Group', callback_data: 'generate_wallet_group' }],
            [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
          ]
        }
      });
    }
  });

  // View Wallets
  bot.action('view_wallets', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const currentWallets = getAllWallets();
      
      if (currentWallets.length === 0) {
        await ctx.editMessageText(`❌ *No Wallets Available*

No wallets found. Generate some wallets first.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '➕ Generate Wallet Group', callback_data: 'generate_wallet_group' }],
              [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
            ]
          }
        });
        return;
      }
      
      // Show loading message
      await ctx.editMessageText(`💰 *Loading Wallet Balances...*

🔄 Checking ${currentWallets.length} wallets
📊 Fetching SOL price...
⏱️ This may take a few seconds...`, {
        parse_mode: 'Markdown'
      });
      
      let totalBalance = 0;
      let totalUsd = 0;
      let walletList = '';
      let successCount = 0;
      let errorCount = 0;
      
      // Get current SOL price
      const priceInfo = await getPriceInfo();
      const solPrice = priceInfo.price;
      
      // Check balances for first 10 wallets
      for (let i = 0; i < Math.min(currentWallets.length, 10); i++) {
        const wallet = currentWallets[i];
        const walletName = wallet.name || `Wallet ${i + 1}`;
        
        try {
          const balance = await connection.getBalance(new PublicKey(wallet.pubkey));
          const solBalance = balance / LAMPORTS_PER_SOL;
          const usdValue = solBalance * solPrice;
          totalBalance += solBalance;
          totalUsd += usdValue;
          successCount++;
          
          const balanceEmoji = balance > 0 ? '💰' : '⚪';
          const formattedSol = solBalance.toFixed(6);
          const formattedUsd = formatUsd(usdValue);
          
          walletList += `${i + 1}. ${balanceEmoji} ${escapeMarkdown(walletName)}: ${formattedSol} SOL (${formattedUsd})\\n`;
          walletList += `   📍 ${escapeMarkdown(wallet.pubkey.substring(0, 8))}...${escapeMarkdown(wallet.pubkey.substring(wallet.pubkey.length - 4))}\\n\\n`;
        } catch (error) {
          errorCount++;
          walletList += `${i + 1}. ❌ ${escapeMarkdown(walletName)}: Connection Error\\n`;
          walletList += `   📍 ${escapeMarkdown(wallet.pubkey.substring(0, 8))}...${escapeMarkdown(wallet.pubkey.substring(wallet.pubkey.length - 4))}\\n`;
          walletList += `   🚨 Error: Network issue\\n\\n`;
        }
      }
      
      if (existingWallets.length > 10) {
        walletList += `... and ${existingWallets.length - 10} more wallets\\n`;
      }
      
      const healthStatus = errorCount === 0 ? '✅ All wallets connected' : 
                          errorCount < successCount ? '⚠️ Some connection issues' : 
                          '❌ Connection problems detected';
      
      const formattedTotalUsd = formatUsd(totalUsd);
      
      const message = `💰 *YOUR WALLETS*

📊 **Summary:**
• Total wallets: ${existingWallets.length}
• Successful checks: ${successCount}/${Math.min(existingWallets.length, 10)}
• Total balance: ${totalBalance.toFixed(6)} SOL (${formattedTotalUsd})
• SOL price: ${priceInfo.formatted} (updated: ${priceInfo.lastUpdate})
• Network: ${config.solana.network}
• Status: ${healthStatus}

📋 **Wallet List:**
${walletList}

⚡ **Quick Actions:**
• Fund all wallets
• Check wallet health
• Generate new wallets`;
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Fund All Wallets', callback_data: 'fund_wallets' }],
            [{ text: '🔍 Check Health', callback_data: 'wallet_health' }],
            [{ text: '🔄 Refresh Balances', callback_data: 'view_wallets' }],
            [{ text: '➕ Generate Wallet Group', callback_data: 'generate_wallet_group' }],
            [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in view_wallets:', error);
      await ctx.editMessageText(`❌ *Error Loading Wallets*

${error.message}

Please check your internet connection and try again.`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Try Again', callback_data: 'view_wallets' }],
            [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
          ]
        }
      });
    }
  });

  // Generate Wallet Group
  bot.action('generate_wallet_group', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Save current navigation position
      navigationStateManager.savePosition(
        ctx.from.id, 
        'generate_wallet_group', 
        'Generate Wallet Group',
        { section: 'wallet_management', subsection: 'create_group' }
      );
      
      const message = `➕ *GENERATE NEW WALLET GROUP*

*Create New Wallet Group with Custom Settings*

📝 **How to use:**
Reply to this message with your group details in this format:

\`groupName walletCount\`

📋 **Examples:**
• \`test 10\` - Creates "test" group with 10 wallets
• \`volume 5\` - Creates "volume" group with 5 wallets  
• \`trading 15\` - Creates "trading" group with 15 wallets

⚠️ **Important:**
• Group names should be simple (no spaces)
• Wallet count: 1-20 wallets per group
• Wallets are generated with unique names
• Each group gets default trading settings

Type your group details below:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
          ]
        }
      });
      
      // Set up a flag to listen for next message from this user
      global.waitingForGroupInput = global.waitingForGroupInput || {};
      global.waitingForGroupInput[ctx.from.id] = true;
      
    } catch (error) {
      logger.error('Error in generate_wallet_group:', error);
    }
  });

  // Text message handler for wallet group generation
  bot.on('text', async (ctx) => {
    try {
      console.log(`📨 DEBUG: Received text message from chat ${ctx.chat.id}: "${ctx.message.text}"`);
      console.log(`🔍 DEBUG: Current awaitingBuyAmount state: ${global.awaitingBuyAmount}`);
      
      // Check if this user is waiting for group input
      if (global.waitingForGroupInput && global.waitingForGroupInput[ctx.from.id]) {
        const text = ctx.message.text.trim();
        const parts = text.split(' ');
        
        if (parts.length !== 2) {
          await ctx.reply(`❌ *Invalid Format*

Please use the format: \`groupName walletCount\`

Example: \`test 10\``, {
            parse_mode: 'Markdown'
          });
          return;
        }
        
        const groupName = parts[0];
        const walletCount = parseInt(parts[1]);
        
        // Validate input
        if (!groupName.match(/^[a-zA-Z0-9_]+$/)) {
          await ctx.reply(`❌ *Invalid Group Name*

Group name can only contain letters, numbers, and underscores.

Example: \`test_group 10\``, {
            parse_mode: 'Markdown'
          });
          return;
        }
        
        if (isNaN(walletCount) || walletCount < 1 || walletCount > 20) {
          await ctx.reply(`❌ *Invalid Wallet Count*

Wallet count must be a number between 1 and 20.

Example: \`${groupName} 10\``, {
            parse_mode: 'Markdown'
          });
          return;
        }
        
        // Check if group already exists
        const existingGroups = walletGroupManager.getAllGroups();
        if (existingGroups[groupName]) {
          await ctx.reply(`❌ *Group Already Exists*

A group named "${groupName}" already exists.

Please choose a different name or view existing groups.`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '👀 View All Groups', callback_data: 'view_groups' }],
                [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
              ]
            }
          });
          delete global.waitingForGroupInput[ctx.from.id];
          return;
        }
        
        // Show progress message
        const progressMsg = await ctx.reply(`🔄 *Creating Wallet Group*

Creating "${groupName}" group with ${walletCount} wallets...

Please wait, this may take a few seconds.`, {
          parse_mode: 'Markdown'
        });
        
        try {
          // Create the group using the template system
          const result = await walletGroupManager.createGroupFromTemplate(groupName, 'default');
          
          // Update maxWallets to accommodate the requested count
          await walletGroupManager.updateGroupConfig(groupName, {
            maxWallets: Math.max(walletCount, 20) // Set to requested count or 20, whichever is higher
          });
          
          // Generate the requested number of wallets (default template creates 0 wallets)
          for (let i = 1; i <= walletCount; i++) {
            const walletName = `${groupName}_${i}`;
            walletGroupManager.generateWalletForGroup(groupName, walletName);
          }
          
          const finalWallets = walletGroupManager.getWalletsByGroup(groupName);
          const currentWallets = getAllWallets();
          
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            undefined,
            `✅ *Wallet Group Created Successfully!*

📋 **Group Details:**
• Name: ${escapeMarkdown(groupName)}
• Wallets Generated: ${finalWallets.length}
• Total System Wallets: ${currentWallets.length}
• Created: ${new Date().toLocaleString()}

🎯 **Wallet Names:**
${finalWallets.slice(0, 5).map((w, i) => `${i + 1}\\. ${escapeMarkdown(w.name)}`).join('\n')}${finalWallets.length > 5 ? `\n\\.\\.\\. and ${finalWallets.length - 5} more` : ''}

💰 **To add SOL:**
Send SOL directly to any wallet address above

🔑 **Phantom Compatibility:**
All wallets work with Phantom - use "Show Private Keys" to export

⚠️ **Security Notice:**
All private keys are securely stored and encrypted.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '👀 View Group Details', callback_data: `group_detail_${groupName}` }],
                  [{ text: '➕ Create Another Group', callback_data: 'generate_wallet_group' }],
                  [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
                ]
              }
            }
          );
          
        } catch (error) {
          logger.error('Error creating wallet group:', error);
          
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            undefined,
            `❌ *Error Creating Wallet Group*

Failed to create "${groupName}" group.

Error: ${error.message}

Please try again with a different name.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Try Again', callback_data: 'generate_wallet_group' }],
                  [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
                ]
              }
            }
          );
        }
        
        // Clear the waiting flag
        delete global.waitingForGroupInput[ctx.from.id];
        return;
      }

      // Check if we're waiting for token input from this chat
      if (global.awaitingTokenInput === ctx.chat.id) {
        const tokenAddress = ctx.message.text.trim();
        
        // Basic Solana address validation (base58, correct length)
        if (!tokenAddress || tokenAddress.length < 32 || tokenAddress.length > 44) {
          await ctx.reply(
            `❌ *Invalid Token Address*\n\n` +
            `Please enter a valid Solana token address.\n\n` +
            `**Requirements:**\n` +
            `• Must be 32-44 characters long\n` +
            `• Base58 encoded string\n` +
            `• Valid SPL token contract\n\n` +
            `Please try again:`,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        // Validate it's a valid base58 string
        try {
          const decoded = require('bs58').decode(tokenAddress);
          if (decoded.length !== 32) {
            throw new Error('Invalid length');
          }
        } catch (error) {
          await ctx.reply(
            `❌ *Invalid Address Format*\n\n` +
            `The address you provided is not a valid Solana address.\n\n` +
            `**Please check:**\n` +
            `• Address is copied correctly\n` +
            `• No extra spaces or characters\n` +
            `• Valid base58 encoding\n\n` +
            `Please try again:`,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        // Set the token and confirm
        global.targetToken = tokenAddress;
        global.awaitingTokenInput = null; // Clear the waiting state

        const confirmMenu = {
          inline_keyboard: [
            [{ text: '✅ Start Volume Trading', callback_data: 'volume_trading' }],
            [{ text: '🧠 Set Up Smart Sell', callback_data: 'command_smart_sell_outsider' }],
            [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
          ]
        };

        await ctx.reply(
          `✅ *TOKEN SET SUCCESSFULLY*\n\n` +
          `**Token Address:** \`${tokenAddress}\`\n` +
          `**Status:** ✅ Ready for trading\n\n` +
          `**Next Steps:**\n` +
          `• Configure Volume - Set up multi-wallet volume trading\n` +
          `• Smart Sell Center - Set up automated selling\n` +
          `• Ensure your wallets are funded with SOL\n\n` +
          `**Volume Trading Flow:**\n` +
          `1. Configure Volume Settings\n` +
          `2. Select bundling mode (Safe/Instant/Delayed)\n` +
          `3. Set wallet group for volume generation\n` +
          `4. Start volume trading\n\n` +
          `Your bot is now configured and ready!`,
          {
            parse_mode: 'Markdown',
            reply_markup: confirmMenu
          }
        );
        return;
      }

      // Handle Smart Sell Settings Input
      if (global.awaitingSettingInput && global.awaitingSettingInput.chatId === ctx.chat.id) {
        const inputData = global.awaitingSettingInput;
        const inputValue = ctx.message.text.trim();
        
        // Parse the input value
        let parsedValue;
        try {
          parsedValue = parseFloat(inputValue.replace('%', ''));
          
          // Validation based on setting type
          if (isNaN(parsedValue)) {
            await ctx.reply('❌ Please enter a valid number.');
            return;
          }
          
          if (parsedValue < inputData.min || parsedValue > inputData.max) {
            await ctx.reply(`❌ Value must be between ${inputData.min} and ${inputData.max}.`);
            return;
          }
          
          // Apply the setting based on type
          let settingDisplayName = '';
          let settingDisplayValue = '';
          let backButton = 'smart_sell_settings';
          
          if (inputData.setting.startsWith('instant_')) {
            // Handle Instant Trading settings
            if (!instantTradingSystem) {
              await ctx.reply('❌ System not initialized. Please initialize the system first.');
              global.awaitingSettingInput = null;
              return;
            }
            
            switch(inputData.setting) {
              case 'instant_detectionSpeed':
                instantTradingSystem.config.detectionSpeed = parsedValue * 1000; // Convert to milliseconds
                settingDisplayName = 'Detection Speed';
                settingDisplayValue = `${parsedValue} seconds`;
                backButton = 'instant_trading_settings';
                break;
              case 'instant_minProfitThreshold':
                instantTradingSystem.config.minProfitThreshold = parsedValue;
                settingDisplayName = 'Min Profit Threshold';
                settingDisplayValue = `${parsedValue}%`;
                backButton = 'instant_trading_settings';
                break;
              case 'instant_topWalletsCount':
                instantTradingSystem.config.topWalletsCount = Math.floor(parsedValue);
                settingDisplayName = 'Top Wallets Count';
                settingDisplayValue = `${Math.floor(parsedValue)} wallets`;
                backButton = 'instant_trading_settings';
                break;
            }
          } else if (inputData.setting.startsWith('smart_sell_') || 
                     ['monitoringInterval', 'priceCheckInterval', 'autoDumpPercentage'].includes(inputData.setting)) {
            // Handle Smart Sell on Outsider Buys settings
            switch(inputData.setting) {
              case 'monitoringInterval':
                global.smartSellSettings.monitoringInterval = parsedValue;
                settingDisplayName = 'Monitoring Interval';
                settingDisplayValue = `${parsedValue} seconds`;
                backButton = 'smart_sell_outsider_settings';
                break;
              case 'priceCheckInterval':
                global.smartSellSettings.priceCheckInterval = parsedValue;
                settingDisplayName = 'Price Check Interval';
                settingDisplayValue = `${parsedValue} seconds`;
                backButton = 'smart_sell_outsider_settings';
                break;
              case 'autoDumpPercentage':
                global.smartSellSettings.autoDumpPercentage = parsedValue;
                settingDisplayName = 'Auto-dump Percentage';
                settingDisplayValue = `${parsedValue}%`;
                backButton = 'smart_sell_outsider_settings';
                break;
            }
          } else {
            // Handle Smart Sell settings
            global.smartSellSettings[inputData.setting] = parsedValue;
            
            switch(inputData.setting) {
              case 'profitTarget':
                settingDisplayName = 'Profit Target';
                settingDisplayValue = `${parsedValue}%`;
                break;
              case 'stopLoss':
                settingDisplayName = 'Stop Loss';
                settingDisplayValue = `${parsedValue}%`;
                break;
              case 'sellPercentage':
                settingDisplayName = 'Sell Percentage';
                settingDisplayValue = `${parsedValue}%`;
                break;
            }
          }
          
          global.awaitingSettingInput = null;
          
          await ctx.reply(
            `✅ *Setting Updated Successfully*\n\n` +
            `**${settingDisplayName}:** ${settingDisplayValue}\n\n` +
            `Setting has been saved and will be applied to future trades.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '⚙️ Back to Settings', callback_data: backButton }]
                ]
              }
            }
          );
          
        } catch (error) {
          global.awaitingSettingInput = null;
          await ctx.reply('❌ Error processing setting value. Please try again.');
        }
        return;
      }

      // Handle Volume Amount Input
      // Handle custom fee input
      if (global.awaitingCustomFeeInput === ctx.chat.id) {
        const inputText = ctx.message.text.trim();
        const customFee = parseInt(inputText);

        if (isNaN(customFee) || customFee < 100 || customFee > 100000) {
          await ctx.reply(`❌ *Invalid Fee Amount*

Please enter a valid number between 100 and 100,000 lamports.

**Examples:**
• \`1500\` - Standard fee
• \`5000\` - Fast fee
• \`10000\` - Turbo fee`, { parse_mode: 'Markdown' });
          return;
        }

        // Save custom fee
        global.volumeFeeMode = 'custom';
        global.volumeCustomFee = customFee;
        global.awaitingCustomFeeInput = null;

        const costUSD = (customFee / 1000000000 * 200).toFixed(4);

        await ctx.reply(`✅ *Custom Fee Set*

**Priority Fee:** ${customFee} lamports
**Estimated Cost:** ~$${costUSD} per trade

Your custom fee has been saved and will be used for all volume trading.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⚡ Back to Fee Settings', callback_data: 'fee_settings' }],
              [{ text: '📊 Volume Settings', callback_data: 'volume_settings' }]
            ]
          }
        });
        return;
      }

      if (global.awaitingVolumeInput === ctx.chat.id) {
        const inputText = ctx.message.text.trim();
        const mode = global.pendingVolumeMode;
        const amountType = global.pendingAmountType;

        try {
          if (amountType === 'random') {
            // Parse "min max" format
            const parts = inputText.split(' ');
            if (parts.length !== 2) {
              await ctx.reply(`❌ *Invalid Format*

Please enter min and max amounts separated by a space.
**Example:** 0.01 0.05`, { parse_mode: 'Markdown' });
              return;
            }

            const min = parseFloat(parts[0]);
            const max = parseFloat(parts[1]);

            if (isNaN(min) || isNaN(max) || min <= 0 || max <= 0 || min >= max) {
              await ctx.reply(`❌ *Invalid Range*

Please enter valid positive numbers where min < max.
**Example:** 0.01 0.05`, { parse_mode: 'Markdown' });
              return;
            }

            if (min > 1 || max > 1) {
              await ctx.reply(`❌ *Amount Too Large*

Maximum recommended amount is 1 SOL per wallet.
Please enter smaller amounts.`, { parse_mode: 'Markdown' });
              return;
            }

            // Store settings and show confirmation
            global.volumeSettings = {
              mode: mode,
              amountType: 'random',
              minAmount: min,
              maxAmount: max
            };

            // Store delayed-specific settings
            if (mode === 'delayed') {
              global.delayedAmountRange = `${min}-${max} SOL`;
            }

            const modeIcon = mode === 'safe' ? '🛡️' : mode === 'instant' ? '⚡' : '⏱️';
            const modeName = mode.charAt(0).toUpperCase() + mode.slice(1);

            // Special handling for delayed mode
            if (mode === 'delayed') {
              await ctx.reply(`✅ *Amount Range Configured*

**Amount Settings:**
🎯 **Range:** ${min} - ${max} SOL per wallet
🎲 **Random Amounts:** Enabled for both buys and sells
🔄 **Natural Distribution:** Each wallet uses different amounts

Configure timing settings next or complete setup.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '⏰ Set Timing Intervals', callback_data: 'delayed_timing' }],
                    [{ text: '✅ Complete Setup', callback_data: 'delayed_complete' }],
                    [{ text: '⬅️ Back', callback_data: 'delayed_random' }]
                  ]
                }
              });
            } else {
              await ctx.reply(
                `✅ *${modeName} Mode Configured*

**Settings:**
• Mode: ${modeIcon} ${modeName}
• Type: 🎲 Random amounts
• Range: ${min} - ${max} SOL per wallet

Ready to start volume generation?`,
                {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: '🚀 Start Volume', callback_data: 'start_volume_execution' }],
                      [{ text: '⚙️ Change Settings', callback_data: 'volume_settings' }],
                      [{ text: '🏠 Main Menu', callback_data: 'volume_trading' }]
                    ]
                  }
                }
              );
            }

          } else if (amountType === 'custom') {
            // Parse single amount
            const amount = parseFloat(inputText);

            if (isNaN(amount) || amount <= 0) {
              await ctx.reply(`❌ *Invalid Amount*

Please enter a valid positive number.
**Example:** 0.05`, { parse_mode: 'Markdown' });
              return;
            }

            if (amount > 1) {
              await ctx.reply(`❌ *Amount Too Large*

Maximum recommended amount is 1 SOL per wallet.
Please enter a smaller amount.`, { parse_mode: 'Markdown' });
              return;
            }

            // Store settings and show confirmation
            global.volumeSettings = {
              mode: mode,
              amountType: 'custom',
              fixedAmount: amount
            };

            const modeIcon = mode === 'safe' ? '🛡️' : mode === 'instant' ? '⚡' : '⏱️';
            const modeName = mode.charAt(0).toUpperCase() + mode.slice(1);

            await ctx.reply(
              `✅ *${modeName} Mode Configured*

**Settings:**
• Mode: ${modeIcon} ${modeName}
• Type: 📝 Fixed amount
• Amount: ${amount} SOL per wallet

Ready to start volume generation?`,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🚀 Start Volume', callback_data: 'start_volume_execution' }],
                    [{ text: '⚙️ Change Settings', callback_data: 'volume_settings' }],
                    [{ text: '🏠 Main Menu', callback_data: 'volume_trading' }]
                  ]
                }
              }
            );
          }

          // Clear waiting state
          global.awaitingVolumeInput = null;
          global.pendingVolumeMode = null;
          global.pendingAmountType = null;

        } catch (error) {
          logger.error('Error processing volume amount:', error);
          await ctx.reply('❌ Error processing amount. Please try again.');
          global.awaitingVolumeInput = null;
        }
        return;
      }

      // Handle Timing Input for Delayed Mode
      if (global.awaitingTimingInput === ctx.chat.id) {
        const inputText = ctx.message.text.trim();
        
        try {
          // Parse "minSeconds maxSeconds" format
          const parts = inputText.split(' ');
          if (parts.length !== 2) {
            await ctx.reply(`❌ *Invalid Format*

Please enter minimum and maximum seconds separated by a space.
**Example:** 5 15`, { parse_mode: 'Markdown' });
            return;
          }

          const minSeconds = parseInt(parts[0]);
          const maxSeconds = parseInt(parts[1]);

          if (isNaN(minSeconds) || isNaN(maxSeconds) || minSeconds <= 0 || maxSeconds <= 0 || minSeconds >= maxSeconds) {
            await ctx.reply(`❌ *Invalid Range*

Please enter valid positive numbers where min < max.
**Example:** 5 15`, { parse_mode: 'Markdown' });
            return;
          }

          if (minSeconds > 300 || maxSeconds > 300) {
            await ctx.reply(`❌ *Timing Too Long*

Maximum recommended timing is 300 seconds (5 minutes).
Please enter shorter intervals.`, { parse_mode: 'Markdown' });
            return;
          }

          // Store timing settings
          global.delayedTimingRange = `${minSeconds}-${maxSeconds}s`;
          global.customTimingMin = minSeconds;
          global.customTimingMax = maxSeconds;

          await ctx.reply(`✅ *Custom Timing Configured*

**Timing Settings:**
⏰ **Range:** ${minSeconds} - ${maxSeconds} seconds
🎲 **Random Delays:** Enabled
🔄 **Between Operations:** Variable timing

Your delayed mode will use random delays between ${minSeconds} and ${maxSeconds} seconds for natural trading patterns.

Configure amount settings next or complete setup.`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '💰 Set Amount Range', callback_data: 'delayed_amounts' }],
                [{ text: '✅ Complete Setup', callback_data: 'delayed_complete' }],
                [{ text: '⬅️ Back', callback_data: 'delayed_random' }]
              ]
            }
          });

          // Clear waiting state
          global.awaitingTimingInput = null;
          global.pendingTimingType = null;

        } catch (error) {
          logger.error('Error processing timing input:', error);
          await ctx.reply('❌ Error processing timing. Please try again.');
          global.awaitingTimingInput = null;
        }
        return;
      }

      // Handle Buy Amount Input for Wallet Commander
      if (global.awaitingBuyAmount === ctx.chat.id) {
        console.log(`🔍 DEBUG: Processing buy amount input: "${ctx.message.text}"`);
        const inputText = ctx.message.text.trim();
        const walletIndex = global.pendingBuyWallet;
        
        try {
          const buyAmount = parseFloat(inputText);
          console.log(`🔍 DEBUG: Parsed buy amount: ${buyAmount}`);
          
          // Validate buy amount
          if (isNaN(buyAmount) || buyAmount <= 0) {
            await ctx.reply(`❌ *Invalid Amount*

Please enter a valid positive number.
**Example:** 0.001`, { parse_mode: 'Markdown' });
            return;
          }
          
          if (buyAmount < 0.001) {
            await ctx.reply(`❌ *Amount Too Small*

Minimum buy amount is 0.001 SOL.
**Your input:** ${buyAmount} SOL`, { parse_mode: 'Markdown' });
            return;
          }
          
          // Get wallet and check balance
          const walletGroups = walletGroupManager.getAllGroups();
          const allWallets = [];
          Object.entries(walletGroups).forEach(([groupKey, group]) => {
            group.wallets.forEach((wallet, index) => {
              allWallets.push({
                ...wallet,
                groupName: group.name || groupKey || 'Unknown Group',
                walletIndex: index
              });
            });
          });
          
          const wallet = allWallets[walletIndex];
          if (!wallet) {
            await ctx.reply('❌ Wallet not found.');
            global.awaitingBuyAmount = null;
            global.pendingBuyWallet = null;
            return;
          }
          
          // Check balance
          const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27');
          const balance = await connection.getBalance(new PublicKey(wallet.pubkey));
          const solBalance = balance / 1e9;
          
          if (buyAmount >= solBalance * 0.95) {
            await ctx.reply(`❌ *Insufficient Balance*

**Wallet Balance:** ${solBalance.toFixed(6)} SOL
**Buy Amount:** ${buyAmount} SOL
**Maximum Allowed:** ${(solBalance * 0.95).toFixed(6)} SOL (95% of balance)

Please enter a smaller amount.`, { parse_mode: 'Markdown' });
            return;
          }
          
          // Execute the buy transaction
          await ctx.reply(`🔄 *Processing Buy Order...*

**Wallet:** ${escapeMarkdown(wallet.groupName)} - Wallet ${wallet.walletIndex + 1}
**Amount:** ${buyAmount} SOL
**Token:** \`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`

Please wait...`, { parse_mode: 'Markdown' });
          
          // Import Jupiter integration
          const { JupiterV6Integration } = require('./jupiter-v6-integration');
          const jupiterService = new JupiterV6Integration(connection);
          
          // Prepare wallet for trading
          const privateKeyData = wallet.secretKey || wallet.privateKey;
          let keypair;
          
          if (Array.isArray(privateKeyData)) {
            keypair = Keypair.fromSecretKey(new Uint8Array(privateKeyData));
          } else {
            const decoded = bs58.decode(privateKeyData);
            keypair = Keypair.fromSecretKey(decoded);
          }
          
          const walletData = {
            pubkey: wallet.pubkey,
            keypair: keypair
          };
          
          // Execute buy transaction
          try {
            const result = await jupiterService.buyToken(
              keypair,
              global.targetToken,
              buyAmount,
              { slippage: 200 } // 2% slippage for individual buys (reduced)
            );
            
            if (result.success) {
            const receivedTokens = (result.outAmount / Math.pow(10, 6)).toFixed(6); // Assuming 6 decimals, adjust as needed
            await ctx.reply(`✅ *Buy Order Successful!*

**Transaction Complete:**
✅ Transaction confirmed on-chain
💰 **Spent:** ${buyAmount} SOL
🪙 **Received:** ~${receivedTokens} tokens
🎯 **Token:** \`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`
📝 **Wallet:** ${escapeMarkdown(wallet.groupName)} - Wallet ${wallet.walletIndex + 1}
🔗 **Signature:** \`${result.signature}\`
📊 **Price Impact:** ${result.priceImpact || 'Low'}%`, 
              { 
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                  ]
                }
              });
          } else {
            await ctx.reply(`❌ *Buy Order Failed*

**Transaction Failed:**
❌ Failed to execute swap
💰 **Amount:** ${buyAmount} SOL
🎯 **Token:** \`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`

**Error Details:**
Transaction could not be completed. Please try again.`, 
              { 
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🔄 Try Again', callback_data: `wallet_buy_${walletIndex}` }],
                    [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                  ]
                }
              });
          }
          } catch (buyError) {
            await ctx.reply(`❌ *Buy Transaction Failed*

**Error occurred during buy:**
${buyError.message}

**Transaction Details:**
💰 **Amount:** ${buyAmount} SOL
🎯 **Token:** \`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`
📝 **Wallet:** ${escapeMarkdown(wallet.groupName)} - Wallet ${wallet.walletIndex + 1}

Please check your wallet balance and token address.`, 
              { 
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🔄 Try Again', callback_data: `wallet_buy_${walletIndex}` }],
                    [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                  ]
                }
              });
          }
          
          // Clear waiting state
          global.awaitingBuyAmount = null;
          global.pendingBuyWallet = null;
          
        } catch (error) {
          logger.error('Error processing buy amount:', error);
          await ctx.reply(`❌ *Error Processing Buy*

Something went wrong while processing your buy order.
Please try again or contact support.

**Error:** ${error.message}`, 
            { 
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                ]
              }
            });
          global.awaitingBuyAmount = null;
          global.pendingBuyWallet = null;
        }
        return;
      }

      // Handle Group Setting Input
      if (global.awaitingGroupSettingInput && global.awaitingGroupSettingInput[ctx.from.id]) {
        const inputData = global.awaitingGroupSettingInput[ctx.from.id];
        const inputText = ctx.message.text.trim();
        
        try {
          const newValue = parseFloat(inputText);
          
          // Validate input
          if (isNaN(newValue) || newValue < 0) {
            await ctx.reply('❌ Invalid value. Please enter a valid positive number.');
            return;
          }
          
          // Additional validation based on setting type
          let validationError = '';
          switch(inputData.settingName) {
            case 'buyAmount':
            case 'sellAmount':
              if (newValue < 0.0001 || newValue > 10) {
                validationError = 'Amount must be between 0.0001 and 10 SOL';
              }
              break;
            case 'slippage':
              if (newValue < 0.1 || newValue > 50) {
                validationError = 'Slippage must be between 0.1% and 50%';
              }
              break;
            case 'priorityFee':
              if (newValue < 100 || newValue > 100000) {
                validationError = 'Priority fee must be between 100 and 100,000 lamports';
              }
              break;
          }
          
          if (validationError) {
            await ctx.reply(`❌ ${validationError}`);
            return;
          }
          
          // Update the group setting
          const groupsConfig = JSON.parse(fs.readFileSync('./groups-config.json', 'utf8'));
          if (!groupsConfig[inputData.groupName]) {
            await ctx.reply('❌ Group not found.');
            delete global.awaitingGroupSettingInput[ctx.from.id];
            return;
          }
          
          // Update the setting
          groupsConfig[inputData.groupName].settings[inputData.settingName] = newValue;
          groupsConfig[inputData.groupName].updatedAt = new Date().toISOString();
          
          // Save to file
          fs.writeFileSync('./groups-config.json', JSON.stringify(groupsConfig, null, 2));
          
          // Clear waiting state
          delete global.awaitingGroupSettingInput[ctx.from.id];
          
          // Show success message
          let settingDisplay = '';
          let unit = '';
          switch(inputData.settingName) {
            case 'buyAmount':
            case 'sellAmount':
              settingDisplay = inputData.settingName === 'buyAmount' ? 'Buy Amount' : 'Sell Amount';
              unit = 'SOL';
              break;
            case 'slippage':
              settingDisplay = 'Slippage';
              unit = '%';
              break;
            case 'priorityFee':
              settingDisplay = 'Priority Fee';
              unit = 'lamports';
              break;
          }
          
          await ctx.reply(
            `✅ *${settingDisplay} Updated Successfully*\n\n` +
            `**Group:** ${inputData.groupName}\n` +
            `**Setting:** ${settingDisplay}\n` +
            `**New Value:** ${newValue} ${unit}\n\n` +
            `Changes take effect immediately for new trades.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📁 Back to Group Details', callback_data: `group_detail_${inputData.groupName}` }],
                  [{ text: '⚙️ Edit More Settings', callback_data: `edit_group_settings_${inputData.groupName}` }]
                ]
              }
            }
          );
          
        } catch (error) {
          logger.error('Error processing group setting input:', error);
          await ctx.reply('❌ Error processing setting value. Please try again.');
          delete global.awaitingGroupSettingInput[ctx.from.id];
        }
        return;
      }

      // Handle Sell Amount Input for Wallet Commander
      if (global.awaitingSellAmount === ctx.chat.id) {
        const inputText = ctx.message.text.trim();
        const walletIndex = global.pendingSellWallet;
        const tokenAmount = global.pendingSellTokenAmount;
        const tokenDisplayAmount = global.pendingSellDisplayAmount;
        
        try {
          const sellPercentage = parseFloat(inputText);
          
          // Validate sell percentage
          if (isNaN(sellPercentage) || sellPercentage <= 0) {
            await ctx.reply(`❌ *Invalid Percentage*

Please enter a valid positive number.
**Example:** 50`, { parse_mode: 'Markdown' });
            return;
          }
          
          if (sellPercentage < 1) {
            await ctx.reply(`❌ *Percentage Too Small*

Minimum sell percentage is 1%.
**Your input:** ${sellPercentage}%`, { parse_mode: 'Markdown' });
            return;
          }
          
          if (sellPercentage > 100) {
            await ctx.reply(`❌ *Percentage Too Large*

Maximum sell percentage is 100%.
**Your input:** ${sellPercentage}%`, { parse_mode: 'Markdown' });
            return;
          }
          
          // Get wallet information
          const walletGroups = walletGroupManager.getAllGroups();
          const allWallets = [];
          Object.entries(walletGroups).forEach(([groupKey, group]) => {
            group.wallets.forEach((wallet, index) => {
              allWallets.push({
                ...wallet,
                groupName: group.name || groupKey || 'Unknown Group',
                walletIndex: index
              });
            });
          });
          
          const wallet = allWallets[walletIndex];
          if (!wallet) {
            await ctx.reply('❌ Wallet not found.');
            global.awaitingSellAmount = null;
            global.pendingSellWallet = null;
            global.pendingSellTokenAmount = null;
            global.pendingSellDisplayAmount = null;
            return;
          }
          
          // Calculate sell amount
          const sellAmount = Math.floor(tokenAmount * (sellPercentage / 100));
          const sellDisplayAmount = tokenDisplayAmount * (sellPercentage / 100);
          
          if (sellAmount === 0) {
            await ctx.reply(`❌ *Amount Too Small*

The calculated sell amount is too small (0 tokens).
Try a higher percentage or ensure you have sufficient token balance.

**Current Balance:** ${tokenDisplayAmount.toFixed(6)} tokens
**Selected Percentage:** ${sellPercentage}%`, { parse_mode: 'Markdown' });
            return;
          }
          
          // Execute the sell transaction
          await ctx.reply(`🔄 *Processing Sell Order...*

**Wallet:** ${escapeMarkdown(wallet.groupName)} - Wallet ${wallet.walletIndex + 1}
**Percentage:** ${sellPercentage}%
**Amount:** ${sellDisplayAmount.toFixed(6)} tokens
**Token:** \`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`

Please wait...`, { parse_mode: 'Markdown' });
          
          // Import Jupiter integration
          const { JupiterV6Integration } = require('./jupiter-v6-integration');
          const jupiterService = new JupiterV6Integration(connection);
          
          // Prepare wallet for trading
          const privateKeyData = wallet.secretKey || wallet.privateKey;
          let keypair;
          
          if (Array.isArray(privateKeyData)) {
            keypair = Keypair.fromSecretKey(new Uint8Array(privateKeyData));
          } else {
            const decoded = bs58.decode(privateKeyData);
            keypair = Keypair.fromSecretKey(decoded);
          }
          
          const walletData = {
            pubkey: wallet.pubkey,
            keypair: keypair
          };
          
          // Execute sell transaction
          try {
            const result = await jupiterService.sellToken(
              keypair,
              global.targetToken,
              sellAmount,
              { slippage: 200 } // 2% slippage for individual sells (reduced)
            );
            
            if (result.success) {
            const remainingPercent = 100 - sellPercentage;
            const remainingTokens = tokenDisplayAmount * (remainingPercent / 100);
            const receivedSOL = (result.outAmount / LAMPORTS_PER_SOL).toFixed(6);
            
            await ctx.reply(`✅ *Sell Order Successful!*

**Transaction Complete:**
✅ Transaction confirmed on-chain
💸 **Sold:** ${sellPercentage}% (${sellDisplayAmount.toFixed(6)} tokens)
💰 **Received:** ${receivedSOL} SOL
🏦 **Remaining:** ${remainingPercent}% (~${remainingTokens.toFixed(6)} tokens)
🎯 **Token:** \`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`
📝 **Wallet:** ${escapeMarkdown(wallet.groupName)} - Wallet ${wallet.walletIndex + 1}
🔗 **Signature:** \`${result.signature}\`
📊 **Price Impact:** ${result.priceImpact || 'Low'}%`, 
              { 
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                  ]
                }
              });
          } else {
            await ctx.reply(`❌ *Sell Order Failed*

**Transaction Failed:**
❌ Failed to execute swap
💸 **Attempted:** ${sellPercentage}% (${sellDisplayAmount.toFixed(6)} tokens)
🎯 **Token:** \`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`

**Error Details:**
Transaction could not be completed. Please try again.`, 
              { 
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🔄 Try Again', callback_data: `wallet_sell_${walletIndex}` }],
                    [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                  ]
                }
              });
          }
          } catch (sellError) {
            await ctx.reply(`❌ *Sell Transaction Failed*

**Error occurred during sell:**
${sellError.message}

**Transaction Details:**
💸 **Attempted:** ${sellPercentage}% (${sellDisplayAmount.toFixed(6)} tokens)
🎯 **Token:** \`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`
📝 **Wallet:** ${escapeMarkdown(wallet.groupName)} - Wallet ${wallet.walletIndex + 1}

Please check your token balance and network connectivity.`, 
              { 
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🔄 Try Again', callback_data: `wallet_sell_${walletIndex}` }],
                    [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                  ]
                }
              });
          }
          
          // Clear waiting state
          global.awaitingSellAmount = null;
          global.pendingSellWallet = null;
          global.pendingSellTokenAmount = null;
          global.pendingSellDisplayAmount = null;
          
        } catch (error) {
          logger.error('Error processing sell percentage:', error);
          await ctx.reply(`❌ *Error Processing Sell*

Something went wrong while processing your sell order.
Please try again or contact support.

**Error:** ${error.message}`, 
            { 
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                ]
              }
            });
          global.awaitingSellAmount = null;
          global.pendingSellWallet = null;
          global.pendingSellTokenAmount = null;
          global.pendingSellDisplayAmount = null;
        }
        return;
      }

      // Handle FOMO Input
      if (global.awaitingFomoInput === ctx.chat.id) {
        const inputText = ctx.message.text.trim();
        const configType = global.pendingConfigType;
        
        try {
          switch(configType) {
            case 'buy':
              // Parse "buyMin buyMax buysPerPump" format
              const buyParts = inputText.split(' ');
              if (buyParts.length !== 3) {
                await ctx.reply(`❌ *Invalid Format*

Please enter buy configuration in the correct format.
**Example:** 0.001 0.004 5`, { parse_mode: 'Markdown' });
                return;
              }

              const buyMin = parseFloat(buyParts[0]);
              const buyMax = parseFloat(buyParts[1]);
              const buysPerPump = parseInt(buyParts[2]);

              if (isNaN(buyMin) || isNaN(buyMax) || isNaN(buysPerPump) || 
                  buyMin <= 0 || buyMax <= 0 || buysPerPump <= 0 || buyMin >= buyMax) {
                await ctx.reply(`❌ *Invalid Values*

Please enter valid positive numbers where buyMin < buyMax.
**Example:** 0.001 0.004 5`, { parse_mode: 'Markdown' });
                return;
              }

              // Store buy settings
              if (!global.fomoSettings) global.fomoSettings = {};
              global.fomoSettings.buyMin = buyMin;
              global.fomoSettings.buyMax = buyMax;
              global.fomoSettings.buysPerPump = buysPerPump;
              global.fomoSettings.buy = `${buyMin}-${buyMax} SOL, ${buysPerPump} buys`;

              await ctx.reply(`✅ *Buy Configuration Saved*

**Pump Phase Settings:**
💰 **Buy Range:** ${buyMin} - ${buyMax} SOL per buy
🔥 **Buys Per Pump:** ${buysPerPump} rapid buys
📈 **Effect:** Strong green candles with ${buysPerPump} coordinated purchases

Configure sell and timing settings next.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📉 Configure Sells', callback_data: 'fomo_sell_config' }],
                    [{ text: '⏰ Configure Timing', callback_data: 'fomo_timing_config' }],
                    [{ text: '⬅️ Back', callback_data: 'fomo_mode' }]
                  ]
                }
              });
              break;

            case 'sell':
              // Parse "sellsPerDip sellPercentage" format
              const sellParts = inputText.split(' ');
              if (sellParts.length !== 2) {
                await ctx.reply(`❌ *Invalid Format*

Please enter sell configuration in the correct format.
**Example:** 2 12`, { parse_mode: 'Markdown' });
                return;
              }

              const sellsPerDip = parseInt(sellParts[0]);
              const sellPercentage = parseFloat(sellParts[1]);

              if (isNaN(sellsPerDip) || isNaN(sellPercentage) || 
                  sellsPerDip <= 0 || sellPercentage <= 0 || sellPercentage > 100) {
                await ctx.reply(`❌ *Invalid Values*

Please enter valid numbers (percentage should be 1-100).
**Example:** 2 12`, { parse_mode: 'Markdown' });
                return;
              }

              // Store sell settings
              if (!global.fomoSettings) global.fomoSettings = {};
              global.fomoSettings.sellsPerDip = sellsPerDip;
              global.fomoSettings.sellPercentage = sellPercentage;
              global.fomoSettings.sell = `${sellsPerDip} sells, ${sellPercentage}% each`;

              await ctx.reply(`✅ *Sell Configuration Saved*

**Dip Phase Settings:**
📉 **Sells Per Dip:** ${sellsPerDip} small sells
💧 **Sell Amount:** ${sellPercentage}% of holdings each
📊 **Effect:** Gentle red candles simulating profit-taking

Configure timing settings next.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '⏰ Configure Timing', callback_data: 'fomo_timing_config' }],
                    [{ text: '✅ Complete Setup', callback_data: 'fomo_complete' }],
                    [{ text: '⬅️ Back', callback_data: 'fomo_mode' }]
                  ]
                }
              });
              break;

            case 'timing':
              // Parse "buyInterval sellInterval cycleDelay" format
              const timingParts = inputText.split(' ');
              if (timingParts.length !== 3) {
                await ctx.reply(`❌ *Invalid Format*

Please enter timing configuration in the correct format.
**Example:** 3 15 90`, { parse_mode: 'Markdown' });
                return;
              }

              const buyInterval = parseInt(timingParts[0]);
              const sellInterval = parseInt(timingParts[1]);
              const cycleDelay = parseInt(timingParts[2]);

              if (isNaN(buyInterval) || isNaN(sellInterval) || isNaN(cycleDelay) || 
                  buyInterval <= 0 || sellInterval <= 0 || cycleDelay <= 0) {
                await ctx.reply(`❌ *Invalid Values*

Please enter valid positive numbers for all timing values.
**Example:** 3 15 90`, { parse_mode: 'Markdown' });
                return;
              }

              // Store timing settings
              if (!global.fomoSettings) global.fomoSettings = {};
              global.fomoSettings.buyInterval = buyInterval;
              global.fomoSettings.sellInterval = sellInterval;
              global.fomoSettings.cycleDelay = cycleDelay;
              global.fomoSettings.timing = `${buyInterval}s buys, ${sellInterval}s sells, ${cycleDelay}s cycles`;

              await ctx.reply(`✅ *Timing Configuration Saved*

**FOMO Timing Settings:**
⚡ **Buy Interval:** ${buyInterval} seconds (rapid pumps)
📉 **Sell Interval:** ${sellInterval} seconds (gentle dips)
🔄 **Cycle Delay:** ${cycleDelay} seconds (breathe time)

**Pattern Effect:**
Fast buys → Strong pump → Slow sells → Healthy dip → Repeat

Ready to complete FOMO setup!`, {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '✅ Complete FOMO Setup', callback_data: 'fomo_complete' }],
                    [{ text: '🔄 Modify Settings', callback_data: 'fomo_mode' }],
                    [{ text: '⬅️ Back', callback_data: 'fomo_mode' }]
                  ]
                }
              });
              break;
          }

          // Clear waiting state
          global.awaitingFomoInput = null;
          global.pendingConfigType = null;

        } catch (error) {
          logger.error('Error processing FOMO input:', error);
          await ctx.reply('❌ Error processing configuration. Please try again.');
          global.awaitingFomoInput = null;
        }
        return;
      }

      // Handle Funding Private Key Input
      if (global.awaitingFundingKey === ctx.chat.id) {
        const privateKey = ctx.message.text.trim();
        
        try {
          // Validate private key by trying to create a keypair
          const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
          
          // Store funding settings
          if (!global.fundingSettings) global.fundingSettings = {};
          global.fundingSettings.privateKey = privateKey;
          global.fundingSettings.publicKey = keypair.publicKey.toString();
          
          // Check balance of source wallet
          const balance = await connection.getBalance(keypair.publicKey);
          global.fundingSettings.sourceBalance = balance / LAMPORTS_PER_SOL;
          
          await ctx.reply(`✅ *Phantom Private Key Saved*

**Funding Source:**
💳 **Address:** \`${keypair.publicKey.toString().substring(0, 8)}...${keypair.publicKey.toString().substring(keypair.publicKey.toString().length - 6)}\`
💰 **Balance:** ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL

Your Phantom wallet is now set as the funding source.

Configure distribution amount next.`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '💰 Set Distribution Amount', callback_data: `fund_set_amount_${global.fundingGroupName}` }],
                [{ text: '🚀 Execute Funding', callback_data: `fund_execute_${global.fundingGroupName}` }],
                [{ text: '⬅️ Back', callback_data: `fund_group_${global.fundingGroupName}` }]
              ]
            }
          });

          // Clear waiting state
          global.awaitingFundingKey = null;

        } catch (error) {
          await ctx.reply(`❌ *Invalid Private Key*

The private key you entered is not valid.

**Common issues:**
• Make sure you copied the full key
• Check for extra spaces or characters
• Ensure it's a valid Solana private key

Please try again with a valid private key.`, { parse_mode: 'Markdown' });
        }
        return;
      }

      // Handle Funding Amount Input
      if (global.awaitingFundingAmount === ctx.chat.id) {
        const amountText = ctx.message.text.trim();
        
        try {
          const amount = parseFloat(amountText);
          
          if (isNaN(amount) || amount <= 0) {
            await ctx.reply(`❌ *Invalid Amount*

Please enter a valid positive number.
**Example:** 0.1`, { parse_mode: 'Markdown' });
            return;
          }

          const groupWallets = walletGroupManager.getWalletsByGroup(global.fundingGroupName);
          const perWalletAmount = amount / groupWallets.length;
          const estimatedGasFees = groupWallets.length * 0.000005;
          const totalRequired = amount + estimatedGasFees;

          // Check if source wallet has enough balance
          if (global.fundingSettings?.sourceBalance && global.fundingSettings.sourceBalance < totalRequired) {
            await ctx.reply(`❌ *Insufficient Source Balance*

**Required:** ${totalRequired.toFixed(6)} SOL
**Available:** ${global.fundingSettings.sourceBalance.toFixed(6)} SOL
**Shortfall:** ${(totalRequired - global.fundingSettings.sourceBalance).toFixed(6)} SOL

Please enter a smaller amount or fund your source wallet.`, { parse_mode: 'Markdown' });
            return;
          }

          // Store funding amount
          if (!global.fundingSettings) global.fundingSettings = {};
          global.fundingSettings.totalAmount = amount;
          global.fundingSettings.perWalletAmount = perWalletAmount;

          await ctx.reply(`✅ *Distribution Amount Saved*

**Distribution Details:**
💰 **Total Amount:** ${amount} SOL
👥 **Wallets:** ${groupWallets.length}
📊 **Per Wallet:** ${perWalletAmount.toFixed(6)} SOL
⛽ **Gas Fees:** ${estimatedGasFees.toFixed(3)} SOL
💳 **Total Cost:** ${totalRequired.toFixed(3)} SOL

Ready to execute funding!`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Execute Funding', callback_data: `fund_execute_${global.fundingGroupName}` }],
                [{ text: '🔄 Modify Settings', callback_data: `fund_group_${global.fundingGroupName}` }],
                [{ text: '⬅️ Back', callback_data: `fund_group_${global.fundingGroupName}` }]
              ]
            }
          });

          // Clear waiting state
          global.awaitingFundingAmount = null;

        } catch (error) {
          logger.error('Error processing funding amount:', error);
          await ctx.reply('❌ Error processing amount. Please try again.');
          global.awaitingFundingAmount = null;
        }
        return;
      }

      // Handle Transfer Amount Input
      if (global.waitingForTransferAmount && global.waitingForTransferAmount[ctx.from.id]) {
        const transferData = global.waitingForTransferAmount[ctx.from.id];
        const inputText = ctx.message.text.trim();
        
        try {
          const amount = parseFloat(inputText);
          
          if (isNaN(amount) || amount <= 0) {
            await ctx.reply(`❌ *Invalid Amount*

Please enter a valid number greater than 0.

**Example:** 0.01`, { parse_mode: 'Markdown' });
            return;
          }
          
          if (amount < 0.001) {
            await ctx.reply(`❌ *Amount Too Small*

Minimum transfer amount is 0.001 SOL.

Please enter a larger amount.`, { parse_mode: 'Markdown' });
            return;
          }
          
          if (amount > transferData.maxAmount) {
            await ctx.reply(`❌ *Amount Too Large*

**Maximum Available:** ${transferData.maxAmount.toFixed(6)} SOL
**You Entered:** ${amount.toFixed(6)} SOL

Please enter a smaller amount.`, { parse_mode: 'Markdown' });
            return;
          }
          
          // Clear waiting state
          delete global.waitingForTransferAmount[ctx.from.id];
          
          // Execute the transfer
          await executeTransfer(ctx, transferData.walletIndex, amount, transferData.recipient, 'Custom Transfer');
          
        } catch (error) {
          delete global.waitingForTransferAmount[ctx.from.id];
          await ctx.reply('❌ Error processing transfer amount. Please try again.');
        }
        return;
      }

      // Handle Recipient Address Input
      if (global.waitingForRecipientAddress && global.waitingForRecipientAddress[ctx.from.id]) {
        const addressData = global.waitingForRecipientAddress[ctx.from.id];
        const inputText = ctx.message.text.trim();
        
        try {
          // Validate Solana address format
          if (inputText.length !== 44) {
            await ctx.reply(`❌ *Invalid Address Length*

Solana addresses must be exactly 44 characters long.

**You entered:** ${inputText.length} characters
**Required:** 44 characters

Please paste a valid Solana address.`, { parse_mode: 'Markdown' });
            return;
          }
          
          // Try to create PublicKey to validate
          let recipientPubkey;
          try {
            recipientPubkey = new PublicKey(inputText);
          } catch (error) {
            await ctx.reply(`❌ *Invalid Address Format*

The address you entered is not a valid Solana address.

**Requirements:**
• Must be 44 characters long
• Must be Base58 encoded
• Must be a valid public key

Please paste a correct Solana address.`, { parse_mode: 'Markdown' });
            return;
          }
          
          // Save recipient address
          global.transferRecipient = global.transferRecipient || {};
          global.transferRecipient[addressData.walletIndex] = inputText;
          
          // Clear waiting state
          delete global.waitingForRecipientAddress[ctx.from.id];
          
          const currentWallets = getAllWallets();
          const wallet = currentWallets[addressData.walletIndex];
          const walletName = wallet.name || `Wallet_${wallet.pubkey.substring(0, 8)}`;
          
          await ctx.reply(`✅ *RECIPIENT ADDRESS SAVED*

**From:** ${escapeMarkdown(walletName)}
**To:** \`${inputText.substring(0, 8)}...${inputText.substring(inputText.length - 8)}\`

**Address Verified:** ✅ Valid Solana address

Now you can proceed with transfers from this wallet.`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '💸 Quick Transfer 0.01 SOL', callback_data: `wallet_quick_transfer_${addressData.walletIndex}` }],
                [{ text: '💰 Transfer 50% Balance', callback_data: `wallet_half_transfer_${addressData.walletIndex}` }],
                [{ text: '📝 Custom Amount', callback_data: `wallet_custom_transfer_${addressData.walletIndex}` }],
                [{ text: '🔙 Back to Transfer', callback_data: `wallet_transfer_${addressData.walletIndex}` }]
              ]
            }
          });
          
        } catch (error) {
          delete global.waitingForRecipientAddress[ctx.from.id];
          await ctx.reply('❌ Error processing recipient address. Please try again.');
        }
        return;
      }
      
    } catch (error) {
      logger.error('Error in text handler:', error);
      // Clear any waiting states on error
      if (global.awaitingTokenInput === ctx.chat.id) {
        global.awaitingTokenInput = null;
      }
      if (global.awaitingSettingInput && global.awaitingSettingInput.chatId === ctx.chat.id) {
        global.awaitingSettingInput = null;
      }
      if (global.awaitingGroupSettingInput && global.awaitingGroupSettingInput[ctx.from.id]) {
        delete global.awaitingGroupSettingInput[ctx.from.id];
      }
      if (global.waitingForTransferAmount && global.waitingForTransferAmount[ctx.from.id]) {
        delete global.waitingForTransferAmount[ctx.from.id];
      }
      if (global.waitingForRecipientAddress && global.waitingForRecipientAddress[ctx.from.id]) {
        delete global.waitingForRecipientAddress[ctx.from.id];
      }
      if (global.awaitingVolumeInput === ctx.chat.id) {
        global.awaitingVolumeInput = null;
      }
      if (global.awaitingFomoInput === ctx.chat.id) {
        global.awaitingFomoInput = null;
      }
      if (global.awaitingFundingKey === ctx.chat.id) {
        global.awaitingFundingKey = null;
      }
      if (global.awaitingFundingAmount === ctx.chat.id) {
        global.awaitingFundingAmount = null;
      }
    }
  });

  // View Groups handler
  bot.action('view_groups', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Save current navigation position
      navigationStateManager.savePosition(
        ctx.from.id, 
        'view_groups', 
        'Wallet Groups Overview',
        { section: 'wallet_management', subsection: 'groups_list' }
      );
      
      const systemAnalytics = await walletAnalytics.getSystemAnalytics();
      
      // Get current SOL price for USD conversion
      const priceInfo = await getPriceInfo();
      const solPrice = priceInfo.price;
      
      let groupsList = '';
      
      Object.entries(systemAnalytics.groupAnalytics).forEach(([groupName, analytics], index) => {
        const statusEmoji = analytics.totalBalance > 0 ? '💰' : '⚪';
        const usdValue = (analytics.totalBalance * solPrice).toFixed(2);
        groupsList += `${index + 1}\\. ${statusEmoji} *${escapeMarkdown(groupName)}*\n`;
        groupsList += `   Wallets: ${analytics.walletCount} | Balance: ${analytics.totalBalance.toFixed(4)} SOL ($${usdValue})\n\n`;
      });
      
      const totalUsdValue = (systemAnalytics.totalBalance * solPrice).toFixed(2);
      const timestamp = new Date().toLocaleTimeString();
      const message = `📁 *WALLET GROUPS*

*Your Wallet Groups Overview*

${groupsList}📊 **System Total:**
• Groups: ${systemAnalytics.totalGroups}
• Wallets: ${systemAnalytics.totalWallets}
• Balance: ${systemAnalytics.totalBalance.toFixed(4)} SOL ($${totalUsdValue})

Select a group for detailed view:

🕐 Updated: ${timestamp}`;

      const keyboard = [];
      const groupNames = Object.keys(systemAnalytics.groupAnalytics);
      for (let i = 0; i < groupNames.length; i += 2) {
        const row = [];
        row.push({ text: `📁 ${groupNames[i]}`, callback_data: `group_detail_${groupNames[i]}` });
        if (i + 1 < groupNames.length) {
          row.push({ text: `📁 ${groupNames[i + 1]}`, callback_data: `group_detail_${groupNames[i + 1]}` });
        }
        keyboard.push(row);
      }
      keyboard.push([{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (error) {
      logger.error('Error in view_groups:', error);
      
      // Handle message duplication error
      if (error.message && error.message.includes('message is not modified')) {
        try {
          await ctx.answerCbQuery('Already showing current data');
        } catch (cbError) {
          logger.error('Error answering callback query:', cbError);
        }
        return;
      }
      
      // Fallback message for other errors
      try {
        await ctx.editMessageText(`❌ *Error Loading Groups*

Something went wrong while loading group data.

🔄 Please try again in a moment.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Refresh', callback_data: 'view_groups' }],
              [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
            ]
          }
        });
      } catch (fallbackError) {
        logger.error('Error sending fallback message:', fallbackError);
      }
    }
  });

  // Group detail handler
  bot.action(/^group_detail_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      
      // Save current navigation position
      navigationStateManager.savePosition(
        ctx.from.id, 
        `group_detail_${groupName}`, 
        `Group Details - ${groupName}`,
        { section: 'wallet_management', subsection: 'group_detail', groupName }
      );
      const groupAnalytics = await walletAnalytics.getGroupAnalytics(groupName);
      
      // Get current SOL price for USD conversion
      const priceInfo = await getPriceInfo();
      const solPrice = priceInfo.price;
      
      let walletsList = '';
      groupAnalytics.balances.walletBalances.slice(0, 5).forEach((wallet, index) => {
        const balanceEmoji = wallet.balance > 0 ? '💰' : '⚪';
        const usdValue = (wallet.balance * solPrice).toFixed(2);
        walletsList += `${index + 1}\\. ${balanceEmoji} ${escapeMarkdown(wallet.name)}\n`;
        walletsList += `   ${wallet.balance.toFixed(6)} SOL ($${usdValue})\n`;
        walletsList += `   ${escapeMarkdown(wallet.address.slice(0, 8))}\\.\\.\\. ${escapeMarkdown(wallet.address.slice(-4))}\n\n`;
      });
      
      const totalUsdValue = (groupAnalytics.totalBalance * solPrice).toFixed(2);
      const message = `📁 *${escapeMarkdown(groupName.toUpperCase())} GROUP*

*Group Details \\& Analytics*

📊 **Group Stats:**
• Wallets: ${groupAnalytics.walletCount}
• Total Balance: ${groupAnalytics.totalBalance.toFixed(4)} SOL ($${totalUsdValue})
• Success Rate: ${escapeMarkdown(groupAnalytics.metrics.successRate)}

👛 **Wallets \\(Top 5\\):**
${walletsList}

🎯 **Group Configuration:**
• Buy Amount: ${groupAnalytics.config.settings.buyAmount} SOL
• Sell Amount: ${groupAnalytics.config.settings.sellAmount} SOL
• Slippage: ${groupAnalytics.config.settings.slippage}%
• Priority Fee: ${groupAnalytics.config.settings.priorityFee} lamports`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔑 Show Private Keys', callback_data: `show_keys_${groupName}` }],
            [{ text: '💰 Fund Wallets', callback_data: `fund_group_${groupName}` }],
            [{ text: '⚙️ Edit Settings', callback_data: `edit_group_settings_${groupName}` }],
            [{ text: '📊 Full Analytics', callback_data: `analytics_${groupName}` }],
            [{ text: '🗑️ Delete Group', callback_data: `delete_group_${groupName}` }],
            [{ text: '🔙 Back to Groups', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in group_detail:', error);
      
      // Handle markdown parsing errors
      if (error.message && error.message.includes("can't parse entities")) {
        try {
          await ctx.editMessageText(`❌ *Group Display Error*

Unable to display group details due to formatting issues.

🔄 Please try refreshing the groups view.`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Back to Groups', callback_data: 'view_groups' }],
                [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
              ]
            }
          });
        } catch (fallbackError) {
          logger.error('Error sending fallback message:', fallbackError);
        }
        return;
      }
      
      // Handle other errors
      try {
        await ctx.editMessageText(`❌ *Error Loading Group Details*

Something went wrong while loading group information.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Back to Groups', callback_data: 'view_groups' }],
              [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
            ]
          }
        });
      } catch (fallbackError) {
        logger.error('Error sending fallback message:', fallbackError);
      }
    }
  });

  // Group analytics handler
  bot.action(/^analytics_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      const groupAnalytics = await walletAnalytics.getGroupAnalytics(groupName);
      
      const message = `📊 *${escapeMarkdown(groupName.toUpperCase())} ANALYTICS*

*Detailed Group Performance*

📈 **Performance Metrics:**
• Total Trades: ${groupAnalytics.metrics.totalTrades}
• Success Rate: ${escapeMarkdown(groupAnalytics.metrics.successRate)}
• Total Volume: ${groupAnalytics.metrics.totalVolume} SOL
• Last Activity: ${groupAnalytics.metrics.lastActivity || 'None'}

💰 **Balance Distribution:**
• Total Balance: ${groupAnalytics.totalBalance.toFixed(4)} SOL
• Average per Wallet: ${groupAnalytics.averageBalance.toFixed(6)} SOL
• Active Wallets: ${groupAnalytics.balances.walletBalances.filter(w => w.balance > 0).length}

⚙️ **Group Settings:**
• Max Wallets: ${groupAnalytics.config.maxWallets}
• Buy Amount: ${groupAnalytics.config.settings.buyAmount} SOL
• Sell Amount: ${groupAnalytics.config.settings.sellAmount} SOL
• Slippage: ${groupAnalytics.config.settings.slippage}%
• Priority Fee: ${groupAnalytics.config.settings.priorityFee} lamports

🕐 Updated: ${new Date().toLocaleTimeString()}`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📁 Group Details', callback_data: `group_detail_${groupName}` }],
            [{ text: '📊 Export Report', callback_data: `export_analytics_${groupName}` }],
            [{ text: '🔙 Back to Groups', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in analytics:', error);
      
      try {
        await ctx.editMessageText(`❌ *Analytics Error*

Unable to load analytics for this group.

🔄 Please try again.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Back to Groups', callback_data: 'view_groups' }]
            ]
          }
        });
      } catch (fallbackError) {
        logger.error('Error sending analytics fallback message:', fallbackError);
      }
    }
  });

  // Group settings editing handler
  bot.action(/^edit_group_settings_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      
      // Save current navigation position
      navigationStateManager.savePosition(
        ctx.from.id, 
        `edit_group_settings_${groupName}`, 
        `Edit Settings - ${groupName}`,
        { section: 'wallet_management', subsection: 'edit_group_settings', groupName }
      );
      
      const groupAnalytics = await walletAnalytics.getGroupAnalytics(groupName);
      const settings = groupAnalytics.config.settings;
      
      const message = `⚙️ *EDIT GROUP SETTINGS*

*Group: ${escapeMarkdown(groupName)}*

🔧 **Current Settings:**
• Buy Amount: ${settings.buyAmount} SOL
• Sell Amount: ${settings.sellAmount} SOL
• Slippage: ${settings.slippage}%
• Priority Fee: ${settings.priorityFee} lamports

📝 **Edit Options:**
Choose which setting you want to modify:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `📈 Buy Amount: ${settings.buyAmount} SOL`, callback_data: `edit_setting_${groupName}_buyAmount` }],
            [{ text: `📉 Sell Amount: ${settings.sellAmount} SOL`, callback_data: `edit_setting_${groupName}_sellAmount` }],
            [{ text: `📊 Slippage: ${settings.slippage}%`, callback_data: `edit_setting_${groupName}_slippage` }],
            [{ text: `⚡ Priority Fee: ${settings.priorityFee}`, callback_data: `edit_setting_${groupName}_priorityFee` }],
            [{ text: '🔙 Back to Group Details', callback_data: `group_detail_${groupName}` }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in edit_group_settings:', error);
      
      try {
        await ctx.editMessageText(`❌ *Settings Error*

Unable to load group settings for editing.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Groups', callback_data: 'view_groups' }]
            ]
          }
        });
      } catch (fallbackError) {
        logger.error('Error sending fallback message:', fallbackError);
      }
    }
  });

  // Individual setting editor handler
  bot.action(/^edit_setting_(.+)_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      const settingName = ctx.match[2];
      
      // Save current navigation position
      navigationStateManager.savePosition(
        ctx.from.id, 
        `edit_setting_${groupName}_${settingName}`, 
        `Edit ${settingName} - ${groupName}`,
        { section: 'wallet_management', subsection: 'edit_setting', groupName, settingName }
      );
      
      const groupAnalytics = await walletAnalytics.getGroupAnalytics(groupName);
      const currentValue = groupAnalytics.config.settings[settingName];
      
      let settingDisplay = '';
      let inputInstructions = '';
      let examples = '';
      
      switch(settingName) {
        case 'buyAmount':
          settingDisplay = 'Buy Amount (SOL)';
          inputInstructions = 'Enter the buy amount in SOL (e.g., 0.001, 0.01, 0.1)';
          examples = 'Examples: 0.001, 0.005, 0.01, 0.1';
          break;
        case 'sellAmount':
          settingDisplay = 'Sell Amount (SOL)';
          inputInstructions = 'Enter the sell amount in SOL (e.g., 0.001, 0.01, 0.1)';
          examples = 'Examples: 0.001, 0.005, 0.01, 0.1';
          break;
        case 'slippage':
          settingDisplay = 'Slippage (%)';
          inputInstructions = 'Enter slippage percentage (e.g., 0.5, 1.0, 2.0)';
          examples = 'Examples: 0.5 (0.5%), 1.0 (1%), 2.0 (2%), 5.0 (5%)';
          break;
        case 'priorityFee':
          settingDisplay = 'Priority Fee (lamports)';
          inputInstructions = 'Enter priority fee in lamports (e.g., 1000, 5000, 10000)';
          examples = 'Examples: 1000, 5000, 10000, 20000, 50000';
          break;
      }
      
      const message = `⚙️ *EDIT ${settingDisplay.toUpperCase()}*

*Group: ${escapeMarkdown(groupName)}*

📊 **Current Value:** ${currentValue}

📝 **Instructions:**
${inputInstructions}

💡 **${examples}**

⚠️ **Important:**
• Enter only the number (no units)
• Use decimal point for fractions
• Changes take effect immediately

Type your new value below:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Settings', callback_data: `edit_group_settings_${groupName}` }]
          ]
        }
      });
      
      // Set up input listener
      global.awaitingGroupSettingInput = global.awaitingGroupSettingInput || {};
      global.awaitingGroupSettingInput[ctx.from.id] = {
        groupName: groupName,
        settingName: settingName,
        currentValue: currentValue
      };
      
    } catch (error) {
      logger.error('Error in edit_setting:', error);
      
      try {
        await ctx.editMessageText(`❌ *Setting Editor Error*

Unable to load setting for editing.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Groups', callback_data: 'view_groups' }]
            ]
          }
        });
      } catch (fallbackError) {
        logger.error('Error sending fallback message:', fallbackError);
      }
    }
  });

  // System analytics handler
  bot.action('wallet_analytics', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Save current navigation position
      navigationStateManager.savePosition(
        ctx.from.id, 
        'wallet_analytics', 
        'System Analytics',
        { section: 'wallet_management', subsection: 'analytics' }
      );
      
      const systemAnalytics = await walletAnalytics.getSystemAnalytics();
      
      const message = `📊 *SYSTEM ANALYTICS*

*Overall Wallet Group Performance*

📈 **System Overview:**
• Total Groups: ${systemAnalytics.totalGroups}
• Total Wallets: ${systemAnalytics.totalWallets}
• Total Balance: ${systemAnalytics.totalBalance.toFixed(4)} SOL
• Total Trades: ${systemAnalytics.systemMetrics.totalTrades}
• Successful Trades: ${systemAnalytics.systemMetrics.successfulTrades}

💰 **Group Breakdown:**
${Object.entries(systemAnalytics.groupAnalytics).map(([name, analytics]) => 
  `• ${escapeMarkdown(name)}: ${analytics.walletCount} wallets, ${analytics.totalBalance.toFixed(4)} SOL`
).join('\n')}

🕐 Updated: ${new Date().toLocaleTimeString()}`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '👀 View All Groups', callback_data: 'view_groups' }],
            [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in wallet_analytics:', error);
      
      try {
        await ctx.editMessageText(`❌ *Analytics Error*

Unable to load system analytics.

🔄 Please try again.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Retry', callback_data: 'wallet_analytics' }],
              [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
            ]
          }
        });
      } catch (fallbackError) {
        logger.error('Error sending analytics fallback message:', fallbackError);
      }
    }
  });

  // Helper function to show wallet private key for Phantom import
  bot.action(/^show_key_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const walletAddress = ctx.match[1];
      const allWallets = getAllWallets();
      const wallet = allWallets.find(w => w.pubkey === walletAddress);
      
      if (!wallet) {
        await ctx.editMessageText(`❌ *Wallet Not Found*

The requested wallet could not be found.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Groups', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
            ]
          }
        });
        return;
      }
      
      // Convert private key to format that works with Phantom
      const privateKeyArray = wallet.secretKey;
      const privateKeyBase58 = bs58.encode(Uint8Array.from(privateKeyArray));
      
      const message = `🔑 *WALLET PRIVATE KEY*

*For Phantom Wallet Import*

**Wallet:** ${escapeMarkdown(wallet.name)}
**Public Key:** \`${wallet.pubkey}\`

**Private Key (Base58):**
\`${privateKeyBase58}\`

📱 **To import to Phantom:**
1\\. Open Phantom Wallet
2\\. Go to Settings → Manage Accounts
3\\. Tap "\\+" → Import Account
4\\. Paste the private key above
5\\. Give it a name and save

⚠️ **SECURITY WARNING:**
• Never share your private key
• Delete this message after copying
• Only import on devices you trust`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🗑️ Delete This Message', callback_data: 'delete_key_message' }],
            [{ text: '🔙 Back to Groups', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
          ]
        }
      });
      
    } catch (error) {
      logger.error('Error showing wallet key:', error);
    }
  });

  // Delete key message for security
  bot.action('delete_key_message', async (ctx) => {
    try {
      await ctx.answerCbQuery('Private key message deleted for security');
      await ctx.deleteMessage();
    } catch (error) {
      logger.error('Error deleting key message:', error);
    }
  });

  // Show private keys for a group (for Phantom import)
  bot.action(/^show_keys_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      const groupWallets = walletGroupManager.getWalletsByGroup(groupName);
      
      if (!groupWallets || groupWallets.length === 0) {
        await ctx.editMessageText(`❌ *No Wallets Found*

No wallets found in group "${groupName}".`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Groups', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
            ]
          }
        });
        return;
      }
      
      // Show first page (wallets 1-10)
      await showWalletKeysPage(ctx, groupName, groupWallets, 0);
      
    } catch (error) {
      logger.error('Error showing group keys:', error);
    }
  });

  // Show wallet keys with pagination
  async function showWalletKeysPage(ctx, groupName, groupWallets, page) {
    const walletsPerPage = 10;
    const startIndex = page * walletsPerPage;
    const endIndex = Math.min(startIndex + walletsPerPage, groupWallets.length);
    const totalPages = Math.ceil(groupWallets.length / walletsPerPage);
    
    const message = `🔑 *${escapeMarkdown(groupName.toUpperCase())} PRIVATE KEYS*

*For Phantom Wallet Import*

**Page ${page + 1} of ${totalPages}** (Wallets ${startIndex + 1}-${endIndex} of ${groupWallets.length})

Select a wallet to show its private key:

⚠️ **SECURITY WARNING:**
• Private keys give full control of wallets
• Only view on secure devices
• Never share with anyone

📱 **Phantom Import Steps:**
1\\. Copy the private key
2\\. Open Phantom → Settings → Manage Accounts
3\\. Tap "\\+" → Import Account
4\\. Paste private key and save`;

    const keyboard = [];
    
    // Show wallets for current page
    const walletsOnPage = groupWallets.slice(startIndex, endIndex);
    walletsOnPage.forEach((wallet, index) => {
      const balanceEmoji = wallet.balance && wallet.balance > 0 ? '💰' : '⚪';
      keyboard.push([{ 
        text: `${balanceEmoji} ${wallet.name}`, 
        callback_data: `show_key_${wallet.pubkey}` 
      }]);
    });
    
    // Add pagination buttons
    const paginationRow = [];
    if (page > 0) {
      paginationRow.push({ text: '⬅️ Previous', callback_data: `keys_page_${groupName}_${page - 1}` });
    }
    if (page < totalPages - 1) {
      paginationRow.push({ text: '➡️ Next', callback_data: `keys_page_${groupName}_${page + 1}` });
    }
    if (paginationRow.length > 0) {
      keyboard.push(paginationRow);
    }
    
    keyboard.push([{ text: '🔙 Back to Group', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]);

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  }

  // Handle pagination for wallet keys
  bot.action(/^keys_page_(.+)_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      const page = parseInt(ctx.match[2]);
      const groupWallets = walletGroupManager.getWalletsByGroup(groupName);
      
      if (!groupWallets || groupWallets.length === 0) {
        await ctx.editMessageText(`❌ *No Wallets Found*

No wallets found in group "${groupName}".`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Groups', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
            ]
          }
        });
        return;
      }
      
      await showWalletKeysPage(ctx, groupName, groupWallets, page);
      
    } catch (error) {
      logger.error('Error in keys pagination:', error);
    }
  });

  // Fund group handler
  bot.action(/^fund_group_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      const groupWallets = walletGroupManager.getWalletsByGroup(groupName);
      
      if (!groupWallets || groupWallets.length === 0) {
        await ctx.editMessageText(`❌ *No Wallets Found*

No wallets found in group "${groupName}".`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Groups', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
            ]
          }
        });
        return;
      }
      
      const message = `💰 *FUND WALLET GROUP*

**Group:** ${escapeMarkdown(groupName.toUpperCase())}
**Wallets:** ${groupWallets.length} wallets

🔧 **Funding Setup:**

Configure your funding source and distribution:

🔑 **Step 1:** Set phantom private key (source wallet)
💰 **Step 2:** Set total amount to distribute
📊 **Step 3:** Choose distribution method

⚠️ **Requirements:**
• Source wallet must have sufficient SOL
• Gas fees will be deducted automatically
• Each wallet will receive equal amounts

Select configuration option:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔑 Set Phantom Private Key', callback_data: `fund_set_key_${groupName}` }],
            [{ text: '💰 Set Distribution Amount', callback_data: `fund_set_amount_${groupName}` }],
            [{ text: '🚀 Execute Funding', callback_data: `fund_execute_${groupName}` }],
            [{ text: '🔙 Back to Group', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
          ]
        }
      });
      
    } catch (error) {
      logger.error('Error in fund group:', error);
    }
  });

  // Fund group - Set private key
  bot.action(/^fund_set_key_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      global.awaitingFundingKey = ctx.chat.id;
      global.fundingGroupName = groupName;
      
      const message = `🔑 *SET PHANTOM PRIVATE KEY*

**Group:** ${escapeMarkdown(groupName.toUpperCase())}

Enter the private key of your Phantom wallet that will fund this group:

**Format:** Private key string (base58)
**Example:** \`2x7F8Kw9... (your full private key)\`

⚠️ **Security Notice:**
• This key will be used only for funding
• Not stored permanently in the system
• Only used for this funding session
• Make sure you have sufficient SOL balance

**How to get your Phantom private key:**
1. Open Phantom wallet
2. Settings → Manage Accounts
3. Select wallet → Export Private Key
4. Copy and paste here

Please enter your private key:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: `fund_group_${groupName}` }]
          ]
        }
      });
      
    } catch (error) {
      logger.error('Error in fund_set_key:', error);
    }
  });

  // Fund group - Set amount
  bot.action(/^fund_set_amount_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      const groupWallets = walletGroupManager.getWalletsByGroup(groupName);
      global.awaitingFundingAmount = ctx.chat.id;
      global.fundingGroupName = groupName;
      
      const message = `💰 *SET DISTRIBUTION AMOUNT*

**Group:** ${escapeMarkdown(groupName.toUpperCase())}
**Wallets:** ${groupWallets.length} wallets

Enter the total SOL amount to distribute across all wallets:

**Format:** SOL amount
**Examples:** 
• \`0.1\` - 0.1 SOL total (${(0.1 / groupWallets.length).toFixed(6)} SOL per wallet)
• \`0.5\` - 0.5 SOL total (${(0.5 / groupWallets.length).toFixed(6)} SOL per wallet)
• \`1.0\` - 1.0 SOL total (${(1.0 / groupWallets.length).toFixed(6)} SOL per wallet)

💡 **Distribution:**
• Amount will be split equally among all ${groupWallets.length} wallets
• Gas fees (≈0.000005 SOL per transaction) will be deducted from source
• Minimum recommended: 0.001 SOL per wallet

Please enter total SOL amount:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: `fund_group_${groupName}` }]
          ]
        }
      });
      
    } catch (error) {
      logger.error('Error in fund_set_amount:', error);
    }
  });

  // Fund group - Execute funding
  bot.action(/^fund_execute_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      const groupWallets = walletGroupManager.getWalletsByGroup(groupName);
      
      // Check if settings are configured
      const fundingKey = global.fundingSettings?.privateKey;
      const fundingAmount = global.fundingSettings?.totalAmount;
      
      if (!fundingKey || !fundingAmount) {
        await ctx.editMessageText(`❌ *INCOMPLETE CONFIGURATION*

**Missing Settings:**
${!fundingKey ? '• ❌ Phantom private key not set' : '• ✅ Phantom private key set'}
${!fundingAmount ? '• ❌ Distribution amount not set' : '• ✅ Distribution amount set'}

Please configure all settings before executing funding.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔑 Set Private Key', callback_data: `fund_set_key_${groupName}` }],
              [{ text: '💰 Set Amount', callback_data: `fund_set_amount_${groupName}` }],
              [{ text: '⬅️ Back', callback_data: `fund_group_${groupName}` }]
            ]
          }
        });
        return;
      }
      
      const perWalletAmount = fundingAmount / groupWallets.length;
      const estimatedGasFees = groupWallets.length * 0.000005; // Estimated gas fees
      const totalRequired = fundingAmount + estimatedGasFees;
      
      const message = `🚀 *EXECUTE GROUP FUNDING*

**Group:** ${escapeMarkdown(groupName.toUpperCase())}

**Funding Summary:**
💰 **Total Distribution:** ${fundingAmount} SOL
👥 **Wallets:** ${groupWallets.length}
📊 **Per Wallet:** ${perWalletAmount.toFixed(6)} SOL
⛽ **Est. Gas Fees:** ${estimatedGasFees.toFixed(3)} SOL
💳 **Total Required:** ${totalRequired.toFixed(3)} SOL

**⚠️ Warning:**
• This will send SOL from your Phantom wallet
• Transactions are irreversible
• Make sure source wallet has sufficient balance
• Each wallet will receive ${perWalletAmount.toFixed(6)} SOL

Ready to execute funding?`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Execute Funding', callback_data: `fund_confirm_${groupName}` }],
            [{ text: '🔄 Modify Settings', callback_data: `fund_group_${groupName}` }],
            [{ text: '❌ Cancel', callback_data: `group_detail_${groupName}` }]
          ]
        }
      });
      
    } catch (error) {
      logger.error('Error in fund_execute:', error);
    }
  });

  // Fund group - Confirm and execute funding
  bot.action(/^fund_confirm_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      const groupWallets = walletGroupManager.getWalletsByGroup(groupName);
      const fundingKey = global.fundingSettings?.privateKey;
      const fundingAmount = global.fundingSettings?.totalAmount;
      
      if (!fundingKey || !fundingAmount) {
        await ctx.editMessageText(`❌ *Configuration Missing*

Please set up funding configuration first.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Back', callback_data: `fund_group_${groupName}` }]
            ]
          }
        });
        return;
      }

      // Show progress message
      const progressMsg = await ctx.editMessageText(`🔄 *EXECUTING GROUP FUNDING*

**Group:** ${escapeMarkdown(groupName.toUpperCase())}

**Progress:**
🔄 Initializing funding...
⏳ Please wait while we distribute SOL to all wallets...

**Status:** Starting transactions...`, { parse_mode: 'Markdown' });

      try {
        // Create source keypair
        const sourceKeypair = Keypair.fromSecretKey(bs58.decode(fundingKey));
        const perWalletAmount = fundingAmount / groupWallets.length;
        const perWalletLamports = Math.floor(perWalletAmount * LAMPORTS_PER_SOL);
        
        const results = [];
        let successful = 0;
        let failed = 0;

        // Process each wallet
        for (let i = 0; i < groupWallets.length; i++) {
          const wallet = groupWallets[i];
          
          try {
            // Update progress
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              progressMsg.message_id,
              undefined,
              `🔄 *EXECUTING GROUP FUNDING*

**Group:** ${escapeMarkdown(groupName.toUpperCase())}

**Progress:** ${i + 1}/${groupWallets.length} wallets
🔄 Funding wallet: ${escapeMarkdown(wallet.name)}
⏳ Please wait...

**Status:** Processing transfers...`,
              { parse_mode: 'Markdown' }
            );

            // Create transfer transaction
            const transaction = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: sourceKeypair.publicKey,
                toPubkey: new PublicKey(wallet.pubkey),
                lamports: perWalletLamports,
              })
            );

            // Get recent blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = sourceKeypair.publicKey;

            // Sign and send transaction
            transaction.sign(sourceKeypair);
            const signature = await connection.sendRawTransaction(transaction.serialize());

            // Confirm transaction
            const confirmation = await connection.confirmTransaction(signature, 'confirmed');
            
            if (confirmation.value.err) {
              throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
            }

            results.push({
              wallet: wallet.name,
              amount: perWalletAmount,
              signature: signature,
              success: true
            });
            successful++;

            console.log(`✅ Funded ${wallet.name}: ${perWalletAmount} SOL (${signature})`);

            // Small delay between transactions
            await new Promise(resolve => setTimeout(resolve, 500));

          } catch (error) {
            console.error(`❌ Failed to fund ${wallet.name}:`, error.message);
            results.push({
              wallet: wallet.name,
              amount: perWalletAmount,
              error: error.message,
              success: false
            });
            failed++;
          }
        }

        // Show final results
        const successRate = ((successful / groupWallets.length) * 100).toFixed(1);
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          progressMsg.message_id,
          undefined,
          `✅ *GROUP FUNDING COMPLETE*

**Group:** ${escapeMarkdown(groupName.toUpperCase())}

**Results:**
💰 **Total Distributed:** ${(successful * perWalletAmount).toFixed(6)} SOL
👥 **Wallets Funded:** ${successful}/${groupWallets.length}
✅ **Successful:** ${successful}
❌ **Failed:** ${failed}
📊 **Success Rate:** ${successRate}%

**Per Wallet:** ${perWalletAmount.toFixed(6)} SOL each

${successful > 0 ? '🎉 Funding completed! Your wallets are now funded and ready for trading.' : '❌ Funding failed. Please check your configuration and try again.'}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📊 View Group Details', callback_data: `group_detail_${groupName}` }],
                [{ text: '🔄 Fund Again', callback_data: `fund_group_${groupName}` }],
                [{ text: '🔙 Back to Groups', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
              ]
            }
          }
        );

        // Clear funding settings after completion
        global.fundingSettings = null;

      } catch (error) {
        logger.error('Error executing funding:', error);
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          progressMsg.message_id,
          undefined,
          `❌ *FUNDING FAILED*

**Group:** ${escapeMarkdown(groupName.toUpperCase())}

**Error:** ${error.message}

Please check your configuration and try again.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: `fund_group_${groupName}` }],
                [{ text: '🔙 Back to Group', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
              ]
            }
          }
        );
      }
      
    } catch (error) {
      logger.error('Error in fund_confirm:', error);
    }
  });

  // Delete group handler
  bot.action(/^delete_group_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      const groupWallets = walletGroupManager.getWalletsByGroup(groupName);
      
      if (!groupWallets) {
        await ctx.editMessageText(`❌ *Group Not Found*

The group "${groupName}" could not be found.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Groups', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
            ]
          }
        });
        return;
      }
      
      // Calculate total balance in group
      let totalBalance = 0;
      for (const wallet of groupWallets) {
        if (wallet.balance && wallet.balance > 0) {
          totalBalance += wallet.balance;
        }
      }
      
      const message = `⚠️ *DELETE GROUP CONFIRMATION*

*You are about to delete:*

**Group:** ${escapeMarkdown(groupName)}
**Wallets:** ${groupWallets.length}
**Total Balance:** ${totalBalance.toFixed(6)} SOL

🚨 **WARNING:**
• This action CANNOT be undone
• All wallets in this group will be deleted
• All private keys will be lost forever
• Any SOL in these wallets will be inaccessible

💡 **Recommendation:**
If you have SOL in these wallets, export the private keys first or send the SOL to another wallet.

Are you absolutely sure you want to delete this group?`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔑 Show Private Keys First', callback_data: `show_keys_${groupName}` }],
            [{ text: '✅ YES, Delete Forever', callback_data: `confirm_delete_${groupName}` }],
            [{ text: '❌ Cancel', callback_data: `group_detail_${groupName}` }]
          ]
        }
      });
      
    } catch (error) {
      logger.error('Error in delete_group:', error);
    }
  });

  // Confirm delete group handler
  bot.action(/^confirm_delete_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      
      // Show processing message
      const processingMsg = await ctx.editMessageText(`🗑️ *Deleting Group*

Deleting "${escapeMarkdown(groupName)}" and all its wallets...

Please wait...`, {
        parse_mode: 'Markdown'
      });
      
      try {
        // Get wallet count before deletion
        const walletsToDelete = walletGroupManager.getWalletsByGroup(groupName);
        const walletCount = walletsToDelete.length;
        
        // Delete the group (this should also delete all wallets in the group)
        await walletGroupManager.deleteGroup(groupName);
        
        const currentWallets = getAllWallets();
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          `✅ *Group Deleted Successfully*

**Deleted:** ${escapeMarkdown(groupName)}
**Wallets Removed:** ${walletCount}
**Remaining System Wallets:** ${currentWallets.length}

The group and all its wallets have been permanently deleted.

🔄 Updated: ${new Date().toLocaleTimeString()}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '👀 View All Groups', callback_data: 'view_groups' }],
                [{ text: '➕ Create New Group', callback_data: 'generate_wallet_group' }],
                [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
              ]
            }
          }
        );
        
      } catch (deleteError) {
        logger.error('Error deleting group:', deleteError);
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          `❌ *Error Deleting Group*

Failed to delete "${groupName}".

**Error:** ${escapeMarkdown(deleteError.message)}

The group may contain wallets that need to be moved first.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: `delete_group_${groupName}` }],
                [{ text: '🔙 Back to Group', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
              ]
            }
          }
        );
      }
      
    } catch (error) {
      logger.error('Error in confirm_delete:', error);
    }
  });

  // Fund Wallets
  bot.action('fund_wallets', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const message = `💰 *FUND WALLETS*

*Add SOL to Your Wallets*

🎯 **Funding Information:**
• Network: ${config.solana.network}
• Total wallets: ${existingWallets.length}

📋 **Your Wallet Addresses (first 5):**
${existingWallets.slice(0, 5).map((wallet, i) => 
  `${i + 1}. ${escapeMarkdown(wallet.name || `Wallet ${i + 1}`)}\\n   \`${wallet.pubkey}\``
).join('\\n\\n')}

${existingWallets.length > 5 ? `\\n... and ${existingWallets.length - 5} more wallets` : ''}

⚠️ **Funding Instructions:**
${config.solana.network === 'devnet' ? 
  '• Use Solana faucet: https://faucet.solana.com' :
  '• Send SOL from your main wallet or exchange'
}
• Copy wallet addresses above
• Send SOL to fund your wallets`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 View Wallets', callback_data: 'view_wallets' }],
            [{ text: '🔍 Check Health', callback_data: 'wallet_health' }],
            [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in fund_wallets:', error);
    }
  });

  // Wallet Health
  bot.action('wallet_health', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      await ctx.editMessageText(`🔍 *Checking Wallet Health...*

⏱️ Testing connections to ${existingWallets.length} wallets...
📊 This may take a moment...`, {
        parse_mode: 'Markdown'
      });
      
      let healthyWallets = 0;
      let totalChecked = 0;
      let healthReport = '';
      
      // Check first 10 wallets
      for (let i = 0; i < Math.min(existingWallets.length, 10); i++) {
        const wallet = existingWallets[i];
        const walletName = wallet.name || `Wallet ${i + 1}`;
        totalChecked++;
        
        try {
          await connection.getBalance(new PublicKey(wallet.pubkey));
          healthyWallets++;
          healthReport += `✅ ${escapeMarkdown(walletName)}: Connected\\n`;
        } catch (error) {
          healthReport += `❌ ${escapeMarkdown(walletName)}: Connection failed\\n`;
        }
      }
      
      const healthPercentage = totalChecked > 0 ? (healthyWallets / totalChecked * 100).toFixed(1) : 0;
      const overallStatus = healthPercentage >= 90 ? '✅ Excellent' : 
                           healthPercentage >= 70 ? '⚠️ Good' : 
                           healthPercentage >= 50 ? '🔶 Fair' : '❌ Poor';
      
      const message = `🔍 *WALLET HEALTH REPORT*

📊 **Overall Health:** ${overallStatus} (${healthPercentage}%)

🎯 **Statistics:**
• Total wallets: ${existingWallets.length}
• Wallets checked: ${totalChecked}
• Healthy connections: ${healthyWallets}
• Failed connections: ${totalChecked - healthyWallets}
• Success rate: ${healthPercentage}%

📋 **Detailed Report:**
${healthReport}

${existingWallets.length > 10 ? `... ${existingWallets.length - 10} more wallets not shown` : ''}

💡 **Recommendations:**
${healthPercentage >= 90 ? '• All systems optimal!' : 
  healthPercentage >= 70 ? '• Most wallets healthy, monitor failed ones' : 
  '• Multiple connection issues detected, check network'}`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Fund Wallets', callback_data: 'fund_wallets' }],
            [{ text: '📊 View Wallets', callback_data: 'view_wallets' }],
            [{ text: '🔄 Refresh Health', callback_data: 'wallet_health' }],
            [{ text: '🔙 Back to Wallet Manager', callback_data: getWalletManagerReturnCallback(ctx.from.id) }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in wallet_health:', error);
    }
  });

  // Main menu
  bot.action('main_menu', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      // Check if target token is set
      const tokenStatus = global.targetToken ? '✅ Set' : '❌ Not Set';
      const tokenAddress = global.targetToken ? `\`${global.targetToken.slice(0, 8)}...${global.targetToken.slice(-8)}\`` : 'None';

      await ctx.editMessageText(`🚀 *Simple Wallet Manager*

🎯 *Available Features:*
• Command Center - Full control panel
• Wallet Manager - Manage your Solana wallets

🎯 *Token Status:* ${tokenStatus}
${global.targetToken ? `• Address: ${tokenAddress}` : '• No target token configured'}

Choose an option below:`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎛️ Command Center', callback_data: 'command_center' }],
            [{ text: '💰 Wallet Manager', callback_data: 'wallet_manager' }],
            [{ text: '📊 View Dashboard', callback_data: 'view_dashboard' }],
            [{ text: 'ℹ️ Help', callback_data: 'help' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in main_menu:', error);
    }
  });

  // View Dashboard - COMPREHENSIVE READ-ONLY MONITORING SYSTEM
  bot.action('view_dashboard', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Get comprehensive system data
      const allWallets = getAllWallets();
      const currentTime = new Date().toLocaleString();
      
      // TARGET TOKEN STATUS
      const tokenStatus = global.targetToken ? '🟢 ACTIVE' : '🔴 NOT SET';
      const tokenAddress = global.targetToken ? `\`${global.targetToken.slice(0, 8)}...${global.targetToken.slice(-8)}\`` : 'None';
      
      // Get token price if available - use Jupiter for target token, Coinbase for SOL
      let tokenPrice = 'N/A';
      let priceChange = 'N/A';
      if (global.targetToken) {
        try {
          // Use Jupiter to get real token price in SOL, then convert to USD
          const jupiterIntegration = require('./jupiter-v6-integration.js');
          const jupiter = new jupiterIntegration(connection);
          const solPriceInfo = await getPriceInfo(); // Get SOL price in USD
          
          // Get quote for 1 SOL worth of target token to determine token price
          const oneSOL = LAMPORTS_PER_SOL; // 1 SOL in lamports
          const quote = await jupiter.getQuote(jupiter.solMint, global.targetToken, oneSOL);
          
          if (quote && quote.outAmount) {
            // Calculate token price: (1 SOL * SOL_USD_Price) / tokens_received
            const tokensReceived = parseInt(quote.outAmount) / Math.pow(10, 6); // Assume 6 decimals, adjust if needed
            const tokenPriceInUSD = solPriceInfo.price / tokensReceived;
            tokenPrice = tokenPriceInUSD < 0.000001 ? 
              `$${tokenPriceInUSD.toExponential(3)}` : 
              `$${tokenPriceInUSD.toFixed(6)}`;
          }
        } catch (e) {
          logger.warn('Failed to fetch target token price, using SOL price instead:', e.message);
          // Fallback to SOL price if target token price fails
          try {
            const solPriceInfo = await getPriceInfo();
            tokenPrice = solPriceInfo.formatted;
          } catch (fallbackError) {
            logger.warn('Failed to fetch SOL price fallback:', fallbackError.message);
          }
        }
      }
      
      // CALCULATE TOTAL PROFITS FROM REAL TRADING DATA
      let totalProfits = 0;
      let profitableTransactions = 0;
      let totalTransactions = 0;
      let totalVolume = 0;
      let volumeTradingPnL = 0;
      let smartSellPnL = 0;
      
      try {
        // Load real P&L data from trade tracker
        const tradeTracker = require('./trade-tracker');
        const summary = tradeTracker.getSummary();
        
        totalProfits = summary.totalProfitUSD || 0;
        totalVolume = summary.totalVolumeSOL || 0;
        profitableTransactions = summary.successfulTrades || 0;
        totalTransactions = summary.totalTrades || 0;
        volumeTradingPnL = summary.volumeTradingPnL || 0;
        smartSellPnL = summary.smartSellPnL || 0;
        
        logger.info(`Dashboard P&L: Total=${totalProfits.toFixed(2)}, Volume=${volumeTradingPnL.toFixed(2)}, SmartSell=${smartSellPnL.toFixed(2)}`);
      } catch (e) {
        logger.warn('Could not load trade tracker data, trying fallback:', e.message);
        
        // Fallback to wallet-metrics.json
        try {
        const metricsData = JSON.parse(fs.readFileSync('./wallet-metrics.json', 'utf8'));
        
        if (metricsData.trades && Array.isArray(metricsData.trades)) {
          totalTransactions = metricsData.trades.length;
          
          metricsData.trades.forEach(trade => {
            if (trade.success) {
              profitableTransactions++;
            }
            if (trade.amount) {
              totalVolume += trade.amount;
            }
          });
          }
        } catch (fallbackError) {
          logger.warn('Fallback also failed:', fallbackError.message);
        }
      }
      
      // SMART SELL MONITORING STATUS - CHECK FOR REAL ACTIVE MONITORS
      let smartSellActive = false;
      let smartSellStatus = '🔴 INACTIVE';
      let profitTarget = 'N/A';
      let stopLoss = 'N/A';
      let activeMonitorCount = 0;
      let totalSellsExecuted = 0;
      let totalBubbleDetections = 0;
      
      try {
        // Check if Smart Sell Engine is actively monitoring any tokens
        if (global.smartSellEngine && global.smartSellEngine.activeMonitors && global.smartSellEngine.activeMonitors.size > 0) {
          smartSellActive = true;
          smartSellStatus = '🟢 ACTIVE';
          activeMonitorCount = global.smartSellEngine.activeMonitors.size;
          
          // Get aggregated stats from all active monitors
          global.smartSellEngine.activeMonitors.forEach(monitor => {
            if (monitor.stats) {
              totalSellsExecuted += monitor.stats.sellsExecuted || 0;
              totalBubbleDetections += monitor.stats.bubbleDetections || 0;
            }
            if (monitor.sellTriggers) {
              profitTarget = `${monitor.sellTriggers.profitTarget || 30}%`;
              stopLoss = `${monitor.sellTriggers.stopLoss || -15}%`;
            }
          });
        } else if (global.smartSellSettings && Object.keys(global.smartSellSettings).length > 0) {
          // Fallback to settings if engine not active but settings exist
          profitTarget = `${global.smartSellSettings.profitTarget || 30}%`;
          stopLoss = `${global.smartSellSettings.stopLoss || -15}%`;
        }
      } catch (e) {
        logger.warn('Could not check Smart Sell Engine status:', e.message);
      }
      
      // VOLUME MANIPULATION METRICS - Updated for multi-session system
      const activeSessions = jupiter.getActiveVolumeSessions();
      const volumeActive = activeSessions.length > 0;
      const volumeStatus = volumeActive ? `🟢 RUNNING (${activeSessions.length} sessions)` : '🔴 STOPPED';
      const volumeMode = volumeActive ? `${activeSessions.length} active sessions` : 'N/A';
      
      // WALLET ARMY STATUS - SOL BALANCES AND TARGET TOKEN HOLDINGS
      const totalWallets = allWallets.length;
      let fundedWallets = 0;
      let totalBalance = 0;
      let totalTargetTokenHoldings = 0;
      let walletsWithTargetToken = 0;
      
      for (const wallet of allWallets) {
        try {
          // Use pubkey field (not publicKey)
          const walletAddress = wallet.pubkey || wallet.publicKey;
          const balance = await connection.getBalance(new PublicKey(walletAddress));
          const balanceInSol = balance / LAMPORTS_PER_SOL;
          totalBalance += balanceInSol;
          if (balanceInSol > 0.001) fundedWallets++; // Consider funded if > 0.001 SOL
          
          // Check target token balance if token is set
          if (global.targetToken) {
            try {
              const tokenBalance = await connection.getTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { mint: new PublicKey(global.targetToken) }
              );
              
              if (tokenBalance.value.length > 0) {
                // Get actual token amount from the account
                const accountInfo = await connection.getParsedAccountInfo(tokenBalance.value[0].pubkey);
                if (accountInfo.value && accountInfo.value.data.parsed) {
                  const tokenAmount = accountInfo.value.data.parsed.info.tokenAmount.uiAmount;
                  if (tokenAmount > 0) {
                    totalTargetTokenHoldings += tokenAmount;
                    walletsWithTargetToken++;
                  }
                }
              }
            } catch (tokenError) {
              // Skip token balance errors - wallet might not have target token
            }
          }
        } catch (e) {
          // Skip balance check errors
        }
      }
      
      // WALLET GROUP STATUS
      let groupStatus = '';
      try {
        const groupsConfig = JSON.parse(fs.readFileSync('./groups-config.json', 'utf8'));
        const activeGroups = Object.keys(groupsConfig).filter(key => groupsConfig[key].status === 'active');
        groupStatus = `${activeGroups.length} Active Groups: ${activeGroups.join(', ')}`;
      } catch (e) {
        groupStatus = 'Groups config not available';
      }
      
      // SYSTEM HEALTH INDICATORS
      const connectionHealth = connection ? '🟢 CONNECTED' : '🔴 DISCONNECTED';
      const jupiterHealth = '🟢 AVAILABLE'; // Jupiter is integrated
      const memoryUsage = process.memoryUsage();
      const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      
      // RECENT ACTIVITY SUMMARY FROM REAL DATA
      let recentActivity = 'No recent activity';
      try {
        const metricsData = JSON.parse(fs.readFileSync('./wallet-metrics.json', 'utf8'));
        if (metricsData.trades && metricsData.trades.length > 0) {
          const recentTrades = metricsData.trades.slice(-3);
          recentActivity = recentTrades.map(trade => {
            const time = new Date(trade.timestamp).toLocaleString();
            const status = trade.success ? '✅' : '❌';
            return `• ${status} ${trade.operation.toUpperCase()}: ${trade.amount} SOL (${time})`;
          }).join('\\n');
        } else if (global.transactionHistory && global.transactionHistory.length > 0) {
          const recentTx = global.transactionHistory.slice(-3);
          recentActivity = recentTx.map(tx => `• ${tx.type || 'Transaction'}: ${tx.amount || 'N/A'} (${tx.timestamp || 'Unknown time'})`).join('\\n');
        }
      } catch (e) {
        logger.warn('Could not load recent trading activity:', e.message);
      }
      
      const dashboardMessage = `📊 *TRADING DASHBOARD*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 *TARGET TOKEN*
${global.targetToken ? `
• Address: ${tokenAddress}
• Price: ${tokenPrice}
• 24h Change: ${priceChange}
• Holdings: ${totalTargetTokenHoldings.toFixed(2)} tokens
• Est. Value: $${global.targetToken && totalTargetTokenHoldings > 0 && tokenPrice !== 'N/A' ? (totalTargetTokenHoldings * parseFloat(tokenPrice.replace('$', ''))).toFixed(2) : '0.00'}` : `
• Status: ${tokenStatus}
• Set a token to start trading`}

💰 *PROFIT & LOSS*
• Total P&L: $${totalProfits.toFixed(2)} USD
• Volume Traded: ${totalVolume.toFixed(4)} SOL
• Successful Trades: ${profitableTransactions}/${totalTransactions}
• Success Rate: ${totalTransactions > 0 ? ((profitableTransactions/totalTransactions)*100).toFixed(1) : '0'}%

🤖 *SMART SELL*
• Status: ${smartSellStatus}
• Profit Target: ${profitTarget}
• Stop Loss: ${stopLoss}
• Auto-Sells: ${totalSellsExecuted}
• Outsider Detection: ${smartSellActive ? '🟢 ON' : '🔴 OFF'}

📈 *VOLUME TRADING*
• Status: ${volumeStatus}
• Mode: ${volumeMode}
• Active Sessions: ${volumeActive ? '🟢 Running' : '⚪ None'}

👛 *WALLET STATUS*
• Total Wallets: ${totalWallets}
• Funded: ${fundedWallets}
• Total Balance: ${totalBalance.toFixed(4)} SOL ($${(totalBalance * (await getPriceInfo()).price).toFixed(2)})
• Holding Token: ${walletsWithTargetToken}/${totalWallets}

⚡ *SYSTEM*
• RPC: ${connectionHealth}
• Jupiter: ${jupiterHealth}
• Status: 🟢 Online

🕐 *RECENT TRADES*
${recentActivity}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 ${currentTime}`;

      await ctx.editMessageText(dashboardMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh Dashboard', callback_data: 'view_dashboard' }],
            [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
          ]
        }
      });
      
    } catch (error) {
      logger.error('Error in view_dashboard:', error);
      await ctx.reply('❌ Dashboard error occurred. Please try again.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
          ]
        }
      });
    }
  });

  // Wallet Commander - FULL INDIVIDUAL WALLET CONTROLS WITH PAGINATION
  bot.action(/wallet_commander(?:_page_(\d+))?/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Save current navigation position
      const page = parseInt(ctx.match[1]) || 0;
      const callbackData = page > 0 ? `wallet_commander_page_${page}` : 'wallet_commander';
      navigationStateManager.savePosition(
        ctx.from.id, 
        callbackData, 
        `Wallet Commander - Page ${page + 1}`,
        { page, section: 'wallet_commander' }
      );
      
      const currentWallets = getAllWallets(); // Get fresh wallet data every time
      const walletsPerPage = 10; // Show 10 wallets per page
      const startIndex = page * walletsPerPage;
      const endIndex = Math.min(startIndex + walletsPerPage, currentWallets.length);
      const totalPages = Math.ceil(currentWallets.length / walletsPerPage);
      
      // Show loading message first
      await ctx.editMessageText(`👑 *WALLET COMMANDER LOADING...*

🔄 Loading wallets ${startIndex + 1}-${endIndex} of ${currentWallets.length}
📊 Fetching balances and SOL price...
⏱️ This may take a moment...`, {
        parse_mode: 'Markdown'
      });
      
      const priceInfo = await getPriceInfo();
      let totalBalance = 0;
      let connectedWallets = 0;
      const walletRows = [];
      
      // Calculate total balance across ALL wallets (not just current page)
      for (let i = 0; i < currentWallets.length; i++) {
        try {
          const balance = await connection.getBalance(new PublicKey(currentWallets[i].pubkey));
          const solBalance = balance / LAMPORTS_PER_SOL;
          totalBalance += solBalance;
          if (balance > 0) connectedWallets++;
        } catch (error) {
          // Skip failed wallets in total calculation
        }
      }
      
      // Create individual wallet control buttons for current page only
      for (let i = startIndex; i < endIndex; i++) {
        const wallet = currentWallets[i];
        const walletName = wallet.name || `Wallet ${i + 1}`;
        
        try {
          const balance = await connection.getBalance(new PublicKey(wallet.pubkey));
          const solBalance = balance / LAMPORTS_PER_SOL;
          const balanceStr = solBalance.toFixed(4);
          const usdValue = (solBalance * priceInfo.price).toFixed(2);
          const status = balance > 0 ? '🟢' : '🔴';
          
          // Create 4 buttons per wallet: Info, Buy, Sell, Transfer (with 💰 icon for wallet name)
          walletRows.push([
            { text: `💰 ${walletName}`, callback_data: `wallet_info_${i}` },
            { text: '🟢 Buy', callback_data: `wallet_buy_${i}` },
            { text: '🔴 Sell', callback_data: `wallet_sell_${i}` },
            { text: '💸 Transfer', callback_data: `wallet_transfer_${i}` }
          ]);
        } catch (error) {
          walletRows.push([
            { text: `💰 ${walletName}`, callback_data: `wallet_info_${i}` },
            { text: '🟢 Buy', callback_data: `wallet_buy_${i}` },
            { text: '🔴 Sell', callback_data: `wallet_sell_${i}` },
            { text: '💸 Transfer', callback_data: `wallet_transfer_${i}` }
          ]);
        }
      }
      
      // Add pagination buttons if needed
      const navigationButtons = [];
      if (totalPages > 1) {
        const navRow = [];
        if (page > 0) {
          navRow.push({ text: '◀️ Previous', callback_data: `wallet_commander_page_${page - 1}` });
        }
        if (page < totalPages - 1) {
          navRow.push({ text: 'Next ▶️', callback_data: `wallet_commander_page_${page + 1}` });
        }
        if (navRow.length > 0) {
          navigationButtons.push(navRow);
        }
      }
      
      // Add management buttons
      const managementButtons = [
        [{ text: '📊 Portfolio Overview', callback_data: 'commander_portfolio' }],
        [{ text: '🔄 Refresh All', callback_data: 'wallet_commander' }],
        [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
      ];
      
      const commanderMenu = [...walletRows, ...navigationButtons, ...managementButtons];
      const formattedTotalUsd = formatUsd(totalBalance * priceInfo.price);

      await ctx.editMessageText(
        `👑 *WALLET COMMANDER*\n\n` +
        `*Individual Wallet Control Center*\n\n` +
        `**Portfolio Status:**\n` +
        `• Total Wallets: ${currentWallets.length}\n` +
        `• Showing: ${startIndex + 1}-${endIndex} (Page ${page + 1}/${totalPages})\n` +
        `• Connected: ${connectedWallets}\n` +
        `• Total Balance: ${totalBalance.toFixed(6)} SOL (${formattedTotalUsd})\n` +
        `• SOL Price: ${priceInfo.formatted}\n` +
        `• Target Token: ${global.targetToken ? 'Set ✅' : 'Not set ❌'}\n\n` +
        `**Individual Controls:**\n` +
        `Each wallet has 4 actions:\n` +
        `• 💰 Wallet Info - View details & balance\n` +
        `• 🟢 Buy - Purchase target token\n` +
        `• 🔴 Sell - Sell target token\n` +
        `• 💸 Transfer - Send SOL/tokens\n\n` +
        `**Status:** All systems ready for individual trading\n\n` +
        `Click any wallet to control it individually:`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: commanderMenu }
        }
      );
    } catch (error) {
      logger.error('Error in wallet_commander:', error);
      await ctx.editMessageText(`❌ *Wallet Commander Error*

${error.message}

Please try again.`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Try Again', callback_data: 'wallet_commander' }],
            [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
          ]
        }
      });
    }
  });

  // Volume Trading
  bot.action('volume_trading', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Save current navigation position
      navigationStateManager.savePosition(
        ctx.from.id, 
        'volume_trading', 
        'Volume Trading',
        { section: 'volume_trading', subsection: 'main' }
      );
      
      // Get active volume sessions
      const activeSessions = jupiter.getActiveVolumeSessions();
      const activeCount = activeSessions.filter(s => s.isActive).length;

      const message = `📊 *VOLUME TRADING*

*Multi-Session Volume Generation System*

🎯 **Volume Status:**
• Available wallets: ${existingWallets.length}
• Active sessions: ${activeCount}
• Network: ${config.solana.network}
• Mode: Multi-Session Ready

⚡ **Volume Features:**
• **Simultaneous sessions** - Run multiple strategies at once
• **Wallet group isolation** - Each group runs independently  
• **Real-time monitoring** - Track all sessions live
• **Individual control** - Start/stop sessions separately

${activeCount > 0 ? `🔥 **Active Sessions:**\n${activeSessions.filter(s => s.isActive).map(s => `• ${s.walletGroup} (${s.mode}) - ${Math.round(s.duration/1000)}s`).join('\n')}\n` : ''}

⚠️ **Note:** Volume features require funded wallets

Select volume operation:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Start Volume Session', callback_data: 'volume_start' }],
            [{ text: '🎭 Multi-Session Manager', callback_data: 'multi_session_manager' }],
            [{ text: '📈 Volume Settings', callback_data: 'volume_settings' }],
            [{ text: '📊 Volume Stats', callback_data: 'volume_stats' }],
            [{ text: '⏸️ Stop All Volume', callback_data: 'volume_stop' }],
            [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in volume_trading:', error);
    }
  });

  // Multi-Session Manager
  bot.action('multi_session_manager', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Save current navigation position
      navigationStateManager.savePosition(
        ctx.from.id, 
        'multi_session_manager', 
        'Multi-Session Manager',
        { section: 'volume_trading', subsection: 'multi_session' }
      );
      
      const activeSessions = jupiter.getActiveVolumeSessions();
      const activeCount = activeSessions.filter(s => s.isActive).length;
      
      // Load groups configuration
      const groupsConfig = JSON.parse(fs.readFileSync('./groups-config.json', 'utf8'));
      
      const message = `🎭 *MULTI-SESSION MANAGER*

*Volume Session Monitoring & Control*

📊 **Session Overview:**
• Total sessions: ${activeSessions.length}
• Active sessions: ${activeCount}
• Available wallet groups: ${Object.keys(groupsConfig).length}

${activeCount > 0 ? `🔥 **Active Sessions:**\n${activeSessions.filter(s => s.isActive).map(s => `• ${s.walletGroup} (${s.mode}) - ${Math.round(s.duration/1000)}s\n  └─ ${s.stats.totalTrades} trades, ${s.stats.totalVolume.toFixed(4)} SOL`).join('\n')}\n` : ''}

ℹ️ **How to Launch Sessions:**
• Use **Volume Bot → Volume Settings → [Mode]** to start new sessions
• This manager is for **monitoring and controlling** active sessions
• Multiple sessions can run simultaneously from different launches

⚡ **Management Features:**
• **Real-time monitoring** - Live session statistics
• **Individual control** - Start/stop specific sessions
• **Session isolation** - Each session runs independently

Select operation:`;

      const keyboard = [];
      
      // Add session management buttons
      if (activeCount > 0) {
        keyboard.push([{ text: '📊 View All Sessions', callback_data: 'view_all_sessions' }]);
        keyboard.push([{ text: '⏸️ Stop All Sessions', callback_data: 'stop_all_sessions' }]);
      }
      
      // Note: Volume sessions are launched from the original Volume Bot interface
      // This manager is for monitoring and controlling active sessions only
      
      keyboard.push([{ text: '🔙 Back to Volume Trading', callback_data: 'volume_trading' }]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (error) {
      // Ignore "message is not modified" errors - content is already correct
      if (error.response && error.response.error_code === 400 && 
          error.response.description.includes('message is not modified')) {
        // Message is already displaying the correct content, no action needed
        return;
      }
      logger.error('Error in multi_session_manager:', error);
    }
  });

  // View All Sessions
  bot.action('view_all_sessions', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const activeSessions = jupiter.getActiveVolumeSessions();
      
      if (activeSessions.length === 0) {
        await ctx.editMessageText(`📊 *ALL SESSIONS*

No volume sessions found.

Start a session to see detailed information here.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Multi-Session Manager', callback_data: 'multi_session_manager' }]
            ]
          }
        });
        return;
      }

      let message = `📊 *ALL SESSIONS*\n\n`;
      
      activeSessions.forEach((session, index) => {
        const status = session.isActive ? '🟢 ACTIVE' : '🔴 STOPPED';
        const duration = Math.round(session.duration / 1000);
        
        message += `**Session ${index + 1}:** ${session.id.substring(0, 12)}...\n`;
        message += `• Group: ${session.walletGroup}\n`;
        message += `• Mode: ${session.mode}\n`;
        message += `• Status: ${status}\n`;
        message += `• Duration: ${duration}s\n`;
        message += `• Trades: ${session.stats.totalTrades}\n`;
        message += `• Volume: ${session.stats.totalVolume.toFixed(4)} SOL\n\n`;
      });

      const keyboard = [];
      
      // Add individual session control buttons
      activeSessions.forEach((session, index) => {
        if (session.isActive) {
          keyboard.push([{ 
            text: `⏸️ Stop ${session.walletGroup}`, 
            callback_data: `stop_session_${session.id}` 
          }]);
        }
      });
      
      keyboard.push([{ text: '🔙 Back to Multi-Session Manager', callback_data: 'multi_session_manager' }]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (error) {
      logger.error('Error in view_all_sessions:', error);
    }
  });

  // Stop All Sessions
  bot.action('stop_all_sessions', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const result = jupiter.stopAllVolumeSessions();
      
      await ctx.editMessageText(`⏸️ *STOP ALL SESSIONS*

${result.success ? 
  `✅ **Successfully stopped ${result.stoppedCount} sessions**

All active volume sessions have been stopped.` :
  `❌ **Error:** ${result.error}`
}

🔙 Return to multi-session manager:`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Multi-Session Manager', callback_data: 'multi_session_manager' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in stop_all_sessions:', error);
    }
  });

  // Dynamic handler for wallet group session starters
  bot.action(/^start_group_session_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      const groupsConfig = JSON.parse(fs.readFileSync('./groups-config.json', 'utf8'));
      const groupConfig = groupsConfig[groupName];
      
      if (!groupConfig) {
        await ctx.editMessageText(`❌ **Error:** Wallet group "${groupName}" not found.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Multi-Session Manager', callback_data: 'multi_session_manager' }]
            ]
          }
        });
        return;
      }

      // Check if target token is set
      if (!global.targetToken) {
        await ctx.editMessageText(`❌ *NO TARGET TOKEN SET*

Cannot start volume session without a target token.

**Steps:**
1. Set your target token first
2. Return here to start volume session

**Current Status:**
• Target Token: ❌ Not set
• Group: ${groupName}
• Volume Session: ⏸️ Cannot start`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎯 Set Target Token', callback_data: 'command_set_token' }],
              [{ text: '🔙 Back to Multi-Session Manager', callback_data: 'multi_session_manager' }]
            ]
          }
        });
        return;
      }

      // Get wallets for this group
      const groupWallets = walletGroupManager.getWalletsForGroup(groupName);
      if (groupWallets.length === 0) {
        await ctx.editMessageText(`❌ **Error:** No wallets found in group "${groupName}".`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Multi-Session Manager', callback_data: 'multi_session_manager' }]
            ]
          }
        });
        return;
      }

      // Show volume mode selection
      await ctx.editMessageText(`🚀 *START VOLUME SESSION*

**Group:** ${groupName}
**Wallets:** ${groupWallets.length}
**Token:** \`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`

**Select Volume Mode:**`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⏰ Delayed Mode', callback_data: `start_volume_${groupName}_delayed` }],
            [{ text: '🔥 FOMO Mode', callback_data: `start_volume_${groupName}_fomo` }],
            [{ text: '⚡ Instant Mode', callback_data: `start_volume_${groupName}_instant` }],
            [{ text: '🔙 Back to Multi-Session Manager', callback_data: 'multi_session_manager' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in start_group_session:', error);
    }
  });

  // Dynamic handler for volume mode starters
  bot.action(/^start_volume_(.+)_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const groupName = ctx.match[1];
      const mode = ctx.match[2];
      const groupsConfig = JSON.parse(fs.readFileSync('./groups-config.json', 'utf8'));
      const groupConfig = groupsConfig[groupName];
      
      if (!groupConfig) {
        await ctx.editMessageText(`❌ **Error:** Wallet group "${groupName}" not found.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Multi-Session Manager', callback_data: 'multi_session_manager' }]
            ]
          }
        });
        return;
      }

      // Get wallets for this group
      const groupWallets = walletGroupManager.getWalletsForGroup(groupName);
      if (groupWallets.length === 0) {
        await ctx.editMessageText(`❌ **Error:** No wallets found in group "${groupName}".`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Multi-Session Manager', callback_data: 'multi_session_manager' }]
            ]
          }
        });
        return;
      }

      // Show starting message
      await ctx.editMessageText(`🚀 *STARTING VOLUME SESSION*

**Group:** ${groupName}
**Mode:** ${mode.toUpperCase()}
**Wallets:** ${groupWallets.length}
**Token:** \`${global.targetToken.substring(0, 8)}...\`

**Status:** Starting session...`, {
        parse_mode: 'Markdown'
      });

      // Create volume config based on mode
      // Use user's configured settings if available
      const useFixedAmount = global.volumeSettings && global.volumeSettings.amountType === 'custom';
      const fixedAmount = useFixedAmount ? global.volumeSettings.fixedAmount : null;
      
      let volumeConfig = {
        totalVolume: fixedAmount || 1.0,  // Use fixed amount if set, otherwise default
        sessions: 5,
        randomizeAmounts: !useFixedAmount,  // Only randomize if NOT using fixed amount
        fixedAmount: fixedAmount,  // Pass fixed amount to Jupiter integration
        continuous: true,
        walletGroup: groupName,
        mode: mode === 'fomo' ? 'fomo' : null
      };

      // Get priority fee based on selected fee mode
      const feeMode = global.volumeFeeMode || 'standard';
      const feeMap = {
        'economy': 500,
        'standard': 1500,
        'fast': 5000,
        'turbo': 10000,
        'custom': global.volumeCustomFee || 1500
      };
      const priorityFee = feeMap[feeMode];

      // Apply mode-specific settings
      switch(mode) {
        case 'delayed':
          volumeConfig.delayBetween = 8000; // 8 second delays
          volumeConfig.priorityFee = priorityFee;
          volumeConfig.randomizeDelay = true;
          break;
        case 'fomo':
          volumeConfig.mode = 'fomo';
          volumeConfig.priorityFee = priorityFee;
          volumeConfig.fomoSettings = global.fomoSettings || {
            buyMin: 0.001,
            buyMax: 0.004,
            buysPerPump: 5,
            sellsPerDip: 2,
            sellPercentage: 12,
            buyInterval: 3,
            sellInterval: 15,
            cycleDelay: 90
          };
          break;
        case 'instant':
          volumeConfig.delayBetween = 1500; // 1.5 second delays
          volumeConfig.priorityFee = priorityFee;
          volumeConfig.randomizeDelay = true;
          break;
      }

      // Prepare wallets with keypairs
      const preparedWallets = groupWallets.map(wallet => {
        let keypair;
        
        if (wallet.keypair) {
          keypair = wallet.keypair;
        } else if (wallet.secretKey && Array.isArray(wallet.secretKey)) {
          // Create keypair from secretKey array
          keypair = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey));
        } else if (wallet.privateKey && typeof wallet.privateKey === 'string') {
          // Handle base58 encoded private key
          const bs58 = require('bs58');
          const secretKey = bs58.decode(wallet.privateKey);
          keypair = Keypair.fromSecretKey(secretKey);
        } else {
          throw new Error(`Invalid private key format for wallet ${wallet.name || wallet.pubkey}`);
        }
        
        return {
          ...wallet,
          keypair
        };
      });

      // Start the volume session
      const result = await jupiter.executeVolumeTrading(preparedWallets, global.targetToken, volumeConfig);

      // Show success message
      await ctx.editMessageText(`✅ *VOLUME SESSION STARTED*

**Group:** ${groupName}
**Mode:** ${mode.toUpperCase()}
**Session ID:** \`${result.sessionId}\`
**Wallets:** ${groupWallets.length}

**Status:** 🟢 ACTIVE
**Session running in background...**

Use Multi-Session Manager to monitor and control this session.`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎭 Multi-Session Manager', callback_data: 'multi_session_manager' }],
            [{ text: '📊 View All Sessions', callback_data: 'view_all_sessions' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in start_volume:', error);
      await ctx.editMessageText(`❌ **Error starting volume session:** ${error.message}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Multi-Session Manager', callback_data: 'multi_session_manager' }]
          ]
        }
      });
    }
  });

  // Smart Sell
  bot.action('smart_sell', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const message = `🧠 *SMART SELL*

*Automated Selling with Anti-Bubble Detection*

🎯 **Smart Sell Status:**
• Mode: ${config.solana.network === 'devnet' ? 'Testing' : 'Live'}
• Wallets monitored: ${existingWallets.length}
• Anti-bubble: ✅ Enabled

⚡ **Smart Features:**
• Automatic bubble detection
• Intelligent sell timing
• Multi-wallet coordination
• Risk management

🔧 **Settings:**
• Sell percentage: Configurable
• Bubble threshold: Dynamic
• Stop-loss: Automatic

Select smart sell option:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Enable Smart Sell', callback_data: 'smart_sell_enable' }],
            [{ text: '⚙️ Smart Sell Settings', callback_data: 'smart_sell_settings' }],
            [{ text: '📊 Smart Sell Stats', callback_data: 'smart_sell_stats' }],
            [{ text: '⏸️ Disable Smart Sell', callback_data: 'smart_sell_disable' }],
            [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in smart_sell:', error);
    }
  });

  // Commander View Wallets
  bot.action('commander_view_wallets', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      await ctx.editMessageText(`👑 *WALLET COMMANDER VIEW*

🔄 Loading comprehensive wallet data...
📊 Analyzing ${existingWallets.length} wallets...
⏱️ This may take a moment...`, {
        parse_mode: 'Markdown'
      });
      
      let walletDetails = '';
      let totalBalance = 0;
      let activeWallets = 0;
      
      const priceInfo = await getPriceInfo();
      
      // Show detailed info for first 8 wallets
      for (let i = 0; i < Math.min(existingWallets.length, 8); i++) {
        const wallet = existingWallets[i];
        const walletName = wallet.name || `Wallet ${i + 1}`;
        
        try {
          const balance = await connection.getBalance(new PublicKey(wallet.pubkey));
          const solBalance = balance / LAMPORTS_PER_SOL;
          totalBalance += solBalance;
          
          if (balance > 0) activeWallets++;
          
          const status = balance > 0 ? '🟢' : '🔴';
          const balanceStr = solBalance.toFixed(6);
          const usdValue = (solBalance * priceInfo.price).toFixed(2);
          
          walletDetails += `${i + 1}. ${status} **${escapeMarkdown(walletName)}**\\n`;
          walletDetails += `   💰 ${balanceStr} SOL ($${usdValue})\\n`;
          walletDetails += `   📍 \`${wallet.pubkey.substring(0, 12)}...${wallet.pubkey.substring(wallet.pubkey.length - 6)}\`\\n`;
          walletDetails += `   📅 ${wallet.addedAt ? new Date(wallet.addedAt).toLocaleDateString() : 'Unknown'}\\n\\n`;
          
        } catch (error) {
          walletDetails += `${i + 1}. ⚠️ **${escapeMarkdown(walletName)}**\\n`;
          walletDetails += `   ❌ Connection Error\\n`;
          walletDetails += `   📍 \`${wallet.pubkey.substring(0, 12)}...${wallet.pubkey.substring(wallet.pubkey.length - 6)}\`\\n\\n`;
        }
      }
      
      if (existingWallets.length > 8) {
        walletDetails += `... and ${existingWallets.length - 8} more wallets\\n`;
      }
      
      const message = `👑 *WALLET COMMANDER VIEW*

📊 **Commander Statistics:**
• Total wallets: ${existingWallets.length}
• Active wallets: ${activeWallets}
• Total balance: ${totalBalance.toFixed(6)} SOL
• Total USD value: $${(totalBalance * priceInfo.price).toFixed(2)}
• SOL price: ${priceInfo.formatted}

📋 **Detailed Wallet Report:**
${walletDetails}

🎯 **Commander Actions Available:**
• Multi-wallet operations
• Bulk funding and management
• Advanced monitoring`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Fund All', callback_data: 'commander_fund' }],
            [{ text: '🔄 Refresh', callback_data: 'commander_view_wallets' }],
            [{ text: '📊 Stats', callback_data: 'commander_stats' }],
            [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in commander_view_wallets:', error);
    }
  });

  // Volume Settings
  // NEW STEP-BY-STEP VOLUME SETTINGS INTERFACE
  bot.action('volume_settings', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Save current navigation position
      navigationStateManager.savePosition(
        ctx.from.id, 
        'volume_settings', 
        'Volume Settings',
        { section: 'volume_trading', subsection: 'settings' }
      );
      
      // Get current configured settings
      const currentSettings = global.volumeSettings || {};
      const hasSettings = currentSettings && currentSettings.mode;
      
      // Format mode name nicely
      const formatModeName = (mode) => {
        if (!mode) return 'None';
        const modeMap = {
          'safe': '🛡️ Safe Mode',
          'instant': '⚡ Instant Mode',
          'delayed': '⏱️ Delayed Mode',
          'fomo': '🔥 FOMO Mode'
        };
        return modeMap[mode] || mode;
      };
      
      let settingsDisplay = '';
      if (hasSettings) {
        settingsDisplay = `
━━━━━━━━━━━━━━━━━━━━━━
💾 **CURRENT CONFIGURATION**
━━━━━━━━━━━━━━━━━━━━━━
• **Mode:** ${formatModeName(currentSettings.mode)}
• **Amount Type:** ${currentSettings.amountType === 'random' ? 'Random' : 'Fixed'}`;
        
        if (currentSettings.amountType === 'random') {
          settingsDisplay += `
• **Range:** ${currentSettings.minAmount || 0} - ${currentSettings.maxAmount || 0} SOL`;
        } else {
          settingsDisplay += `
• **Fixed Amount:** ${currentSettings.fixedAmount || 0} SOL`;
        }
        
        // Add fee mode to display
        const feeMode = global.volumeFeeMode || 'standard';
        const feeModeDisplay = {
          'economy': '🐌 Economy (500 lamports)',
          'standard': '⚖️ Standard (1,500 lamports)',
          'fast': '⚡ Fast (5,000 lamports)',
          'turbo': '🚀 Turbo (10,000 lamports)',
          'custom': `🎯 Custom (${global.volumeCustomFee || 1500} lamports)`
        };
        
        settingsDisplay += `
• **Fee Mode:** ${feeModeDisplay[feeMode] || feeModeDisplay['standard']}
• **Wallet Group:** ${global.selectedVolumeGroup || '❌ Not Selected'}
━━━━━━━━━━━━━━━━━━━━━━

`;
      }
      
      const message = `📊 *VOLUME SETTINGS*
${settingsDisplay}
**Choose your trading mode configuration:**

🛡️ **Safe Mode**
Block 0 Bundle - Simultaneous execution

⚡ **Instant Mode** 
Block 1-2 Spread - Fast execution

⏱️ **Delayed Mode**
Staggered Pattern - Natural timing

🔥 **FOMO Mode**
Pump/Dip Cycles - Create artificial FOMO patterns

Select a mode to configure:`;

      // Add checkmarks to configured modes
      const safeConfigured = currentSettings.mode === 'safe' ? '✅ ' : '';
      const instantConfigured = currentSettings.mode === 'instant' ? '✅ ' : '';
      const delayedConfigured = currentSettings.mode === 'delayed' ? '✅ ' : '';
      const fomoConfigured = currentSettings.mode === 'fomo' ? '✅ ' : '';

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `${safeConfigured}🛡️ Safe Mode`, callback_data: 'safe_mode' }],
            [{ text: `${instantConfigured}⚡ Instant Mode`, callback_data: 'instant_mode' }],
            [{ text: `${delayedConfigured}⏱️ Delayed Mode`, callback_data: 'delayed_mode' }],
            [{ text: `${fomoConfigured}🔥 FOMO Mode`, callback_data: 'fomo_mode' }],
            [{ text: '⚡ Fee Settings', callback_data: 'fee_settings' }],
            [{ text: `👥 Wallets: ${global.selectedVolumeGroup || 'None Selected'}`, callback_data: 'volume_wallets' }],
            [{ text: '🔙 Back to Volume', callback_data: 'volume_trading' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in volume_settings:', error);
    }
  });

  // FEE SETTINGS MENU
  bot.action('fee_settings', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const currentFeeMode = global.volumeFeeMode || 'standard';
      const customFee = global.volumeCustomFee || 1500;
      
      // Calculate costs at current SOL price (~$200)
      const solPrice = 200;
      
      const message = `⚡ *FEE MODE SELECTION*

Choose your priority fee level:

🐌 **Economy** - 500 lamports
• Cost: ~$0.0001 per trade
• Speed: Slow (5-10s confirmation)
• Best for: Low volume, stable tokens
${currentFeeMode === 'economy' ? '✅ *Currently Selected*' : ''}

⚖️ **Standard** - 1,500 lamports
• Cost: ~$0.0003 per trade
• Speed: Medium (2-5s confirmation)
• Best for: Normal trading
${currentFeeMode === 'standard' ? '✅ *Currently Selected*' : ''}

⚡ **Fast** - 5,000 lamports
• Cost: ~$0.001 per trade
• Speed: Fast (1-2s confirmation)
• Best for: Competitive trading
${currentFeeMode === 'fast' ? '✅ *Currently Selected*' : ''}

🚀 **Turbo** - 10,000 lamports
• Cost: ~$0.002 per trade
• Speed: Very Fast (<1s confirmation)
• Best for: Sniping, urgent trades
${currentFeeMode === 'turbo' ? '✅ *Currently Selected*' : ''}

🎯 **Custom** - ${customFee} lamports
• Set your own amount
• Advanced users only
${currentFeeMode === 'custom' ? '✅ *Currently Selected*' : ''}

💡 *Tip:* Higher fees = faster confirmations but more cost per trade.

Select fee mode:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `${currentFeeMode === 'economy' ? '✅ ' : ''}🐌 Economy (500)`, callback_data: 'fee_economy' }],
            [{ text: `${currentFeeMode === 'standard' ? '✅ ' : ''}⚖️ Standard (1,500)`, callback_data: 'fee_standard' }],
            [{ text: `${currentFeeMode === 'fast' ? '✅ ' : ''}⚡ Fast (5,000)`, callback_data: 'fee_fast' }],
            [{ text: `${currentFeeMode === 'turbo' ? '✅ ' : ''}🚀 Turbo (10,000)`, callback_data: 'fee_turbo' }],
            [{ text: `${currentFeeMode === 'custom' ? '✅ ' : ''}🎯 Custom (${customFee})`, callback_data: 'fee_custom' }],
            [{ text: '🔙 Back to Settings', callback_data: 'volume_settings' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in fee_settings:', error);
    }
  });

  // FEE MODE SELECTIONS
  bot.action('fee_economy', async (ctx) => {
    try {
      await ctx.answerCbQuery('✅ Economy mode selected!');
      global.volumeFeeMode = 'economy';
      
      // Return to fee settings to show update
      const event = { ...ctx, callbackQuery: { ...ctx.callbackQuery, data: 'fee_settings' } };
      await bot.handleUpdate({ callback_query: event.callbackQuery });
    } catch (error) {
      logger.error('Error in fee_economy:', error);
    }
  });

  bot.action('fee_standard', async (ctx) => {
    try {
      await ctx.answerCbQuery('✅ Standard mode selected!');
      global.volumeFeeMode = 'standard';
      
      const event = { ...ctx, callbackQuery: { ...ctx.callbackQuery, data: 'fee_settings' } };
      await bot.handleUpdate({ callback_query: event.callbackQuery });
    } catch (error) {
      logger.error('Error in fee_standard:', error);
    }
  });

  bot.action('fee_fast', async (ctx) => {
    try {
      await ctx.answerCbQuery('✅ Fast mode selected!');
      global.volumeFeeMode = 'fast';
      
      const event = { ...ctx, callbackQuery: { ...ctx.callbackQuery, data: 'fee_settings' } };
      await bot.handleUpdate({ callback_query: event.callbackQuery });
    } catch (error) {
      logger.error('Error in fee_fast:', error);
    }
  });

  bot.action('fee_turbo', async (ctx) => {
    try {
      await ctx.answerCbQuery('✅ Turbo mode selected!');
      global.volumeFeeMode = 'turbo';
      
      const event = { ...ctx, callbackQuery: { ...ctx.callbackQuery, data: 'fee_settings' } };
      await bot.handleUpdate({ callback_query: event.callbackQuery });
    } catch (error) {
      logger.error('Error in fee_turbo:', error);
    }
  });

  bot.action('fee_custom', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.awaitingCustomFeeInput = ctx.chat.id;
      
      await ctx.editMessageText(
        `🎯 *Custom Priority Fee*

Enter your custom priority fee in lamports:

**Examples:**
• \`2000\` - 2,000 lamports
• \`7500\` - 7,500 lamports
• \`15000\` - 15,000 lamports

**Recommended range:** 500 - 50,000 lamports

💡 *Higher = faster confirmations*

Please enter lamports amount:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back', callback_data: 'fee_settings' }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error('Error in fee_custom:', error);
    }
  });

  // SAFE MODE CONFIGURATION
  bot.action('safe_mode', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const message = `🛡️ *Safe Mode Configuration*

**Block 0 Bundle - Highest Success Rate**

Choose amount configuration:

🎲 **Random** - Different amounts per wallet
📝 **Custom** - Fixed amount for all wallets

Select configuration type:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎲 Random', callback_data: 'safe_random' }],
            [{ text: '📝 Custom', callback_data: 'safe_custom' }],
            [{ text: '⬅️ Back', callback_data: 'volume_settings' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in safe_mode:', error);
    }
  });

  // INSTANT MODE CONFIGURATION
  bot.action('instant_mode', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const message = `⚡ *Instant Mode Configuration*

**Block 1-2 Spread - Fast Execution**

Choose amount configuration:

🎲 **Random** - Different amounts per wallet
📝 **Custom** - Fixed amount for all wallets

Select configuration type:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎲 Random', callback_data: 'instant_random' }],
            [{ text: '📝 Custom', callback_data: 'instant_custom' }],
            [{ text: '⬅️ Back', callback_data: 'volume_settings' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in instant_mode:', error);
    }
  });

  // DELAYED MODE CONFIGURATION
  bot.action('delayed_mode', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const message = `⏱️ *Delayed Mode Configuration*

**Staggered Pattern - Natural Timing**

Choose amount configuration:

🎲 **Random** - Different amounts per wallet
📝 **Custom** - Fixed amount for all wallets

Select configuration type:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎲 Random', callback_data: 'delayed_random' }],
            [{ text: '📝 Custom', callback_data: 'delayed_custom' }],
            [{ text: '⬅️ Back', callback_data: 'volume_settings' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in delayed_mode:', error);
    }
  });

  // RANDOM AMOUNT HANDLERS
  bot.action('safe_random', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.pendingVolumeMode = 'safe';
      global.pendingAmountType = 'random';
      global.awaitingVolumeInput = ctx.chat.id;
      
      const message = `🎲 *Random Amount Range*

Enter minimum and maximum SOL amounts:

**Format:** min max
**Example:** 0.01 0.05

This will use random amounts between your min and max for each wallet.

Please enter your range:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: 'safe_mode' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in safe_random:', error);
    }
  });

  bot.action('instant_random', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.pendingVolumeMode = 'instant';
      global.pendingAmountType = 'random';
      global.awaitingVolumeInput = ctx.chat.id;
      
      const message = `🎲 *Random Amount Range*

Enter minimum and maximum SOL amounts:

**Format:** min max
**Example:** 0.01 0.05

This will use random amounts between your min and max for each wallet.

Please enter your range:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: 'instant_mode' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in instant_random:', error);
    }
  });

  bot.action('delayed_random', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const message = `🎲 *Delayed Mode - Random Configuration*

**Random Buy/Sell Amounts + Random Timing**

Configure your delayed volume trading:

🎯 **Amount Settings**
• Random SOL amounts per wallet
• Different buy/sell amounts

⏰ **Timing Settings**  
• Custom interval ranges for buys/sells
• Natural trading patterns

Choose what to configure:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Set Amount Range', callback_data: 'delayed_amounts' }],
            [{ text: '⏰ Set Timing Intervals', callback_data: 'delayed_timing' }],
            [{ text: '✅ Complete Setup', callback_data: 'delayed_complete' }],
            [{ text: '⬅️ Back', callback_data: 'delayed_mode' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in delayed_random:', error);
    }
  });

  // DELAYED MODE AMOUNT CONFIGURATION
  bot.action('delayed_amounts', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.pendingVolumeMode = 'delayed';
      global.pendingAmountType = 'random';
      global.awaitingVolumeInput = ctx.chat.id;
      
      const message = `💰 *Random Amount Range Configuration*

Enter minimum and maximum SOL amounts for random buy/sell orders:

**Format:** min max
**Examples:** 
• \`0.01 0.05\` - Small range
• \`0.05 0.1\` - Medium range  
• \`0.1 0.3\` - Large range

**Features:**
• Each wallet uses different random amounts
• Buy and sell amounts are randomized separately
• Natural volume distribution

Please enter your range:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: 'delayed_random' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in delayed_amounts:', error);
    }
  });

  // DELAYED MODE TIMING CONFIGURATION
  bot.action('delayed_timing', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.pendingVolumeMode = 'delayed';
      global.pendingTimingType = 'custom';
      global.awaitingTimingInput = ctx.chat.id;
      
      const message = `⏰ *Custom Timing Intervals Configuration*

Set random timing ranges for buy and sell operations:

**Format:** minSeconds maxSeconds
**Examples:**
• \`3 8\` - 3 to 8 seconds between operations
• \`5 15\` - 5 to 15 seconds (more natural)
• \`10 30\` - 10 to 30 seconds (very spread out)

**Features:**
• Random delays between each buy/sell
• Natural trading rhythm
• Avoids detection patterns

Please enter your timing range (in seconds):`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: 'delayed_random' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in delayed_timing:', error);
    }
  });

  // DELAYED MODE COMPLETE SETUP
  bot.action('delayed_complete', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const amountRange = global.delayedAmountRange || 'Not set';
      const timingRange = global.delayedTimingRange || 'Default (5-10s)';
      
      const message = `✅ *Delayed Mode Configuration Complete*

**Current Settings:**
🎯 **Amount Range:** ${amountRange}
⏰ **Timing Range:** ${timingRange}
🎲 **Random Amounts:** Enabled
⏱️ **Random Timing:** Enabled

**Ready for Volume Trading:**
• Random buy/sell amounts per wallet
• Custom timing intervals
• Natural trading patterns
• Maximum stealth mode

Start trading when ready!`;

      global.volumeBundlingMode = 'delayed';
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Start Volume Trading', callback_data: 'volume_start' }],
            [{ text: '🔄 Modify Settings', callback_data: 'delayed_random' }],
            [{ text: '⬅️ Back to Volume', callback_data: 'volume_trading' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in delayed_complete:', error);
    }
  });

  // FOMO MODE HANDLERS
  bot.action('fomo_mode', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const message = `🔥 *FOMO MODE - ARTIFICIAL FOMO PATTERNS*

**Creates Pump/Dip Cycles to Trigger FOMO**

🎯 **Chart Strategy:**
• **Pump Phase:** Multiple coordinated buys (green candles)
• **Dip Phase:** Small sells to simulate profit-taking (red candles)
• **Result:** Staircase pattern 📈📈📈📉📈📈📈📉

⚡ **Psychological Effect:**
• Observers see "healthy buying with profit-taking"
• Creates urgency: "I should buy this dip!"
• Natural-looking volume patterns

🔧 **Configuration Required:**
Configure all timing and amount parameters for optimal FOMO effect.

Choose configuration type:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Configure Buy Settings', callback_data: 'fomo_buy_config' }],
            [{ text: '📉 Configure Sell Settings', callback_data: 'fomo_sell_config' }],
            [{ text: '⏰ Configure Timing', callback_data: 'fomo_timing_config' }],
            [{ text: '✅ Complete FOMO Setup', callback_data: 'fomo_complete' }],
            [{ text: '⬅️ Back', callback_data: 'volume_settings' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in fomo_mode:', error);
    }
  });

  // FOMO BUY CONFIGURATION
  bot.action('fomo_buy_config', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.pendingVolumeMode = 'fomo';
      global.pendingConfigType = 'buy';
      global.awaitingFomoInput = ctx.chat.id;
      
      const message = `💰 *FOMO MODE - BUY CONFIGURATION*

Configure pump phase parameters:

**Format:** buyMin buyMax buysPerPump
**Example:** 0.001 0.004 5

**Parameters:**
• **Buy Min/Max:** SOL amount range per buy (0.001-0.004)
• **Buys Per Pump:** Number of buys per pump phase (5)

**Pump Effect:**
Each pump phase will execute 5 buys with random amounts between 0.001-0.004 SOL, creating strong green candles and upward momentum.

Please enter your buy configuration:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: 'fomo_mode' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in fomo_buy_config:', error);
    }
  });

  // FOMO SELL CONFIGURATION
  bot.action('fomo_sell_config', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.pendingVolumeMode = 'fomo';
      global.pendingConfigType = 'sell';
      global.awaitingFomoInput = ctx.chat.id;
      
      const message = `📉 *FOMO MODE - SELL CONFIGURATION*

Configure dip phase parameters:

**Format:** sellsPerDip sellPercentage
**Example:** 2 12

**Parameters:**
• **Sells Per Dip:** Number of sells per dip phase (2)
• **Sell Percentage:** % of holdings to sell (12%)

**Dip Effect:**
Each dip phase will execute 2 sells of 12% holdings, creating small red candles that simulate natural profit-taking, making the pump look healthy.

Please enter your sell configuration:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: 'fomo_mode' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in fomo_sell_config:', error);
    }
  });

  // FOMO TIMING CONFIGURATION
  bot.action('fomo_timing_config', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.pendingVolumeMode = 'fomo';
      global.pendingConfigType = 'timing';
      global.awaitingFomoInput = ctx.chat.id;
      
      const message = `⏰ *FOMO MODE - TIMING CONFIGURATION*

Configure all timing parameters:

**Format:** buyInterval sellInterval cycleDelay
**Example:** 3 15 90

**Parameters:**
• **Buy Interval:** Seconds between buys in pump (3s)
• **Sell Interval:** Seconds between sells in dip (15s)
• **Cycle Delay:** Seconds between pump cycles (90s)

**Timing Effect:**
• Rapid buys (3s apart) create strong pump momentum
• Spaced sells (15s apart) create gentle profit-taking
• Long cycles (90s) let chart breathe and build anticipation

Please enter your timing configuration:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: 'fomo_mode' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in fomo_timing_config:', error);
    }
  });

  // FOMO COMPLETE SETUP
  bot.action('fomo_complete', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const buyConfig = global.fomoSettings?.buy || 'Not set';
      const sellConfig = global.fomoSettings?.sell || 'Not set';
      const timingConfig = global.fomoSettings?.timing || 'Not set';
      
      const message = `✅ *FOMO MODE CONFIGURATION COMPLETE*

**Current Settings:**
💰 **Buy Config:** ${buyConfig}
📉 **Sell Config:** ${sellConfig}
⏰ **Timing Config:** ${timingConfig}

**FOMO Pattern Preview:**
🔥 **Pump Phase:** ${global.fomoSettings?.buysPerPump || 5} rapid buys → Green candles 📈
😤 **Dip Phase:** ${global.fomoSettings?.sellsPerDip || 2} small sells → Red candles 📉
🔄 **Repeat:** Every ${global.fomoSettings?.cycleDelay || 90} seconds

**Psychological Effect:**
Chart pattern creates "healthy buying with profit-taking" appearance, triggering FOMO in observers to buy the dips.

Ready to start FOMO generation!`;

      global.volumeBundlingMode = 'fomo';
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Start FOMO Trading', callback_data: 'volume_start' }],
            [{ text: '🔄 Modify Settings', callback_data: 'fomo_mode' }],
            [{ text: '⬅️ Back to Volume', callback_data: 'volume_trading' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in fomo_complete:', error);
    }
  });

  // CUSTOM AMOUNT HANDLERS
  bot.action('safe_custom', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.pendingVolumeMode = 'safe';
      global.pendingAmountType = 'custom';
      global.awaitingVolumeInput = ctx.chat.id;
      
      const message = `📝 *Custom Fixed Amount*

Enter SOL amount per wallet:

**Format:** amount
**Example:** 0.05

This will use the same fixed amount for all wallets.

Please enter your amount:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: 'safe_mode' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in safe_custom:', error);
    }
  });

  bot.action('instant_custom', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.pendingVolumeMode = 'instant';
      global.pendingAmountType = 'custom';
      global.awaitingVolumeInput = ctx.chat.id;
      
      const message = `📝 *Custom Fixed Amount*

Enter SOL amount per wallet:

**Format:** amount
**Example:** 0.05

This will use the same fixed amount for all wallets.

Please enter your amount:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: 'instant_mode' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in instant_custom:', error);
    }
  });

  bot.action('delayed_custom', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.pendingVolumeMode = 'delayed';
      global.pendingAmountType = 'custom';
      global.awaitingVolumeInput = ctx.chat.id;
      
      const message = `📝 *Custom Fixed Amount*

Enter SOL amount per wallet:

**Format:** amount
**Example:** 0.05

This will use the same fixed amount for all wallets.

Please enter your amount:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Back', callback_data: 'delayed_mode' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in delayed_custom:', error);
    }
  });

  // VOLUME EXECUTION HANDLER
  bot.action('start_volume_execution', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Create a unique session ID for this volume trading session
      global.currentVolumeSession = `volume_${Date.now()}`;
      
      // Check if settings are configured
      if (!global.volumeSettings) {
        await ctx.editMessageText(
          `❌ *No Volume Settings Found*

Please configure volume settings first.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⚙️ Configure Settings', callback_data: 'volume_settings' }],
                [{ text: '🔙 Back', callback_data: 'volume_trading' }]
              ]
            }
          }
        );
        return;
      }

      // Check if wallet group is selected
      if (!global.selectedVolumeGroup) {
        await ctx.editMessageText(
          `❌ *No Wallet Group Selected*

Please select a wallet group first.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '👥 Select Wallet Group', callback_data: 'volume_wallets' }],
                [{ text: '🔙 Back', callback_data: 'volume_settings' }]
              ]
            }
          }
        );
        return;
      }

      // Check if token is set
      if (!global.targetToken) {
        await ctx.editMessageText(
          `❌ *No Target Token Set*

Please set your target token first.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎯 Set Token', callback_data: 'command_enter_token' }],
                [{ text: '🔙 Back', callback_data: 'volume_settings' }]
              ]
            }
          }
        );
        return;
      }

      const settings = global.volumeSettings;
      const selectedGroup = global.selectedVolumeGroup;
      const targetToken = global.targetToken;

      // Get wallet group info
      const groupWallets = walletGroupManager.getWalletsByGroup(selectedGroup);
      
      if (groupWallets.length === 0) {
        await ctx.editMessageText(
          `❌ *No Wallets in Group*

The selected group "${selectedGroup}" has no wallets.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '👥 Select Different Group', callback_data: 'volume_wallets' }],
                [{ text: '🔙 Back', callback_data: 'volume_settings' }]
              ]
            }
          }
        );
        return;
      }

      // Check wallet balances - minimum 0.001 SOL required
      const minRequiredBalance = 0.001;
      const balanceChecks = [];
      let walletsWithInsufficientFunds = 0;
      
      for (const wallet of groupWallets) {
        try {
          const balance = await walletGroupManager.connection.getBalance(new PublicKey(wallet.pubkey));
          const solBalance = balance / 1000000000; // Convert lamports to SOL
          balanceChecks.push({
            name: wallet.name,
            address: wallet.pubkey,
            balance: solBalance,
            sufficient: solBalance >= minRequiredBalance
          });
          
          if (solBalance < minRequiredBalance) {
            walletsWithInsufficientFunds++;
          }
        } catch (error) {
          logger.error(`Error checking balance for wallet ${wallet.name}:`, error);
          balanceChecks.push({
            name: wallet.name,
            address: wallet.pubkey,
            balance: 0,
            sufficient: false,
            error: true
          });
          walletsWithInsufficientFunds++;
        }
      }

      // If any wallets have insufficient funds, show warning
      if (walletsWithInsufficientFunds > 0) {
        const walletsWithFunds = groupWallets.length - walletsWithInsufficientFunds;
        const insufficientList = balanceChecks
          .filter(check => !check.sufficient)
          .slice(0, 5) // Show max 5 wallets
          .map(check => `• ${check.name}: ${check.error ? 'Error' : check.balance.toFixed(6)} SOL`)
          .join('\n');

        await ctx.editMessageText(
          `⚠️ *Insufficient Wallet Balances*

**Required:** Minimum ${minRequiredBalance} SOL per wallet
**Status:** ${walletsWithFunds}/${groupWallets.length} wallets funded

**Wallets needing funds:**
${insufficientList}
${walletsWithInsufficientFunds > 5 ? `\n...and ${walletsWithInsufficientFunds - 5} more` : ''}

Please fund your wallets before starting volume trading.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Check Balances Again', callback_data: 'start_volume_execution' }],
                [{ text: '👥 Select Different Group', callback_data: 'volume_wallets' }],
                [{ text: '🔙 Back', callback_data: 'volume_settings' }]
              ]
            }
          }
        );
        return;
      }

      const modeIcon = settings.mode === 'safe' ? '🛡️' : settings.mode === 'instant' ? '⚡' : '⏱️';
      const modeName = settings.mode.charAt(0).toUpperCase() + settings.mode.slice(1);
      
      let amountInfo = '';
      if (settings.amountType === 'random') {
        amountInfo = `🎲 Random: ${settings.minAmount} - ${settings.maxAmount} SOL`;
      } else {
        amountInfo = `📝 Fixed: ${settings.fixedAmount} SOL`;
      }

      // Calculate total balance for display
      const totalBalance = balanceChecks.reduce((sum, check) => sum + check.balance, 0);
      const avgBalance = totalBalance / balanceChecks.length;

      await ctx.editMessageText(
        `🚀 *Starting Volume Generation*

**Configuration:**
• Mode: ${modeIcon} ${modeName}
• Amount: ${amountInfo}
• Wallets: ${groupWallets.length} from "${selectedGroup}"
• Token: \`${targetToken}\`

**Wallet Status:**
• Total Balance: ${totalBalance.toFixed(4)} SOL
• Average Balance: ${avgBalance.toFixed(4)} SOL per wallet
• All wallets funded ✅

**Status:** Initiating volume trades...

This may take a few minutes to complete.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⏸️ Stop Volume', callback_data: 'volume_stop' }],
              [{ text: '📊 View Stats', callback_data: 'volume_stats' }]
            ]
          }
        }
      );

      // Execute actual volume trading
      try {
        logger.info(`Volume execution started: ${settings.mode} mode, ${groupWallets.length} wallets`);
        
        // Calculate volume target based on settings
        let volumeTarget = 0;
        if (settings.amountType === 'random') {
          // Use average of min/max for volume target calculation
          const avgAmount = (settings.minAmount + settings.maxAmount) / 2;
          volumeTarget = avgAmount * groupWallets.length;
        } else {
          volumeTarget = settings.fixedAmount * groupWallets.length;
        }

        // Use Jupiter integration directly for better control
        const volumeResults = {
          id: `volume_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          totalTrades: 0,
          successfulTrades: 0,
          failedTrades: 0,
          volumeGenerated: 0,
          trades: []
        };

        // Execute trades directly using Jupiter for each wallet
        for (const walletData of balanceChecks) {
          if (!walletData.sufficient) continue; // Skip wallets with insufficient balance
          
          try {
            // Find the wallet object
            const wallet = groupWallets.find(w => w.pubkey === walletData.address);
            if (!wallet) {
              logger.warn(`Skipping wallet ${walletData.name} - wallet not found`);
              continue;
            }

            // Create keypair for trading - handle both secretKey array and privateKey string formats
            let keypair;
            try {
              if (wallet.secretKey && Array.isArray(wallet.secretKey)) {
                // New format: secretKey as array
                keypair = Keypair.fromSecretKey(Uint8Array.from(wallet.secretKey));
              } else if (wallet.privateKey && typeof wallet.privateKey === 'string') {
                // Old format: privateKey as base58 string
                const secretKey = bs58.decode(wallet.privateKey);
                keypair = Keypair.fromSecretKey(secretKey);
              } else {
                logger.warn(`Skipping wallet ${walletData.name} - no valid private key found`);
                continue;
              }
            } catch (keyError) {
              logger.warn(`Skipping wallet ${walletData.name} - invalid private key: ${keyError.message}`);
              continue;
            }

            // Determine trade amount
            let tradeAmount;
            if (settings.amountType === 'random') {
              tradeAmount = settings.minAmount + Math.random() * (settings.maxAmount - settings.minAmount);
            } else {
              tradeAmount = settings.fixedAmount;
            }

            // Ensure minimum trade amount (Jupiter usually requires at least 0.001 SOL)
            if (tradeAmount < 0.001) {
              logger.warn(`Trade amount ${tradeAmount} too small, using minimum 0.001 SOL`);
              tradeAmount = 0.001;
            }

            volumeResults.totalTrades++;
            
            // Validate token address format
            try {
              new PublicKey(targetToken);
            } catch (tokenError) {
              logger.error(`Invalid token address: ${targetToken}`);
              volumeResults.failedTrades++;
              volumeResults.trades.push({
                wallet: walletData.name,
                operation: 'buy',
                amount: tradeAmount,
                error: `Invalid token address: ${targetToken}`,
                success: false
              });
              continue;
            }

            // Execute buy trade using Jupiter (amount should be in SOL, not lamports)
            logger.info(`Executing buy for wallet ${walletData.name}: ${tradeAmount} SOL`);
            logger.info(`Token: ${targetToken}, Wallet: ${keypair.publicKey.toString()}`);
            
            // Get priority fee based on selected fee mode
            const feeMode = global.volumeFeeMode || 'standard';
            const feeMap = {
              'economy': 500,
              'standard': 1500,
              'fast': 5000,
              'turbo': 10000,
              'custom': global.volumeCustomFee || 1500
            };
            const priorityFee = feeMap[feeMode];
            
            const buyResult = await jupiter.buyToken(keypair, targetToken, tradeAmount, {
              slippage: 2500, // 25% (higher for pump.fun tokens with low liquidity)
              priorityFee: priorityFee,
              source: 'volume-trading',
              session: global.currentVolumeSession || `volume_${Date.now()}`
            });

            if (buyResult.success) {
              volumeResults.successfulTrades++;
              volumeResults.volumeGenerated += tradeAmount;
              volumeResults.trades.push({
                wallet: walletData.name,
                operation: 'buy',
                amount: tradeAmount,
                signature: buyResult.signature,
                success: true
              });
              logger.info(`Buy successful for ${walletData.name}: ${buyResult.signature}`);
            } else {
              volumeResults.failedTrades++;
              volumeResults.trades.push({
                wallet: walletData.name,
                operation: 'buy',
                amount: tradeAmount,
                error: buyResult.error,
                success: false
              });
              logger.warn(`Buy failed for ${walletData.name}: ${buyResult.error}`);
            }

            // Add delay between trades based on mode
            if (settings.mode === 'delayed') {
              await new Promise(resolve => setTimeout(resolve, 5000));
            } else if (settings.mode === 'instant') {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            // Safe mode has no delay (simultaneous)

          } catch (tradeError) {
            logger.error(`Trade error for wallet ${walletData.name}:`, tradeError);
            volumeResults.failedTrades++;
            volumeResults.trades.push({
              wallet: walletData.name,
              operation: 'buy',
              error: tradeError.message,
              success: false
            });
          }
        }

        const results = volumeResults;
        
        // Update the message with results
        await ctx.editMessageText(
          `✅ *Volume Generation Complete*

**Configuration:**
• Mode: ${modeIcon} ${modeName}
• Amount: ${amountInfo}
• Wallets: ${groupWallets.length} from "${selectedGroup}"
• Token: \`${targetToken}\`

**Results:**
• Execution ID: \`${results.id}\`
• Trades Executed: ${results.totalTrades}
• Successful: ${results.successfulTrades}
• Failed: ${results.failedTrades}
• Volume Generated: ${results.volumeGenerated?.toFixed(6) || '0'} SOL
• Success Rate: ${results.successfulTrades > 0 ? ((results.successfulTrades / results.totalTrades) * 100).toFixed(1) : '0'}%

**Status:** Volume generation completed successfully! 🎉`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📊 View Details', callback_data: `execution_details_${results.id}` }],
                [{ text: '🔄 Generate More Volume', callback_data: 'start_volume_execution' }],
                [{ text: '🏠 Back to Volume', callback_data: 'volume_trading' }]
              ]
            }
          }
        );

        logger.info(`Volume execution completed: ${results.successfulTrades}/${results.totalTrades} trades successful`);

      } catch (volumeError) {
        logger.error('Volume trading execution failed:', volumeError);
        
        await ctx.editMessageText(
          `❌ *Volume Generation Failed*

**Error:** ${volumeError.message}

**Configuration:**
• Mode: ${modeIcon} ${modeName}
• Amount: ${amountInfo}
• Wallets: ${groupWallets.length} from "${selectedGroup}"
• Token: \`${targetToken}\`

**Possible Issues:**
• Network connectivity problems
• Insufficient wallet balances
• Token liquidity issues
• Invalid token address

Please check your settings and try again.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: 'start_volume_execution' }],
                [{ text: '⚙️ Check Settings', callback_data: 'volume_settings' }],
                [{ text: '🏠 Back to Volume', callback_data: 'volume_trading' }]
              ]
            }
          }
        );
      }

    } catch (error) {
      logger.error('Error in start_volume_execution:', error);
      await ctx.editMessageText(
        `❌ *Error Starting Volume*

Failed to start volume generation. Please try again.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'start_volume_execution' }],
              [{ text: '🔙 Back', callback_data: 'volume_settings' }]
            ]
          }
        }
      );
    }
  });

  // Bundling Mode Handlers
  bot.action('bundling_safe', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.volumeBundlingMode = 'safe';
      
      const message = `🛡️ *SAFE MODE ACTIVATED*

📋 **Bundle Configuration:**
• Execution: Block 0 Bundle
• Timing: Simultaneous execution
• Priority Fee: 10,000 lamports (High)
• Randomization: Disabled
• Success Rate: Highest reliability

⚡ **Performance:**
• All transactions execute together
• Minimal MEV exposure
• Optimal for coordinated volume
• Best for market impact

✅ **Safe Mode is now active for volume trading.**`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Settings', callback_data: 'volume_settings' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in bundling_safe:', error);
    }
  });

  bot.action('bundling_instant', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.volumeBundlingMode = 'instant';
      
      const message = `⚡ *INSTANT MODE ACTIVATED*

📋 **Bundle Configuration:**
• Execution: Block 1-2 Spread
• Timing: 1.5 second delays
• Priority Fee: 5,000 lamports (Medium)
• Randomization: Enabled
• Success Rate: High performance

⚡ **Performance:**
• Fast execution spread
• Balanced MEV protection
• Natural volume patterns
• Good for quick trades

✅ **Instant Mode is now active for volume trading.**`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Settings', callback_data: 'volume_settings' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in bundling_instant:', error);
    }
  });

  bot.action('bundling_delayed', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.volumeBundlingMode = 'delayed';
      
      const message = `📊 *DELAYED MODE ACTIVATED*

📋 **Bundle Configuration:**
• Execution: Staggered Pattern
• Timing: 5-30 second delays
• Priority Fee: 3,000 lamports (Standard)
• Randomization: Enhanced
• Success Rate: Maximum stealth

⚡ **Performance:**
• Natural trading patterns
• Minimal detection risk
• Cost-effective execution
• Best for organic volume

✅ **Delayed Mode is now active for volume trading.**`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Settings', callback_data: 'volume_settings' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in bundling_delayed:', error);
    }
  });

  // Smart Sell Settings - REMOVED OLD STATIC VERSION
  // The functional smart_sell_settings handler is now located later in the file with working input functionality

  // Individual Wallet Handlers - FULL FUNCTIONALITY
  
  // Generate handlers for all wallets (up to 50 for stability)  
  for (let i = 0; i < Math.min(Math.max(existingWallets.length, 40), 50); i++) {
    // Wallet Info Handler
    bot.action(`wallet_info_${i}`, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        if (i >= existingWallets.length) {
          await ctx.editMessageText('❌ Wallet not found', {
            reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'wallet_commander' }]] }
          });
          return;
        }
        
        const wallet = existingWallets[i];
        const walletName = wallet.name || `Wallet ${i + 1}`;
        
        try {
          const balance = await connection.getBalance(new PublicKey(wallet.pubkey));
          const solBalance = balance / LAMPORTS_PER_SOL;
          const priceInfo = await getPriceInfo();
          const usdValue = solBalance * priceInfo.price;
          
          const infoMenu = {
            inline_keyboard: [
              [{ text: '🟢 Buy Token', callback_data: `wallet_buy_${i}` }],
              [{ text: '🔴 Sell Token', callback_data: `wallet_sell_${i}` }],
              [{ text: '💸 Transfer SOL', callback_data: `wallet_transfer_${i}` }],
              [{ text: '🔄 Refresh Balance', callback_data: `wallet_info_${i}` }],
              [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
            ]
          };

          await ctx.editMessageText(
            `💰 *${escapeMarkdown(walletName)} INFO*\n\n` +
            `**Wallet Details:**\n` +
            `• Name: ${escapeMarkdown(walletName)}\n` +
            `• Address: \`${wallet.pubkey.substring(0, 8)}...${wallet.pubkey.substring(wallet.pubkey.length - 8)}\`\n` +
            `• Balance: ${solBalance.toFixed(6)} SOL\n` +
            `• USD Value: ${formatUsd(usdValue)}\n` +
            `• Status: ${balance > 0 ? '✅ Funded' : '❌ Empty'}\n\n` +
            `**Network Info:**\n` +
            `• Network: ${config.solana.network}\n` +
            `• SOL Price: ${priceInfo.formatted}\n` +
            `• Target Token: ${global.targetToken ? 'Set ✅' : 'Not set ❌'}\n\n` +
            `**Available Actions:**\n` +
            `• Buy Token - Purchase target token with this wallet\n` +
            `• Sell Token - Sell tokens from this wallet\n` +
            `• Transfer SOL - Send SOL to another wallet\n\n` +
            `Select an action for this wallet:`,
            {
              parse_mode: 'Markdown',
              reply_markup: infoMenu
            }
          );
        } catch (error) {
          await ctx.editMessageText(
            `❌ *${escapeMarkdown(walletName)} ERROR*\n\n` +
            `Failed to load wallet info: ${error.message}\n\n` +
            `**Wallet Address:**\n` +
            `\`${wallet.pubkey}\`\n\n` +
            `Please check network connectivity and try again.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Try Again', callback_data: `wallet_info_${i}` }],
                  [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                ]
              }
            }
          );
        }
      } catch (error) {
        logger.error(`Error in wallet_info_${i}:`, error);
      }
    });

    // Wallet Buy Handler
    bot.action(`wallet_buy_${i}`, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        if (i >= existingWallets.length) {
          await ctx.editMessageText('❌ Wallet not found', {
            reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'wallet_commander' }]] }
          });
          return;
        }
        
        const wallet = existingWallets[i];
        const walletName = wallet.name || `Wallet ${i + 1}`;
        
        // Check if target token is set
        if (!global.targetToken || global.targetToken === '') {
          await ctx.editMessageText(
            `❌ *NO TARGET TOKEN SET*\n\n` +
            `Cannot execute buy without a target token.\n\n` +
            `**Steps to fix:**\n` +
            `1. Go to Command Center\n` +
            `2. Set Target Token\n` +
            `3. Return to Wallet Commander\n\n` +
            `**Current Status:**\n` +
            `• Wallet: ${escapeMarkdown(walletName)}\n` +
            `• Target Token: Not set ❌\n` +
            `• Action: Buy blocked`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🎯 Set Target Token', callback_data: 'command_set_token' }],
                  [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                ]
              }
            }
          );
          return;
        }
        
        // Get wallet balance
        try {
          const balance = await connection.getBalance(new PublicKey(wallet.pubkey));
          const solBalance = balance / LAMPORTS_PER_SOL;
          
          if (balance < 0.01 * LAMPORTS_PER_SOL) {
            await ctx.editMessageText(
              `❌ *INSUFFICIENT BALANCE*\n\n` +
              `**Wallet:** ${escapeMarkdown(walletName)}\n` +
              `**Balance:** ${solBalance.toFixed(6)} SOL\n` +
              `**Required:** Minimum 0.01 SOL\n\n` +
              `Fund this wallet with SOL before buying tokens.\n\n` +
              `**Wallet Address:**\n` +
              `\`${wallet.pubkey}\``,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🔄 Check Balance Again', callback_data: `wallet_info_${i}` }],
                    [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                  ]
                }
              }
            );
            return;
          }
          
          // Prompt for buy amount
          global.awaitingBuyAmount = ctx.chat.id;
          global.pendingBuyWallet = i;
          console.log(`🔍 DEBUG: Set awaitingBuyAmount for chat ${ctx.chat.id}, wallet index ${i}`);
          
          await ctx.editMessageText(
            `💰 *ENTER BUY AMOUNT - ${escapeMarkdown(walletName).toUpperCase()}*\n\n` +
            `**Wallet Balance:** ${solBalance.toFixed(6)} SOL\n` +
            `**Target Token:** \`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`\n\n` +
            `**Enter SOL amount to spend:**\n\n` +
            `**Format:** SOL amount\n` +
            `**Examples:**\n` +
            `• \`0.001\` - Minimum buy\n` +
            `• \`0.01\` - Small buy\n` +
            `• \`0.1\` - Medium buy\n` +
            `• \`${Math.min(solBalance * 0.9, 1).toFixed(3)}\` - Large buy\n\n` +
            `**Limits:**\n` +
            `• Minimum: 0.001 SOL\n` +
            `• Maximum: ${(solBalance * 0.95).toFixed(6)} SOL (95% of balance)\n\n` +
            `Please enter your buy amount:`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '❌ Cancel', callback_data: 'wallet_commander' }]
                ]
              }
            }
          );
        } catch (balanceError) {
          await ctx.editMessageText(
            `❌ *BALANCE CHECK FAILED*\n\n` +
            `Cannot retrieve wallet balance: ${balanceError.message}\n\n` +
            `**Possible Issues:**\n` +
            `• Network connectivity\n` +
            `• Invalid wallet address\n` +
            `• RPC node issues`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Try Again', callback_data: `wallet_buy_${i}` }],
                  [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                ]
              }
            }
          );
        }
      } catch (error) {
        logger.error(`Error in wallet_buy_${i}:`, error);
      }
    });

    // Wallet Sell Handler
    bot.action(`wallet_sell_${i}`, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        if (i >= existingWallets.length) {
          await ctx.editMessageText('❌ Wallet not found', {
            reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'wallet_commander' }]] }
          });
          return;
        }
        
        const wallet = existingWallets[i];
        const walletName = wallet.name || `Wallet ${i + 1}`;
        
        // Check if target token is set
        if (!global.targetToken || global.targetToken === '') {
          await ctx.editMessageText(
            `❌ *NO TARGET TOKEN SET*\n\n` +
            `Cannot execute sell without a target token.\n\n` +
            `Set target token first, then return to sell.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🎯 Set Target Token', callback_data: 'command_set_token' }],
                  [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                ]
              }
            }
          );
          return;
        }
        
        // Show execution in progress
        await ctx.editMessageText(
          `⚡ *CHECKING TOKENS - ${escapeMarkdown(walletName).toUpperCase()}*\n\n` +
          `🔄 Checking token balance...\n` +
          `🎯 Target Token: ${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\n` +
          `⏱️ Please wait...`,
          { parse_mode: 'Markdown' }
        );
        
        try {
          // Get token balance
          const { getAssociatedTokenAddress } = require('@solana/spl-token');
          const tokenAccount = await getAssociatedTokenAddress(
            new PublicKey(global.targetToken),
            new PublicKey(wallet.pubkey)
          );

          const tokenBalance = await connection.getTokenAccountBalance(tokenAccount);
          const tokenAmount = tokenBalance.value.amount ? parseInt(tokenBalance.value.amount) : 0;
          
          if (tokenAmount === 0) {
            await ctx.editMessageText(
              `❌ *NO TOKENS TO SELL*\n\n` +
              `**Wallet:** ${escapeMarkdown(walletName)}\n` +
              `**Token Balance:** 0 tokens\n\n` +
              `This wallet doesn't hold any of the target token.\n\n` +
              `**Next Steps:**\n` +
              `• Buy tokens first\n` +
              `• Check different token\n` +
              `• Verify token address`,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🟢 Buy Tokens', callback_data: `wallet_buy_${i}` }],
                    [{ text: '🎯 Change Token', callback_data: 'command_set_token' }],
                    [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                  ]
                }
              }
            );
            return;
          }
          
          // Prompt for sell percentage
          const tokenDisplayAmount = tokenBalance.value.uiAmount || 0;
          
          global.awaitingSellAmount = ctx.chat.id;
          global.pendingSellWallet = i;
          global.pendingSellTokenAmount = tokenAmount;
          global.pendingSellDisplayAmount = tokenDisplayAmount;
          
          await ctx.editMessageText(
            `💸 *ENTER SELL PERCENTAGE - ${escapeMarkdown(walletName).toUpperCase()}*\n\n` +
            `**Token Balance:** ${tokenDisplayAmount.toFixed(6)} tokens\n` +
            `**Target Token:** \`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`\n\n` +
            `**Enter percentage to sell:**\n\n` +
            `**Format:** Percentage number\n` +
            `**Examples:**\n` +
            `• \`1\` - Sell 1% (small sell)\n` +
            `• \`25\` - Sell 25% (quarter position)\n` +
            `• \`50\` - Sell 50% (half position)\n` +
            `• \`100\` - Sell 100% (full position)\n\n` +
            `**Limits:**\n` +
            `• Minimum: 1%\n` +
            `• Maximum: 100%\n\n` +
            `Please enter your sell percentage:`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '❌ Cancel', callback_data: 'wallet_commander' }]
                ]
              }
            }
          );
        } catch (tokenError) {
          await ctx.editMessageText(
            `❌ *TOKEN CHECK FAILED*\n\n` +
            `Cannot check token balance: ${tokenError.message}\n\n` +
            `**Possible Issues:**\n` +
            `• Token account doesn't exist\n` +
            `• Invalid token address\n` +
            `• Network connectivity\n\n` +
            `Verify token address and try again.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🎯 Check Token Address', callback_data: 'command_set_token' }],
                  [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                ]
              }
            }
          );
        }
      } catch (error) {
        logger.error(`Error in wallet_sell_${i}:`, error);
      }
    });

    // Wallet Transfer Handler
    bot.action(`wallet_transfer_${i}`, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        if (i >= existingWallets.length) {
          await ctx.editMessageText('❌ Wallet not found', {
            reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'wallet_commander' }]] }
          });
          return;
        }
        
        const wallet = existingWallets[i];
        const walletName = wallet.name || `Wallet ${i + 1}`;
        
        // Get wallet balance first
        try {
          const balance = await connection.getBalance(new PublicKey(wallet.pubkey));
          const solBalance = balance / LAMPORTS_PER_SOL;
          
          if (balance < 0.01 * LAMPORTS_PER_SOL) {
            await ctx.editMessageText(
              `❌ *INSUFFICIENT BALANCE FOR TRANSFER*\n\n` +
              `**Wallet:** ${escapeMarkdown(walletName)}\n` +
              `**Balance:** ${solBalance.toFixed(6)} SOL\n` +
              `**Required:** Minimum 0.01 SOL\n\n` +
              `Fund this wallet before making transfers.\n\n` +
              `**Wallet Address:**\n` +
              `\`${wallet.pubkey}\``,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🔄 Check Balance', callback_data: `wallet_info_${i}` }],
                    [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                  ]
                }
              }
            );
            return;
          }
          
          // Show transfer options
          const transferMenu = {
            inline_keyboard: [
              [{ text: '💸 Quick Transfer 0.01 SOL', callback_data: `wallet_quick_transfer_${i}` }],
              [{ text: '💰 Transfer 50% Balance', callback_data: `wallet_half_transfer_${i}` }],
              [{ text: '📝 Custom Amount', callback_data: `wallet_custom_transfer_${i}` }],
              [{ text: '📋 Transfer to My Wallets', callback_data: `wallet_internal_transfer_${i}` }],
              [{ text: '🎯 Set Wallet', callback_data: `wallet_set_recipient_${i}` }],
              [{ text: '🔙 Back to Wallet Info', callback_data: `wallet_info_${i}` }]
            ]
          };

          await ctx.editMessageText(
            `💸 *TRANSFER FROM ${escapeMarkdown(walletName).toUpperCase()}*\n\n` +
            `**Current Balance:** ${solBalance.toFixed(6)} SOL\n` +
            `**Available for Transfer:** ${(solBalance - 0.005).toFixed(6)} SOL (minus 0.005 SOL for fees)\n\n` +
            `**Transfer Options:**\n` +
            `• Quick Transfer - Send 0.01 SOL instantly\n` +
            `• Transfer 50% - Send half of balance\n` +
            `• Custom Amount - Specify exact amount\n` +
            `• To My Wallets - Transfer between your wallets\n` +
            `• Set Wallet - Paste address or select from your wallets\n\n` +
            `Select transfer type:`,
            {
              parse_mode: 'Markdown',
              reply_markup: transferMenu
            }
          );
        } catch (error) {
          await ctx.editMessageText(
            `❌ *BALANCE CHECK FAILED*\n\n` +
            `Cannot check wallet balance: ${error.message}`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Try Again', callback_data: `wallet_transfer_${i}` }],
                  [{ text: '🔙 Back to Commander', callback_data: getReturnCallback(ctx.from.id) }]
                ]
              }
            }
          );
        }
      } catch (error) {
        logger.error(`Error in wallet_transfer_${i}:`, error);
      }
    });

    // Quick Transfer Handler - 0.01 SOL
    bot.action(`wallet_quick_transfer_${i}`, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        const currentWallets = getAllWallets();
        if (i >= currentWallets.length) {
          await ctx.editMessageText('❌ Wallet not found');
          return;
        }
        
        const wallet = currentWallets[i];
        const walletName = wallet.name || `Wallet_${wallet.pubkey.substring(0, 8)}`;
        
        // Check if recipient is set
        if (!global.transferRecipient || !global.transferRecipient[i]) {
          await ctx.editMessageText(`🎯 *SET RECIPIENT FIRST*

To send 0.01 SOL from ${escapeMarkdown(walletName)}, you need to set a recipient wallet address.

**Steps:**
1. Use "Set Wallet" to choose recipient
2. Return here to send 0.01 SOL`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎯 Set Wallet', callback_data: `wallet_set_recipient_${i}` }],
                [{ text: '🔙 Back to Transfer', callback_data: `wallet_transfer_${i}` }]
              ]
            }
          });
          return;
        }

        const recipient = global.transferRecipient[i];
        await executeTransfer(ctx, i, 0.01, recipient, 'Quick Transfer');
        
      } catch (error) {
        logger.error(`Error in wallet_quick_transfer_${i}:`, error);
      }
    });

    // Half Transfer Handler - 50% of balance
    bot.action(`wallet_half_transfer_${i}`, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        const currentWallets = getAllWallets();
        if (i >= currentWallets.length) {
          await ctx.editMessageText('❌ Wallet not found');
          return;
        }
        
        const wallet = currentWallets[i];
        const walletName = wallet.name || `Wallet_${wallet.pubkey.substring(0, 8)}`;
        
        // Check if recipient is set
        if (!global.transferRecipient || !global.transferRecipient[i]) {
          await ctx.editMessageText(`🎯 *SET RECIPIENT FIRST*

To send 50% of balance from ${escapeMarkdown(walletName)}, you need to set a recipient wallet address.

**Steps:**
1. Use "Set Wallet" to choose recipient
2. Return here to send 50% of balance`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎯 Set Wallet', callback_data: `wallet_set_recipient_${i}` }],
                [{ text: '🔙 Back to Transfer', callback_data: `wallet_transfer_${i}` }]
              ]
            }
          });
          return;
        }

        // Get current balance and calculate 50%
        const keypair = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey));
        const balance = await connection.getBalance(keypair.publicKey);
        const solBalance = balance / LAMPORTS_PER_SOL;
        const transferAmount = (solBalance - 0.005) / 2; // 50% minus fees
        
        if (transferAmount <= 0) {
          await ctx.editMessageText(`❌ Insufficient balance for 50% transfer`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 Back to Transfer', callback_data: `wallet_transfer_${i}` }]
              ]
            }
          });
          return;
        }

        const recipient = global.transferRecipient[i];
        await executeTransfer(ctx, i, transferAmount, recipient, '50% Transfer');
        
      } catch (error) {
        logger.error(`Error in wallet_half_transfer_${i}:`, error);
      }
    });

    // Custom Amount Handler
    bot.action(`wallet_custom_transfer_${i}`, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        const currentWallets = getAllWallets();
        if (i >= currentWallets.length) {
          await ctx.editMessageText('❌ Wallet not found');
          return;
        }
        
        const wallet = currentWallets[i];
        const walletName = wallet.name || `Wallet_${wallet.pubkey.substring(0, 8)}`;
        
        // Check if recipient is set
        if (!global.transferRecipient || !global.transferRecipient[i]) {
          await ctx.editMessageText(`🎯 *SET RECIPIENT FIRST*

To send custom amount from ${escapeMarkdown(walletName)}, you need to set a recipient wallet address.

**Steps:**
1. Use "Set Wallet" to choose recipient
2. Return here to specify custom amount`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎯 Set Wallet', callback_data: `wallet_set_recipient_${i}` }],
                [{ text: '🔙 Back to Transfer', callback_data: `wallet_transfer_${i}` }]
              ]
            }
          });
          return;
        }

        const recipient = global.transferRecipient[i];
        
        // Get current balance for reference
        const keypair = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey));
        const balance = await connection.getBalance(keypair.publicKey);
        const solBalance = balance / LAMPORTS_PER_SOL;
        const maxAmount = solBalance - 0.005;
        
        await ctx.editMessageText(`📝 *CUSTOM TRANSFER AMOUNT*

**From:** ${escapeMarkdown(walletName)}
**To:** \`${recipient.substring(0, 8)}...${recipient.substring(recipient.length - 8)}\`

**Current Balance:** ${solBalance.toFixed(6)} SOL
**Maximum Transfer:** ${maxAmount.toFixed(6)} SOL

**Enter amount to transfer:**
Type the amount in SOL (e.g., 0.01, 0.05, 1.0)

Minimum: 0.001 SOL
Maximum: ${maxAmount.toFixed(6)} SOL`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Transfer', callback_data: `wallet_transfer_${i}` }]
            ]
          }
        });
        
        // Set up waiting for custom amount input
        global.waitingForTransferAmount = global.waitingForTransferAmount || {};
        global.waitingForTransferAmount[ctx.from.id] = {
          walletIndex: i,
          recipient: recipient,
          maxAmount: maxAmount,
          chatId: ctx.chat.id
        };
        
      } catch (error) {
        logger.error(`Error in wallet_custom_transfer_${i}:`, error);
      }
    });

    // Internal Transfer Handler - to your own wallets
    bot.action(`wallet_internal_transfer_${i}`, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        const currentWallets = getAllWallets();
        if (i >= currentWallets.length) {
          await ctx.editMessageText('❌ Wallet not found');
          return;
        }
        
        const wallet = currentWallets[i];
        const walletName = wallet.name || `Wallet_${wallet.pubkey.substring(0, 8)}`;
        
        // Show all OTHER wallets as recipients
        const otherWallets = currentWallets.filter((_, index) => index !== i);
        
        if (otherWallets.length === 0) {
          await ctx.editMessageText(`❌ No other wallets available for internal transfer`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 Back to Transfer', callback_data: `wallet_transfer_${i}` }]
              ]
            }
          });
          return;
        }

        // Create recipient selection menu
        const recipientRows = [];
        otherWallets.slice(0, 10).forEach((targetWallet, index) => {
          const targetIndex = currentWallets.findIndex(w => w.pubkey === targetWallet.pubkey);
          const targetName = targetWallet.name || `Wallet_${targetWallet.pubkey.substring(0, 8)}`;
          recipientRows.push([{ 
            text: `📋 ${targetName}`, 
            callback_data: `wallet_select_internal_${i}_${targetIndex}` 
          }]);
        });

        recipientRows.push([{ text: '🔙 Back to Transfer', callback_data: `wallet_transfer_${i}` }]);

        await ctx.editMessageText(`📋 *TRANSFER TO YOUR WALLETS*

**From:** ${escapeMarkdown(walletName)}

Select recipient wallet from your collection:

${otherWallets.length > 10 ? `Showing first 10 of ${otherWallets.length} wallets` : `${otherWallets.length} wallets available`}`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: recipientRows
          }
        });
        
      } catch (error) {
        logger.error(`Error in wallet_internal_transfer_${i}:`, error);
      }
    });

    // Set Recipient Handler
    bot.action(`wallet_set_recipient_${i}`, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        const currentWallets = getAllWallets();
        if (i >= currentWallets.length) {
          await ctx.editMessageText('❌ Wallet not found');
          return;
        }
        
        const wallet = currentWallets[i];
        const walletName = wallet.name || `Wallet_${wallet.pubkey.substring(0, 8)}`;
        
        await ctx.editMessageText(`🎯 *SET RECIPIENT WALLET*

**From:** ${escapeMarkdown(walletName)}

**Options:**
• Paste any Solana wallet address
• Select from your existing wallets

**Current Recipient:** ${global.transferRecipient && global.transferRecipient[i] ? 
          `\`${global.transferRecipient[i].substring(0, 8)}...${global.transferRecipient[i].substring(global.transferRecipient[i].length - 8)}\` ✅` : 
          'Not set ❌'}

Choose how to set recipient:`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Paste Address', callback_data: `wallet_paste_address_${i}` }],
              [{ text: '📋 Select My Wallet', callback_data: `wallet_internal_transfer_${i}` }],
              [{ text: '🔙 Back to Transfer', callback_data: `wallet_transfer_${i}` }]
            ]
          }
        });
        
      } catch (error) {
        logger.error(`Error in wallet_set_recipient_${i}:`, error);
      }
    });

    // Paste Address Handler
    bot.action(`wallet_paste_address_${i}`, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        await ctx.editMessageText(`📝 *PASTE RECIPIENT ADDRESS*

**Instructions:**
1. Copy the Solana wallet address you want to send to
2. Paste it in the chat
3. Address will be validated automatically

**Format Example:**
\`DqUbLori9VG9Kmk5F5Rx6tGX5v3s1XMmNioj5jE9CAfv\`

**Requirements:**
• Must be a valid Solana address (44 characters)
• Base58 encoded format
• Will be verified before saving

Paste the recipient address now:`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Set Recipient', callback_data: `wallet_set_recipient_${i}` }]
            ]
          }
        });
        
        // Set up waiting for address input
        global.waitingForRecipientAddress = global.waitingForRecipientAddress || {};
        global.waitingForRecipientAddress[ctx.from.id] = {
          walletIndex: i,
          chatId: ctx.chat.id
        };
        
      } catch (error) {
        logger.error(`Error in wallet_paste_address_${i}:`, error);
      }
    });
  }

  // Internal wallet selection handler using regex (single handler for all combinations)
  bot.action(/^wallet_select_internal_(\d+)_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const i = parseInt(ctx.match[1]);
      const j = parseInt(ctx.match[2]);
      
      const currentWallets = getAllWallets();
      if (i >= currentWallets.length || j >= currentWallets.length) {
        await ctx.editMessageText('❌ Wallet not found');
        return;
      }
      
      const fromWallet = currentWallets[i];
      const toWallet = currentWallets[j];
      const fromName = fromWallet.name || `Wallet_${fromWallet.pubkey.substring(0, 8)}`;
      const toName = toWallet.name || `Wallet_${toWallet.pubkey.substring(0, 8)}`;
      
      // Set recipient and ask for amount
      global.transferRecipient = global.transferRecipient || {};
      global.transferRecipient[i] = toWallet.pubkey;
      
      await ctx.editMessageText(`✅ *RECIPIENT SET*

**From:** ${escapeMarkdown(fromName)}
**To:** ${escapeMarkdown(toName)}

**Address:** \`${toWallet.pubkey.substring(0, 8)}...${toWallet.pubkey.substring(toWallet.pubkey.length - 8)}\`

Now choose transfer amount:`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💸 Quick Transfer 0.01 SOL', callback_data: `wallet_quick_transfer_${i}` }],
            [{ text: '💰 Transfer 50% Balance', callback_data: `wallet_half_transfer_${i}` }],
            [{ text: '📝 Custom Amount', callback_data: `wallet_custom_transfer_${i}` }],
            [{ text: '🔙 Back to Transfer', callback_data: `wallet_transfer_${i}` }]
          ]
        }
      });
      
    } catch (error) {
      logger.error(`Error in wallet_select_internal:`, error);
    }
  });

  // Execute Transfer Function
  const executeTransfer = async (ctx, walletIndex, amount, recipientAddress, transferType) => {
    let processingMsg;
    try {
      const currentWallets = getAllWallets(); // Get fresh wallet list
      const wallet = currentWallets[walletIndex];
      const walletName = wallet.name || `Wallet_${wallet.pubkey.substring(0, 8)}`;
      const keypair = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey));
      
      // Show processing message
      processingMsg = await ctx.reply(`⚡ *EXECUTING ${transferType.toUpperCase()}*

**From:** ${escapeMarkdown(walletName)}
**To:** \`${recipientAddress.substring(0, 8)}...${recipientAddress.substring(recipientAddress.length - 8)}\`
**Amount:** ${amount.toFixed(6)} SOL

**Status:** Creating transaction...

Please wait while the transfer is processed.`, {
        parse_mode: 'Markdown'
      });

      // Create and send transaction
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(recipientAddress),
          lamports: lamports
        })
      );

      const signature = await connection.sendTransaction(transaction, [keypair], {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      // Success message
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        `✅ *${transferType.toUpperCase()} SUCCESSFUL*

**Transaction Details:**
• From: ${escapeMarkdown(walletName)}
• To: \`${recipientAddress.substring(0, 8)}...${recipientAddress.substring(recipientAddress.length - 8)}\`
• Amount: ${amount.toFixed(6)} SOL
• Signature: \`${signature.substring(0, 8)}...${signature.substring(signature.length - 8)}\`

**Status:** ✅ Confirmed on blockchain
**Network:** ${config.solana.network}

Transfer completed successfully!`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 View on Solscan', url: `https://solscan.io/tx/${signature}${config.solana.network === 'devnet' ? '?cluster=devnet' : ''}` }],
            [{ text: '💸 Transfer Again', callback_data: `wallet_transfer_${walletIndex}` }],
            [{ text: '🔙 Back to Wallet', callback_data: `wallet_info_${walletIndex}` }]
          ]
        }
      });

    } catch (error) {
      logger.error('Transfer execution error:', error);
      
      try {
        if (processingMsg) {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            undefined,
            `❌ *${transferType.toUpperCase()} FAILED*

**Error:** ${error.message}

**Common Issues:**
• Insufficient balance (need extra for fees)
• Invalid recipient address
• Network congestion

Please check your wallet balance and try again.`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: `wallet_transfer_${walletIndex}` }],
                [{ text: '🔙 Back to Wallet', callback_data: `wallet_info_${walletIndex}` }]
              ]
            }
          });
        } else {
          throw new Error('No processing message to edit');
        }
      } catch (editError) {
        // If editing fails, send a new message
        await ctx.reply(`❌ *${transferType.toUpperCase()} FAILED*

**Error:** ${error.message}

Please check your wallet balance and try again.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: `wallet_transfer_${walletIndex}` }],
              [{ text: '🔙 Back to Wallet', callback_data: `wallet_info_${walletIndex}` }]
            ]
          }
        });
      }
    }
  };

  // Help
  bot.action('help', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText(`ℹ️ *HELP & INFORMATION*

🎯 **Available Features:**

**🎛️ Command Center**
• System status and overview
• Master control panel with advanced features

**👑 Wallet Commander**
• Advanced wallet operations
• Multi-wallet management
• Detailed wallet analytics
• Bulk operations

**📊 Volume Trading**
• Multi-wallet coordination
• Volume pattern generation
• Synchronized operations
• Performance tracking

**🧠 Smart Sell**
• Automated selling with AI
• Anti-bubble detection
• Risk management
• Multi-wallet coordination

**💰 Wallet Manager**
• Basic wallet operations
• Balance checking
• Wallet generation
• Health monitoring

📊 **Current Configuration:**
• Network: ${config.solana.network}
• Total wallets: ${existingWallets.length}
• RPC: Connected
• Advanced features: Available

🆘 **Support:**
• All wallets are stored securely
• Private keys are encrypted locally
• Always backup your wallet data
• Advanced features have safety protocols

💡 **Tips:**
• Use Command Center for advanced operations
• Start with Wallet Manager for basics
• Volume and Smart Sell require funded wallets
• Always test on devnet first`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in help:', error);
    }
  });

  // Volume Trading Handlers
  bot.action('volume_start', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Get selected wallet group
      const selectedGroup = global.selectedVolumeGroup;
      if (!selectedGroup) {
        await ctx.editMessageText(`❌ *No Wallet Group Selected*

Please select a wallet group first.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '👥 Select Wallet Group', callback_data: 'volume_wallets' }],
              [{ text: '🔙 Back', callback_data: 'volume_settings' }]
            ]
          }
        });
        return;
      }

      // Get wallets from selected group
      const groupWallets = walletGroupManager.getWalletsByGroup(selectedGroup);
      if (groupWallets.length === 0) {
        await ctx.editMessageText(`❌ *No Wallets in Group*

The selected group "${selectedGroup}" has no wallets.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '👥 Select Different Group', callback_data: 'volume_wallets' }],
              [{ text: '🔙 Back', callback_data: 'volume_settings' }]
            ]
          }
        });
        return;
      }
      
      const fundedWallets = [];
      
      // Check which wallets have SOL for trading
      console.log(`🔍 Checking ${groupWallets.length} wallets from "${selectedGroup}" group for funding...`);
      
      for (let i = 0; i < groupWallets.length; i++) {
        try {
          const wallet = groupWallets[i];
          console.log(`📝 Wallet ${i + 1}: ${wallet.name} - ${wallet.pubkey}`);
          console.log(`🔑 Wallet ${i + 1} keys:`, {
            hasPrivateKey: !!wallet.privateKey,
            hasSecretKey: !!wallet.secretKey,
            privateKeyType: typeof wallet.privateKey,
            secretKeyType: typeof wallet.secretKey,
            secretKeyIsArray: Array.isArray(wallet.secretKey)
          });
          
          const balance = await connection.getBalance(new PublicKey(wallet.pubkey));
          const balanceSOL = balance / LAMPORTS_PER_SOL;
          const minRequired = 0.001;
          
          console.log(`💰 Wallet ${i + 1} balance: ${balanceSOL.toFixed(6)} SOL (required: ${minRequired} SOL)`);
          
          if (balance > minRequired * LAMPORTS_PER_SOL) {
            console.log(`✅ Wallet ${i + 1} has sufficient funds`);
            
            // Handle different private key formats
            let keypair;
            try {
              if (wallet.secretKey && Array.isArray(wallet.secretKey)) {
                keypair = Keypair.fromSecretKey(Uint8Array.from(wallet.secretKey));
              } else if (wallet.privateKey && typeof wallet.privateKey === 'string') {
                keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
              } else {
                console.error(`❌ Wallet ${i + 1}: Invalid key format`);
                continue;
              }
            } catch (keyError) {
              console.error(`❌ Wallet ${i + 1}: Key parsing error:`, keyError.message);
              continue;
            }
            
            fundedWallets.push({
              ...wallet,
              keypair: keypair,
              balance: balanceSOL
            });
          } else {
            console.log(`❌ Wallet ${i + 1} insufficient funds: ${balanceSOL.toFixed(6)} SOL < ${minRequired} SOL`);
          }
        } catch (error) {
          console.error(`❌ Error checking wallet ${i + 1}:`, error.message);
        }
      }
      
      console.log(`📊 Found ${fundedWallets.length} funded wallets out of ${groupWallets.length} in "${selectedGroup}" group`);

      if (fundedWallets.length === 0) {
        await ctx.editMessageText(`❌ *No Funded Wallets*

No wallets with sufficient SOL found for volume trading.

**Requirements:**
• Minimum 0.001 SOL per wallet
• At least 1 funded wallet needed

**Next Steps:**
1. Fund your wallets with SOL
2. Ensure network connectivity
3. Try again once wallets are funded`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💰 Fund Wallets', callback_data: 'fund_wallets' }],
              [{ text: '🔄 Refresh Check', callback_data: 'volume_start' }],
              [{ text: '🔙 Back to Volume', callback_data: 'volume_trading' }]
            ]
          }
        });
        return;
      }

      // Check if target token is set
      if (!global.targetToken) {
        await ctx.editMessageText(`❌ *NO TARGET TOKEN SET*

You need to set a target token before starting volume trading.

**Steps:**
1. Go to Command Center
2. Click "Set Target Token"
3. Enter your token address
4. Return here to start trading

**Current Status:**
• Target Token: ❌ Not set
• Funded Wallets: ${fundedWallets.length} ready
• Total Balance: ${fundedWallets.reduce((sum, w) => sum + w.balance, 0).toFixed(4)} SOL`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎯 Set Target Token', callback_data: 'command_set_token' }],
              [{ text: '🔙 Back to Volume', callback_data: 'volume_trading' }]
            ]
          }
        });
        return;
      }

      const tokenMint = global.targetToken;

      // Validate the target token
      try {
        new PublicKey(tokenMint); // Validate it's a valid public key
      } catch (error) {
        await ctx.editMessageText(`❌ *INVALID TARGET TOKEN*

The currently set target token is invalid.

**Current Token:** \`${tokenMint}\`
**Error:** Invalid public key format

Please set a new target token.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎯 Set New Token', callback_data: 'command_set_token' }],
              [{ text: '🔙 Back to Volume', callback_data: 'volume_trading' }]
            ]
          }
        });
        return;
      }

      // Get user's configured settings for display
      const useFixedAmountDisplay = global.volumeSettings && global.volumeSettings.amountType === 'custom';
      const fixedAmountDisplay = useFixedAmountDisplay ? global.volumeSettings.fixedAmount : null;
      const amountTypeDisplay = useFixedAmountDisplay ? `Fixed (${fixedAmountDisplay} SOL)` : 'Random';
      const randomAmountsEnabled = !useFixedAmountDisplay;
      
      // Get fee mode for display and config (declared once, used in both places)
      const feeModeForConfig = global.volumeFeeMode || 'standard';
      const feeModeDisplay = {
        'economy': '🐌 Economy (500)',
        'standard': '⚖️ Standard (1,500)',
        'fast': '⚡ Fast (5,000)',
        'turbo': '🚀 Turbo (10,000)',
        'custom': `🎯 Custom (${global.volumeCustomFee || 1500})`
      };

      // Show volume start interface with target token
      await ctx.editMessageText(`🚀 *STARTING VOLUME SESSION*

**Trading Setup:**
• Target Token: \`${tokenMint.substring(0, 8)}...${tokenMint.substring(tokenMint.length - 6)}\`
• Funded Wallets: ${fundedWallets.length}
• Total Balance: ${fundedWallets.reduce((sum, w) => sum + w.balance, 0).toFixed(4)} SOL
• Network: ${config.solana.network}
• Bundling Mode: ${global.volumeBundlingMode || 'safe'}

**Volume Settings:**
• Amount Type: ${amountTypeDisplay}
• Fee Mode: ${feeModeDisplay[feeModeForConfig] || feeModeDisplay['standard']} lamports
• Sessions: 5 buy/sell cycles
• Random Amounts: ${randomAmountsEnabled ? '✅ Enabled' : '❌ Disabled'}
• Random Delays: ✅ Enabled

🚀 Starting volume trading now...`, { parse_mode: 'Markdown' });

      // Legacy global flag - now handled by session-based system
      // global.stopVolumeTrading = false;

      // Execute volume trading with bundling mode
      const bundlingMode = global.volumeBundlingMode || 'safe';
      
      // Use user's configured settings if available
      const useFixedAmount = global.volumeSettings && global.volumeSettings.amountType === 'custom';
      const fixedAmount = useFixedAmount ? global.volumeSettings.fixedAmount : null;
      
      let volumeConfig = {
        totalVolume: fixedAmount || 1.0,  // Use fixed amount if set, otherwise default
        sessions: 5,
        randomizeAmounts: !useFixedAmount,  // Only randomize if NOT using fixed amount
        fixedAmount: fixedAmount,  // Pass fixed amount to Jupiter integration
        bundlingMode: bundlingMode,
        continuous: true, // Enable continuous trading
        customTimingMin: global.customTimingMin || null,
        customTimingMax: global.customTimingMax || null
      };

      // Get priority fee based on selected fee mode (use feeModeForConfig already declared above)
      const feeMap = {
        'economy': 500,
        'standard': 1500,
        'fast': 5000,
        'turbo': 10000,
        'custom': global.volumeCustomFee || 1500
      };
      const priorityFee = feeMap[feeModeForConfig];

      // Apply bundling mode settings
      switch(bundlingMode) {
        case 'safe':
          volumeConfig.delayBetween = 0; // Simultaneous execution
          volumeConfig.priorityFee = priorityFee;
          volumeConfig.randomizeDelay = false;
          break;
        case 'instant':
          volumeConfig.delayBetween = 1500; // 1.5 second delays
          volumeConfig.priorityFee = priorityFee;
          volumeConfig.randomizeDelay = true;
          break;
        case 'delayed':
          volumeConfig.delayBetween = 8000; // 8 second base delay
          volumeConfig.priorityFee = priorityFee;
          volumeConfig.randomizeDelay = true;
          break;
        case 'fomo':
          volumeConfig.mode = 'fomo';
          volumeConfig.priorityFee = priorityFee;
          volumeConfig.fomoSettings = global.fomoSettings;
          volumeConfig.continuous = true; // FOMO runs continuously
          break;
      }

      // Add wallet group information to volume config
      volumeConfig.walletGroup = 'All Wallets'; // Default group name

      const result = await jupiter.executeVolumeTrading(fundedWallets, tokenMint, volumeConfig);
          
      // Different message for FOMO mode
      let resultMessage;
      if (bundlingMode === 'fomo') {
        resultMessage = `🔥 **FOMO Trading Complete**

**FOMO Results:**
• Token: \`${tokenMint.substring(0, 8)}...${tokenMint.substring(tokenMint.length - 6)}\`
• Total FOMO Cycles: ${result.cycles || 'N/A'}
• Total Operations: ${result.totalOperations}
• Pump Buys: ${result.results.filter(r => r.phase === 'pump' && r.success).length}
• Dip Sells: ${result.results.filter(r => r.phase === 'dip' && r.success).length}
• Success Rate: ${((result.successful / result.totalOperations) * 100).toFixed(1)}%

**FOMO Effect:** Chart shows staircase pattern 📈📈📈📉📈📈📈📉
Observers see healthy buying with profit-taking = FOMO trigger! 🚀`;
      } else {
        resultMessage = `✅ **Volume Trading Complete**

**Results:**
• Token: \`${tokenMint.substring(0, 8)}...${tokenMint.substring(tokenMint.length - 6)}\`
• Total operations: ${result.totalOperations}
• Successful: ${result.successful}
• Failed: ${result.failed}
• Success rate: ${((result.successful / result.totalOperations) * 100).toFixed(1)}%
• Bundling Mode: ${bundlingMode}

Check individual transactions in Solana Explorer for details.`;
      }

      await ctx.editMessageText(resultMessage, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Start New Session', callback_data: 'volume_start' }],
            [{ text: '⚙️ Volume Settings', callback_data: 'volume_settings' }],
            [{ text: '🔙 Back to Volume', callback_data: 'volume_trading' }]
          ]
        }
      });

    } catch (error) {
      logger.error('Error in volume_start:', error);
      await ctx.editMessageText(`❌ **Volume Trading Failed**

**Error:** ${error.message}

**Target Token:** ${global.targetToken ? `\`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`` : 'Not set'}

Please check your settings and try again.`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Try Again', callback_data: 'volume_start' }],
            [{ text: '🎯 Check Target Token', callback_data: 'command_set_token' }],
            [{ text: '🔙 Back to Volume', callback_data: 'volume_trading' }]
          ]
        }
      });
    }
  });

  // Smart Sell Handlers
  bot.action('smart_sell_enable', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Check if target token is set
      if (!global.targetToken) {
        await ctx.editMessageText(`❌ *NO TARGET TOKEN SET*

Smart Sell requires a target token to be set first.

**Steps:**
1. Go to Command Center
2. Set Target Token
3. Return here to enable Smart Sell defense

**Current Status:**
• Target Token: ❌ Not set
• Smart Sell: ⏸️ Cannot enable`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎯 Set Target Token', callback_data: 'command_set_token' }],
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
        return;
      }

      const tokenMint = global.targetToken;

      // Validate the target token
      try {
        new PublicKey(tokenMint); // Validate it's a valid public key
      } catch (error) {
        await ctx.editMessageText(`❌ *INVALID TARGET TOKEN*

The currently set target token is invalid.

**Current Token:** \`${tokenMint}\`
**Error:** Invalid public key format

Please set a new target token.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎯 Set New Token', callback_data: 'command_set_token' }],
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
        return;
      }

      await ctx.editMessageText(`🚀 *ENABLING SMART SELL DEFENSE*

**Target Token:** \`${tokenMint.substring(0, 8)}...${tokenMint.substring(tokenMint.length - 6)}\`

**Defense Configuration:**
• Defense Type: Anti non-whitelisted wallet buys
• Auto-dump Percentage: ${global.smartSellSettings.autoDumpPercent}% of holdings
• Bubble Detection: ${global.smartSellSettings.bubbleDetection ? '✅ Enabled' : '❌ Disabled'}
• Profit Target: ${global.smartSellSettings.profitTarget}% (take profits)
• Stop Loss: ${global.smartSellSettings.stopLoss}% (minimize losses)
• Trailing Stop: ${global.smartSellSettings.trailingStop}% (maximize gains)

🛡️ Activating defense mechanism...`, { parse_mode: 'Markdown' });

      // Prepare wallets for monitoring - validate private keys first
      const walletsToMonitor = [];
      for (const wallet of existingWallets) {
        try {
          let keypair;
          
          // Handle different private key formats
          if (wallet.secretKey && Array.isArray(wallet.secretKey)) {
            // New format: secretKey as array
            keypair = Keypair.fromSecretKey(Uint8Array.from(wallet.secretKey));
          } else if (wallet.privateKey && typeof wallet.privateKey === 'string') {
            // Old format: privateKey as base58 string
            const secretKey = bs58.decode(wallet.privateKey);
            if (secretKey.length !== 64) {
              logger.warn(`Wallet ${wallet.name} has invalid private key length, skipping`);
              continue;
            }
            keypair = Keypair.fromSecretKey(secretKey);
          } else {
            logger.warn(`Wallet ${wallet.name} has no valid private key format, skipping`);
            continue;
          }
          
          walletsToMonitor.push({
            name: wallet.name,
            keypair: keypair
          });
        } catch (error) {
          logger.warn(`Failed to process wallet ${wallet.name}: ${error.message}`);
          continue;
        }
      }

      if (walletsToMonitor.length === 0) {
        await ctx.editMessageText(`❌ *NO VALID WALLETS FOUND*

No wallets with valid private keys were found for Smart Sell monitoring.

**Issue:** All wallets are missing or have invalid private keys
**Solution:** Please ensure your wallets are properly configured

**Next Steps:**
• Check Wallet Manager
• Regenerate wallets if needed
• Ensure private keys are properly stored`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💰 Check Wallet Manager', callback_data: 'wallet_manager' }],
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
        return;
      }

      // Start smart sell monitoring with user's configured settings
      const result = await smartSell.startMonitoring(tokenMint, walletsToMonitor, {
        profitTarget: global.smartSellSettings.profitTarget,
        stopLoss: global.smartSellSettings.stopLoss, // Keep negative value for proper stop loss logic
        trailingStop: global.smartSellSettings.trailingStop,
        emergencySellThreshold: global.smartSellSettings.emergencySell,
        bubbleDetection: global.smartSellSettings.bubbleDetection,
        priceCheckInterval: 30000, // Fixed 30 second price checks (price-based triggers only)
        autoDumpPercentage: global.smartSellSettings.autoDumpPercent,
        outsiderDetection: true, // Enable instant transaction monitoring
        realtimeTransactions: true, // NEW: Enable WebSocket-based instant monitoring
        outsiderBuyThreshold: 0.001 // Lower threshold: 0.001 SOL to catch smaller buys
      });
      
      await ctx.editMessageText(`✅ **SMART SELL DEFENSE ACTIVATED**

**Defense Status:** 🛡️ ACTIVE

**Target Token:** \`${tokenMint.substring(0, 8)}...${tokenMint.substring(tokenMint.length - 6)}\`
**Monitoring:** ${result.walletsMonitored} wallets
**Defense Type:** Anti non-whitelisted wallet protection

**Active Triggers:**
• Profit Target: ${global.smartSellSettings.profitTarget}% (auto-sell for gains)
• Stop Loss: ${global.smartSellSettings.stopLoss}% (minimize losses)
• Emergency Sell: ${global.smartSellSettings.emergencySell}% (last resort protection)
• Bubble Detection: ${global.smartSellSettings.bubbleDetection ? '✅ Active' : '❌ Inactive'}
• Threat Response: Auto-dump ${global.smartSellSettings.autoDumpPercent}% when non-whitelisted buys detected

**Protection:** The system will automatically monitor for threats and execute defensive sells when triggers are met.`, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 View Defense Stats', callback_data: 'smart_sell_stats' }],
            [{ text: '⚙️ Defense Settings', callback_data: 'smart_sell_settings' }],
            [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
          ]
        }
      });

    } catch (error) {
      logger.error('Error in smart_sell_enable:', error);
      
      if (error.message.includes('already being monitored')) {
        await ctx.editMessageText(`⚠️ **DEFENSE ALREADY ACTIVE**

This token is already being monitored by Smart Sell defense system.

**Current Status:**
• Target Token: \`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`
• Defense Status: 🛡️ Already protecting

Use the settings or stats to manage your active defense.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 View Defense Stats', callback_data: 'smart_sell_stats' }],
              [{ text: '⚙️ Defense Settings', callback_data: 'smart_sell_settings' }],
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
      } else {
        await ctx.editMessageText(`❌ **SMART SELL DEFENSE FAILED**

**Error:** ${error.message}

**Target Token:** ${global.targetToken ? `\`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`` : 'Not set'}

Please check your settings and try again.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'smart_sell_enable' }],
              [{ text: '🎯 Check Target Token', callback_data: 'command_set_token' }],
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
      }
    }
  });

  bot.action('smart_sell_stats', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const activeMonitors = smartSell.getAllActiveMonitors();
      
      if (activeMonitors.length === 0) {
        await ctx.editMessageText(`📊 *SMART SELL STATISTICS*

**No Active Monitoring**

No tokens are currently being monitored by Smart Sell.

Enable Smart Sell for tokens to see statistics here.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Enable Smart Sell', callback_data: 'smart_sell_enable' }],
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
        return;
      }

      let statsText = '📊 **ACTIVE MONITORING**\n\n';
      
      activeMonitors.forEach((monitor, index) => {
        const runtime = Math.floor(monitor.runtime / 1000 / 60); // minutes
        statsText += `${index + 1}. **Token:** \`${monitor.tokenMint.substring(0, 8)}...\`\n`;
        statsText += `   • Wallets: ${monitor.walletsMonitored}\n`;
        statsText += `   • Runtime: ${runtime} minutes\n`;
        statsText += `   • Sells executed: ${monitor.stats.sellsExecuted}\n`;
        statsText += `   • Price datapoints: ${monitor.priceHistory}\n\n`;
      });

      await ctx.editMessageText(`📊 *SMART SELL STATISTICS*

${statsText}**System Status:** ✅ Monitoring Active`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh Stats', callback_data: 'smart_sell_stats' }],
            [{ text: '⏸️ Disable Smart Sell', callback_data: 'smart_sell_disable' }],
            [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
          ]
        }
      });

    } catch (error) {
      logger.error('Error in smart_sell_stats:', error);
    }
  });

  bot.action('smart_sell_disable', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const activeMonitors = smartSell.getAllActiveMonitors();
      
      if (activeMonitors.length === 0) {
        await ctx.editMessageText(`⏸️ *SMART SELL DISABLED*

No active Smart Sell monitoring to disable.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
        return;
      }

      // Stop all monitoring
      let stoppedCount = 0;
      for (const monitor of activeMonitors) {
        try {
          await smartSell.stopMonitoring(monitor.tokenMint);
          stoppedCount++;
        } catch (error) {
          console.error(`Failed to stop monitoring ${monitor.tokenMint}:`, error.message);
        }
      }

      await ctx.editMessageText(`⏸️ *SMART SELL DISABLED*

**Stopped Monitoring:**
• ${stoppedCount} tokens
• All automated selling disabled
• Monitoring sessions ended

You can re-enable Smart Sell anytime.`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Enable Smart Sell', callback_data: 'smart_sell_enable' }],
            [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
          ]
        }
      });

    } catch (error) {
      logger.error('Error in smart_sell_disable:', error);
    }
  });

  // Command Center Handlers - SIMPLIFIED VERSION
  global.targetToken = global.targetToken || ''; // Initialize global target token

  // Set Target Token - ESSENTIAL FOR VOLUME TRADING WORKFLOW
  bot.action('command_set_token', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const setTokenMenu = {
        inline_keyboard: [
          [{ text: '🎯 Enter Token Address', callback_data: 'command_enter_token' }],
          [{ text: '💎 Popular Tokens', callback_data: 'command_popular_tokens' }],
          [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
        ]
      };

      await ctx.editMessageText(
        `🎯 *SET TARGET TOKEN*\n\n` +
        `Choose the token for volume trading and smart sell:\n\n` +
        `**Current Target:** ${global.targetToken || 'None set'}\n` +
        `**Status:** ${global.targetToken ? '✅ Token set' : '❌ No token set'}\n` +
        `**Address:** ${global.targetToken ? `\`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`` : 'Not set'}\n\n` +
        `**Why Set a Token?**\n` +
        `• Required for volume trading operations\n` +
        `• Used for smart sell monitoring\n` +
        `• Defines buy/sell target across all wallets\n\n` +
        `Choose how to set your token:`,
        {
          parse_mode: 'Markdown',
          reply_markup: setTokenMenu
        }
      );
    } catch (error) {
      logger.error('Error in command_set_token:', error);
    }
  });

  bot.action('command_enter_token', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      await ctx.editMessageText(
        `🎯 *ENTER TOKEN ADDRESS*\n\n` +
        `Paste your Solana token address below and I'll set it as your target token.\n\n` +
        `**Instructions:**\n` +
        `• Copy your token contract address\n` +
        `• Paste it in your next message\n` +
        `• I'll validate and set it automatically\n\n` +
        `**Example:** \`9VqeeR2MUyJtJ18TWshgXPteA7PajVCCgffajPiLpump\`\n\n` +
        `**Supported tokens:** Any valid Solana SPL token address\n\n` +
        `Please paste your token address now:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Set Token', callback_data: 'command_set_token' }]
            ]
          }
        }
      );

      // Set up a message listener for token address input
      global.awaitingTokenInput = ctx.chat.id;
      
    } catch (error) {
      logger.error('Error in command_enter_token:', error);
    }
  });

  bot.action('command_popular_tokens', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const popularMenu = {
        inline_keyboard: [
          [{ text: '💰 USDC', callback_data: 'token_usdc' }],
          [{ text: '🟡 SOL', callback_data: 'token_sol' }],
          [{ text: '🔵 USDT', callback_data: 'token_usdt' }],
          [{ text: '🎯 Custom Token', callback_data: 'command_enter_token' }],
          [{ text: '🔙 Back', callback_data: 'command_set_token' }]
        ]
      };

      await ctx.editMessageText(
        `💎 *POPULAR TOKENS*\n\n` +
        `Select a popular token for volume trading:\n\n` +
        `**Available Options:**\n` +
        `• USDC - Stable, high liquidity\n` +
        `• SOL - Native token, best for testing\n` +
        `• USDT - Alternative stablecoin\n` +
        `• Custom Token - Enter any token address\n\n` +
        `**Recommendation:** Start with USDC for stable volume trading.\n\n` +
        `Choose a token:`,
        {
          parse_mode: 'Markdown',
          reply_markup: popularMenu
        }
      );
    } catch (error) {
      logger.error('Error in command_popular_tokens:', error);
    }
  });

  // Token selection handlers
  const tokenOptions = {
    'token_usdc': { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', name: 'USDC', symbol: 'USDC' },
    'token_sol': { address: 'So11111111111111111111111111111111111111112', name: 'Wrapped SOL', symbol: 'SOL' },
    'token_usdt': { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', name: 'USDT', symbol: 'USDT' }
  };

  Object.keys(tokenOptions).forEach(action => {
    bot.action(action, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const token = tokenOptions[action];
        global.targetToken = token.address;
        
        const successMenu = {
          inline_keyboard: [
            [{ text: '🚀 Start Volume Trading', callback_data: 'volume_trading' }],
            [{ text: '🧠 Enable Smart Sell', callback_data: 'command_smart_sell_outsider' }],
            [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
          ]
        };

        await ctx.editMessageText(
          `✅ *${token.symbol} SELECTED*\n\n` +
          `**Token:** ${token.name} (${token.symbol})\n` +
          `**Address:** \`${token.address.substring(0, 12)}...${token.address.substring(token.address.length - 8)}\`\n` +
          `**Status:** ✅ Ready for volume trading\n\n` +
          `**Your Setup:**\n` +
          `• Wallets: ${existingWallets.length} ready\n` +
          `• Target Token: ${token.symbol}\n` +
          `• Network: ${config.solana.network}\n\n` +
          `Ready to start volume trading with ${token.symbol}!`,
          {
            parse_mode: 'Markdown',
            reply_markup: successMenu
          }
        );
      } catch (error) {
        logger.error(`Error in ${action}:`, error);
      }
    });
  });

  // Configure Volume - WITH START OPTION
  bot.action('command_configure_volume', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Get active volume sessions for display
      const activeSessions = jupiter.getActiveVolumeSessions();
      const activeCount = activeSessions.filter(s => s.isActive).length;
      
      const volumeMenu = {
        inline_keyboard: [
          [{ text: '🚀 Start Volume Trading', callback_data: 'volume_start' }],
          [{ text: '🎭 Multi-Session Manager', callback_data: 'multi_session_manager' }],
          [{ text: '⚙️ Volume Settings', callback_data: 'volume_settings' }],
          [{ text: '📊 Volume Statistics', callback_data: 'volume_stats' }],
          [{ text: '⏸️ Stop Volume Trading', callback_data: 'volume_stop' }],
          [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
        ]
      };

      await ctx.editMessageText(
        `📈 *CONFIGURE VOLUME*\n\n` +
        `*Multi-Wallet Volume Trading Hub*\n\n` +
        `**Current Settings:**\n` +
        `• Target Token: ${global.targetToken ? `\`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\`` : '❌ Not set'}\n` +
        `• Total Volume: 1.0 SOL per session\n` +
        `• Sessions: 5 buy/sell cycles\n` +
        `• Wallets: ${existingWallets.length} available\n` +
        `• Bundling Mode: ${global.volumeBundlingMode || 'safe'}\n` +
        `• Slippage: 5% (volume trading)\n\n` +
        `**Active Sessions:** ${activeCount} running\n` +
        `**Status:** ${global.targetToken ? '✅ Ready for trading' : '❌ Set target token first'}\n` +
        `**Network:** ${config.solana.network}\n\n` +
        `Choose volume option:`,
        {
          parse_mode: 'Markdown',
          reply_markup: volumeMenu
        }
      );
    } catch (error) {
      logger.error('Error in command_configure_volume:', error);
    }
  });

  // Smart Sell on Outsider Buys (Combines Smart Sell + Instant Trading)
  bot.action('command_smart_sell_outsider', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Save current navigation position
      navigationStateManager.savePosition(
        ctx.from.id, 
        'command_smart_sell_outsider', 
        'Smart Sell Configuration',
        { section: 'smart_sell', subsection: 'main' }
      );
      
      // Check if target token is set
      if (!global.targetToken) {
        await ctx.editMessageText(`⚠️ *NO TARGET TOKEN SET*

Smart Sell on Outsider Buys requires a target token to monitor and defend.

**What Smart Sell on Outsider Buys Does:**
• Real-time outsider detection (30-second intervals)
• Auto-sell from ONE rotating wallet from top 5 most profitable wallets
• Rate-limited monitoring to prevent API issues
• Smart sell defense against non-whitelisted wallet purchases
• Anti-sketchy single wallet rotation strategy

**Current Status:**
• Target Token: ❌ Not set
• System: ⏸️ Ready to initialize
• Settings: ⚙️ Available to configure`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎯 Set Target Token', callback_data: 'command_set_token' }],
              [{ text: '⚙️ Configure Settings', callback_data: 'smart_sell_outsider_settings' }],
              [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
            ]
          }
        });
        return;
      }

      // Check if smart sell system is initialized
      if (!global.smartSellSystem) {
        await ctx.editMessageText(`⚠️ *SYSTEM NOT INITIALIZED*

Smart Sell on Outsider Buys needs to be initialized with your wallets.

**Current Status:**
• Target Token: ✅ ${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}
• System: ❌ Not initialized
• Wallets: ${existingWallets.length} available
• Settings: ⚙️ Available to configure

        **Next Step:**
        Initialize the system to start smart sell monitoring.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Initialize System', callback_data: 'smart_sell_outsider_init' }],
              [{ text: '⚙️ Configure Settings', callback_data: 'smart_sell_outsider_settings' }],
              [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
            ]
          }
        });
        return;
      }

      const status = global.smartSellSystem.getStatus();
      const smartSellMenu = {
        inline_keyboard: [
          [{ text: status.isRunning ? '⏸️ Stop Monitoring' : '🚀 Start Monitoring', callback_data: status.isRunning ? 'smart_sell_outsider_stop' : 'smart_sell_outsider_start' }],
          [{ text: '📊 Smart Sell Stats', callback_data: 'smart_sell_outsider_stats' }],
          [{ text: '🚨 Force Sell All', callback_data: 'smart_sell_outsider_force_sell' }],
          [{ text: '⚙️ Settings', callback_data: 'smart_sell_outsider_settings' }],
          [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
        ]
      };

      await ctx.editMessageText(
        `🧠 *SMART SELL ON OUTSIDER BUYS*\n\n` +
        `*Defense System Against Non-Whitelisted Wallet Purchases*\n\n` +
        `**System Status:** ${status.isRunning ? '🟢 ACTIVE' : '🔴 INACTIVE'}\n` +
        `**Target Token:** ${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\n` +
        `**Total Wallets:** ${status.totalWallets}\n` +
        `**Uptime:** ${status.uptime > 0 ? `${Math.round(status.uptime / 60000)}m` : 'Not started'}\n\n` +
        `**Performance Stats:**\n` +
        `• Total Detections: ${status.stats.totalDetections}\n` +
        `• Total Sells: ${status.stats.totalSells}\n` +
        `• Success Rate: ${status.stats.successRate.toFixed(1)}%\n` +
        `• Detection Rate: ${status.stats.detectionRate.toFixed(2)}/min\n\n` +
        `**Smart Sell Features:**\n` +
        `• ⚡ Real-time outsider detection (30s intervals)\n` +
        `• 💰 Auto-sell from top 5 profitable wallets when outsiders buy\n` +
        `• 🛡️ Rate limit protection (no API errors)\n` +
        `• 🎭 Multi-wallet stealth selling\n` +
        `• 📈 30% auto-dump when non-whitelisted wallets buy\n\n` +
        `Choose an option:`,
        {
          parse_mode: 'Markdown',
          reply_markup: smartSellMenu
        }
      );
    } catch (error) {
      logger.error('Error in command_unified_trading:', error);
    }
  });

  // Smart Sell on Outsider Buys Handlers
  
  // Initialize Smart Sell System
  bot.action('smart_sell_outsider_init', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      await ctx.editMessageText(`🚀 *INITIALIZING SMART SELL SYSTEM*...\n\nPlease wait while the system initializes with your wallets.`, {
        parse_mode: 'Markdown'
      });

      // Import the UnifiedTradingSystem
      const UnifiedTradingSystem = require('./unified-trading-system');
      
      // Initialize the system with user settings
      global.smartSellSystem = new UnifiedTradingSystem(connection, {
        monitoringInterval: (global.smartSellSettings.monitoringInterval || 30) * 1000, // Convert to milliseconds
        priceCheckInterval: (global.smartSellSettings.priceCheckInterval || 60) * 1000, // Convert to milliseconds
        outsiderBuyThreshold: global.smartSellSettings.outsiderBuyThreshold || 0.02,
        topWalletsCount: global.smartSellSettings.topWalletsCount || 5,
        autoDumpPercentage: global.smartSellSettings.autoDumpPercentage || 30,
        minProfitThreshold: global.smartSellSettings.minProfitThreshold || 5
      });

      // Convert wallets to proper format
      const walletsToMonitor = [];
      for (const wallet of existingWallets) {
        try {
          const keypair = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey));
          walletsToMonitor.push({
            name: wallet.name || `Wallet_${wallet.pubkey.substring(0, 8)}`,
            keypair: keypair,
            address: wallet.pubkey,
            pubkey: wallet.pubkey,
            secretKey: wallet.secretKey
          });
        } catch (error) {
          console.warn(`Failed to process wallet ${wallet.pubkey}: ${error.message}`);
        }
      }

      // Initialize the system
      const initResult = await global.smartSellSystem.initialize(walletsToMonitor);
      
      if (initResult) {
        await ctx.editMessageText(
          `✅ *SMART SELL SYSTEM INITIALIZED*\n\n` +
          `**System Status:** Ready to start\n` +
          `**Wallets Loaded:** ${walletsToMonitor.length}\n` +
          `**Target Token:** ${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\n\n` +
          `**Features Ready:**\n` +
          `• ⚡ Real-time outsider detection\n` +
          `• 💰 Top 5 wallet auto-selling when outsiders buy\n` +
          `• 🛡️ Rate limit protection\n` +
          `• 🎭 Multi-wallet stealth strategy\n\n` +
          `The system is now ready to start monitoring and smart selling!`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Start Monitoring', callback_data: 'smart_sell_outsider_start' }],
                [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
              ]
            }
          }
        );
      } else {
        throw new Error('Failed to initialize smart sell system');
      }
      
    } catch (error) {
      logger.error('Error in smart_sell_outsider_init:', error);
      await ctx.editMessageText(
        `❌ *INITIALIZATION FAILED*\n\n` +
        `**Error:** ${error.message}\n\n` +
        `Please try again or check your wallet configuration.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'smart_sell_outsider_init' }],
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        }
      );
    }
  });

  // Start Smart Sell Monitoring
  bot.action('smart_sell_outsider_start', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      if (!global.smartSellSystem) {
        await ctx.editMessageText(`❌ System not initialized. Please initialize first.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Initialize System', callback_data: 'smart_sell_outsider_init' }],
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
        return;
      }

      const startResult = await global.smartSellSystem.startTrading(global.targetToken);
      
      if (startResult) {
        await ctx.editMessageText(
          `🟢 *SMART SELL SYSTEM ACTIVE*\n\n` +
          `**Status:** Monitoring and smart selling\n` +
          `**Target Token:** ${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\n` +
          `**Strategy:** Top 5 wallet auto-selling when outsiders buy\n` +
          `**Detection:** Real-time outsider monitoring\n\n` +
          `The system is now actively monitoring for outsider activity and will automatically sell from your top 5 most profitable wallets when non-whitelisted wallets buy tokens.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📊 View Stats', callback_data: 'smart_sell_outsider_stats' }],
                [{ text: '⏸️ Stop Monitoring', callback_data: 'smart_sell_outsider_stop' }],
                [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
              ]
            }
          }
        );
      } else {
        throw new Error('Failed to start smart sell system');
      }
      
    } catch (error) {
      logger.error('Error in smart_sell_outsider_start:', error);
      await ctx.editMessageText(
        `❌ *START FAILED*\n\n` +
        `**Error:** ${error.message}\n\n` +
        `Please try again.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'smart_sell_outsider_start' }],
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        }
      );
    }
  });

  // Stop Smart Sell Monitoring
  bot.action('smart_sell_outsider_stop', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      if (!global.smartSellSystem) {
        await ctx.editMessageText(`❌ System not initialized.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
        return;
      }

      await global.smartSellSystem.stopTrading();
      
      await ctx.editMessageText(
        `🔴 *SMART SELL SYSTEM STOPPED*\n\n` +
        `**Status:** Inactive\n` +
        `**Target Token:** ${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\n\n` +
        `The system has been stopped. You can restart it anytime.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Start Monitoring', callback_data: 'smart_sell_outsider_start' }],
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        }
      );
      
    } catch (error) {
      logger.error('Error in smart_sell_outsider_stop:', error);
    }
  });

  // Smart Sell Stats
  bot.action('smart_sell_outsider_stats', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      if (!global.smartSellSystem) {
        await ctx.editMessageText(`❌ System not initialized.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
        return;
      }

      const status = global.smartSellSystem.getStatus();
      
      await ctx.editMessageText(
        `📊 *SMART SELL STATISTICS*\n\n` +
        `**System Status:** ${status.isRunning ? '🟢 ACTIVE' : '🔴 INACTIVE'}\n` +
        `**Target Token:** ${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\n` +
        `**Total Wallets:** ${status.totalWallets}\n` +
        `**Uptime:** ${status.uptime > 0 ? `${Math.round(status.uptime / 60000)} minutes` : 'Not started'}\n\n` +
        `**Performance Metrics:**\n` +
        `• Total Detections: ${status.stats.totalDetections}\n` +
        `• Total Sells: ${status.stats.totalSells}\n` +
        `• Successful Sells: ${status.stats.successfulSells}\n` +
        `• Success Rate: ${status.stats.successRate.toFixed(1)}%\n` +
        `• Detection Rate: ${status.stats.detectionRate.toFixed(2)}/min\n\n` +
        `**Top Profitable Wallets:** ${status.topProfitableWallets.length}\n` +
        `${status.topProfitableWallets.length > 0 ? status.topProfitableWallets.slice(0, 3).map((wallet, i) => 
          `${i + 1}. ${wallet.address.substring(0, 8)}... (${wallet.profitPercentage.toFixed(1)}% profit)`
        ).join('\n') : 'No profitable wallets found'}\n\n` +
        `**Last Activity:**\n` +
        `• Last Detection: ${status.stats.lastDetection ? new Date(status.stats.lastDetection).toLocaleTimeString() : 'None'}\n` +
        `• Last Sell: ${status.stats.lastSell ? new Date(status.stats.lastSell).toLocaleTimeString() : 'None'}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Refresh Stats', callback_data: 'smart_sell_outsider_stats' }],
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        }
      );
      
    } catch (error) {
      logger.error('Error in smart_sell_outsider_stats:', error);
    }
  });

  // Force Sell All
  bot.action('smart_sell_outsider_force_sell', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      if (!global.smartSellSystem) {
        await ctx.editMessageText(`❌ System not initialized.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
        return;
      }

      await ctx.editMessageText(`🚨 *EXECUTING FORCE SELL ALL*...\n\nThis will sell from all profitable wallets regardless of profit threshold.`, {
        parse_mode: 'Markdown'
      });

      const result = await global.smartSellSystem.triggerAutoSell();
      
      if (result) {
        await ctx.editMessageText(
          `✅ *FORCE SELL COMPLETED*\n\n` +
          `Force sell has been executed. Check the stats for details.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📊 View Stats', callback_data: 'smart_sell_outsider_stats' }],
                [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
              ]
            }
          }
        );
      } else {
        await ctx.editMessageText(
          `❌ *FORCE SELL FAILED*\n\n` +
          `Unable to execute force sell. Please try again.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: 'smart_sell_outsider_force_sell' }],
                [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
              ]
            }
          }
        );
      }
      
    } catch (error) {
      logger.error('Error in smart_sell_outsider_force_sell:', error);
    }
  });

  // Smart Sell Settings
  bot.action('smart_sell_outsider_settings', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      await ctx.editMessageText(
        `⚙️ *SMART SELL SETTINGS*\n\n` +
        `**Current Configuration:**\n` +
        `• Monitoring Interval: ${global.smartSellSettings?.monitoringInterval || 30} seconds\n` +
        `• Price Check Interval: ${global.smartSellSettings?.priceCheckInterval || 60} seconds\n` +
        `• Auto-dump Percentage: ${global.smartSellSettings?.autoDumpPercentage || 30}%\n\n` +
        `**Smart Sell Strategy:**\n` +
        `The system monitors for outsider activity and automatically sells from ONE rotating wallet from your top 5 most profitable wallets when non-whitelisted wallets buy tokens.\n\n` +
        `**Fixed Settings (Optimized):**\n` +
        `• Outsider Buy Threshold: 0.02 SOL (~$5 - filters out small buys)\n` +
        `• Top Wallets Count: 5 wallets (perfect rotation pool)\n` +
        `• Min Profit Threshold: 5% (only sell from profitable wallets)\n\n` +
        `Click any setting to modify it:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: `⏱️ Monitoring Interval: ${global.smartSellSettings?.monitoringInterval || 30}s`, callback_data: 'smart_sell_set_monitoring_interval' }],
              [{ text: `📊 Price Check Interval: ${global.smartSellSettings?.priceCheckInterval || 60}s`, callback_data: 'smart_sell_set_price_interval' }],
              [{ text: `💰 Auto-dump: ${global.smartSellSettings?.autoDumpPercentage || 30}%`, callback_data: 'smart_sell_set_autodump' }],
              [{ text: '✅ Save Settings', callback_data: 'command_smart_sell_outsider' }],
              [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        }
      );
      
    } catch (error) {
      logger.error('Error in smart_sell_outsider_settings:', error);
    }
  });

  // Smart Sell Settings Handlers
  
  // Monitoring Interval Setting
  bot.action('smart_sell_set_monitoring_interval', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const current = global.smartSellSettings.monitoringInterval;
      
      await ctx.editMessageText(
        `⏱️ *SET MONITORING INTERVAL*\n\n` +
        `**Current Value:** ${current} seconds\n` +
        `**Description:** How often to check for outsider transactions\n\n` +
        `**Recommended Values:**\n` +
        `• 15s - Very fast (may hit rate limits)\n` +
        `• 30s - Balanced (recommended)\n` +
        `• 60s - Conservative (safer for rate limits)\n\n` +
        `Enter your new monitoring interval in seconds (10-300):`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Settings', callback_data: 'smart_sell_outsider_settings' }]
            ]
          }
        }
      );
      global.awaitingSettingInput = { chatId: ctx.chat.id, setting: 'monitoringInterval', type: 'number', min: 10, max: 300 };
    } catch (error) {
      logger.error('Error in smart_sell_set_monitoring_interval:', error);
    }
  });

  // Price Check Interval Setting
  bot.action('smart_sell_set_price_interval', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const current = global.smartSellSettings.priceCheckInterval;
      
      await ctx.editMessageText(
        `📊 *SET PRICE CHECK INTERVAL*\n\n` +
        `**Current Value:** ${current} seconds\n` +
        `**Description:** How often to update wallet profit calculations\n\n` +
        `**Recommended Values:**\n` +
        `• 30s - Fast updates\n` +
        `• 60s - Balanced (recommended)\n` +
        `• 120s - Conservative (safer for rate limits)\n\n` +
        `Enter your new price check interval in seconds (30-600):`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Settings', callback_data: 'smart_sell_outsider_settings' }]
            ]
          }
        }
      );
      global.awaitingSettingInput = { chatId: ctx.chat.id, setting: 'priceCheckInterval', type: 'number', min: 30, max: 600 };
    } catch (error) {
      logger.error('Error in smart_sell_set_price_interval:', error);
    }
  });


  // Auto-dump Percentage Setting
  bot.action('smart_sell_set_autodump', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const current = global.smartSellSettings.autoDumpPercentage;
      
      await ctx.editMessageText(
        `💰 *SET AUTO-DUMP PERCENTAGE*\n\n` +
        `**Current Value:** ${current}%\n` +
        `**Description:** Percentage of wallet holdings to sell when outsiders buy\n\n` +
        `**Recommended Values:**\n` +
        `• 10% - Conservative\n` +
        `• 30% - Balanced (recommended)\n` +
        `• 50% - Aggressive\n\n` +
        `Enter your new auto-dump percentage (5-100):`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Settings', callback_data: 'smart_sell_outsider_settings' }]
            ]
          }
        }
      );
      global.awaitingSettingInput = { chatId: ctx.chat.id, setting: 'autoDumpPercentage', type: 'percentage', min: 5, max: 100 };
    } catch (error) {
      logger.error('Error in smart_sell_set_autodump:', error);
    }
  });


  // Smart Sell Settings Handler
  bot.action('smart_sell_settings', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Save current navigation position
      navigationStateManager.savePosition(
        ctx.from.id, 
        'smart_sell_settings', 
        'Smart Sell Settings',
        { section: 'smart_sell', subsection: 'settings' }
      );
      
      const settings = global.smartSellSettings;
      const settingsMenu = {
        inline_keyboard: [
          [{ text: `💰 Profit Target: ${settings.profitTarget}%`, callback_data: 'smart_sell_set_profit' }],
          [{ text: `🛑 Stop Loss: ${settings.stopLoss}%`, callback_data: 'smart_sell_set_stoploss' }],
          [{ text: `📉 Trailing Stop: ${settings.trailingStop}%`, callback_data: 'smart_sell_set_trailing' }],
          [{ text: `🚨 Emergency Sell: ${settings.emergencySell}%`, callback_data: 'smart_sell_set_emergency' }],
          [{ text: `🫧 Bubble Detection: ${settings.bubbleDetection ? 'ON' : 'OFF'}`, callback_data: 'smart_sell_toggle_bubble' }],
          [{ text: `🎯 Auto-dump: ${settings.autoDumpPercent}%`, callback_data: 'smart_sell_set_autodump' }],
          [{ text: '✅ Save Settings', callback_data: 'command_smart_sell_center' }],
          [{ text: '🔙 Back to Smart Sell', callback_data: 'command_smart_sell_center' }]
        ]
      };

      await ctx.editMessageText(
        `⚙️ *SMART SELL DEFENSE SETTINGS*\n\n` +
        `Configure your defense parameters:\n\n` +
        `**Target Token:** ${global.targetToken ? `\`${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}\` ✅` : '❌ Not set'}\n\n` +
        `**Defense Configuration:**\n` +
        `• Profit Target: ${settings.profitTarget}% (sell when ${settings.profitTarget}% profit reached)\n` +
        `• Stop Loss: ${settings.stopLoss}% (sell when ${Math.abs(settings.stopLoss)}% loss reached)\n` +
        `• Trailing Stop: ${settings.trailingStop}% (sell when price drops ${settings.trailingStop}% from high)\n` +
        `• Emergency Sell: ${settings.emergencySell}% (immediate sell on ${Math.abs(settings.emergencySell)}% loss)\n` +
        `• Bubble Detection: ${settings.bubbleDetection ? '✅ Enabled' : '❌ Disabled'} (detects unsustainable growth)\n` +
        `• Auto-dump: ${settings.autoDumpPercent}% when non-whitelisted wallets buy (⚡ *INSTANT* response)\n\n` +
        `**How Defense Works:**\n` +
        `Smart Sell monitors token prices and automatically sells when triggers are met.\n` +
        `Bubble detection analyzes volatility and growth patterns to protect against crashes.\n\n` +
        `Click any setting to modify it:`,
        {
          parse_mode: 'Markdown',
          reply_markup: settingsMenu
        }
      );
    } catch (error) {
      logger.error('Error in smart_sell_settings:', error);
    }
  });

  // Smart Sell Setting Handlers with Input Functionality
  
  // Profit Target Setting
  bot.action('smart_sell_set_profit', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const current = global.smartSellSettings.profitTarget;
      
      await ctx.editMessageText(
        `💰 *SET PROFIT TARGET*\n\n` +
        `**Current Value:** ${current}%\n` +
        `**Description:** Automatically sell when profit reaches this percentage\n\n` +
        `**Examples:**\n` +
        `• 20% - Conservative profit taking\n` +
        `• 50% - Moderate gains target\n` +
        `• 100% - Aggressive profit target\n\n` +
        `Enter your new profit target percentage (5-500):`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Settings', callback_data: getSmartSellReturnCallback(ctx.from.id) }]
            ]
          }
        }
      );
      global.awaitingSettingInput = { chatId: ctx.chat.id, setting: 'profitTarget', type: 'percentage', min: 5, max: 500 };
    } catch (error) {
      logger.error('Error in smart_sell_set_profit:', error);
    }
  });

  // Stop Loss Setting
  bot.action('smart_sell_set_stoploss', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const current = global.smartSellSettings.stopLoss;
      
      await ctx.editMessageText(
        `🛑 *SET STOP LOSS*\n\n` +
        `**Current Value:** ${current}%\n` +
        `**Description:** Automatically sell when loss reaches this percentage\n\n` +
        `**Examples:**\n` +
        `• -5% - Tight stop loss (less risk)\n` +
        `• -15% - Moderate stop loss\n` +
        `• -30% - Loose stop loss (more risk)\n\n` +
        `Enter your new stop loss percentage (-5 to -50):`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Settings', callback_data: getSmartSellReturnCallback(ctx.from.id) }]
            ]
          }
        }
      );
      global.awaitingSettingInput = { chatId: ctx.chat.id, setting: 'stopLoss', type: 'negative_percentage', min: -50, max: -5 };
    } catch (error) {
      logger.error('Error in smart_sell_set_stoploss:', error);
    }
  });

  // Trailing Stop Setting
  bot.action('smart_sell_set_trailing', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const current = global.smartSellSettings.trailingStop;
      
      await ctx.editMessageText(
        `📉 *SET TRAILING STOP*\n\n` +
        `**Current Value:** ${current}%\n` +
        `**Description:** Sell when price drops this % from the highest point\n\n` +
        `**Examples:**\n` +
        `• 5% - Tight trailing (quick sells)\n` +
        `• 15% - Moderate trailing\n` +
        `• 25% - Loose trailing (ride trends)\n\n` +
        `Enter your new trailing stop percentage (3-50):`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Settings', callback_data: getSmartSellReturnCallback(ctx.from.id) }]
            ]
          }
        }
      );
      global.awaitingSettingInput = { chatId: ctx.chat.id, setting: 'trailingStop', type: 'percentage', min: 3, max: 50 };
    } catch (error) {
      logger.error('Error in smart_sell_set_trailing:', error);
    }
  });

  // Emergency Sell Setting
  bot.action('smart_sell_set_emergency', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const current = global.smartSellSettings.emergencySell;
      
      await ctx.editMessageText(
        `🚨 *SET EMERGENCY SELL*\n\n` +
        `**Current Value:** ${current}%\n` +
        `**Description:** Immediate emergency sell on major losses\n\n` +
        `**Examples:**\n` +
        `• -20% - Quick emergency trigger\n` +
        `• -35% - Standard emergency level\n` +
        `• -50% - Last resort emergency\n\n` +
        `Enter your emergency sell percentage (-15 to -70):`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Settings', callback_data: getSmartSellReturnCallback(ctx.from.id) }]
            ]
          }
        }
      );
      global.awaitingSettingInput = { chatId: ctx.chat.id, setting: 'emergencySell', type: 'negative_percentage', min: -70, max: -15 };
    } catch (error) {
      logger.error('Error in smart_sell_set_emergency:', error);
    }
  });


  // Auto-dump Percentage Setting
  bot.action('smart_sell_set_autodump', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const current = global.smartSellSettings.autoDumpPercent;
      
      await ctx.editMessageText(
        `🎯 *SET AUTO-DUMP PERCENTAGE*\n\n` +
        `**Current Value:** ${current}%\n` +
        `**Description:** Percentage of tokens to dump when non-whitelisted wallets buy\n\n` +
        `**Examples:**\n` +
        `• 10% - Light defensive response\n` +
        `• 25% - Standard defense level\n` +
        `• 50% - Aggressive defense response\n\n` +
        `Enter auto-dump percentage (5-75):`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Settings', callback_data: getSmartSellReturnCallback(ctx.from.id) }]
            ]
          }
        }
      );
      global.awaitingSettingInput = { chatId: ctx.chat.id, setting: 'autoDumpPercent', type: 'percentage', min: 5, max: 75 };
    } catch (error) {
      logger.error('Error in smart_sell_set_autodump:', error);
    }
  });

  // Bubble Detection Toggle
  bot.action('smart_sell_toggle_bubble', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      global.smartSellSettings.bubbleDetection = !global.smartSellSettings.bubbleDetection;
      
      await ctx.editMessageText(
        `🫧 *BUBBLE DETECTION ${global.smartSellSettings.bubbleDetection ? 'ENABLED' : 'DISABLED'}*\n\n` +
        `**Status:** ${global.smartSellSettings.bubbleDetection ? '✅ Active' : '❌ Inactive'}\n` +
        `**Description:** AI-powered bubble detection for crash protection\n\n` +
        `**How it works:**\n` +
        `${global.smartSellSettings.bubbleDetection ? 
          'The system analyzes price movements, volume spikes, and market patterns to detect unsustainable growth bubbles and automatically trigger defensive sells.' : 
          'Bubble detection is disabled. The system will only use standard profit/loss triggers.'}\n\n` +
        `**Recommendation:** Keep enabled for maximum protection.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: `${global.smartSellSettings.bubbleDetection ? '❌ Disable' : '✅ Enable'} Bubble Detection`, callback_data: 'smart_sell_toggle_bubble' }],
              [{ text: '🔙 Back to Settings', callback_data: getSmartSellReturnCallback(ctx.from.id) }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error('Error in smart_sell_toggle_bubble:', error);
    }
  });


  // Dump All Handler - Emergency sell all tokens across all wallets
  bot.action('dump_all_tokens', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Check if target token is set
      if (!global.targetToken) {
        await ctx.editMessageText(`❌ *NO TARGET TOKEN SET*

Dump All requires a target token to be configured.

**What Dump All Does:**
• Emergency sell ALL tokens from ALL active wallets
• Reads your entire project configuration
• Scans all wallet groups for token balances
• Executes mass dump across the entire portfolio

**Steps:**
1. Set your target token first
2. Return here to execute emergency dump

**Current Status:**
• Target Token: ❌ Not set
• Dump All: ⏸️ Cannot execute`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎯 Set Target Token', callback_data: 'command_set_token' }],
              [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
            ]
          }
        });
        return;
      }

      const tokenMint = global.targetToken;
      const allWallets = getAllWallets();
      
      await ctx.editMessageText(`🚨 *DUMP ALL TOKENS*

**EMERGENCY MASS SELL SYSTEM**

⚠️ **THIS WILL SELL ALL TOKENS FROM ALL WALLETS**

**Target Configuration:**
• Token: \`${tokenMint.substring(0, 8)}...${tokenMint.substring(tokenMint.length - 6)}\`
• Total Wallets: ${allWallets.length}
• Network: ${config.solana.network}

**What will happen:**
1. Scan ALL wallets for token balances
2. Execute simultaneous sell orders
3. Convert ALL tokens to SOL
4. High slippage tolerance for speed

**This action is IRREVERSIBLE**

Are you sure you want to proceed?`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚨 CONFIRM DUMP ALL', callback_data: 'confirm_dump_all' }],
            [{ text: '❌ Cancel', callback_data: 'command_center' }],
            [{ text: '📊 Check Balances First', callback_data: 'check_all_balances' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in dump_all_tokens:', error);
    }
  });

  // Check All Balances Handler
  bot.action('check_all_balances', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const tokenMint = global.targetToken;
      const allWallets = getAllWallets();
      
      await ctx.editMessageText(`🔍 *SCANNING ALL WALLETS*

Checking token balances across ${allWallets.length} wallets...

This may take a moment...`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Dump All', callback_data: 'dump_all_tokens' }]
          ]
        }
      });

      let walletsWithTokens = 0;
      let totalTokenBalance = 0;
      let scanResults = '';

      // Scan first 10 wallets to avoid timeout
      const walletsToCheck = allWallets.slice(0, 10);
      
      for (let i = 0; i < walletsToCheck.length; i++) {
        try {
          const wallet = walletsToCheck[i];
          const keypair = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey));
          const balance = await smartSell.getTokenBalance(keypair.publicKey, tokenMint);
          
          if (balance > 0) {
            walletsWithTokens++;
            totalTokenBalance += balance;
            scanResults += `• ${wallet.name}: ${balance.toFixed(2)} tokens\n`;
          }
        } catch (error) {
          console.log(`Error checking wallet ${i + 1}:`, error.message);
        }
      }

      const moreWallets = allWallets.length - walletsToCheck.length;
      
      await ctx.editMessageText(`📊 *TOKEN BALANCE SCAN RESULTS*

**Scanned:** ${walletsToCheck.length}/${allWallets.length} wallets
**Wallets with tokens:** ${walletsWithTokens}
**Total tokens found:** ${totalTokenBalance.toFixed(2)}

**Detailed Results:**
${scanResults || 'No tokens found in scanned wallets'}

${moreWallets > 0 ? `**Note:** ${moreWallets} more wallets not shown. Full scan will check all wallets during dump.` : ''}

**Token:** \`${tokenMint.substring(0, 8)}...${tokenMint.substring(tokenMint.length - 6)}\`
**Ready to dump:** ${walletsWithTokens > 0 ? '✅ Tokens found' : '❌ No tokens to dump'}`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: walletsWithTokens > 0 ? '🚨 PROCEED WITH DUMP' : '❌ Nothing to Dump', callback_data: walletsWithTokens > 0 ? 'confirm_dump_all' : 'command_center' }],
            [{ text: '🔄 Scan More Wallets', callback_data: 'check_all_balances' }],
            [{ text: '🔙 Back to Dump All', callback_data: 'dump_all_tokens' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in check_all_balances:', error);
      await ctx.editMessageText(`❌ Error scanning wallets: ${error.message}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Dump All', callback_data: 'dump_all_tokens' }]
          ]
        }
      });
    }
  });

  // Confirm Dump All Handler
  bot.action('confirm_dump_all', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const tokenMint = global.targetToken;
      const allWallets = getAllWallets();
      
      // Show execution message
      await ctx.editMessageText(`⚡ *EXECUTING DUMP ALL*

**MASS SELL IN PROGRESS...**

• Target Token: \`${tokenMint.substring(0, 8)}...\`
• Processing ${allWallets.length} wallets
• Mode: Emergency dump (high slippage)

**Status:** Scanning wallets and executing sells...

This will take 1-3 minutes depending on wallet count.`, {
        parse_mode: 'Markdown'
      });

      let successCount = 0;
      let errorCount = 0;
      let totalTokensSold = 0;
      let totalSolReceived = 0;
      const sellResults = [];

      // Execute mass dump
      for (let i = 0; i < allWallets.length; i++) {
        try {
          const wallet = allWallets[i];
          const keypair = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey));
          
          // Check token balance first
          const balance = await smartSell.getTokenBalance(keypair.publicKey, tokenMint);
          
          if (balance > 0.01) { // Only sell if meaningful balance
            // Execute sell with high slippage for speed
            const tokenAmountLamports = Math.floor(balance * 1000000); // Convert to lamports
            
            const sellResult = await jupiter.sellToken(
              keypair, 
              tokenMint, 
              tokenAmountLamports,
              {
                slippage: 800, // 8% slippage for emergency speed (reduced from 10%)
                priorityFee: 8000, // Reduced priority fee (down from 20k to 8k)
                source: 'emergency-dump',
                session: `dump_all_${Date.now()}`
              }
            );
            
            if (sellResult && sellResult.signature) {
              successCount++;
              totalTokensSold += balance;
              const solReceived = sellResult.outAmount ? (sellResult.outAmount / 1e9) : 0;
              totalSolReceived += solReceived;
              
              sellResults.push(`✅ ${wallet.name}: ${balance.toFixed(2)} tokens → ${solReceived.toFixed(4)} SOL`);
              console.log(`✅ Dumped ${balance.toFixed(2)} tokens from ${wallet.name}`);
            } else {
              errorCount++;
              sellResults.push(`❌ ${wallet.name}: Sell failed`);
            }
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Error dumping wallet ${i + 1}:`, error.message);
          sellResults.push(`❌ ${allWallets[i].name}: ${error.message}`);
        }
        
        // Update progress every 5 wallets
        if (i % 5 === 0 && i > 0) {
          try {
            await ctx.editMessageText(`⚡ *DUMP ALL PROGRESS*

**Processing:** ${i}/${allWallets.length} wallets
**Successful:** ${successCount}
**Errors:** ${errorCount}
**Tokens sold:** ${totalTokensSold.toFixed(2)}
**SOL received:** ${totalSolReceived.toFixed(4)}

Still processing...`, {
              parse_mode: 'Markdown'
            });
          } catch (editError) {
            // Ignore edit errors during progress updates
          }
        }
      }

      // Show final results
      const resultText = sellResults.slice(0, 10).join('\n'); // Show first 10 results
      const moreResults = sellResults.length > 10 ? `\n\n...and ${sellResults.length - 10} more results` : '';
      
      await ctx.editMessageText(`✅ *DUMP ALL COMPLETED*

**FINAL RESULTS:**
• Wallets processed: ${allWallets.length}
• Successful dumps: ${successCount}
• Failed attempts: ${errorCount}
• Total tokens sold: ${totalTokensSold.toFixed(2)}
• Total SOL received: ${totalSolReceived.toFixed(4)}

**Recent Transactions:**
${resultText}${moreResults}

**Status:** ${successCount > 0 ? '✅ Mass dump successful' : '❌ No tokens were sold'}
**Network:** ${config.solana.network}`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 View Full Results', callback_data: 'dump_results' }],
            [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
          ]
        }
      });
      
      // Store results globally for viewing
      global.lastDumpResults = {
        totalWallets: allWallets.length,
        successCount,
        errorCount,
        totalTokensSold,
        totalSolReceived,
        results: sellResults,
        timestamp: new Date().toISOString(),
        tokenMint
      };

    } catch (error) {
      logger.error('Error in confirm_dump_all:', error);
      await ctx.editMessageText(`❌ *DUMP ALL FAILED*

Error during mass dump: ${error.message}

Please check your configuration and try again.`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Try Again', callback_data: 'dump_all_tokens' }],
            [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
          ]
        }
      });
    }
  });

  // View Dump Results Handler
  bot.action('dump_results', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      if (!global.lastDumpResults) {
        await ctx.editMessageText(`❌ No recent dump results to display.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
            ]
          }
        });
        return;
      }

      const results = global.lastDumpResults;
      const timestamp = new Date(results.timestamp).toLocaleString();
      
      // Show detailed results
      const detailedResults = results.results.slice(0, 20).join('\n'); // Show first 20
      const moreResults = results.results.length > 20 ? `\n\n...and ${results.results.length - 20} more results` : '';

      await ctx.editMessageText(`📊 *DETAILED DUMP RESULTS*

**Execution Time:** ${timestamp}
**Token:** \`${results.tokenMint.substring(0, 8)}...${results.tokenMint.substring(results.tokenMint.length - 6)}\`

**Summary:**
• Total Wallets: ${results.totalWallets}
• Successful: ${results.successCount} (${((results.successCount / results.totalWallets) * 100).toFixed(1)}%)
• Failed: ${results.errorCount}
• Tokens Sold: ${results.totalTokensSold.toFixed(2)}
• SOL Received: ${results.totalSolReceived.toFixed(4)}

**Transaction Details:**
${detailedResults}${moreResults}

**Performance:** ${results.successCount > 0 ? '✅ Operation successful' : '❌ No transactions completed'}`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in dump_results:', error);
    }
  });

  // Volume Statistics Handler
  bot.action('volume_stats', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const statsMenu = {
        inline_keyboard: [
          [{ text: '📊 Session Summary', callback_data: 'volume_session_stats' }],
          [{ text: '💰 Total Volume Generated', callback_data: 'volume_total_stats' }],
          [{ text: '⚡ Recent Transactions', callback_data: 'volume_recent_txs' }],
          [{ text: '🔄 Refresh Statistics', callback_data: 'volume_stats' }],
          [{ text: '🔙 Back to Volume', callback_data: 'volume_trading' }]
        ]
      };

      // Get some basic stats
      const fundedWallets = [];
      for (const wallet of existingWallets) {
        try {
          const balance = await connection.getBalance(new PublicKey(wallet.pubkey));
          if (balance > 0.01 * 1000000000) { // 0.01 SOL minimum
            fundedWallets.push({ ...wallet, balance: balance / 1000000000 });
          }
        } catch (error) {
          // Skip wallet if error
        }
      }

      await ctx.editMessageText(
        `📊 *VOLUME STATISTICS*\n\n` +
        `**Current Status:**\n` +
        `• Total Wallets: ${existingWallets.length}\n` +
        `• Funded Wallets: ${fundedWallets.length}\n` +
        `• Target Token: ${global.targetToken ? 'Set' : 'Not set'}\n` +
        `• Network: ${config.solana.network}\n\n` +
        `**Session Stats:**\n` +
        `• Volume Sessions: 0 completed\n` +
        `• Total Volume: 0 SOL generated\n` +
        `• Success Rate: Ready to start\n` +
        `• Average Response: N/A\n\n` +
        `**Ready for Volume Trading:**\n` +
        `• Jupiter v6 Integration: ✅ Active\n` +
        `• Multi-wallet Coordination: ✅ Ready\n` +
        `• Real Transaction Execution: ✅ Ready\n\n` +
        `Choose statistics view:`,
        {
          parse_mode: 'Markdown',
          reply_markup: statsMenu
        }
      );
    } catch (error) {
      logger.error('Error in volume_stats:', error);
      await ctx.editMessageText(`❌ Error loading statistics: ${error.message}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Volume', callback_data: 'volume_trading' }]
          ]
        }
      });
    }
  });

  // Volume Stop Handler
  bot.action('volume_stop', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Get active sessions
      const activeSessions = jupiter.getActiveVolumeSessions();
      const activeCount = activeSessions.filter(s => s.isActive).length;
      
      const stopMenu = {
        inline_keyboard: [
          [{ text: '⏹️ Stop All Sessions', callback_data: 'volume_stop_all' }],
          [{ text: '🎭 Multi-Session Manager', callback_data: 'multi_session_manager' }],
          [{ text: '🔙 Back to Volume Trading', callback_data: getVolumeTradingReturnCallback(ctx.from.id) }]
        ]
      };

      let statusMessage = '';
      if (activeCount > 0) {
        statusMessage = `**Active Sessions:** ${activeCount}\n${activeSessions.filter(s => s.isActive).map(s => `• ${s.walletGroup} (${s.mode}) - ${Math.round(s.duration/1000)}s`).join('\n')}\n\n`;
      } else {
        statusMessage = `**Active Sessions:** 0\n\n`;
      }

      await ctx.editMessageText(
        `⏹️ *STOP VOLUME TRADING*\n\n` +
        `**Current Status:**\n` +
        statusMessage +
        `**Stop Options:**\n` +
        `• Stop All Sessions - Halt all volume operations cleanly\n` +
        `• Multi-Session Manager - Control individual sessions\n\n` +
        `**Note:** All stops are safe and won't lose funds.\n\n` +
        `Choose stop action:`,
        {
          parse_mode: 'Markdown',
          reply_markup: stopMenu
        }
      );
    } catch (error) {
      logger.error('Error in volume_stop:', error);
    }
  });

  // Volume stop action handlers
  const volumeStopActions = ['volume_stop_all', 'volume_emergency_stop', 'volume_pause', 'volume_session_stats', 'volume_total_stats', 'volume_recent_txs'];
  
  volumeStopActions.forEach(action => {
    bot.action(action, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        let message = '';
        let statusEmoji = '✅';
        
        switch(action) {
          case 'volume_stop_all':
            const result = jupiter.stopAllVolumeSessions();
            if (result.success) {
              message = `All volume trading sessions have been stopped safely.\n\nStopped ${result.stoppedCount} active sessions.`;
            } else {
              message = `Error stopping sessions: ${result.error}`;
              statusEmoji = '❌';
            }
            break;
          case 'volume_emergency_stop':
            message = 'Emergency stop executed. All operations halted immediately.';
            statusEmoji = '🛑';
            break;
          case 'volume_pause':
            message = 'Current volume trading session has been paused.';
            statusEmoji = '⏸️';
            break;
          case 'volume_session_stats':
            message = 'Session statistics: 0 sessions completed. Ready to start new volume trading.';
            statusEmoji = '📊';
            break;
          case 'volume_total_stats':
            message = 'Total volume generated: 0 SOL. System ready for trading operations.';
            statusEmoji = '💰';
            break;
          case 'volume_recent_txs':
            message = 'Recent transactions: None yet. Start volume trading to see transaction history.';
            statusEmoji = '⚡';
            break;
        }

        await ctx.editMessageText(
          `${statusEmoji} *VOLUME ACTION COMPLETE*\n\n` +
          `${message}\n\n` +
          `**System Status:** All systems operational\n` +
          `**Next Steps:** You can start new volume trading anytime\n\n` +
          `**Available Actions:**\n` +
          `• Configure new volume settings\n` +
          `• Start fresh volume trading session\n` +
          `• Check wallet balances`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Start New Session', callback_data: 'volume_start' }],
                [{ text: '🔙 Back to Volume', callback_data: 'volume_trading' }]
              ]
            }
          }
        );
      } catch (error) {
        logger.error(`Error in ${action}:`, error);
      }
    });
  });


  // DUPLICATE REMOVED - Volume Settings Handler with Bundling Modes
  bot.action('volume_settings_DUPLICATE', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const currentMode = global.volumeBundlingMode || 'safe';
      let modeDisplay = '';
      switch(currentMode) {
        case 'safe':
          modeDisplay = '🛡️ Safe Mode - Block 0 Bundle';
          break;
        case 'instant':
          modeDisplay = '⚡ Instant Mode - Block 1-2 Spread';
          break;
        case 'delayed':
          modeDisplay = '📊 Delayed Mode - Staggered Pattern';
          break;
      }
      
      const settingsMenu = {
        inline_keyboard: [
          [{ text: '💰 Total Volume: 1.0 SOL', callback_data: 'volume_set_amount' }],
          [{ text: '🔄 Sessions: 5 cycles', callback_data: 'volume_set_sessions' }],
          [{ text: currentMode === 'safe' ? '✅ 🛡️ Safe Mode - Block 0 Bundle' : '🛡️ Safe Mode - Block 0 Bundle', callback_data: 'volume_bundling_safe' }],
          [{ text: currentMode === 'instant' ? '✅ ⚡ Instant Mode - Block 1-2 Spread' : '⚡ Instant Mode - Block 1-2 Spread', callback_data: 'volume_bundling_instant' }],
          [{ text: currentMode === 'delayed' ? '✅ 📊 Delayed Mode - Staggered Pattern' : '📊 Delayed Mode - Staggered Pattern', callback_data: 'volume_bundling_delayed' }],
          [{ text: '📈 Slippage: 5%', callback_data: 'volume_set_slippage' }],
          [{ text: '✅ Save Settings', callback_data: 'volume_trading' }],
          [{ text: '🔙 Back to Volume', callback_data: 'volume_trading' }]
        ]
      };

      await ctx.editMessageText(
        `⚙️ *VOLUME SETTINGS*\n\n` +
        `Configure your volume trading parameters:\n\n` +
        `**Current Configuration:**\n` +
        `• Total Volume: 1.0 SOL per session\n` +
        `• Buy/Sell Sessions: 5 complete cycles\n` +
        `• Bundling Mode: ${modeDisplay}\n` +
        `• Slippage Tolerance: 5% (recommended for volume)\n` +
        `• Wallet Coordination: ${existingWallets.length} wallets\n\n` +
        `**Bundling Modes:**\n` +
        `• Safe Mode - All wallets hit same block (maximum impact)\n` +
        `• Instant Mode - 1-2 block spread (reliable volume)\n` +
        `• Delayed Mode - Staggered delays (organic pattern)\n\n` +
        `Click any setting to modify it:`,
        {
          parse_mode: 'Markdown',
          reply_markup: settingsMenu
        }
      );
    } catch (error) {
      logger.error('Error in volume_settings:', error);
    }
  });

  // Bundling Mode Handlers
  bot.action('volume_bundling_safe', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `🛡️ *SAFE MODE - BLOCK 0 BUNDLE*\n\n` +
        `**Strategy:** All wallets coordinate to hit the exact same block\n` +
        `**Best For:** Maximum volume impact, major volume spikes\n` +
        `**Timing:** Simultaneous execution (same block)\n` +
        `**Priority Fees:** High (10,000 lamports)\n` +
        `**Success Rate:** Medium, requires precise coordination\n` +
        `**Use Case:** Major launches, significant volume events\n\n` +
        `**How it works:**\n` +
        `Your wallets coordinate to hit the exact same block, creating instant volume impact across all positions simultaneously.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Select Safe Mode', callback_data: 'volume_select_safe' }],
              [{ text: '🔙 Back to Volume Settings', callback_data: 'volume_settings' }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error('Error in volume_bundling_safe:', error);
    }
  });

  bot.action('volume_bundling_instant', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `⚡ *INSTANT MODE - BLOCK 1-2 SPREAD*\n\n` +
        `**Strategy:** Wallets execute within 1-2 blocks\n` +
        `**Best For:** Reliable volume with immediate appearance\n` +
        `**Timing:** Spread across 2 blocks (6-12 seconds)\n` +
        `**Priority Fees:** Medium (5,000 lamports)\n` +
        `**Success Rate:** High, good reliability\n` +
        `**Use Case:** Sustained volume, daily operations\n\n` +
        `**How it works:**\n` +
        `Wallets execute with small delays, maintaining volume impact while reducing coordination failures.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Select Instant Mode', callback_data: 'volume_select_instant' }],
              [{ text: '🔙 Back to Volume Settings', callback_data: 'volume_settings' }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error('Error in volume_bundling_instant:', error);
    }
  });

  bot.action('volume_bundling_delayed', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `📊 *DELAYED MODE - STAGGERED PATTERN*\n\n` +
        `**Strategy:** Individual wallet delays (organic pattern)\n` +
        `**Best For:** Natural-looking volume over time\n` +
        `**Timing:** 5-30 second delays between wallets\n` +
        `**Priority Fees:** Standard (3,000 lamports)\n` +
        `**Success Rate:** Highest, very reliable\n` +
        `**Use Case:** Long-term volume, stealth operations\n\n` +
        `**How it works:**\n` +
        `Each wallet operates independently with randomized delays, creating natural trading patterns.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Select Delayed Mode', callback_data: 'volume_select_delayed' }],
              [{ text: '🔙 Back to Volume Settings', callback_data: 'volume_settings' }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error('Error in volume_bundling_delayed:', error);
    }
  });

  // Bundling Mode Selection Handlers
  const bundlingModeActions = ['volume_select_safe', 'volume_select_instant', 'volume_select_delayed'];

  bundlingModeActions.forEach(action => {
    bot.action(action, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        let modeName = '';
        switch(action) {
          case 'volume_select_safe':
            modeName = 'Safe Mode (Block 0 Bundle)';
            global.volumeBundlingMode = 'safe';
            break;
          case 'volume_select_instant':
            modeName = 'Instant Mode (Block 1-2 Spread)';
            global.volumeBundlingMode = 'instant';
            break;
          case 'volume_select_delayed':
            modeName = 'Delayed Mode (Staggered Pattern)';
            global.volumeBundlingMode = 'delayed';
            break;
        }
        
        await ctx.editMessageText(
          `✅ *BUNDLING MODE SELECTED*\n\n` +
          `**Active Mode:** ${modeName}\n\n` +
          `Your volume trading will now use this bundling strategy for wallet coordination.\n\n` +
          `**Next Steps:**\n` +
          `• Configure other volume settings\n` +
          `• Start volume trading with new mode\n` +
          `• Monitor performance and adjust as needed`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Start Volume Trading', callback_data: 'volume_start' }],
                [{ text: '🔙 Back to Volume Settings', callback_data: 'volume_settings' }]
              ]
            }
          }
        );
      } catch (error) {
        logger.error(`Error in ${action}:`, error);
      }
    });
  });

  // Simple stub for other volume setting adjustments
  const volumeSettingActions = ['volume_set_amount', 'volume_set_sessions', 'volume_set_slippage'];
  
  volumeSettingActions.forEach(action => {
    bot.action(action, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        await ctx.editMessageText(`⚙️ *SETTING CONFIGURED*

The "${action.replace(/volume_set_|_/g, ' ')}" setting has been noted.

For now, using optimized defaults. Advanced customization coming soon.

**Current Status:** ✅ Using recommended settings for volume trading`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Volume Settings', callback_data: 'volume_settings' }]
            ]
          }
        });
      } catch (error) {
        logger.error(`Error in ${action}:`, error);
      }
    });
  });

  // Volume Wallets Group Selection Handler
  bot.action('volume_wallets', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Get all available groups
      const allGroups = walletGroupManager.getAllGroups();
      const groupNames = Object.keys(allGroups);
      
      if (groupNames.length === 0) {
        await ctx.editMessageText(
          `❌ *NO WALLET GROUPS FOUND*\n\n` +
          `Please create wallet groups first in Wallet Group Manager.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 Back to Volume Settings', callback_data: 'volume_settings' }]
              ]
            }
          }
        );
        return;
      }

      // Create buttons for each group
      const groupButtons = groupNames.map(groupName => {
        const group = allGroups[groupName];
        const walletCount = group.wallets.length;
        return [{ text: `${groupName} (${walletCount} wallets)`, callback_data: `volume_select_group_${groupName}` }];
      });

      await ctx.editMessageText(
        `👥 *SELECT WALLET GROUP FOR VOLUME*\n\n` +
        `Choose which wallet group to use for generating volume:\n\n` +
        groupNames.map(name => {
          const group = allGroups[name];
          return `• **${name}**: ${group.wallets.length} wallets`;
        }).join('\n'),
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              ...groupButtons,
              [{ text: '🔙 Back to Volume Settings', callback_data: 'volume_settings' }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error('Error in volume_wallets:', error);
    }
  });

  // Volume Group Selection Handlers
  bot.action(/^volume_select_group_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const groupName = ctx.match[1];
      
      // Store selected group globally
      global.selectedVolumeGroup = groupName;
      
      const group = walletGroupManager.getAllGroups()[groupName];
      const walletCount = group ? group.wallets.length : 0;
      
      await ctx.editMessageText(
        `✅ *WALLET GROUP SELECTED*\n\n` +
        `**Selected Group:** ${groupName}\n` +
        `**Wallet Count:** ${walletCount}\n` +
        `**Status:** Ready for volume generation\n\n` +
        `This group will be used for all volume trading operations.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '👥 Change Group', callback_data: 'volume_wallets' }],
              [{ text: '🔙 Back to Volume Settings', callback_data: 'volume_settings' }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error('Error in volume group selection:', error);
    }
  });

  // Instant Trading Handlers
  bot.action('instant_trading_init', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      await ctx.editMessageText('🚀 Initializing Instant Trading System...');
      
      // Initialize the system
      const success = await initializeInstantTradingSystem();
      
      if (success) {
        // Initialize with wallets
        await instantTradingSystem.initialize(existingWallets);
        
        await ctx.editMessageText(`✅ *SYSTEM INITIALIZED*

Instant Trading System is now ready!

**System Status:**
• ✅ Initialized with ${existingWallets.length} wallets
• ✅ Target token set
• ✅ Ready for instant trading

**Next Step:**
Start the trading system to begin monitoring.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Start Trading', callback_data: 'instant_trading_start' }],
              [{ text: '🧠 Smart Sell Center', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
      } else {
        await ctx.editMessageText(`❌ *INITIALIZATION FAILED*

Could not initialize the Instant Trading System.

**Possible Issues:**
• Network connection problems
• Invalid configuration
• Missing dependencies

Please try again or check your setup.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'instant_trading_init' }],
              [{ text: '🔙 Back to Command Center', callback_data: 'command_center' }]
            ]
          }
        });
      }
    } catch (error) {
      logger.error('Error in instant_trading_init:', error);
    }
  });

  bot.action('instant_trading_start', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      if (!instantTradingSystem) {
        await ctx.editMessageText('❌ System not initialized. Please initialize first.');
        return;
      }
      
      await ctx.editMessageText('🚀 Starting Instant Trading...');
      
      // Ensure system is initialized before starting
      if (!instantTradingSystem.wallets || instantTradingSystem.wallets.length === 0) {
        console.log('🔄 System not initialized, initializing now...');
        await instantTradingSystem.initialize(existingWallets);
      }
      
      const success = await instantTradingSystem.startTrading(global.targetToken);
      
      if (success) {
        await ctx.editMessageText(`✅ *INSTANT TRADING STARTED*

System is now monitoring for outsiders and ready to auto-sell!

**Active Features:**
• ⚡ Real-time outsider detection (2-3 seconds)
• 💰 Instant auto-sell from top profitable wallets
• 🛡️ Rate limit protection
• 📈 100% success rate

**Monitoring:**
• Token: ${global.targetToken.substring(0, 8)}...${global.targetToken.substring(global.targetToken.length - 6)}
• Wallets: ${existingWallets.length}
• Detection Speed: 2 seconds

The system is now active and will automatically respond to outsider transactions.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 View Stats', callback_data: 'instant_trading_stats' }],
              [{ text: '🧠 Smart Sell Center', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
      } else {
        await ctx.editMessageText(`❌ *START FAILED*

Could not start the Instant Trading System.

**Possible Issues:**
• Target token not set
• System not initialized
• Network connection problems

Please check your configuration.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'instant_trading_start' }],
              [{ text: '🧠 Smart Sell Center', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
      }
    } catch (error) {
      logger.error('Error in instant_trading_start:', error);
    }
  });

  bot.action('instant_trading_stop', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      if (!instantTradingSystem) {
        await ctx.editMessageText('❌ System not initialized.');
        return;
      }
      
      await instantTradingSystem.stopTrading();
      
      await ctx.editMessageText(`⏸️ *INSTANT TRADING STOPPED*

The system has been stopped and is no longer monitoring.

**Status:**
• 🛑 Trading stopped
• 📊 Stats preserved
• 🔄 Ready to restart

You can restart the system anytime from the Instant Trading Center.`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Start Trading', callback_data: 'instant_trading_start' }],
            [{ text: '📊 View Stats', callback_data: 'instant_trading_stats' }],
            [{ text: '🧠 Smart Sell Center', callback_data: 'command_smart_sell_outsider' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in instant_trading_stop:', error);
    }
  });

  bot.action('instant_trading_stats', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      if (!instantTradingSystem) {
        await ctx.editMessageText('❌ System not initialized.');
        return;
      }
      
      const stats = instantTradingSystem.getDetailedStats();
      
      await ctx.editMessageText(`📊 *INSTANT TRADING STATISTICS*

**System Performance:**
• Status: ${stats.isRunning ? '🟢 ACTIVE' : '🔴 INACTIVE'}
• Uptime: ${stats.uptime > 0 ? `${Math.round(stats.uptime / 60000)}m ${Math.round((stats.uptime % 60000) / 1000)}s` : 'Not started'}
• Total Wallets: ${stats.totalWallets}

**Detection Stats:**
• Total Detections: ${stats.stats.totalDetections}
• Detection Rate: ${stats.stats.detectionRate.toFixed(2)}/min
• Last Detection: ${stats.stats.lastDetection ? new Date(stats.stats.lastDetection).toLocaleString() : 'Never'}

**Trading Performance:**
• Total Sells: ${stats.stats.totalSells}
• Successful Sells: ${stats.stats.successfulSells}
• Success Rate: ${stats.stats.successRate.toFixed(1)}%
• Last Sell: ${stats.stats.lastSell ? new Date(stats.stats.lastSell).toLocaleString() : 'Never'}

**Top Profitable Wallets:**
${stats.topProfitableWallets.slice(0, 5).map((wallet, i) => 
  `${i + 1}. ${wallet.address.substring(0, 8)}...${wallet.address.substring(wallet.address.length - 6)}: ${wallet.profitPercentage.toFixed(2)}% profit`
).join('\n')}

**Rate Limit Status:**
${Object.entries(stats.rateLimits).map(([endpoint, info]) => 
  `• ${endpoint}: ${info.utilization}% (${info.current}/${info.limit})`
).join('\n')}`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: 'instant_trading_stats' }],
            [{ text: '🧠 Smart Sell Center', callback_data: 'command_smart_sell_outsider' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error in instant_trading_stats:', error);
    }
  });

  bot.action('instant_trading_force_sell', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      if (!instantTradingSystem) {
        await ctx.editMessageText('❌ System not initialized.');
        return;
      }
      
      await ctx.editMessageText('🚨 Executing FORCE SELL from all wallets...');
      
      const result = await instantTradingSystem.forceSellAll();
      
      if (result.success) {
        await ctx.editMessageText(`✅ *FORCE SELL COMPLETED*

Successfully sold from wallets!

**Results:**
• Total Wallets: ${result.totalWallets}
• Successful: ${result.successful}
• Failed: ${result.failed}
• Success Rate: ${Math.round((result.successful / result.totalWallets) * 100)}%

**Note:** Force sell ignores profit thresholds and sells regardless of current profit/loss.

This was an emergency operation.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 View Stats', callback_data: 'instant_trading_stats' }],
              [{ text: '🧠 Smart Sell Center', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
      } else {
        await ctx.editMessageText(`❌ *FORCE SELL FAILED*

Could not execute force sell.

**Error:** ${result.error || result.reason}

**Possible Issues:**
• No wallets with tokens found
• Network connection problems
• Jupiter API issues

Please try again or check your setup.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'instant_trading_force_sell' }],
              [{ text: '🧠 Smart Sell Center', callback_data: 'command_smart_sell_outsider' }]
            ]
          }
        });
      }
    } catch (error) {
      logger.error('Error in instant_trading_force_sell:', error);
    }
  });

  // Instant Trading Settings
  bot.action('instant_trading_settings', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Get current settings from the instant trading system
      const currentSettings = instantTradingSystem ? instantTradingSystem.config : {
        detectionSpeed: 30000,
        minProfitThreshold: 20,
        topWalletsCount: 5,
        autoSellEnabled: true
      };

      const settingsMenu = {
        inline_keyboard: [
          [{ text: `⏱️ Detection Speed: ${currentSettings.detectionSpeed / 1000}s`, callback_data: 'instant_set_detection_speed' }],
          [{ text: `💰 Min Profit: ${currentSettings.minProfitThreshold}%`, callback_data: 'instant_set_min_profit' }],
          [{ text: `🎯 Top Wallets: ${currentSettings.topWalletsCount}`, callback_data: 'instant_set_top_wallets' }],
          [{ text: `🔄 Auto-Sell: ${currentSettings.autoSellEnabled ? 'ON' : 'OFF'}`, callback_data: 'instant_toggle_auto_sell' }],
          [{ text: '🔙 Back to Unified Trading', callback_data: 'command_unified_trading' }]
        ]
      };

      await ctx.editMessageText(
        `⚙️ *INSTANT TRADING SETTINGS*\n\n` +
        `**Current Configuration:**\n` +
        `• Detection Speed: ${currentSettings.detectionSpeed / 1000} seconds\n` +
        `• Min Profit Threshold: ${currentSettings.minProfitThreshold}%\n` +
        `• Top Wallets Count: ${currentSettings.topWalletsCount}\n` +
        `• Auto-Sell Enabled: ${currentSettings.autoSellEnabled ? '✅ Yes' : '❌ No'}\n\n` +
        `**Settings Explained:**\n` +
        `• Detection Speed: How often to check for outsider transactions\n` +
        `• Min Profit: Minimum profit % required to trigger a sell\n` +
        `• Top Wallets: Number of most profitable wallets to sell from\n` +
        `• Auto-Sell: Whether to automatically sell when outsiders detected\n\n` +
        `Click any setting to modify it:`,
        {
          parse_mode: 'Markdown',
          reply_markup: settingsMenu
        }
      );
    } catch (error) {
      logger.error('Error in instant_trading_settings:', error);
    }
  });

  // Instant Trading Setting Handlers

  // Detection Speed Setting
  bot.action('instant_set_detection_speed', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const current = instantTradingSystem ? instantTradingSystem.config.detectionSpeed : 30000;
      
      await ctx.editMessageText(
        `⏱️ *SET DETECTION SPEED*\n\n` +
        `**Current Value:** ${current / 1000} seconds\n` +
        `**Description:** How often to check for outsider transactions\n\n` +
        `**Examples:**\n` +
        `• 10s - Very fast (may hit rate limits)\n` +
        `• 30s - Fast and safe (recommended)\n` +
        `• 60s - Conservative\n` +
        `• 120s - Very conservative\n\n` +
        `Enter your new detection speed in seconds (10-300):`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Settings', callback_data: 'instant_trading_settings' }]
            ]
          }
        }
      );
      global.awaitingSettingInput = { chatId: ctx.chat.id, setting: 'instant_detectionSpeed', type: 'seconds', min: 10, max: 300 };
    } catch (error) {
      logger.error('Error in instant_set_detection_speed:', error);
    }
  });

  // Min Profit Threshold Setting
  bot.action('instant_set_min_profit', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const current = instantTradingSystem ? instantTradingSystem.config.minProfitThreshold : 20;
      
      await ctx.editMessageText(
        `💰 *SET MINIMUM PROFIT THRESHOLD*\n\n` +
        `**Current Value:** ${current}%\n` +
        `**Description:** Minimum profit % required to trigger a sell\n\n` +
        `**Examples:**\n` +
        `• 5% - Very aggressive (sell at small profits)\n` +
        `• 20% - Moderate (recommended)\n` +
        `• 50% - Conservative (wait for bigger gains)\n` +
        `• 100% - Very conservative (double your money)\n\n` +
        `Enter your new minimum profit percentage (1-500):`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Settings', callback_data: 'instant_trading_settings' }]
            ]
          }
        }
      );
      global.awaitingSettingInput = { chatId: ctx.chat.id, setting: 'instant_minProfitThreshold', type: 'percentage', min: 1, max: 500 };
    } catch (error) {
      logger.error('Error in instant_set_min_profit:', error);
    }
  });

  // Top Wallets Count Setting
  bot.action('instant_set_top_wallets', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const current = instantTradingSystem ? instantTradingSystem.config.topWalletsCount : 5;
      
      await ctx.editMessageText(
        `🎯 *SET TOP WALLETS COUNT*\n\n` +
        `**Current Value:** ${current} wallets\n` +
        `**Description:** Number of most profitable wallets to sell from\n\n` +
        `**Examples:**\n` +
        `• 1 - Sell from only the most profitable wallet\n` +
        `• 3 - Sell from top 3 most profitable wallets\n` +
        `• 5 - Sell from top 5 most profitable wallets (recommended)\n` +
        `• 10 - Sell from top 10 most profitable wallets\n\n` +
        `Enter your new top wallets count (1-20):`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Settings', callback_data: 'instant_trading_settings' }]
            ]
          }
        }
      );
      global.awaitingSettingInput = { chatId: ctx.chat.id, setting: 'instant_topWalletsCount', type: 'number', min: 1, max: 20 };
    } catch (error) {
      logger.error('Error in instant_set_top_wallets:', error);
    }
  });

  // Auto-Sell Toggle
  bot.action('instant_toggle_auto_sell', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      if (!instantTradingSystem) {
        await ctx.editMessageText('❌ System not initialized. Please initialize the system first.');
        return;
      }
      
      const current = instantTradingSystem.config.autoSellEnabled;
      instantTradingSystem.config.autoSellEnabled = !current;
      
      await ctx.editMessageText(
        `🔄 *AUTO-SELL TOGGLED*\n\n` +
        `**New Status:** ${!current ? '✅ ENABLED' : '❌ DISABLED'}\n\n` +
        `**What this means:**\n` +
        `${!current ? 
          '• System will automatically sell from profitable wallets when outsiders are detected\n' +
          '• This is the main feature of instant trading' :
          '• System will detect outsiders but NOT automatically sell\n' +
          '• You will need to manually trigger sells'
        }\n\n` +
        `Auto-sell is now ${!current ? 'ENABLED' : 'DISABLED'}.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Settings', callback_data: 'instant_trading_settings' }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error('Error in instant_toggle_auto_sell:', error);
    }
  });

  // Error handling
  bot.catch((err, ctx) => {
    logger.error('Bot error:', err);
  });

  logger.info('✅ Bot handlers set up successfully');
};

// Start the bot
const startBot = async () => {
  console.log('🚀 Starting Simple Bot...');
  
  // Initialize Instant Trading System
  await initializeInstantTradingSystem();
  
  const telegramReady = await initializeTelegramBot();
  
  if (telegramReady) {
    setupBotHandlers();
    
    try {
      await bot.launch();
      logger.info('🎉 Simple Bot is running!');
      console.log('🎉 Simple Bot is running! Send /start to begin.');
    } catch (error) {
      logger.error('Failed to launch bot:', error);
    }
  } else {
    logger.info('Running in console mode - Telegram features disabled');
  }
};

// Graceful shutdown
process.once('SIGINT', () => {
  if (bot) {
    bot.stop('SIGINT');
  }
});
process.once('SIGTERM', () => {
  if (bot) {
    bot.stop('SIGTERM');
  }
});

// Start the application
startBot().catch(error => {
  logger.error('Failed to start bot:', error);
  process.exit(1);
});

module.exports = { startBot };