// One request per iteration. RATE fixes offered load independently of response time.
// The runner executes this file once for warm-up and once for measurement.
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const target = __ENV.TARGET_URL || 'http://127.0.0.1:3000';
const stack = __ENV.STACK || 'local';
const rate = Number(__ENV.RATE || 20);
const duration = __ENV.DURATION || '3m';
// Fixed token without exp is intentional for this lab; unsafe in production.
const token = __ENV.AUTH_TOKEN ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSJ9.MTO9PoTY5azdFpJ7s4zTHpibadJdkQlHxqj5Lak5DWI';

export const options = {
  scenarios: {
    mixed: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration,
      preAllocatedVUs: Number(__ENV.PRE_VUS || 50),
      maxVUs: Number(__ENV.MAX_VUS || 500),
    },
  },
  thresholds: {
    request_failure_rate: ['rate<0.01'],
    dropped_iterations: ['count==0'],
  },
};

const failureRate = new Rate('request_failure_rate');
const contractFailures = new Counter('contract_failures');
const serverFailures = new Counter('server_failures');
const networkFailures = new Counter('network_failures');
const expectedClientErrors = new Counter('expected_client_errors');
const successfulRequests = new Counter('successful_requests');

function inspect(res, endpoint, expectedStatus, validBody) {
  const labels = { stack, endpoint };
  let body = null;
  try { body = res.json(); } catch (_) { /* recorded as contract failure below */ }
  const valid = res.status === expectedStatus && validBody(body);
  check(res, { 'status and body match contract': () => valid }, labels);
  failureRate.add(!valid, labels);
  if (valid) {
    if (expectedStatus >= 400) expectedClientErrors.add(1, labels);
    else successfulRequests.add(1, labels);
  } else if (res.status === 0) {
    networkFailures.add(1, labels);
  } else if (res.status >= 500) {
    serverFailures.add(1, labels);
  } else {
    contractFailures.add(1, labels);
  }
}

function jsonCode(body, code) {
  return body && body.error && body.error.code === code;
}

export default function () {
  const choice = Math.random();

  if (choice < 0.30) {
    const endpoint = 'health';
    const res = http.get(`${target}/health`, { tags: { stack, endpoint } });
    inspect(res, endpoint, 200, (b) => b && b.status === 'ok');
  } else if (choice < 0.56) {
    const endpoint = 'users';
    const res = http.get(`${target}/users?limit=20&offset=0`, { tags: { stack, endpoint } });
    inspect(res, endpoint, 200, (b) => b && Array.isArray(b.data) &&
      b.pagination && b.pagination.limit === 20 && b.pagination.offset === 0 &&
      typeof b.pagination.total === 'number');
  } else if (choice < 0.75) {
    const endpoint = 'me';
    const res = http.get(`${target}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      tags: { stack, endpoint },
    });
    inspect(res, endpoint, 200, (b) => b && b.data && b.data.id === 1 &&
      b.data.email === 'admin@example.com');
  } else if (choice < 0.90) {
    const endpoint = 'users-bulk';
    const suffix = `${__ENV.RUN_ID || 'run'}-${Date.now()}-${__VU}-${__ITER}`;
    const payload = JSON.stringify({ data: [
      { email: `k6-${suffix}-a@example.com`, password_hash: 'k6-hash' },
      { email: `k6-${suffix}-b@example.com`, password_hash: 'k6-hash' },
    ] });
    const res = http.post(`${target}/users/bulk`, payload, {
      headers: { 'Content-Type': 'application/json' },
      tags: { stack, endpoint },
    });
    inspect(res, endpoint, 201, (b) => b && Array.isArray(b.data) && b.data.length === 2);
  } else if (choice < 0.98) {
    const endpoint = 'login';
    const res = http.post(`${target}/auth/login`,
      JSON.stringify({ email: 'admin@example.com', password: 'secret' }), {
        headers: { 'Content-Type': 'application/json' },
        tags: { stack, endpoint },
      });
    inspect(res, endpoint, 200, (b) => b && b.data && typeof b.data.token === 'string');
  } else if (choice < 0.99) {
    const endpoint = 'not-found';
    const res = http.get(`${target}/not-found`, { tags: { stack, endpoint } });
    inspect(res, endpoint, 404, (b) => jsonCode(b, 'endpoint_not_found'));
  } else {
    const endpoint = 'me-no-auth';
    const res = http.get(`${target}/me`, { tags: { stack, endpoint } });
    inspect(res, endpoint, 401, (b) => jsonCode(b, 'missing_token'));
  }
}
