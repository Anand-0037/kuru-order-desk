import { outcomeGuidance, parseOrderFields, prepareCommand, readReview, readStatus } from './handoff.mjs';

const $ = id => document.getElementById(id);
const statusTemplate = 'mm kuru status --intent <INTENT_ID> --format text';
let order, owner, review;

function message(id, text) {
  $(id).textContent = text;
}

function makeRows(values) {
  const dl = document.createElement('dl');
  dl.className = 'compact-list';
  for (const [label, value] of values) {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = String(value);
    row.append(dt, dd);
    dl.append(row);
  }
  return dl;
}

function rows(target, values) {
  $(target).replaceChildren(makeRows(values));
}

function clearReports() {
  review = undefined;
  $('exact-review').replaceChildren();
  $('imported-status').replaceChildren();
  $('status-command').textContent = statusTemplate;
  $('status-command-json').textContent = '';
  message('review-message', '');
  message('status-message', '');
}

function clearCommands() {
  clearReports();
  order = undefined;
  owner = undefined;
  $('order-summary').hidden = true;
  $('prepare-command').textContent = '';
  $('prepare-command-json').textContent = '';
  $('copy-prepare-command').hidden = true;
  $('copy-prepare-command-json').hidden = true;
  message('instruction-message', '');
  message('copy-prepare-message', '');
  message('copy-prepare-json-message', '');
}

function provenanceDetails(r) {
  const details = document.createElement('details');
  const title = document.createElement('summary');
  details.className = 'compact-details';
  title.textContent = 'Reported provenance details';
  details.append(title);
  const p = r.reconciliationProvenance;
  if (!p) {
    const note = document.createElement('p');
    note.className = 'wallet-note';
    note.textContent = 'This older report has no versioned reconciliation provenance. Its contents remain historical and unverified.';
    details.append(note);
    return details;
  }
  const values = [];
  if (p.schemaVersion === 2) values.push(['Reported chain ID', p.chainId], ['Reported market', p.market], ['Intent owner', p.intentOwner], ['Kuru account ID', p.intentAccountId]);
  values.push(['Observed submission transaction', p.submissionHash], ['Persisted expected transaction', p.expectedSubmissionHash], ['Submission hashes match', p.submissionHashMatches ? 'Yes · as reported' : 'No · as reported'], ['Receipt', `${p.receiptStatus} · block ${p.receiptBlock}`], ['Evidence block range', `${p.evidenceFromBlock}–${p.evidenceToBlock}`], ['Finalized head block hash', p.finalizedHeadHash], ['Request matches', p.requestMatches ? 'Yes · as reported' : 'No · as reported'], ['Finalized', p.finalized ? 'Yes · as reported' : 'No · as reported'], ['Log set complete', p.complete ? 'Yes · as reported' : 'No · as reported'], ['Evidence canonical', p.canonical ? 'Yes · as reported' : 'No · as reported']);
  details.append(makeRows(values));
  return details;
}

$('instruction-form').addEventListener('submit', event => {
  event.preventDefault();
  clearCommands();
  try {
    const side = document.querySelector('input[name="intent-side"]:checked')?.value;
    const parsed = parseOrderFields({ side, price: $('order-price').value.trim(), quantity: $('order-quantity').value.trim() });
    const address = $('intent-owner').value.trim();
    const command = prepareCommand(parsed, address);
    const jsonCommand = prepareCommand(parsed, address, 'json');
    order = parsed;
    owner = address;
    $('prepare-command').textContent = command;
    $('prepare-command-json').textContent = jsonCommand;
    $('order-summary').textContent = `${parsed.side === 'buy' ? 'Buy' : 'Sell'} ${parsed.quantity} MON at ${parsed.price} USDC per MON · GTC post-only`;
    $('order-summary').hidden = false;
    $('copy-prepare-command').hidden = false;
    $('copy-prepare-command-json').hidden = false;
    message('instruction-message', 'Command ready. Run it in Agent Wallet and check the full review shown there.');
  } catch (error) {
    message('instruction-message', error.message);
  }
});

for (const field of ['order-price', 'order-quantity', 'intent-owner']) {
  $(field).addEventListener('input', () => {
    clearCommands();
    message('instruction-message', 'Terms changed. Build a new command before reviewing an order.');
  });
}
for (const field of document.querySelectorAll('input[name="intent-side"]')) {
  field.addEventListener('change', () => {
    clearCommands();
    message('instruction-message', 'Terms changed. Build a new command before reviewing an order.');
  });
}

async function copyCommand(commandId, statusId, label) {
  const command = $(commandId).textContent;
  if (!command) return;
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (typeof clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
    await clipboard.writeText(command);
    message(statusId, `Copied. Review the ${label} before running it in Agent Wallet.`);
  } catch {
    message(statusId, 'Clipboard access is unavailable. Select and copy the command above manually.');
  }
}

$('copy-prepare-command').addEventListener('click', () => copyCommand('prepare-command', 'copy-prepare-message', 'text command'));
$('copy-prepare-command-json').addEventListener('click', () => copyCommand('prepare-command-json', 'copy-prepare-json-message', 'optional JSON command'));

$('review-import-form').addEventListener('submit', event => {
  event.preventDefault();
  clearReports();
  try {
    review = readReview($('review-json').value, order, owner);
    rows('exact-review', [['Order', review.order], ['Required custody funding', review.funding], ['Estimated maker fee', review.estimatedMakerFee], ['Wallet gas balance', review.walletGasBalance], ['Type', review.type], ['Review expires', review.localReviewExpires], ['Intent ID', review.intentId], ['Review digest', review.confirmationDigest], ['Kuru account ID', review.accountId ?? 'Unknown · older review format']]);
    if (Date.parse(review.localReviewExpires) <= Date.now()) {
      const note = document.createElement('p');
      note.className = 'outcome-summary';
      const heading = document.createElement('strong');
      heading.textContent = 'This review has expired.';
      const detail = document.createElement('span');
      detail.textContent = ' Prepare a fresh review before any authorization.';
      note.append(heading, detail);
      $('exact-review').append(note);
      message('review-message', 'Expired review imported for inspection.');
    } else {
      message('review-message', 'Imported CLI review. Confirm the same terms in MetaMask Agent Wallet. This page does not authorize or execute it.');
    }
    $('status-command').textContent = `mm kuru status --intent ${review.intentId} --format text`;
    $('status-command-json').textContent = `mm kuru status --intent ${review.intentId} --format json`;
  } catch (error) {
    message('review-message', error.message);
  }
});

$('review-json').addEventListener('input', () => {
  clearReports();
  message('review-message', 'Report changed. Format it again before reading a matching status report.');
  message('status-message', 'Review changed. The previous outcome was cleared.');
});

$('status-import-form').addEventListener('submit', event => {
  event.preventDefault();
  $('imported-status').replaceChildren();
  try {
    const result = readStatus($('status-json').value, review);
    const guidance = outcomeGuidance(result, review);
    const summary = document.createElement('div');
    summary.className = 'outcome-summary';
    const heading = document.createElement('strong');
    heading.textContent = guidance.title;
    const next = document.createElement('span');
    next.textContent = guidance.next;
    summary.append(heading, next);
    const provenance = result.reconciliationProvenance;
    const observationTime = provenance ? `${new Date(provenance.observedAtMs).toISOString()} · reported by CLI` : 'Unknown · this report has no observation timestamp';
    rows('imported-status', [['Reported state', result.state], ['Filled', result.filled], ['Open', result.open], ['Cancelled', result.cancelled], ['Other removed', result.otherRemoved], ['Reported observation time', observationTime], ['Finalized block', result.throughFinalizedBlock === null ? 'Unknown' : `${result.throughFinalizedBlock} · reported historical data`], ['Verification', 'Imported report · not independently checked']]);
    $('imported-status').prepend(summary);
    $('imported-status').append(provenanceDetails(result));
    const note = document.createElement('p');
    note.className = 'wallet-note';
    note.textContent = result.evidence.join(' · ');
    $('imported-status').append(note);
    message('status-message', 'Imported CLI report · unverified by this browser. A reported state or block does not independently establish a live outcome.');
  } catch (error) {
    message('status-message', error.message);
  }
});

$('status-json').addEventListener('input', () => {
  $('imported-status').replaceChildren();
  message('status-message', 'Status report changed. Format it again.');
});

$('reset').addEventListener('click', () => {
  $('instruction-form').reset();
  for (const field of ['order-price', 'order-quantity', 'intent-owner', 'review-json', 'status-json']) $(field).value = '';
  clearCommands();
  message('review-message', '');
  message('status-message', '');
});
