const { createHash } = require('node:crypto');

const storeScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
if count > 10 then return -1 end
redis.call('LPUSH', KEYS[2], ARGV[1])
redis.call('LTRIM', KEYS[2], 0, 9999)
return count
`;

module.exports = async function feedback(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST to submit feedback.' });
  }
  const length = Number(req.headers['content-length'] || 0);
  if (length > 2048) return res.status(413).json({ error: 'Feedback is too large.' });
  let origin;
  try { origin = new URL(req.headers.origin); } catch {}
  if (!origin || origin.host !== req.headers.host || !/^https?:$/.test(origin.protocol)) {
    return res.status(403).json({ error: 'Feedback can only be sent from YourKitchen.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const kind = body.kind === 'dish' ? 'dish' : body.kind === 'site' ? 'site' : '';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
  const recipeId = typeof body.recipeId === 'string' ? body.recipeId.slice(0, 100) : '';
  const recipeName = typeof body.recipeName === 'string' ? body.recipeName.trim().slice(0, 120) : '';
  const rating = Number(body.rating);
  if (!kind || (kind === 'site' && !message) || (kind === 'dish' && (!recipeName || !Number.isInteger(rating) || rating < 1 || rating > 5))) {
    return res.status(400).json({ error: 'Add a message for site feedback, or a 1–5 rating for dish feedback.' });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return res.status(503).json({ error: 'The feedback store is not connected yet.' });
  let parsedRedisUrl;
  try { parsedRedisUrl = new URL(redisUrl); } catch {}
  if (!parsedRedisUrl || parsedRedisUrl.protocol !== 'https:' || !parsedRedisUrl.hostname.endsWith('.upstash.io')) {
    return res.status(503).json({ error: 'The feedback store is not configured correctly.' });
  }

  const forwarded = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const ipDigest = createHash('sha256').update(forwarded).digest('hex').slice(0, 24);
  const entry = {
    id: createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 20),
    kind,
    recipeId: recipeId || undefined,
    recipeName: recipeName || undefined,
    rating: kind === 'dish' ? rating : undefined,
    message: message || undefined,
    createdAt: new Date().toISOString()
  };
  try {
    const response = await fetch(parsedRedisUrl.href, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', storeScript, 2, `yk:feedback:rate:${ipDigest}`, 'yk:feedback:entries', JSON.stringify(entry)])
    });
    const result = await response.json();
    if (!response.ok || result.error) {
      console.error('Feedback storage failed:', response.status);
      return res.status(502).json({ error: 'Feedback could not be saved right now.' });
    }
    if (result.result === -1) return res.status(429).json({ error: 'Please wait a minute before sending more feedback.' });
    return res.status(201).json({ saved: true });
  } catch {
    return res.status(502).json({ error: 'Feedback could not be saved right now.' });
  }
};
