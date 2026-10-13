import { test } from 'node:test';
import assert from 'node:assert/strict';

class Element extends EventTarget {
  textContent = '';
  value = '';
  hidden = false;
  checked = false;
  children = [];
  append(...children) { this.children.push(...children); }
  prepend(...children) { this.children.unshift(...children); }
  replaceChildren(...children) { this.children = children; }
  reset() {}
}

const ids = [
  'instruction-form', 'side-buy', 'side-sell', 'order-price', 'order-quantity', 'intent-owner', 'order-summary', 'exact-review', 'imported-status',
  'status-command', 'status-command-json', 'review-message', 'status-message', 'prepare-command', 'prepare-command-json',
  'copy-prepare-command', 'copy-prepare-command-json', 'copy-prepare-message', 'copy-prepare-json-message', 'instruction-message',
  'review-import-form', 'review-json', 'status-import-form', 'status-json', 'reset',
];

const setup = () => {
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  elements['side-buy'].value = 'buy';
  elements['side-sell'].value = 'sell';
  elements['copy-prepare-command'].hidden = true;
  elements['copy-prepare-command-json'].hidden = true;
  elements['instruction-form'].reset = () => {
    for (const id of ['side-buy', 'side-sell']) elements[id].checked = false;
    for (const id of ['order-price', 'order-quantity', 'intent-owner']) elements[id].value = '';
  };
  const radios = [elements['side-buy'], elements['side-sell']];
  return {
    elements,
    document: {
      getElementById: id => elements[id],
      createElement: () => new Element(),
      querySelector: selector => selector === 'input[name="intent-side"]:checked' ? radios.find(radio => radio.checked) : undefined,
      querySelectorAll: selector => selector === 'input[name="intent-side"]' ? radios : [],
    },
  };
};

const restoreGlobal = (key, descriptor) => {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  else delete globalThis[key];
};

const mount = async (f, clipboard, suffix) => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'document', { value: f.document, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true });
  try {
    await import(`../dist/handoff-ui.mjs?copy-button-${suffix}`);
  } catch (error) {
    restoreGlobal('document', originalDocument);
    restoreGlobal('navigator', originalNavigator);
    throw error;
  }
  return () => {
    restoreGlobal('document', originalDocument);
    restoreGlobal('navigator', originalNavigator);
  };
};

const settle = () => new Promise(resolve => setImmediate(resolve));

const prepare = elements => {
  elements['side-buy'].checked = true;
  elements['order-price'].value = '0.025';
  elements['order-quantity'].value = '1000';
  elements['intent-owner'].value = `0x${'1'.repeat(40)}`;
  elements['instruction-form'].dispatchEvent(new Event('submit', { cancelable: true }));
};

const textTree = element => `${element.textContent} ${element.children.map(textTree).join(' ')}`;

test('prepare command copies only after a click and becomes unavailable when terms change', async () => {
  const f = setup();
  const copied = [];
  const unmount = await mount(f, { writeText: async text => copied.push(text) }, 'success');
  try {
    prepare(f.elements);
    assert.equal(f.elements['instruction-message'].textContent, 'Command ready. Run it in Agent Wallet and check the full review shown there.');
    const command = `mm kuru prepare --owner 0x${'1'.repeat(40)} --side buy --price 0.025 --quantity 1000 --format text`;
    assert.equal(f.elements['prepare-command'].textContent, command);
    assert.equal(f.elements['copy-prepare-command'].hidden, false);
    assert.match(f.elements['prepare-command-json'].textContent, /--format json$/);
    assert.equal(f.elements['order-summary'].textContent, 'Buy 1000 MON at 0.025 USDC per MON · GTC post-only');
    assert.deepEqual(copied, []);

    f.elements['copy-prepare-command'].dispatchEvent(new Event('click'));
    await settle();
    assert.deepEqual(copied, [command]);
    assert.match(f.elements['copy-prepare-message'].textContent, /Copied/);

    f.elements['order-price'].value = '0.030';
    f.elements['order-price'].dispatchEvent(new Event('input'));
    assert.equal(f.elements['prepare-command'].textContent, '');
    assert.equal(f.elements['prepare-command-json'].textContent, '');
    assert.equal(f.elements['copy-prepare-command'].hidden, true);
    assert.equal(f.elements['copy-prepare-command-json'].hidden, true);
    assert.equal(f.elements['copy-prepare-message'].textContent, '');

    prepare(f.elements);
    assert.equal(f.elements['copy-prepare-command'].hidden, false);
    f.elements.reset.dispatchEvent(new Event('click'));
    assert.equal(f.elements['prepare-command'].textContent, '');
    assert.equal(f.elements['copy-prepare-command'].hidden, true);
    assert.equal(f.elements['copy-prepare-message'].textContent, '');
  } finally {
    unmount();
  }
});

test('prepare command gives a manual selection fallback when clipboard access fails', async () => {
  const f = setup();
  const unmount = await mount(f, { writeText: async () => { throw new Error('denied'); } }, 'denied');
  try {
    prepare(f.elements);
    f.elements['copy-prepare-command'].dispatchEvent(new Event('click'));
    await settle();
    assert.match(f.elements['copy-prepare-message'].textContent, /Select and copy the command above manually/);
  } finally {
    unmount();
  }
});

test('status import shows claimed provenance with permanent unverified framing', async () => {
  const f = setup();
  const unmount = await mount(f, { writeText: async () => {} }, 'status-provenance');
  try {
    prepare(f.elements);
    const owner = `0x${'1'.repeat(40)}`;
    const review = { intentId: 'a'.repeat(64), confirmationDigest: 'a'.repeat(64), market: '0x26cd68436b6a4aeb3ec52abc20a4d121f8b4bac9', owner, accountId: '7', network: 'Monad TESTNET (10143) · dummy test assets', order: 'Buy 1000 MON at a limit of 0.025 USDC/MON', funding: '25.01 USDC prefunded in AccountCore', estimatedMakerFee: '0.01 USDC', walletGasBalance: '1 MON', type: 'GTC + POST_ONLY', localReviewExpires: new Date(Date.now() + 60_000).toISOString() };
    f.elements['review-json'].value = JSON.stringify(review);
    f.elements['review-import-form'].dispatchEvent(new Event('submit', { cancelable: true }));
    assert.match(f.elements['review-message'].textContent, /Imported CLI review/);
    assert.match(textTree(f.elements['exact-review']), /Kuru account ID\s+7/);
    const report = { intentId: review.intentId, state: 'open', filled: '0 MON', open: '1000 MON', cancelled: '0 MON', otherRemoved: '0 MON', throughFinalizedBlock: '105', evidence: [], reconciliationProvenance: { schemaVersion: 2, chainId: 10143, market: review.market, intentOwner: owner, intentAccountId: '7', submissionHash: `0x${'a'.repeat(64)}`, expectedSubmissionHash: `0x${'a'.repeat(64)}`, submissionHashMatches: true, receiptStatus: 'success', receiptBlock: '101', evidenceFromBlock: '101', evidenceToBlock: '105', finalizedHeadHash: `0x${'b'.repeat(64)}`, observedAtMs: 1790928000000, requestMatches: true, finalized: true, complete: true, canonical: true } };
    f.elements['status-json'].value = JSON.stringify(report);
    f.elements['status-import-form'].dispatchEvent(new Event('submit', { cancelable: true }));
    const rendered = textTree(f.elements['imported-status']);
    assert.match(rendered, /2026-10-02T08:00:00\.000Z/);
    assert.match(rendered, /Reported chain ID\s+10143/);
    assert.match(rendered, /Intent owner\s+0x1111111111111111111111111111111111111111/);
    assert.match(rendered, /Observed submission transaction/);
    assert.match(f.elements['status-message'].textContent, /unverified by this browser/);

    f.elements['status-json'].value = JSON.stringify({ intentId: review.intentId, state: 'needs-review', filled: 'Unknown', open: 'Unknown', cancelled: 'Unknown', otherRemoved: 'Unknown', throughFinalizedBlock: null, evidence: ['Older report'] });
    f.elements['status-import-form'].dispatchEvent(new Event('submit', { cancelable: true }));
    const legacyRendered = textTree(f.elements['imported-status']);
    assert.match(legacyRendered, /Unknown · this report has no observation timestamp/);
    assert.match(legacyRendered, /older report has no versioned reconciliation provenance/);
  } finally {
    unmount();
  }
});
