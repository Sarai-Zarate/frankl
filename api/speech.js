const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(data)); }
      });
    }).on('error', reject);
  });
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

async function searchYouTube(query, excludeTitles) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const q = encodeURIComponent(query);
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${q}&key=${key}&videoEmbeddable=true&safeSearch=none`;
  const data = await httpsGet(url);
  if (!data.items || !data.items.length) return null;

  // Skip any video whose title matches something already shown
  const excluded = (excludeTitles || '').toLowerCase();
  for (const item of data.items) {
    const title = item.snippet.title;
    if (excluded && excluded.includes(title.toLowerCase())) continue;
    return {
      video_id: item.id.videoId,
      title: title,
      speaker: item.snippet.channelTitle
    };
  }
  // If all excluded, just return first
  const first = data.items[0];
  return {
    video_id: first.id.videoId,
    title: first.snippet.title,
    speaker: first.snippet.channelTitle
  };
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

  const contentTypes = {
    toughness:    'cinematic motivational speech compilation site:youtube.com -ted -tedx -mel robbins',
    meditation:   'guided meditation breathing calm site:youtube.com',
    manifesting:  'manifesting law of attraction visualization joe dispenza site:youtube.com',
    observe:      'observe your thoughts mindfulness eckhart tolle inner peace site:youtube.com',
    affirmations: 'positive affirmations self belief rewire your mind site:youtube.com',
    selflove:     'self love self compassion inner healing site:youtube.com',
    dopamine:     'dopamine habits motivation science huberman site:youtube.com'
  };

  const searchQueries = {
    toughness:    ['motivational speech compilation mental toughness', 'cinematic motivational video best speeches', 'mental toughness motivational compilation Motiversity'],
    meditation:   ['guided meditation calm breathing', 'guided meditation for focus and clarity', 'morning meditation mindfulness'],
    manifesting:  ['joe dispenza manifesting thoughts become reality', 'law of attraction visualization meditation', 'manifesting your future self guided'],
    observe:      ['eckhart tolle observe your thoughts inner peace', 'mindfulness watching your thoughts meditation', 'observer of thoughts awareness meditation'],
    affirmations: ['positive affirmations self belief morning', 'I am affirmations confidence self worth', 'powerful affirmations rewire subconscious mind'],
    selflove:     ['self love meditation heal yourself', 'self compassion affirmations inner child', 'love yourself deeply guided meditation'],
    dopamine:     ['andrew huberman dopamine motivation podcast', 'dopamine detox habits science explained', 'neuroscience of motivation habits dopamine']
  };

  // Ask Claude for the best search query for this specific person
  const queryPrompt = [
    'You are Franklyn. Pick the single best YouTube search query to find a video for this person.',
    '',
    'Content type: ' + (video_type || 'toughness'),
    'Person mindset state: ' + stateDesc,
    mindset_text ? 'What they said: ' + mindset_text : '',
    'Identity anchors: ' + anchorList,
    'What knocks them off: ' + (pattern_trigger || 'unknown'),
    '',
    'Choose one of these queries or write a better variation (keep it under 8 words, YouTube-style):',
    ...(searchQueries[video_type] || searchQueries['toughness']),
    '',
    'Reply with just the search query on one line. Nothing else.'
  ].filter(Boolean).join('\n');

  let searchQuery = (searchQueries[video_type] || searchQueries['toughness'])[0];

  try {
    const queryResult = await post(JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 30,
      messages: [{ role: 'user', content: queryPrompt }]
    }));
    if (queryResult && queryResult.trim()) searchQuery = queryResult.trim();
  } catch(e) {
    // fall through to default query
  }

  // Search YouTube for a real working video
  let videoData = null;
  try {
    videoData = await searchYouTube(searchQuery, exclude_titles);
  } catch(e) {
    // fall through
  }

  // Ask Claude for a personalized framing sentence
  const framingPrompt = [
    'You are Franklyn. Write one sentence introducing this video to the user.',
    '',
    'Video: ' + (videoData ? `"${videoData.title}" by ${videoData.speaker}` : 'a ' + (video_type || 'motivational') + ' video'),
    'Person mindset state: ' + stateDesc,
    mindset_text ? 'What they said: ' + mindset_text : '',
    'Identity anchors: ' + anchorList,
    '',
    'One sentence. Franklyn\'s voice. Specific to this person. No clichés, no em dashes, no quotes around the sentence.'
  ].filter(Boolean).join('\n');

  let framing = 'This one is for exactly where you are right now.';
  try {
    const framingResult = await post(JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{ role: 'user', content: framingPrompt }]
    }));
    if (framingResult && framingResult.trim()) framing = framingResult.trim();
  } catch(e) {
    // use default framing
  }

  if (videoData) {
    const youtube_watch_url = `https://www.youtube.com/watch?v=${videoData.video_id}`;
    const youtube_search_url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    res.status(200).json({
      speaker: videoData.speaker,
      title: videoData.title,
      framing,
      video_id: videoData.video_id,
      youtube_watch_url,
      youtube_search_url
    });
  } else {
    // Fallback: no YouTube API key or search failed — return search link only
    const youtube_search_url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    res.status(200).json({
      speaker: '',
      title: searchQuery,
      framing,
      video_id: null,
      youtube_watch_url: null,
      youtube_search_url
    });
  }
};
