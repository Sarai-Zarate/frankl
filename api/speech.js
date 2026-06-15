const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mindset_state, mindset_text, identity_anchors, pattern_trigger, favorites } = req.body;

  const anchorList = (identity_anchors || []).filter(Boolean).join(', ') || 'not set';
  const favoritesLine = (favorites || []).length
    ? 'Speeches this person already loves (use these to calibrate tone and intensity): ' + favorites.join(' | ')
    : '';

  const stateDescriptions = {
    ready:     'clear and willing, this is already the plan',
    resistant: 'they know they should but something is in the way',
    low:       'energy is down, not sure they have it today',
    avoiding:  'they have been putting this off and they know it'
  };
  const stateDesc = stateDescriptions[mindset_state] || mindset_state;

  const prompt = [
    'You are Franklyn. Recommend one specific motivational speech or talk available on YouTube.',
    '',
    'Person profile:',
    'Identity anchors: ' + anchorList,
    'What knocks them off center: ' + (pattern_trigger || 'unknown'),
    'Mindset going into their habits today: ' + stateDesc,
    mindset_text ? 'What they said: ' + mindset_text : '',
    favoritesLine,
    '',
    'Rules:',
    '- Recommend ONE real, specific talk — a speech, a YouTube video, a TED talk, a podcast clip — that actually exists and is findable on YouTube',
    '- Match the energy level to their state: low/avoiding = grounded and honest, not hype; ready = can handle intensity',
    '- Do not invent titles or speakers. Only recommend something you are confident exists.',
    '- The framing line must be written in Franklyn\'s voice: grounded, specific to this person, no clichés, no em dashes',
    '- Never say "journey", never use bullet points',
    '',
    'Reply with exactly these three labeled lines:',
    'SPEAKER: (the speaker or creator\'s name)',
    'TITLE: (the exact title of the talk or video)',
    'FRAMING: (one sentence in Franklyn\'s voice — why this fits this person right now, specific to their anchors or pattern)'
  ].filter(Boolean).join('\n');

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
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

    function extractLine(t, label) {
      const i = t.indexOf(label);
      if (i === -1) return '';
      const line = t.slice(i + label.length).split('\n')[0];
      return line.trim();
    }

    const speaker = extractLine(text, 'SPEAKER:');
    const title   = extractLine(text, 'TITLE:');
    const framing = extractLine(text, 'FRAMING:');
    const searchQuery = encodeURIComponent((speaker + ' ' + title).trim());
    const youtubeSearchUrl = 'https://www.youtube.com/results?search_query=' + searchQuery;

    res.status(200).json({ speaker, title, framing, youtube_search_url: youtubeSearchUrl });
  } catch(error) {
    res.status(500).json({ error: error.message });
  }
};
