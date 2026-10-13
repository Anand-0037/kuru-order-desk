import { formatExact } from './amounts.mjs';

export const MONAD_CHAIN_HEX = '0x279f';
export const MONAD_CHAIN_ID = 10143;
const EMPTY = Object.freeze({
  status: 'disconnected', account: null, chainId: null, balance: null,
  balanceStatus: 'idle', balanceReadAt: null, walletName: '', message: '', switching: false,
});

export function isProvider(value) {
  return !!value && typeof value.request === 'function' &&
    typeof value.on === 'function' && typeof value.removeListener === 'function';
}
function accountValue(accounts) {
  if (!Array.isArray(accounts) || !accounts.every(a => typeof a === 'string' && /^0x[\da-f]{40}$/i.test(a))) {
    throw Error('Wallet returned invalid accounts');
  }
  return accounts[0]?.toLowerCase() ?? null;
}
function chainValue(value) {
  if (typeof value !== 'string' || !/^0x[\da-f]+$/i.test(value) || value.length > 66) {
    throw Error('Wallet returned an invalid chain ID');
  }
  return '0x' + BigInt(value).toString(16);
}
function balanceValue(value) {
  if (typeof value !== 'string' || !/^0x[\da-f]+$/i.test(value) || value.length > 66) {
    throw Error('Wallet returned an invalid balance');
  }
  return formatExact(BigInt(value), 10n ** 18n);
}
function errorMessage(error, action) {
  const code = Number(error?.code);
  if (code === 4001) return `${action} declined in your wallet. You can try again when ready.`;
  if (code === -32002) return 'A request is already open in your wallet. Finish or reject that prompt first.';
  if (code === 4100) return 'Account access is not authorized. Connect again and review the wallet prompt.';
  if (code === 4900 || code === 4901) return 'Your wallet cannot reach the network. Check it and reconnect.';
  if (code === 4902) return 'Monad testnet is not configured in this wallet. Add it yourself using the official network details, then retry.';
  return `${action} failed. Check your wallet and try again. No transaction was requested.`;
}

/** Read-only account session. No provider or account is restored automatically. */
export function createWalletSession({ onChange = () => {}, now = Date.now } = {}) {
  let state = EMPTY;
  let provider = null;
  let epoch = 0;
  let attachment = 0;
  let pendingConnect = null;
  let authorizing = false;
  let handlers = null;
  const publish = patch => { state = Object.freeze({ ...state, ...patch }); onChange(state); };
  const current = (p, id) => provider === p && epoch === id;
  function detach() {
    if (provider && handlers) {
      for (const [event, callback] of Object.entries(handlers)) provider.removeListener(event, callback);
    }
    handlers = null;
  }
  function disconnect(message = 'Disconnected from this page. This does not revoke permissions saved in your wallet.') {
    epoch++;
    attachment++;
    detach();
    provider = null;
    authorizing = false;
    pendingConnect = null;
    state = EMPTY;
    publish({ message });
  }
  async function refresh() {
    if (!provider || authorizing) return;
    const p = provider, id = ++epoch;
    publish({ status: 'checking', account: null, chainId: null, balance: null, balanceStatus: 'loading', balanceReadAt: null, message: '' });
    try {
      const [accounts, chain] = await Promise.all([
        p.request({ method: 'eth_accounts' }), p.request({ method: 'eth_chainId' }),
      ]);
      if (!current(p, id)) return;
      const account = accountValue(accounts), chainId = chainValue(chain);
      if (!account) { disconnect('No account is shared. Your wallet may be locked or site access removed.'); return; }
      if (chainId !== MONAD_CHAIN_HEX) {
        publish({ status: 'wrong-chain', account, chainId, balanceStatus: 'idle', message: 'Select Monad testnet (10143) to read a MON balance. Trading remains unavailable.' });
        return;
      }
      publish({ status: 'connected', account, chainId, balanceStatus: 'loading' });
      try {
        const result = await p.request({ method: 'eth_getBalance', params: [account, 'latest'] });
        if (!current(p, id)) return;
        const [afterAccounts, afterChain] = await Promise.all([
          p.request({ method: 'eth_accounts' }), p.request({ method: 'eth_chainId' }),
        ]);
        if (!current(p, id)) return;
        if (accountValue(afterAccounts) !== account || chainValue(afterChain) !== chainId) {
          publish({ status: 'error', account: null, chainId: null, balance: null, balanceStatus: 'error', message: 'Wallet account or network changed during the read. Refresh to check it again.' });
          return;
        }
        publish({ balance: balanceValue(result), balanceStatus: 'ready', balanceReadAt: now(), message: '' });
      } catch {
        if (current(p, id)) publish({ balance: null, balanceStatus: 'error', message: 'Balance unavailable. The wallet read failed; this is not a zero balance. Try Refresh.' });
      }
    } catch (error) {
      if (current(p, id)) publish({ status: 'error', account: null, chainId: null, balance: null, balanceStatus: 'error', message: errorMessage(error, 'Wallet check') });
    }
  }
  function connect(selectedProvider, name = 'Browser wallet') {
    if (provider === selectedProvider && pendingConnect) return pendingConnect;
    disconnect('');
    if (!isProvider(selectedProvider)) {
      publish({ status: 'unavailable', message: 'No compatible browser wallet was found. Open this site in a browser with an EIP-1193 wallet such as the MetaMask extension.' });
      return Promise.resolve();
    }
    provider = selectedProvider;
    const p = provider, id = ++epoch;
    authorizing = true;
    handlers = {
      accountsChanged: () => { if (provider === p && !authorizing) void refresh(); },
      chainChanged: () => { if (provider === p && !authorizing) void refresh(); },
      disconnect: () => { if (provider === p) disconnect('The wallet provider disconnected. Check your wallet/network, then reconnect.'); },
    };
    for (const [event, callback] of Object.entries(handlers)) p.on(event, callback);
    publish({ status: 'connecting', walletName: String(name).slice(0,80), message: 'Review the account-access prompt in your wallet. No signature or transaction is requested.' });
    const run = (async () => {
      try {
        const accounts = await p.request({ method: 'eth_requestAccounts' });
        if (!current(p, id)) return;
        if (!accountValue(accounts)) { disconnect('No account was shared. Connect again when ready.'); return; }
        authorizing = false;
        await refresh();
      } catch (error) {
        if (current(p, id)) disconnect(errorMessage(error, 'Connection'));
      }
    })();
    pendingConnect = run;
    void run.finally(() => { if (pendingConnect === run) pendingConnect = null; });
    return run;
  }
  async function switchToMonad() {
    if (!provider || !state.account || state.switching || state.chainId === MONAD_CHAIN_HEX) return;
    const p = provider, session = attachment;
    const sameSession = () => provider === p && attachment === session;
    // This method is bound only to an explicit user click. No automatic add/switch flow.
    publish({ switching: true, message: 'Review the Monad testnet network-switch prompt in your wallet.' });
    try {
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_CHAIN_HEX }] });
      if (sameSession()) await refresh();
    } catch (error) {
      if (sameSession()) publish({ message: errorMessage(error, 'Network switch') });
    } finally {
      if (sameSession()) publish({ switching: false });
    }
  }
  return Object.freeze({ getState: () => state, connect, disconnect, refresh, switchToMonad });
}
