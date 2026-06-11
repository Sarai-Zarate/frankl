const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { state, signals, anchors, evidence } = req.body;

  const prompt = `You are Frankl, a warm psychologically grounded AI informed by polyvagal theory, self-determination theory, and cognitive load theory. You are not a therapist but you understand the nervous system deeply.

The user has reported:
- Current state: ${state}
- Signals present: ${(signals||[]).join(', ')}

Their identity anchors are: Influential, Significant, Wealthy

Recent evidence from their life:
${(evidence||[]).map(e => '- ' + e).join('\n')}

Their spiral signature: starts with comparison online, moves to unworthiness, lands on abandonment story, numbs with wine and cleaning.

Write a response that names exactly what is happening, explains the mechanism without jargon, reflects one specific true thing from their evidence, and gives one action small enough to do in 30 seconds. Warm, direct, zero judgment. Prose only, no bullets, under 180 words. Never use the word journey.`;

  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
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
    const text = await new Promise((resolve, reject) => {
      const r = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.content[0].text);
          } catch(e) {
            reject(e);
          }
        });
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    res.status(200).json({ response: text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
