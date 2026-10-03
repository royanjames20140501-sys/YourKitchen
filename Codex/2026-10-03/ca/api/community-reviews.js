const { createHash } = require('node:crypto');

const saveScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
if count > 10 then return -1 end
local recipes = redis.call('LRANGE', KEYS[2], 0, 499)
local exists = false
for _, raw in ipairs(recipes) do
  local ok, recipe = pcall(cjson.decode, raw)
  if ok and recipe.id == ARGV[1] then exists = true; break end
end
if not exists then return -2 end
redis.call('LPUSH', KEYS[3], ARGV[2])
if KEYS[3] == 'yk:community:reports' then redis.call('LTRIM', KEYS[3], 0, 999)
else redis.call('LTRIM', KEYS[3], 0, 99) end
return count
`;

function redisConfig() {
  try {
    const url = new URL(process.env.UPSTASH_REDIS_REST_URL || '');
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    return token && url.protocol === 'https:' && url.hostname.endsWith('.upstash.io') ? { url: url.href, token } : null;
  } catch { return null; }
}

async function redis(config, command) {
  const response = await fetch(config.url, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('Storage request failed');
  return data.result;
}

module.exports = async function communityReviews(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }
  const config = redisConfig();
  if (!config) return res.status(503).json({ error: 'Community reviews are not connected yet.' });
  if (req.method === 'GET') {
    const recipeId = String(req.query?.recipeId || '').slice(0, 100);
    if (!/^[a-f\d-]{1,100}$/i.test(recipeId)) return res.status(400).json({ error: 'Choose a community recipe first.' });
    try {
      const rows = await redis(config, ['LRANGE', `yk:community:reviews:${recipeId}`, '0', '99']);
      const reviews = Array.isArray(rows) ? rows.map(row => { try { const item = JSON.parse(row); return { rating: item.rating, message: item.message, createdAt: item.createdAt }; } catch { return null; } }).filter(Boolean) : [];
      const average = reviews.length ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length : 0;
      return res.status(200).json({ count: reviews.length, average: Number(average.toFixed(1)), reviews: reviews.slice(0, 5) });
    } catch { return res.status(502).json({ error: 'Could not load ratings right now.' }); }
  }

  if (Number(req.headers['content-length'] || 0) > 1200) return res.status(413).json({ error: 'That review is too long.' });
  let origin;
  try { origin = new URL(req.headers.origin); } catch {}
  if (!origin || origin.host !== req.headers.host || origin.protocol !== 'https:') return res.status(403).json({ error: 'Reviews can only be sent from the hosted YourKitchen site.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const recipeId = typeof body.recipeId === 'string' ? body.recipeId.slice(0, 100) : '';
  const action = body.action === 'report' ? 'report' : body.action === 'rate' ? 'rate' : '';
  const rating = Number(body.rating);
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
  if (!action || !/^[a-f\d-]{1,100}$/i.test(recipeId) || (action === 'rate' && (!Number.isInteger(rating) || rating < 1 || rating > 5)) || (action === 'report' && !message)) {
    return res.status(400).json({ error: 'Add a recipe, a 1–5 star rating, or a report reason.' });
  }
  const forwarded = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const ipHash = createHash('sha256').update(forwarded).digest('hex').slice(0, 24);
  const entry = action === 'rate'
    ? { id: createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 16), rating, message, createdAt: new Date().toISOString() }
    : { id: createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 16), reason: message, createdAt: new Date().toISOString() };
  const targetKey = action === 'rate' ? `yk:community:reviews:${recipeId}` : 'yk:community:reports';
  try {
    const result = await redis(config, ['EVAL', saveScript, 3, `yk:community:review-rate:${ipHash}`, 'yk:community:recipes', targetKey, recipeId, JSON.stringify(entry)]);
    if (result === -1) return res.status(429).json({ error: 'Please wait a minute before sending more ratings or reports.' });
    if (result === -2) return res.status(404).json({ error: 'That community recipe could not be found.' });
    return res.status(201).json({ saved: true });
  } catch { return res.status(502).json({ error: 'Your rating or report could not be saved right now.' }); }
};
