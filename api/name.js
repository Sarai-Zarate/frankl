const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { state, signals, anchors, evidence, signature, todayFocus, todayPriorities, numbing } = req.body;
  const anchorList = (anchors || []).filter(Boolean).join(', ') || 'their identity anchors';
  const evidenceList = (evidence || []).join(' | ') || 'none yet';
  const sig = signature || 'unknown pattern';
  const priorities = todayPriorities && todayPriorities.length ? todayPriorities : (todayFocus ? [todayFocus] : []);
  const topFocus = priorities[0] || '';
  const priorityLine = priorities.length
    ? 'Their Big Three for today: ' + priorities.map(function(p,i){return (i+1)+'. '+p;}).join(' | ')
    : '';
  const numbingLine = numbing ? 'What they default to when overwhelmed: ' + numbing : '';

  const oneThing = topFocus
    ? (state === 'anxious' || state === 'spiral'
        ? 'ONE THING RIGHT NOW:\n(A 90-second competing action toward their top priority — "' + topFocus + '" — that directly replaces their default behavior of "' + (numbing || 'numbing') + '". Specific and tiny. Start with →)'
        : 'ONE THING RIGHT NOW:\n(One small step toward their top priority: "' + topFocus + '". Specific, completable in under 2 minutes. Start with →)')
    : 'ONE THING RIGHT NOW:\n(one specific action starting with →, completable in 30 seconds or less)';

  const prompt = [
    'You are Franklyn, a warm psychologically grounded coach.',
    'Current state: ' + state,
    'Signals selected: ' + (signals || []).join(', '),
    'Identity anchors: ' + anchorList,
    'Evidence of progress: ' + evidenceList,
    'Their pattern: ' + sig,
    priorityLine,
    numbingLine,
    '',
    'Reply with exactly these six labeled sections:',
    'WHAT IS HAPPENING:',
    '(one sentence naming the pattern precisely)',
    '',
    'WHY THIS MAKES SENSE:',
    '(2-3 sentences on the mechanism — cite Porges, Sweller, or relevant science)',
    '',
    'WHAT IS ACTUALLY TRUE:',
    '(1-2 sentences grounding them in their real evidence and anchors)',
    '',
    oneThing,
    '',
    'DONE TITLE:',
    '(3-5 words — a landing statement after they complete the one thing, specific to their state)',
    '',
    'DONE BODY:',
    '(one sentence — what just happened and what it means, referencing their morning focus if set)',
    '',
    'Warm, direct, specific to this person. No bullets. No em dashes or en dashes. Use commas and periods instead. Never use the word journey.'
  ].filter(Boolean).join('\n');

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
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

    const all = ['WHAT IS HAPPENING:', 'WHY THIS MAKES SENSE:', 'WHAT IS ACTUALLY TRUE:', 'ONE THING RIGHT NOW:', 'DONE TITLE:', 'DONE BODY:'];
    res.status(200).json({
      what:       extract(text, all[0], all.slice(1)),
      why:        extract(text, all[1], all.slice(2)),
      truth:      extract(text, all[2], all.slice(3)),
      action:     extract(text, all[3], all.slice(4)),
      done_title: extract(text, all[4], all.slice(5)),
      done_body:  extract(text, all[5], [])
    });

  } catch(error) {
    res.status(500).json({ error: error.message });
  }
};
