#!/usr/bin/env node
// Dashboard local del laboratorio. Está pensado para uso en la red de pruebas.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'dashboard', 'public');
const resultsDir = path.join(root, 'benchmarks', 'results');
const port = Number(process.env.DASHBOARD_PORT || 8090);
const runs = new Map();
const allowedStacks = new Set(['php', 'python', 'kotlin', 'node', 'go']);
const allowedScenarios = new Set(['mixed', 'error']);

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function body(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return JSON.parse(data || '{}');
}

function validDuration(value) { return typeof value === 'string' && /^[1-9][0-9]*(s|m|h)$/.test(value); }
function validRates(value) { return typeof value === 'string' && value.trim().split(/\s+/).every((n) => /^[1-9][0-9]*$/.test(n)); }

async function summaries(runId) {
  const dir = path.join(resultsDir, runId);
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json') && !name.startsWith('manifest') && !name.startsWith('raw-'));
  return Promise.all(files.map(async (name) => JSON.parse(await readFile(path.join(dir, name), 'utf8'))));
}

async function history() {
  if (!existsSync(resultsDir)) return [];
  const dirs = await readdir(resultsDir, { withFileTypes: true });
  const items = [];
  for (const dir of dirs.filter((entry) => entry.isDirectory())) {
    const manifestPath = path.join(resultsDir, dir.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    items.push({ id: dir.name, ...manifest, summaries: await summaries(dir.name) });
  }
  return items.sort((a, b) => b.id.localeCompare(a.id));
}

function launch(config) {
  const id = `dashboard-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${process.pid}`;
  const state = { id, status: 'running', lines: [], subscribers: new Set(), startedAt: new Date().toISOString() };
  runs.set(id, state);
  const child = spawn(path.join(root, 'bin', 'k6.sh'), config.stacks, {
    cwd: root,
    env: { ...process.env, RUN_NAME: id, SCENARIO: config.scenario, RATES: config.rates,
      REPEATS: String(config.repeats), WARMUP: config.warmup, DURATION: config.duration },
  });
  const push = (line) => {
    state.lines.push(line);
    for (const res of state.subscribers) res.write(`data: ${JSON.stringify({ line })}\n\n`);
  };
  child.stdout.on('data', (chunk) => chunk.toString().split('\n').filter(Boolean).forEach(push));
  child.stderr.on('data', (chunk) => chunk.toString().split('\n').filter(Boolean).forEach(push));
  child.on('close', async (code) => {
    state.status = code === 0 ? 'completed' : 'failed';
    state.code = code;
    state.results = await summaries(id);
    for (const res of state.subscribers) {
      res.write(`event: done\ndata: ${JSON.stringify({ status: state.status, code })}\n\n`);
      res.end();
    }
    state.subscribers.clear();
  });
  return state;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/history' && req.method === 'GET') return json(res, 200, await history());
    if (url.pathname === '/api/runs' && req.method === 'POST') {
      const config = await body(req);
      const stacks = Array.isArray(config.stacks) ? config.stacks : ['php', 'python', 'kotlin', 'node', 'go'];
      if (!stacks.length || stacks.some((stack) => !allowedStacks.has(stack))) return json(res, 400, { error: 'stacks inválidos' });
      if (!allowedScenarios.has(config.scenario) || !validRates(config.rates) || !validDuration(config.warmup) || !validDuration(config.duration))
        return json(res, 400, { error: 'parámetros inválidos' });
      const repeats = Number(config.repeats);
      if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20) return json(res, 400, { error: 'repeats inválido' });
      const state = launch({ ...config, stacks, repeats });
      return json(res, 202, { id: state.id, status: state.status });
    }
    const eventMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (eventMatch && req.method === 'GET') {
      const state = runs.get(eventMatch[1]);
      if (!state) return json(res, 404, { error: 'run no encontrado' });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      for (const line of state.lines) res.write(`data: ${JSON.stringify({ line })}\n\n`);
      if (state.status === 'running') state.subscribers.add(res);
      else { res.write(`event: done\ndata: ${JSON.stringify({ status: state.status, code: state.code })}\n\n`); res.end(); }
      return;
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'endpoint no encontrado' });
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!file.includes('..')) {
      const filePath = path.join(publicDir, file);
      if (existsSync(filePath)) {
        res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' });
        return res.end(await readFile(filePath));
      }
    }
    res.writeHead(404); res.end('Not found');
  } catch (error) { json(res, 400, { error: error.message }); }
});

server.listen(port, () => console.log(`Dashboard disponible en http://localhost:${port}`));
