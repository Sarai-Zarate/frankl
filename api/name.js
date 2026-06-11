const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { state, signals, evidence } = req.body;

  const prompt = [
    'You are Frankl, a warm psychologically grounded AI.',
    'Current state: ' + state,
    'Signals: ' + (signals||[]).join(', '),
    'Anchors: Influential, Significant, Wealthy',
    'Evidence: ' + (evidence||[]).join(' | '),
    'Spiral: comparison -> unworthiness -> abandonment -> numbing.',
    '',
    'Reply with exactly these four labeled sections:',
    'WHAT IS HAPPENING:',
    '(one sentence naming the pattern)',
    '',
    'WHY THIS MAKES SENSE:',
    '(2-3 sentences on the mechanism, cite Porges or Sweller)',
    '',
    'WHAT IS ACTUALLY TRUE:',
    '(1-2 sentences from their real evidence)',
    '',
    'ONE THING RIGHT NOW:',
    '(one action starting with arrow, 30 seconds max)',
    '',
    'Warm, direct, specific, no bullets in answers, never use journey.'
  ].join('\n');

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
          try { resolve(JSON.parse(data).content[0].text); }
          catch(e) { reject(new Error(data)); }
        });
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    console.log('RAW:', text);

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

    const all = ['WHAT IS HAPPENING:', 'WHY THIS MAKES SENSE:', 'WHAT IS ACTUALLY TRUE:', 'ONE THING RIGHT NOW:'];
    res.status(200).json({
      what:   extract(text, all[0], all.slice(1)),
      why:    extract(text, all[1], all.slice(2)),
      truth:  extract(text, all[2], all.slice(3)),
      action: extract(text, all[3], [])
    });

  } catch(error) {
    res.status(500).json({ error: error.message });
  }
};
