#!/usr/bin/env node
/** Quick end-to-end check for banking APIs through the public gateway.
 *   SMOKE_BASE_URL=http://localhost:3000 node scripts/smoke-banking.mjs
 */
const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

const suffix = Date.now().toString(36);
const email = `bank-${suffix}@efls.local`;
const password = 'BankTest123!';

await request('/api/v1/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, username: `bank_${suffix}`, password }),
});
console.log('[ok] register');

const session = await request('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const token = session.accessToken;
console.log('[ok] login');

const overview = await request('/api/v1/banking/overview', {
  headers: { Authorization: `Bearer ${token}` },
});
if (overview.characterId === undefined) throw new Error('overview missing characterId');
if (!overview.cash || overview.cash.amount !== 500_000) {
  throw new Error(`unexpected starting cash: ${JSON.stringify(overview.cash)}`);
}
console.log(
  '[ok] banking/overview',
  JSON.stringify({ cash: overview.cash, creditScore: overview.creditScore }),
);

const loan = await request('/api/v1/banking/loans', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ amount: { amount: 100_000, currency: 'USD' }, termMonths: 12 }),
});
if (!loan.id || loan.outstanding.amount !== 100_000) throw new Error('loan not created');
console.log('[ok] loan created', loan.id, loan.outstanding.amount);

const repaid = await request(`/api/v1/banking/loans/${loan.id}/repay`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ amount: { amount: 50_000, currency: 'USD' } }),
});
if (repaid.outstanding.amount !== 50_000) throw new Error('repayment not applied');
console.log('[ok] loan repaid partial', repaid.outstanding.amount);

const full = await request(`/api/v1/banking/loans/${loan.id}/repay`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ amount: { amount: 50_000, currency: 'USD' } }),
});
if (full.status !== 'repaid') throw new Error('loan not fully repaid');
console.log('[ok] loan fully repaid', full.status);

const savings = await request('/api/v1/banking/savings/deposit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ amount: { amount: 25_000, currency: 'USD' } }),
});
if (savings.balance.amount !== 25_000) throw new Error('savings deposit failed');
console.log('[ok] savings deposit', savings.balance.amount);

const withdrawn = await request('/api/v1/banking/savings/withdraw', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ amount: { amount: 10_000, currency: 'USD' } }),
});
if (withdrawn.balance.amount !== 15_000) throw new Error('savings withdraw failed');
console.log('[ok] savings withdraw', withdrawn.balance.amount);

console.log('\nBanking smoke test passed.');
process.exit(0);
