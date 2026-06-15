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

  const excludeLine = exclude_titles
    ? 'ALREADY SHOWN — do not repeat any of these: ' + exclude_titles
    : '';

  const prompt = [
    'You are Franklyn. Recommend one YouTube motivational speech video for this person.',
    '',
    'CRITICAL — FORMAT REQUIRED:',
    'The video MUST be a cinematic motivational speech compilation — the kind with dramatic background music, scenes cutting between nature/sports/film footage, and voice clips from athletes, coaches, philosophers, or movie characters edited together.',
    'These are sometimes called "motivational speech" or "best motivational video" compilations.',
    'Channels that make this format: Motiversity, Ben Lionel Scott, Mateusz M, Absolute Motivation, T&H Inspiration, RedFrost Motivation.',
    '',
    'DO NOT recommend: TED talks, TEDx talks, talking-head lectures, podcasts, interviews where someone sits and speaks to camera. No Mel Robbins, no Tim Urban, no conference stages.',
    '',
    'Person:',
    '- Identity anchors: ' + anchorList,
    '- What knocks them off: ' + (pattern_trigger || 'unknown'),
    '- Mindset state: ' + stateDesc,
    mindset_text ? '- What they said: ' + mindset_text : '',
    excludeLine,
    '',
    'Verified video IDs you can trust (same format as what this person wants):',
    '  ZBPY4Boczf8 = "True Beast Mentality" — Motiversity style compilation',
    '  5reo3dXOicU = "How Your Thoughts Are Connected To Your Future" — Joe Dispenza cinematic',
    '',
    'Match energy to state: low/avoiding = raw honesty, quiet intensity; resistant = direct and clear; ready = can handle full fire.',
    '',
    'VIDEO_ID: only include if you are certain the ID is correct. A wrong ID breaks the embed — leave it blank if unsure.',
    'FRAMING: one sentence in Franklyn\'s voice. Specific to this person\'s anchors or what they said. No clichés, no em dashes.',
    '',
    'Reply with exactly:',
    'SPEAKER: channel or curator name',
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
