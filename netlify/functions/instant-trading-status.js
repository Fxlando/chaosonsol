// Netlify Function for instant trading status
exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Try to get instant trading system status
    // Since this is a Netlify function, we can't directly access the bot instance
    // We'll return that it's available but needs to be connected via the bot
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        available: true,
        connected: false,
        isRunning: false,
        currentToken: null,
        message: 'Instant trading system available. Start the bot to activate.',
        stats: {
          totalDetections: 0,
          totalSells: 0,
          successfulSells: 0
        }
      })
    };
  } catch (error) {
    console.error('Error getting instant trading status:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        available: false,
        connected: false,
        isRunning: false,
        error: error.message
      })
    };
  }
};

