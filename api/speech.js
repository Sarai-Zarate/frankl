const https = require('https');

function httpsGet(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      resolve(res.statusCode);
    }).on('error', () => resolve(0));
  });
}

async function validateVideoId(id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return false;
  const status = await httpsGet(
    'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + id + '&format=json'
  );
  return status === 200;
}

function post(body) {
  return new Promise((resolve, reject) => {
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
}

function extractLine(t, label) {
  const i = t.indexOf(label);
  if (i === -1) return '';
  return t.slice(i + label.length).split('\n')[0].trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mindset_state, mindset_text, identity_anchors, pattern_trigger, favorites, exclude_titles } = req.body;

  const anchorList = (identity_anchors || []).filter(Boolean).join(', ') || 'not set';

  const stateDescriptions = {
    ready:     'clear and willing — this is already the plan',
    resistant: 'knows they should but something is in the way',
    low:       'energy is down, not sure they have it today',
    avoiding:  'have been putting this off and they know it'
  };
  const stateDesc = stateDescriptions[mindset_state] || (mindset_text ? 'described below' : 'unspecified');

  const favoritesLine = (favorites || []).length
    ? 'Tone calibration — talks they already love: ' + favorites.join(' | ')
    : '';
  const excludeLine = exclude_titles
    ? 'SKIP these — already shown and skipped: ' + exclude_titles
    : '';

  const prompt = [
    'You are Franklyn. Recommend one real YouTube video that fits this person right now.',
    '',
    'Person:',
    '- Identity anchors: ' + anchorList,
    '- What knocks them off: ' + (pattern_trigger || 'unknown'),
    '- Mindset state: ' + stateDesc,
    mindset_text ? '- In their own words: ' + mindset_text : '',
    favoritesLine,
    excludeLine,
    '',
    'Rules:',
    '- Pick ONE video that actually exists on YouTube. No invented titles.',
    '- Prefer well-known talks with millions of views — these have stable, known video IDs.',
    '- Match energy: low or avoiding = honest and grounded; resistant = clarity over hype; ready = can handle intensity.',
    '- VIDEO_ID: only provide if you are certain it is correct. Well-known examples you can trust:',
    '  ZBPY4Boczf8 = True Beast Mentality compilation',
    '  5reo3dXOicU = Joe Dispenza on thoughts and your future',
    '  arj7oStGLkU = TED talk "Inside the mind of a master procrastinator" Tim Urban',
    '  8KkKuTCFvzI = Mel Robbins 5 Second Rule TEDx',
    '  Lp7E973zozc = David Goggins — You are in danger of living a comfortable life',
    '  If you are not certain the ID is real, leave VIDEO_ID blank — a wrong ID is worse than no ID.',
    '- FRAMING: one sentence in Franklyn\'s voice, specific to their anchors or what they said. No clichés, no em dashes.',
    '',
    'Reply with exactly:',
    'SPEAKER: name',
    'TITLE: exact video title',
    'FRAMING: one sentence',
    'VIDEO_ID: 11-char id or blank'
  ].filter(Boolean).join('\n');

  try {
    const raw = await post(JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    }));

    const speaker = extractLine(raw, 'SPEAKER:');
    const title   = extractLine(raw, 'TITLE:');
    const framing = extractLine(raw, 'FRAMING:');
    const rawId   = extractLine(raw, 'VIDEO_ID:');

    // Validate the ID actually exists on YouTube
    const valid = rawId ? await validateVideoId(rawId) : false;
    const video_id = valid ? rawId : null;

    const searchQuery = encodeURIComponent((speaker + ' ' + title).trim());
    const youtube_search_url = 'https://www.youtube.com/results?search_query=' + searchQuery;
    const youtube_watch_url  = video_id ? 'https://www.youtube.com/watch?v=' + video_id : null;

    res.status(200).json({ speaker, title, framing, video_id, youtube_search_url, youtube_watch_url });
  } catch(error) {
    res.status(500).json({ error: error.message });
  }
};
