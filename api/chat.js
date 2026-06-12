const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;
  if (!messages || !messages.length) {
    return res.status(400).json({ error: 'No messages provided' });
  }

  const system = messages[0].role === 'system' ? messages[0].content : null;
  const conversation = messages.filter(function(m) { return m.role !== 'system'; });

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: system,
    messages: conversation
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  try {
    const reply = await new Promise((resolve, reject) => {
      const r = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          try { resolve(JSON.parse(data).content[0].text); }
          catch(e) { reject(new Error(data)); }
        });
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    res.status(200).json({ reply });
  } catch(error) {
    res.status(500).json({ error: error.message });
  }
};
