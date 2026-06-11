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

Fresh evidence from their life today:
${(evidence||[]).map(e => '- ' + e).join('\n')}

Their spiral signature: starts with comparison online, moves to unworthiness, lands on abandonment story, numbs with wine and cleaning.

Respond in exactly this structure with these exact labels:

WHAT IS HAPPENING:
[One precise sentence naming the pattern. No jargon. Direct.]

WHY THIS MAKES SENSE:
[2-3 sentences explaining the neurological or psychological mechanism. Make it feel like relief, not diagnosis. End with a source: Porges, Sweller, Ryan & Deci, or similar.]

WHAT IS ACTUALLY TRUE:
[1-2 sentences reflecting something specific from their evidence list back to them. Ground it in a real thing they did or have. Make it feel like a mirror, not encouragement.]

ONE THING RIGHT NOW:
[One action. 30 seconds or less. Specific. Physical or behavioral. Start with an arrow: →]

Rules: warm, direct, zero judgment, zero nagging. Never use the word journey. Never generic. Always specific to their actual evidence.`;

  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
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

    const sections = {
      what: extract(text, 'WHAT IS HAPPENING:'),
      why: extract(text, 'WHY THIS MAKES SENSE:'),
      truth: extract(text, 'WHAT IS ACTUALLY TRUE:'),
      action: extract(text, 'ONE THING RIGHT NOW:')
    };

    res.status(200).json(sections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function extract(text, label) {
  const labels = [
    'WHAT IS HAPPENING:',
    'WHY THIS MAKES SENSE:',
    'WHAT IS ACTUALLY TRUE:',
    'ONE THING RIGHT NOW:'
  ];
  const start = text.indexOf(label);
  if (start === -1) return '';
  const after = text.slice(start + label.length);
  const nextLabel = labels.find(l => l !== label && after.indexOf(l) > -1);
  const end = nextLabel ? after.indexOf(nextLabel) : after.length;
  return after.slice(0, end).trim();
}
