// Netlify Function for smart sell status
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

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      isEnabled: false,
      settings: {
        profitTarget: 30,
        stopLoss: -15,
        trailingStop: 10,
        emergencyStop: -25
      },
      activeMonitors: 0
    })
  };
};

