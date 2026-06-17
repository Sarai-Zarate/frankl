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

async function searchYouTube(query, excludeTitles) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) { console.error('YOUTUBE_API_KEY not set'); return null; }
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${key}&relevanceLanguage=en&safeSearch=none`;
  const data = await httpsGet(url);
  if (data.error) { console.error('YouTube API error:', JSON.stringify(data.error)); return null; }
  if (!data.items || !data.items.length) { console.error('YouTube returned no items for:', query); return null; }

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
  const first = data.items[0];
  return {
    video_id: first.id.videoId,
    title: first.snippet.title,
    speaker: first.snippet.channelTitle
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mindset_state, mindset_text, identity_anchors, pattern_trigger, exclude_titles } = req.body;

  const anchorList = (identity_anchors || []).filter(Boolean).join(', ') || 'not set';

  const stateDescriptions = {
    ready:     'clear and willing — this is already the plan',
    resistant: 'knows they should but something is in the way',
    low:       'energy is down, not sure they have it today',
    avoiding:  'have been putting this off and they know it'
  };
  const stateDesc = stateDescriptions[mindset_state] || (mindset_text ? 'described below' : 'unspecified');

  // Step 1: Claude reads context and decides the best search query
  const queryPrompt = [
    'You are Franklyn. Based on what this person shared, choose the single best YouTube search query to find them a helpful video right now.',
    '',
    'Person:',
    '- Mindset state: ' + stateDesc,
    mindset_text ? '- What they said: ' + mindset_text : '',
    '- Identity anchors: ' + anchorList,
    '- What knocks them off: ' + (pattern_trigger || 'unknown'),
    '',
    'Read what they said and pick the right type of content:',
    '- Tired, sore, burnt out → recovery, rest, gentle movement, or calming meditation',
    '- Anxious, overthinking → breathwork, mindfulness, observe your thoughts',
    '- Avoiding, resistant, low motivation → cinematic motivational speech compilation (Motiversity, Ben Lionel Scott)',
    '- Wants to manifest or visualize → Joe Dispenza, law of attraction, visualization',
    '- Needs self compassion → self love, inner healing, Louise Hay',
    '- Curious about science of behavior → Huberman dopamine habits neuroscience',
    '- Ready and wants fire → high energy motivational speech compilation',
    '',
    'Write a YouTube search query of 4-7 words that would find the right video. No quotes, no punctuation. Just the query.',
    'Reply with only the search query on one line.'
  ].filter(Boolean).join('\n');

  let searchQuery = 'motivational speech compilation mental toughness';
  try {
    const q = await post(JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      messages: [{ role: 'user', content: queryPrompt }]
    }));
    if (q && q.trim()) searchQuery = q.trim().replace(/^["']|["']$/g, '');
  } catch(e) { /* use default */ }

  // Step 2: Search YouTube for a real working video
  let videoData = null;
  try {
    videoData = await searchYouTube(searchQuery, exclude_titles);
  } catch(e) { /* fall through */ }

  // Step 3: Claude writes a personalized framing sentence
  const framingPrompt = [
    'You are Franklyn. Write one sentence introducing this video to the user.',
    videoData
      ? `Video: "${videoData.title}" by ${videoData.speaker}`
      : `Video type: ${searchQuery}`,
    '- Mindset state: ' + stateDesc,
    mindset_text ? '- What they said: ' + mindset_text : '',
    '- Identity anchors: ' + anchorList,
    '',
    'One sentence only. Franklyn voice — direct, warm, specific to this person. No clichés, no em dashes.'
  ].filter(Boolean).join('\n');

  let framing = 'This one is for exactly where you are right now.';
  try {
    const f = await post(JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{ role: 'user', content: framingPrompt }]
    }));
    if (f && f.trim()) framing = f.trim();
  } catch(e) { /* use default */ }

  if (videoData) {
    res.status(200).json({
      speaker: videoData.speaker,
      title: videoData.title,
      framing,
      video_id: videoData.video_id,
      youtube_watch_url: `https://www.youtube.com/watch?v=${videoData.video_id}`,
      youtube_search_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`
    });
  } else {
    // YouTube API unavailable — return search link only, no broken embed
    res.status(200).json({
      speaker: null,
      title: null,
      framing,
      video_id: null,
      youtube_watch_url: null,
      youtube_search_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`
    });
  }
};
