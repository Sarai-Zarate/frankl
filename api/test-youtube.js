const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error(data)); } });
    }).on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(200).json({ error: 'YOUTUBE_API_KEY not set' });
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=3&q=motivational+speech+compilation&key=${key}&relevanceLanguage=en`;
    const data = await httpsGet(url);
    res.status(200).json({ key_prefix: key.slice(0,8)+'...', result: data });
  } catch(e) {
    res.status(200).json({ error: e.message });
  }
};
