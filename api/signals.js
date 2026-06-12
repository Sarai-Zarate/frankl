const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });

  const prompt = 'The user described their numbing behaviors or emotional signals in their own words. Parse this into individual complete sentences. Each sentence must:\n- Start with "I"\n- Describe one specific behavior or feeling\n- Be grammatically correct and natural-sounding\n- Be written without judgment, the way someone self-aware would describe their own pattern\n- Be a full thought, not a fragment\n\nInput: "' + text.trim() + '"\n\nReturn only a raw JSON array of strings. No explanation, no markdown, no code block. Example: ["I reach for wine", "I scroll for hours without stopping", "I go quiet and pull away"]\n\nIf the input is a single behavior, return an array with one item.';

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }]
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

    const signals = JSON.parse(reply.trim());
    if (!Array.isArray(signals)) throw new Error('Not an array');
    res.status(200).json({ signals });
  } catch(error) {
    res.status(500).json({ error: error.message });
  }
};
