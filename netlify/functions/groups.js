// Netlify Function to get wallet groups
const volumeWallets = require('../../volume-wallets-public.json');
const pumpWallets = require('../../pump-wallets-public.json');
const groupsConfig = require('../../groups-config.json');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const groups = [
      {
        id: 'test',
        name: groupsConfig.test?.name || 'Test Wallets',
        description: groupsConfig.test?.description || 'Development wallets',
        walletCount: volumeWallets.wallets?.length || 0,
        settings: groupsConfig.test?.settings || {}
      },
      {
        id: 'VolumePump',
        name: groupsConfig.VolumePump?.name || 'Pump.Fun Launch Group',
        description: groupsConfig.VolumePump?.description || '20-wallet pump group',
        walletCount: pumpWallets.wallets?.length || 0,
        settings: groupsConfig.VolumePump?.settings || {}
      }
    ];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(groups)
    };
  } catch (error) {
    console.error('Error in groups function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

