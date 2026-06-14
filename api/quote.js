const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, state, evidence } = req.body;
  if (!user) return res.status(400).json({ error: 'No user provided' });

  const evidenceLine = (evidence || []).slice(0, 3).join(' | ') || 'none yet';
  const prompt = `You are Franklyn. Write one short reflection for this specific person right now.

Name: ${user.name}
Identity anchors: ${(user.anchors || []).join(', ')}
What starts their spiral: ${user.spiralTrigger || 'unknown'}
Most recent emotional state: ${state || 'unknown'}
Recent evidence of progress: ${evidenceLine}

Rules:
- One to two sentences maximum
- Specific to this person — not generic
- Warm and honest, not motivational or fluffy
- Not an affirmation ("You are...") — a reframe, an observation, or a grounding truth
- No quotation marks in your response
- No sign-off, no attribution
- No em dashes or en dashes. Use commas and periods only.`;

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 80,
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

    res.status(200).json({ quote: reply.trim(), attr: 'Franklyn' });
  } catch(error) {
    res.status(500).json({ error: error.message });
  }
};
