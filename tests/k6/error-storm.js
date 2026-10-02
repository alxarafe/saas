// Error Storm: carga de validación, auth y conflictos transaccionales.
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const target = __ENV.TARGET_URL || 'http://127.0.0.1:3000';
const stack = __ENV.STACK || 'local';
const rate = Number(__ENV.RATE || 20);
const duration = __ENV.DURATION || '30s';
const runId = __ENV.RUN_ID || 'error-storm';

export const options = {
  scenarios: { errors: { executor: 'constant-arrival-rate', rate, timeUnit: '1s', duration,
    preAllocatedVUs: Number(__ENV.PRE_VUS || 50), maxVUs: Number(__ENV.MAX_VUS || 500) } },
  thresholds: { request_failure_rate: ['rate<0.01'], dropped_iterations: ['count==0'] },
};

const failureRate = new Rate('request_failure_rate');
const contractFailures = new Counter('contract_failures');
const serverFailures = new Counter('server_failures');
const networkFailures = new Counter('network_failures');
const expectedClientErrors = new Counter('expected_client_errors');
const successfulRequests = new Counter('successful_requests');

function code(body, expected) { return body && body.error && body.error.code === expected; }

function inspect(res, endpoint, status, valid) {
  const labels = { stack, endpoint };
  let body = null;
  try { body = res.json(); } catch (_) { /* counted as a contract failure */ }
  const ok = res.status === status && valid(body);
  check(res, { 'status and body match contract': () => ok }, labels);
  failureRate.add(!ok, labels);
  if (ok && status >= 400) expectedClientErrors.add(1, labels);
  else if (ok) successfulRequests.add(1, labels);
  else if (res.status === 0) networkFailures.add(1, labels);
  else if (res.status >= 500) serverFailures.add(1, labels);
  else contractFailures.add(1, labels);
}

export default function () {
  const choice = Math.random();
  const headers = { 'Content-Type': 'application/json' };
  if (choice < 0.30) {
    const endpoint = 'bad-json';
    const res = http.post(`${target}/auth/login`, '{not-json', { headers, tags: { stack, endpoint } });
    inspect(res, endpoint, 400, (b) => code(b, 'bad_request'));
  } else if (choice < 0.55) {
    const endpoint = 'wrong-types';
    const res = http.post(`${target}/users/bulk`, JSON.stringify({ data: [{ email: 42, password_hash: true }] }),
      { headers, tags: { stack, endpoint } });
    inspect(res, endpoint, 422, (b) => code(b, 'validation_error'));
  } else if (choice < 0.80) {
    const endpoint = 'conflict';
    const email = `error-storm-${runId}@example.com`;
    const res = http.post(`${target}/users/bulk`, JSON.stringify({ data: [
      { email, password_hash: 'error-hash' }, { email, password_hash: 'error-hash' },
    ] }), { headers, tags: { stack, endpoint } });
    inspect(res, endpoint, 409, (b) => code(b, 'conflict'));
  } else if (choice < 0.90) {
    const endpoint = 'missing-auth';
    const res = http.get(`${target}/me`, { tags: { stack, endpoint } });
    inspect(res, endpoint, 401, (b) => code(b, 'missing_token'));
  } else {
    const endpoint = 'not-found';
    const res = http.get(`${target}/not-found`, { tags: { stack, endpoint } });
    inspect(res, endpoint, 404, (b) => code(b, 'endpoint_not_found'));
  }
}
