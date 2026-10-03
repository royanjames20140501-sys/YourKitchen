const { createHash } = require('node:crypto');

const saveScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
if count > 5 then return -1 end
redis.call('LPUSH', KEYS[2], ARGV[1])
redis.call('LTRIM', KEYS[2], 0, 499)
return count
`;

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.upstash.io') ? { url: parsed.href, token } : null;
  } catch { return null; }
}

async function command(config, args) {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('Storage request failed');
  return data.result;
}

module.exports = async function communityRecipes(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }
  const config = redisConfig();
  if (!config) return res.status(503).json({ error: 'The community recipe store is not connected yet.' });

  if (req.method === 'GET') {
    try {
      const rows = await command(config, ['LRANGE', 'yk:community:recipes', '0', '49']);
      let recipes = Array.isArray(rows) ? rows.map(row => { try { return JSON.parse(row); } catch { return null; } }).filter(Boolean) : [];
      if (recipes.length) {
        const base = config.url.endsWith('/') ? config.url : `${config.url}/`;
        const response = await fetch(new URL('pipeline', base), {
          method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(recipes.map(recipe => ['LRANGE', `yk:community:reviews:${recipe.id}`, '0', '99']))
        });
        const results = await response.json();
        if (!response.ok || !Array.isArray(results)) throw new Error('Could not load ratings');
        recipes = recipes.map((recipe, index) => {
          const reviewRows = Array.isArray(results[index]?.result) ? results[index].result : [];
          const ratings = reviewRows.map(row => { try { return Number(JSON.parse(row).rating); } catch { return 0; } }).filter(value => Number.isInteger(value) && value >= 1 && value <= 5);
          return { ...recipe, ratingCount: ratings.length, ratingAverage: ratings.length ? Number((ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)) : 0 };
        });
      }
      return res.status(200).json({ recipes });
    } catch {
      return res.status(502).json({ error: 'Community recipes are temporarily unavailable.' });
    }
  }

  if (Number(req.headers['content-length'] || 0) > 6000) return res.status(413).json({ error: 'That recipe is too long to share.' });
  let origin;
  try { origin = new URL(req.headers.origin); } catch {}
  if (!origin || origin.host !== req.headers.host || origin.protocol !== 'https:') {
    return res.status(403).json({ error: 'Recipes can only be shared from the hosted YourKitchen site.' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 100) : '';
  const cuisine = typeof body.cuisine === 'string' ? body.cuisine.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
  const author = typeof body.author === 'string' ? body.author.trim().replace(/\s+/g, ' ').slice(0, 50) : '';
  const time = Number(body.time);
  const cleanLines = value => typeof value === 'string' ? value.split(/\r?\n/).map(line => line.trim().replace(/\s+/g, ' ').slice(0, 180)).filter(Boolean).slice(0, 20) : [];
  const ingredients = cleanLines(body.ingredients);
  const steps = cleanLines(body.steps);
  if (!name || !Number.isInteger(time) || time < 1 || time > 600 || ingredients.length < 2 || steps.length < 2) {
    return res.status(400).json({ error: 'Add a name, at least two ingredients and two steps, and a valid cooking time.' });
  }
  const forwarded = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const ipDigest = createHash('sha256').update(forwarded).digest('hex').slice(0, 24);
  const recipe = {
    id: createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 16),
    name, cuisine: cuisine || 'Community kitchen', author: author || 'A home cook', time,
    ingredients, steps, createdAt: new Date().toISOString()
  };
  try {
    const result = await command(config, ['EVAL', saveScript, 2, `yk:community:rate:${ipDigest}`, 'yk:community:recipes', JSON.stringify(recipe)]);
    if (result === -1) return res.status(429).json({ error: 'You have shared several recipes recently. Try again in an hour.' });
    return res.status(201).json({ recipe });
  } catch {
    return res.status(502).json({ error: 'Your recipe could not be saved right now. Please try again.' });
  }
};
