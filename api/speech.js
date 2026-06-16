const https = require('https');

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

  const { mindset_state, mindset_text, identity_anchors, pattern_trigger, exclude_titles, video_type } = req.body;

  const anchorList = (identity_anchors || []).filter(Boolean).join(', ') || 'not set';

  const stateDescriptions = {
    ready:     'clear and willing — this is already the plan',
    resistant: 'knows they should but something is in the way',
    low:       'energy is down, not sure they have it today',
    avoiding:  'have been putting this off and they know it'
  };
  const stateDesc = stateDescriptions[mindset_state] || (mindset_text ? 'described below' : 'unspecified');

  const excludeLine = exclude_titles
    ? 'DO NOT repeat any of these already-shown titles: ' + exclude_titles
    : '';

  // Verified video IDs Claude can use with confidence
  const verifiedIds = [
    'ZBPY4Boczf8 = "True Beast Mentality" by Motiversity — cinematic speech compilation',
    '5reo3dXOicU = "How Your Thoughts Are Connected To Your Future" by Be Inspired — Joe Dispenza cinematic',
    'mgMb1tgQjGE = "You Were Born For This" by Motiversity — cinematic speech compilation',
    'lsSC2vx7zFQ = "Its Not Over" by Ben Lionel Scott — cinematic speech compilation',
    'k0C9-4K7M_g = "Just Breathe - Guided Meditation" by Great Meditation — 10 min guided meditation',
    'inpok4MKVLM = "Yoga For Beginners" by Yoga With Adriene — 20 min follow-along',
  ];

  const vibeInstructions = {
    tough: [
      'VIBE: The user wants to be pushed hard. Choose a cinematic motivational SPEECH compilation.',
      'Format: dramatic music, scenes cutting between nature/sports/film, voice clips from athletes, coaches, philosophers.',
      'Channels: Motiversity, Ben Lionel Scott, Mateusz M, Absolute Motivation, T&H Inspiration, RedFrost Motivation.',
      'DO NOT pick: TED talks, TEDx, podcasts, lectures, sit-down interviews. No Mel Robbins. No Tim Urban.',
    ],
    peaceful: [
      'VIBE: The user wants calm and restoration. Choose a GUIDED MEDITATION or gentle breathwork video.',
      'Format: calm voice, ambient music, eyes-closed practice, 5-20 minutes.',
      'Channels: Great Meditation, Michael Sealey, Jason Stephenson, Headspace, Yoga With Adriene.',
      'DO NOT pick: motivational speeches, workout videos, lectures.',
    ],
    auto: [
      'VIBE: Choose the best format for this person right now based on their state:',
      '- Avoiding or low energy → cinematic motivational compilation (Motiversity, Ben Lionel Scott)',
      '- Resistant or anxious → guided meditation or breathwork (Great Meditation, Michael Sealey)',
      '- Ready → your call — push them or ground them based on what they said',
      'DO NOT pick: TED talks, TEDx, podcasts, sit-down lectures, Mel Robbins.',
    ]
  };

  const vibeLines = vibeInstructions[video_type] || vibeInstructions['auto'];

  const prompt = [
    'You are Franklyn. Recommend one YouTube video for this person right now.',
    '',
    ...vibeLines,
    '',
    'Person:',
    '- Identity anchors: ' + anchorList,
    '- What knocks them off: ' + (pattern_trigger || 'unknown'),
    '- Mindset state: ' + stateDesc,
    mindset_text ? '- What they said: ' + mindset_text : '',
    excludeLine,
    '',
    'Verified video IDs you can use with confidence:',
    ...verifiedIds,
    '',
    'You may recommend any video you know well — not just those above. But VIDEO_ID must be an 11-character YouTube ID you are certain is correct. A wrong ID breaks the embed. Leave blank if unsure.',
    'FRAMING: one sentence in Franklyn\'s voice, specific to this person\'s anchors or what they typed. No clichés, no em dashes.',
    '',
    'Reply with exactly these four lines:',
    'SPEAKER: channel or creator name',
    'TITLE: exact video title',
    'FRAMING: one sentence',
    'VIDEO_ID: 11-char id or blank',
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
    const video_id = /^[A-Za-z0-9_-]{11}$/.test(rawId) ? rawId : null;

    const searchQuery = encodeURIComponent((speaker + ' ' + title).trim());
    const youtube_search_url = 'https://www.youtube.com/results?search_query=' + searchQuery;
    const youtube_watch_url  = video_id ? 'https://www.youtube.com/watch?v=' + video_id : null;

    res.status(200).json({ speaker, title, framing, video_id, youtube_search_url, youtube_watch_url });
  } catch(error) {
    res.status(500).json({ error: error.message });
  }
};
