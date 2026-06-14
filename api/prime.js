const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { context, name, anchors, trigger, spiralFeeling } = req.body;
  if (!context) return res.status(400).json({ error: 'No context provided' });

  const anchorList = (anchors || []).filter(Boolean).join(', ') || 'their core identity';
  const contextLabel = context;

  const prompt = `You are Franklyn. Generate a 60-second pre-performance brief for this specific person.

Name: ${name || 'this person'}
Identity anchors: ${anchorList}
What knocks them off center: ${trigger || 'unknown'}
What they first notice: ${spiralFeeling || 'unknown'}
About to walk into: ${contextLabel}

Return exactly three labeled sections:

BREATHE:
(One specific breath instruction — one sentence. Physiological sigh or extended exhale. Tell them why in five words or fewer.)

ANCHOR:
(One sentence naming which of their specific identity anchors is most relevant for this context and why. Use their actual anchor words.)

INTENTION:
(One clear sentence — what they are there to do, not to prove. Specific to the context. No performance pressure language.)

Write to someone capable who doesn't need encouragement. They need precision. Direct, grounded, no filler. No em dashes or en dashes. Use commas and periods only.`;

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
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

    function extract(t, label, nexts) {
      const i = t.indexOf(label);
      if (i === -1) return '';
      let s = t.slice(i + label.length);
      for (const n of nexts) {
        const j = s.indexOf(n);
        if (j !== -1) s = s.slice(0, j);
      }
      return s.trim();
    }

    const all = ['BREATHE:', 'ANCHOR:', 'INTENTION:'];
    res.status(200).json({
      breath:    extract(text, all[0], all.slice(1)),
      anchor:    extract(text, all[1], all.slice(2)),
      intention: extract(text, all[2], [])
    });

  } catch(error) {
    res.status(500).json({ error: error.message });
  }
};
