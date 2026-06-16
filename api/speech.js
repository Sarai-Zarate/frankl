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

  const contentTypes = {
    toughness: {
      desc: 'Mental toughness / motivational speech compilation',
      instructions: [
        'Find a cinematic motivational speech compilation — dramatic music, scenes cutting between nature/sports/film footage, voice clips from athletes, coaches, philosophers, or movie characters edited together.',
        'Channels: Motiversity, Ben Lionel Scott, Mateusz M, Absolute Motivation, T&H Inspiration, RedFrost Motivation.',
        'DO NOT pick: TED talks, TEDx, podcasts, sit-down interviews. No Mel Robbins. No Tim Urban.',
        'Verified IDs: ZBPY4Boczf8 = "True Beast Mentality" (Motiversity), lsSC2vx7zFQ = "Its Not Over" (Ben Lionel Scott), mgMb1tgQjGE = "You Were Born For This" (Motiversity)',
      ]
    },
    meditation: {
      desc: 'Guided meditation or breathwork',
      instructions: [
        'Find a guided meditation or breathwork session — calm voice, ambient music, eyes-closed practice, 5-20 minutes.',
        'Channels: Great Meditation, Michael Sealey, Jason Stephenson, Headspace, Calm, Yoga With Adriene.',
        'DO NOT pick: motivational speeches, workout videos, lectures.',
        'Verified IDs: k0C9-4K7M_g = "Just Breathe Guided Meditation" (Great Meditation), inpok4MKVLM = "Yoga For Beginners" (Yoga With Adriene)',
      ]
    },
    manifesting: {
      desc: 'Manifesting / law of attraction / visualization',
      instructions: [
        'Find a video about manifesting, law of attraction, visualization, or calling in what you want — the kind that blends neuroscience, spiritual insight, and practical technique.',
        'Speakers/channels: Joe Dispenza, Abraham Hicks, Jake Ducey, Leeor Alexandra, Your Youniverse.',
        'DO NOT pick: generic motivation, workout content, or pure meditation with no manifesting element.',
        'Verified IDs: 5reo3dXOicU = "How Your Thoughts Are Connected To Your Future" (Joe Dispenza cinematic)',
      ]
    },
    observe: {
      desc: 'Observe your thoughts / mindfulness / inner work',
      instructions: [
        'Find a video about observing your own thoughts, mindfulness, inner peace, or detachment from the mind — Eckhart Tolle style, non-dual, or insight meditation.',
        'Speakers/channels: Eckhart Tolle, Mooji, Tara Brach, Adyashanti, Alan Watts, Rupert Spira.',
        'DO NOT pick: pure exercise motivation, manifesting hype, or TED lectures.',
      ]
    },
    affirmations: {
      desc: 'Affirmation video',
      instructions: [
        'Find an affirmation video — positive statements spoken directly to the listener, often with music, designed to rewire self-belief.',
        'Channels: YouAreCreators, Rockstar Affirmations, Bob Baker, Minds in Unison, Growing Forever.',
        'DO NOT pick: meditation without affirmations, motivational speeches without I-statements, lectures.',
      ]
    },
    selflove: {
      desc: 'Self love / self compassion / inner healing',
      instructions: [
        'Find a video about self love, self compassion, healing your inner world, or releasing self-judgment.',
        'Speakers/channels: Louise Hay, Tara Brach, Brene Brown, Kyle Cease, Lisa Nichols.',
        'DO NOT pick: hardcore hustle motivation, diet/fitness content, generic positive thinking.',
      ]
    },
    dopamine: {
      desc: 'Dopamine, habits, and the science of behavior',
      instructions: [
        'Find a podcast clip, short lecture, or explainer video about dopamine, habit formation, motivation science, or the neuroscience of behavior change.',
        'Speakers/channels: Andrew Huberman, Huberman Lab, Lex Fridman, Ali Abdaal, Thomas Frank, Dr. Anna Lembke.',
        'This can be a talking-head format — science content is the exception where lecture style works.',
        'DO NOT pick: pure motivation, meditation, or affirmations.',
      ]
    }
  };

  const chosen = contentTypes[video_type] || contentTypes['toughness'];

  const prompt = [
    'You are Franklyn. Recommend one YouTube video for this person.',
    '',
    'Content type requested: ' + chosen.desc,
    ...chosen.instructions,
    '',
    'Person:',
    '- Identity anchors: ' + anchorList,
    '- What knocks them off: ' + (pattern_trigger || 'unknown'),
    '- Mindset state: ' + stateDesc,
    mindset_text ? '- What they said: ' + mindset_text : '',
    excludeLine,
    '',
    'VIDEO_ID: 11-character YouTube ID you are certain is correct. A wrong ID breaks the embed — leave blank if unsure.',
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
