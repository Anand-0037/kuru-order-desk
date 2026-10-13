// A deterministic command handoff. No model, signing, shell execution or RPC.
export const MARKET = '0x26cd68436b6a4aeb3ec52abc20a4d121f8b4bac9';
const decimal = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;
const id = /^[a-f0-9]{64}$/;
const txHash = /^0x[\da-fA-F]{64}$/;
const address = /^0x[\da-fA-F]{40}$/;
const states = new Set(['unconfirmed','needs-review','reverted','not-placed','open','partially-filled','filled','cancelled','partially-filled-cancelled','removed']);
export function parseOrder(text) {
  if (typeof text !== 'string' || text.length > 240) throw Error('Use a short instruction such as “Buy 1000 MON at 0.025”.');
  const match = text.trim().match(/^(?:place (?:a )?(?:post-only )?)?(buy|sell|bid|ask)(?: order)?(?: for)? ([\d,]+(?:\.\d+)?) MON (?:at|@) (\d+(?:\.\d+)?)(?: USDC(?:\/MON)?)?\.?$/i);
  if (!match) throw Error('Use “Buy 1000 MON at 0.025” or “Place a post-only bid for 1,000 MON at 0.025”. Other markets and order types are unsupported.');
  const raw = match[2];
  if (raw.includes(',') && !/^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) throw Error('Use standard thousands separators or omit commas.');
  const quantity = raw.replaceAll(',', ''), price = match[3];
  for (const value of [quantity, price]) if (!decimal.test(value) || value.length > 40 || !/[1-9]/.test(value)) throw Error('Price and quantity must be positive decimals with at most six decimal places.');
  return { side: /^(buy|bid)$/i.test(match[1]) ? 'buy' : 'sell', quantity, price };
}
export function parseOrderFields({ side, price, quantity } = {}) {
  if (!['buy','sell'].includes(side)) throw Error('Choose Buy or Sell.');
  for (const value of [price, quantity]) {
    if (typeof value !== 'string' || !decimal.test(value) || value.length > 40 || !/[1-9]/.test(value)) {
      throw Error('Enter a positive price and quantity using up to six decimal places.');
    }
  }
  return { side, price, quantity };
}
export function prepareCommand(order, owner, format = 'text') {
  if (!/^0x[\da-fA-F]{40}$/.test(owner) || /^0x0{40}$/.test(owner)) throw Error('Enter your dedicated testnet owner address.');
  // Validate again so callers cannot interpolate shell syntax.
  if (!['buy','sell'].includes(order.side) || !decimal.test(order.quantity) || !decimal.test(order.price) || !/[1-9]/.test(order.quantity) || !/[1-9]/.test(order.price)) throw Error('Invalid order fields.');
  if (!['text','json'].includes(format)) throw Error('Choose text or JSON output.');
  return `mm kuru prepare --owner ${owner} --side ${order.side} --price ${order.price} --quantity ${order.quantity} --format ${format}`;
}
function report(text) {
  if (typeof text !== 'string' || text.length > 65536) throw Error('Paste one CLI result object, up to 64 KB.');
  const value = JSON.parse(text);
  if (value?.ok === false) throw Error('The CLI returned an error. Resolve it before importing a result.');
  const result = value?.data ?? value;
  if (!result || typeof result !== 'object' || Array.isArray(result) || !id.test(result.intentId)) throw Error('Expected a CLI result with a full intent ID.');
  return result;
}
export function readReview(text, order, owner) {
  const r = report(text);
  if (!order) throw Error('Prepare an instruction first.');
  if (r.market?.toLowerCase() !== MARKET || r.owner?.toLowerCase() !== owner.toLowerCase() || !/^Monad TESTNET \(10143\)/.test(r.network) || r.confirmationDigest !== r.intentId) throw Error('The report does not match the fixed market, testnet, owner or review digest.');
  if (r.accountId !== undefined && (typeof r.accountId !== 'string' || !/^(0|[1-9]\d{0,77})$/.test(r.accountId))) throw Error('Review has an invalid Kuru account ID.');
  const parsed = typeof r.order === 'string' && r.order.match(/^(Buy|Sell) (\d+(?:\.\d+)?) MON at a limit of (\d+(?:\.\d+)?) USDC\/MON$/);
  const sameDecimal = (a,b) => {
    const atoms = s => { const [whole, fraction=''] = s.split('.'); return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6,'0')); };
    return decimal.test(a) && decimal.test(b) && atoms(a) === atoms(b);
  };
  if (!parsed || parsed[1].toLowerCase() !== order.side || !sameDecimal(parsed[2],order.quantity) || !sameDecimal(parsed[3],order.price)) throw Error('The CLI review is for different order terms. Generate a new review.');
  for (const key of ['funding','estimatedMakerFee','walletGasBalance','type','localReviewExpires']) if (typeof r[key] !== 'string' || r[key].length > 500) throw Error(`Review is missing ${key}.`);
  if (!/POST_ONLY/.test(r.type) || !Number.isFinite(Date.parse(r.localReviewExpires))) throw Error('Expected a post-only review with an expiry.');
  return r;
}
export function readStatus(text, review) {
  if (!review) throw Error('Import the matching prepare review first.');
  const r = report(text);
  if (r.intentId !== review.intentId) throw Error('Status belongs to a different intent.');
  if (!states.has(r.state)) throw Error('Unsupported order state.');
  for (const key of ['filled','open','cancelled','otherRemoved']) if (typeof r[key] !== 'string' || (r[key] !== 'Unknown' && !/^(?:0|[1-9]\d*)(?:\.\d{1,6})? MON$/.test(r[key]))) throw Error(`Invalid ${key} quantity.`);
  if (r.throughFinalizedBlock !== null && (typeof r.throughFinalizedBlock !== 'string' || !/^\d{1,78}$/.test(r.throughFinalizedBlock))) throw Error('Invalid finalized block.');
  if (!Array.isArray(r.evidence) || r.evidence.length > 100 || !r.evidence.every(x => typeof x === 'string' && x.length <= 2000)) throw Error('Invalid evidence summary.');
  const p = r.reconciliationProvenance;
  if (p !== undefined && p !== null) {
    if (!p || typeof p !== 'object' || Array.isArray(p) || ![1,2].includes(p.schemaVersion)) throw Error('Invalid reconciliation provenance version.');
    if (![p.submissionHash,p.expectedSubmissionHash,p.finalizedHeadHash].every(value => typeof value === 'string' && txHash.test(value))) throw Error('Invalid transaction or finalized-head hash in provenance.');
    if (!Number.isSafeInteger(p.observedAtMs) || p.observedAtMs < 0 || !Number.isFinite(new Date(p.observedAtMs).getTime())) throw Error('Invalid report observation time.');
    for (const key of ['receiptBlock','evidenceFromBlock','evidenceToBlock']) if (typeof p[key] !== 'string' || !/^\d{1,78}$/.test(p[key])) throw Error(`Invalid ${key} in provenance.`);
    if (!['success','reverted','pending'].includes(p.receiptStatus) || !['submissionHashMatches','requestMatches','finalized','complete','canonical'].every(key => typeof p[key] === 'boolean')) throw Error('Invalid reconciliation flags in provenance.');
    if (p.submissionHashMatches !== (p.submissionHash.toLowerCase() === p.expectedSubmissionHash.toLowerCase())) throw Error('Submission hash comparison is inconsistent.');
    if (p.schemaVersion === 2) {
      if (!Number.isSafeInteger(p.chainId) || p.chainId < 0 || typeof p.market !== 'string' || !address.test(p.market) || typeof p.intentOwner !== 'string' || !address.test(p.intentOwner) || typeof p.intentAccountId !== 'string' || !/^(0|[1-9]\d{0,77})$/.test(p.intentAccountId)) throw Error('Invalid order identity context in provenance.');
      if (p.chainId !== 10143 || p.market.toLowerCase() !== MARKET || p.intentOwner.toLowerCase() !== review.owner.toLowerCase() || (review.accountId !== undefined && p.intentAccountId !== review.accountId)) throw Error('Status provenance does not match the reviewed testnet chain, market, owner or Kuru account.');
    }
  }
  return r;
}

export function outcomeGuidance(status, review) {
  const atoms = value => {
    const match = typeof value === 'string' && value.match(/^(\d+(?:\.\d{1,6})?) MON$/);
    if (!match) return null;
    const [whole, fraction = ''] = match[1].split('.');
    return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  };
  const filled = atoms(status.filled), open = atoms(status.open), cancelled = atoms(status.cancelled), removed = atoms(status.otherRemoved);
  if (status.state === 'unconfirmed' || status.state === 'needs-review' ||
      [status.filled, status.open, status.cancelled, status.otherRemoved].includes('Unknown') ||
      [filled, open, cancelled, removed].some(value => value === null)) {
    return {
      title: 'The outcome is unknown.',
      next: 'Inspect the original Agent Wallet request and its status with a person. Do not retry or prepare a replacement order while the outcome is unresolved.'
    };
  }
  const zero = value => value === 0n;
  const positive = value => value > 0n;
  const consistent = {
    'not-placed': zero(filled) && zero(open) && zero(cancelled) && zero(removed),
    reverted: zero(filled) && zero(open) && zero(cancelled) && zero(removed),
    filled: positive(filled) && zero(open) && zero(cancelled) && zero(removed),
    open: positive(open) && zero(filled) && zero(cancelled) && zero(removed),
    'partially-filled': positive(filled) && positive(open) && zero(cancelled) && zero(removed),
    cancelled: zero(open) && zero(filled) && positive(cancelled) && zero(removed),
    'partially-filled-cancelled': zero(open) && positive(filled) && positive(cancelled) && zero(removed),
    removed: zero(open) && positive(removed) && zero(cancelled)
  }[status.state];
  const expected = review?.order?.match(/^(?:Buy|Sell) (\d+(?:\.\d+)?) MON at a limit of /);
  const conserved = expected && !['not-placed', 'reverted'].includes(status.state)
    ? filled + open + cancelled + removed === atoms(`${expected[1]} MON`)
    : true;
  if (consistent === false || !conserved) {
    return {
      title: 'The imported state and quantities do not agree.',
      next: 'Inspect the original Agent Wallet request and its status with a person. Do not retry or take an order action from this inconsistent report.'
    };
  }
  if (status.state === 'not-placed' || status.state === 'reverted') {
    return {
      title: 'This report says no order was placed.',
      next: 'There is nothing to cancel. Review the original report and order terms before preparing a fresh review.'
    };
  }
  if (status.state === 'filled') {
    return { title: 'The report says the order filled.', next: 'Nothing remains to cancel.' };
  }
  if (status.state === 'open' || status.state === 'partially-filled') {
    return {
      title: status.state === 'open' ? 'The report says the order is open.' : 'The report says part of the order filled and a remainder is open.',
      next: 'Review the current CLI status before deciding whether to cancel. Cancellation needs its own human-reviewed CLI step.'
    };
  }
  if (status.state === 'cancelled' || status.state === 'partially-filled-cancelled') {
    return { title: 'The report says the remaining order was cancelled.', next: 'Nothing remains to cancel. Any reported fills are shown as part of this CLI report.' };
  }
  if (status.state === 'removed') {
    return { title: 'The report says the order was removed.', next: 'Review the original request and evidence to understand the removal before taking another action.' };
  }
  return { title: 'Review the reported order state.', next: 'Use the original Agent Wallet request and its CLI status for the next human decision.' };
}
