const express = require('express');
const { Pool } = require('pg');
const { Queue } = require('bullmq');

const app = express();
app.use(express.json());
const port = Number(process.env.PORT || 3000);

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
pool.on('error', error => console.error('PostgreSQL connection error:', error.message));

const queue = new Queue('todo-events', {
  connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) || 6379 }
});

async function initDb(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS todos (
          id SERIAL PRIMARY KEY,
          text TEXT NOT NULL,
          processed BOOLEAN DEFAULT FALSE,
          processed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('DB ready');
      return;
    } catch (e) {
      console.log(`DB not ready (attempt ${i + 1}): ${e.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('Could not connect to DB');
}

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.get('/api/todos', async (_, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM todos ORDER BY id DESC');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/todos', async (req, res, next) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO todos (text) VALUES ($1) RETURNING *', [text]
    );
    await queue.add('process', { todoId: rows[0].id });
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'request too large' });
  }
  console.error('Todo request failed:', error.message);
  res.status(500).json({ error: 'could not process the todo request' });
});

initDb().then(() => {
  app.listen(port, () => console.log(`API listening on :${port}`));
}).catch(e => { console.error(e); process.exit(1); });
