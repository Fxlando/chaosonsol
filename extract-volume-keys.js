const fs = require('fs');
const bs58 = require('bs58');

// Load wallet data
const walletsData = JSON.parse(fs.readFileSync('./wallets.json', 'utf8'));

// Filter for Volume group
const volumeWallets = walletsData.filter(wallet => wallet.group === 'Volume');

console.log('=== VOLUME WALLET GROUP PRIVATE KEYS ===\n');
console.log(`Found ${volumeWallets.length} wallets in Volume group\n`);

// Display each wallet's information
volumeWallets.forEach((wallet, index) => {
  console.log(`--- Wallet ${index + 1}: ${wallet.name} ---`);
  console.log(`Public Key: ${wallet.pubkey}`);
  
  // Convert secret key array to Uint8Array and then to base58
  const secretKeyUint8 = new Uint8Array(wallet.secretKey);
  const privateKeyBase58 = bs58.encode(secretKeyUint8);
  
  console.log(`Private Key (Base58): ${privateKeyBase58}`);
  console.log(`Balance: ${wallet.balance} SOL`);
  console.log(`Priority: ${wallet.priority}`);
  console.log(`Status: ${wallet.status}`);
  console.log(`Added: ${wallet.addedAt}`);
  console.log('');
});

// Create a summary object for easy export
const volumeWalletSummary = {
  groupName: 'Volume',
  totalWallets: volumeWallets.length,
  wallets: volumeWallets.map(wallet => ({
    name: wallet.name,
    publicKey: wallet.pubkey,
    privateKey: bs58.encode(new Uint8Array(wallet.secretKey)),
    balance: wallet.balance,
    priority: wallet.priority,
    status: wallet.status
  }))
};

// Save to file for easy access
fs.writeFileSync('./volume-wallets-keys.json', JSON.stringify(volumeWalletSummary, null, 2));

console.log('=== SUMMARY ===');
console.log(`Total Volume Wallets: ${volumeWallets.length}`);
console.log('Private keys have been saved to: volume-wallets-keys.json');
console.log('\n=== IMPORT INSTRUCTIONS FOR PHANTOM WALLET ===');
console.log('1. Open Phantom Wallet');
console.log('2. Click Settings → Add/Connect Wallet');
console.log('3. Select "Import Private Key"');
console.log('4. Copy and paste each private key from above');
console.log('5. Use the wallet names provided for easy identification');

// Also create a simple text file with just the private keys
const privateKeysOnly = volumeWallets.map(wallet => 
  `${wallet.name}: ${bs58.encode(new Uint8Array(wallet.secretKey))}`
).join('\n');

fs.writeFileSync('./volume-private-keys.txt', privateKeysOnly);
console.log('\nPrivate keys only saved to: volume-private-keys.txt');
