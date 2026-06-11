module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { state, signals, anchors, evidence, signature } = req.body;

  const prompt = `You are Frankl, a warm psychologically grounded AI. You are informed by polyvagal theory, self-determination theory, and cognitive load theory. You are not a therapist but you understand the nervous system deeply.

The user has reported:
- Current state: ${state}
- Signals present: ${signals.join(', ')}

Their identity anchors are: ${anchors.join(', ')}

Recent evidence from their life:
${evidence.map(e => '- ' + e).join('\n')}

Their spiral signature: starts with comparison online, moves to unworthiness, lands on abandonment story, numbs with wine and cleaning.

Write a response that:
1. Names exactly what is happening in one precise sentence
2. Explains the mechanism why this makes neurological sense without jargon
3. Reflects one specific true thing from their actual evidence list
4. Gives one action small enough to do in 30 seconds

Rules:
- Warm, direct, zero judgment, zero nagging
- Write in prose, no bullet points
- Under 180 words total
- Speak like their most grounded self talking to them
- Never use the word journey`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content[0].text;
    res.status(200).json({ response: text });

  } catch (error) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
