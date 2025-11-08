/**
 * Netlify Function: Upload Token Image
 * Pins image content to IPFS (Pinata) and returns the resulting URI.
 */

const PINATA_ENDPOINT = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff'
};

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: DEFAULT_HEADERS,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const { PINATA_JWT, PINATA_GATEWAY_URL } = process.env;

    if (!PINATA_JWT) {
      throw new Error('PINATA_JWT environment variable is not configured');
    }

    if (!event.body) {
      throw new Error('Request body is required');
    }

    const payload = JSON.parse(event.body);
    const { fileName, contentType, data, metadata = {} } = payload;

    if (!data) {
      throw new Error('Image data (base64) is required');
    }

    // Support data URLs or raw base64 strings
    const base64Data = data.includes('base64,') ? data.split('base64,')[1] : data;
    const buffer = Buffer.from(base64Data, 'base64');

    if (!buffer.length) {
      throw new Error('Decoded image data is empty');
    }

    const blob = new Blob([buffer], {
      type: contentType || 'application/octet-stream'
    });

    const formData = new FormData();
    const safeFileName = fileName || `token-image-${Date.now()}.png`;

    formData.append('file', blob, safeFileName);

    const pinataMetadata = {
      name: safeFileName,
      keyvalues: {
        source: 'chaosbot',
        createdAt: new Date().toISOString(),
        ...metadata
      }
    };

    formData.append('pinataMetadata', JSON.stringify(pinataMetadata));
    formData.append(
      'pinataOptions',
      JSON.stringify({
        cidVersion: 1
      })
    );

    const response = await fetch(PINATA_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorPayload = await response.text();
      throw new Error(`Pinata upload failed: ${errorPayload}`);
    }

    const result = await response.json();
    const ipfsHash = result.IpfsHash;
    const gatewayBase =
      (PINATA_GATEWAY_URL && PINATA_GATEWAY_URL.trim().replace(/\/$/, '')) ||
      'https://gateway.pinata.cloud/ipfs';

    const ipfsUri = `ipfs://${ipfsHash}`;
    const publicUrl = `${gatewayBase}/${ipfsHash}`;

    return {
      statusCode: 200,
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        ipfsHash,
        uri: ipfsUri,
        url: publicUrl
      })
    };
  } catch (error) {
    console.error('Upload token image error:', error);
    return {
      statusCode: 500,
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};

