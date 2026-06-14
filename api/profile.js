const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, anchors, trigger, spiralFeeling, numbing } = req.body;
  if (!name) return res.status(400).json({ error: 'No user provided' });

  const anchorList = (anchors || []).filter(Boolean).join(', ') || 'not yet set';

  const prompt = `Write a two-sentence psychological profile for this person. This will appear in their settings as "What Franklyn knows about you."

Name: ${name}
Identity anchors: ${anchorList}
What knocks them off center: ${trigger || 'unknown'}
Where they first notice it: ${spiralFeeling || 'unknown'}
What they default to: ${numbing || 'unknown'}

Rules:
- Exactly two sentences
- Second person ("You are..." or "You tend to...")
- First sentence: name something genuine and strong about them based on their anchors
- Second sentence: name their pattern honestly — what triggers it and what it costs them
- Warm and specific, not clinical or generic
- No jargon, no labels, no diagnosis
- Write as if you know them well and respect them
- No em dashes or en dashes. Use commas and periods only.`;

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
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
    const text = await new Promise((resolve, reject) => {
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

    res.status(200).json({ summary: text.trim() });

  } catch(error) {
    res.status(500).json({ error: error.message });
  }
};
