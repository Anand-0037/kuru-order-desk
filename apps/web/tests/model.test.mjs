import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewEstimate, selectScenario } from '../dist/model.mjs';
import fixture from '../dist/evidence.json' with { type: 'json' };

test('default buy review preserves exact units and conservative fee', () => {
 const r=reviewEstimate({side:'buy',price:'0.025',quantity:'1000'},fixture.snapshot);
 assert.equal(r.priceUnits,'25000'); assert.equal(r.quantityUnits,'1000000000');
 assert.equal(r.notional,'25'); assert.equal(r.fee,'0.01'); assert.equal(r.required,'25.01'); assert.equal(r.token,'USDC');
});
test('sell review funds base separately from quote maker fee', () => {
 const r=reviewEstimate({side:'sell',price:'0.025',quantity:'1000'},fixture.snapshot);
 assert.equal(r.required,'1000'); assert.equal(r.token,'MON'); assert.equal(r.fee,'0.01');
});
test('invalid and over-precision input are never silently rounded', () => {
 for(const price of ['1e-2','-1','0.0250001',' 0.025','00.025','0','4294.967296']) assert.throws(()=>reviewEstimate({side:'buy',price,quantity:'1000'},fixture.snapshot));
 for(const quantity of ['1e3','1000.0000001','0','NaN','']) assert.throws(()=>reviewEstimate({side:'buy',price:'0.025',quantity},fixture.snapshot));
});
test('fixture notional and prefunded balance gates are enforced', () => {
 assert.throws(()=>reviewEstimate({side:'buy',price:'0.025',quantity:'1'},fixture.snapshot),/notional/i);
 assert.throws(()=>reviewEstimate({side:'buy',price:'0.025',quantity:'50000'},fixture.snapshot),/balance/i);
});
test('fixture scenario values are sourced, not scaled from user inputs', () => {
 assert.equal(selectScenario(fixture,'partial').open,'600 MON');
 assert.equal(selectScenario(fixture,'cancelled').filled,'400 MON');
 assert.equal(selectScenario(fixture,'cancelled').cancelled,'600 MON');
 assert.equal(selectScenario(fixture,'cancelled').open,'0 MON');
});
test('ambiguous submission preserves unknown values and refusal', () => {
 const r=selectScenario(fixture,'unknown'); assert.equal(r.state,'needs-review');
 assert.equal(r.filled,'Unknown'); assert.equal(r.open,'Unknown'); assert.equal(r.cancelled,'Unknown');
 assert.equal(r.canRetry,false); assert.equal(r.executorCalls,1);
});
