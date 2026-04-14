const express = require('express');
const { Pool } = require('pg');
const { Queue } = require('bullmq');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

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

app.get('/api/todos', async (_, res) => {
  const { rows } = await pool.query('SELECT * FROM todos ORDER BY id DESC');
  res.json(rows);
});

app.post('/api/todos', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const { rows } = await pool.query(
    'INSERT INTO todos (text) VALUES ($1) RETURNING *', [text]
  );
  await queue.add('process', { todoId: rows[0].id });
  res.status(201).json(rows[0]);
});

initDb().then(() => {
  app.listen(3000, () => console.log('API listening on :3000'));
}).catch(e => { console.error(e); process.exit(1); });
