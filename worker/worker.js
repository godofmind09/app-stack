const { Worker } = require('bullmq');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const worker = new Worker('todo-events', async job => {
  const { todoId } = job.data;
  console.log(`Processing todo ${todoId}`);
  await new Promise(r => setTimeout(r, 1000));
  await pool.query(
    'UPDATE todos SET processed=TRUE, processed_at=NOW() WHERE id=$1',
    [todoId]
  );
  console.log(`Todo ${todoId} marked processed`);
}, {
  connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) || 6379 }
});

worker.on('failed', (job, err) => console.error(`Job ${job.id} failed:`, err.message));
console.log('Worker started, listening on queue: todo-events');
