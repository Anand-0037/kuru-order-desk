import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExact, formatExact, ceilDiv } from '../src/amounts.ts';
import { prepareIntent, verifyIntent, materialSnapshot } from '../src/planner.ts';
import { snapshot, input, NOW } from './fixtures.ts';

test('decimal amounts use exact units and never round extra precision', () => {
  assert.equal(parseExact('1.000001', 1_000_000n), 1_000_001n);
  assert.equal(formatExact(1_000_001n, 1_000_000n), '1.000001');
  for (const value of ['1.0000001', '1e3', '-1', 'NaN', ' 1 ', '0x20', '.1', '01.2', '1.', '']) assert.throws(() => parseExact(value, 1_000_000n));
  assert.throws(() => parseExact('1', 3n));
  assert.equal(ceilDiv(5n, 2n), 3n);
});

test('prepare binds exact owner, testnet target and maker budget in immutable digest', () => {
  const p = prepareIntent(input(), snapshot(), NOW);
  assert.equal(p.quantity, '1000000000');
  assert.equal(p.price, '25000');
  assert.equal(p.quoteNotionalAtoms, '25000000');
  assert.equal(p.funding.requiredAtoms, '25010000');
  assert.equal(p.funding.token, 'USDC');
  assert.equal(p.clientOrderId, `0x${p.digest}`);
  assert.equal(verifyIntent(p), true);
  assert.equal(verifyIntent({ ...p, price: '26000' }), false);
  assert.ok(p.risks.some(x => x.includes('no execution-time deadline')));
});

test('sell reserves exact native MON atoms with quote fee deducted from proceeds', () => {
  const p = prepareIntent(input({side:'sell'}), snapshot(), NOW);
  assert.equal(p.funding.requiredAtoms, '1000000000000000000000');
  assert.equal(p.funding.token, 'MON');
});

test('rejects stale, future, unregistered, funded incorrectly and non-exclusive snapshots', () => {
  assert.doesNotThrow(() => prepareIntent(input(), snapshot({ blockTimestampMs: NOW + 1000 }), NOW));
  for (const change of [
    { observedAtMs: NOW - 30001 }, { observedAtMs: NOW + 1 }, { blockTimestampMs: NOW - 30001 }, { blockTimestampMs: NOW + 2001 },
    { accountId:'0' }, { quoteFreeAtoms:'25009999' }, { chainId:1 }, { paused:true }, {marketState:1},
    { slots:['9', ...Array(61).fill('0')] }, { postFillHook:'0x1111111111111111111111111111111111111111' },
    { baseMultiplier:'1' }, {quoteDecimals:18}, {market:'0x1111111111111111111111111111111111111111'},
  ]) assert.throws(() => prepareIntent(input(), snapshot(change), NOW));
});

test('rejects prices and sizes outside ABI, tick, notional or exact numeric bounds', () => {
  for (const data of [{price:'0'}, {quantity:'0'}, {price:'4294.967296'}, {quantity:'79228162514264337593544'}, {quantity:'1'}, {side:'hold'}, {price:'0.025001'}]) {
    assert.throws(() => prepareIntent(input(data), snapshot({tick:'10'}), NOW));
  }
  assert.throws(() => prepareIntent(input(), snapshot({maxQuoteAtoms:'24999999'}), NOW));
});

test('material terms exclude block/balances but include fee and market identity', () => {
  assert.equal(materialSnapshot(snapshot()), materialSnapshot(snapshot({blockNumber:'101',quoteFreeAtoms:'999999999'})));
  assert.notEqual(materialSnapshot(snapshot()), materialSnapshot(snapshot({makerFeePps:'5000'})));
});
