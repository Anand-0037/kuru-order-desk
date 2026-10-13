import { createWalletSession, MONAD_CHAIN_HEX } from './wallet.mjs';
import { discoverWallets } from './wallet-discovery.mjs';

export function mountWalletUI({ document, host }) {
  const $ = id => document.getElementById(id);
  let wallets = [];
  const labels = {
    disconnected: 'Not connected', unavailable: 'Wallet unavailable',
    connecting: 'Waiting for your wallet', checking: 'Checking wallet',
    connected: 'Connected · read only', 'wrong-chain': 'Wrong network', error: 'Wallet check failed',
  };
  function render(state) {
    const active = !['disconnected', 'unavailable'].includes(state.status);
    const busy = ['connecting', 'checking'].includes(state.status) || state.switching;
    $('wallet-status').textContent = labels[state.status];
    $('wallet-account').textContent = state.account ?? 'Not connected';
    $('wallet-chain').textContent = state.chainId === MONAD_CHAIN_HEX
      ? 'Monad testnet · 10143'
      : state.chainId ? `Unsupported chain · ${BigInt(state.chainId).toString()}` : 'Not checked';
    $('wallet-balance').textContent = state.balanceStatus === 'ready'
      ? `${state.balance} MON`
      : state.balanceStatus === 'loading' && state.account ? 'Reading…' : 'Not available';
    $('wallet-balance-time').textContent = state.balanceReadAt
      ? `Read from your wallet at ${new Date(state.balanceReadAt).toLocaleTimeString()}. Refresh for a new reading.`
      : 'Native wallet balance only. Custody balances and order data are not connected.';
    $('wallet-message').textContent = state.message;
    $('wallet-message').hidden = !state.message;
    $('wallet-select').disabled = active || wallets.length === 0;
    $('wallet-connect').disabled = active || wallets.length === 0;
    $('wallet-discover').disabled = active;
    $('wallet-refresh').hidden = !active || state.status === 'connecting';
    $('wallet-refresh').disabled = busy;
    $('wallet-switch').hidden = state.status !== 'wrong-chain';
    $('wallet-switch').disabled = busy;
    $('wallet-disconnect').hidden = !active;
  }
  const session = createWalletSession({ onChange: render });
  const discovery = discoverWallets(host, next => {
    const selected = $('wallet-select').value;
    const priorSelected = wallets.find(wallet => wallet.id === selected);
    const active = !['disconnected', 'unavailable'].includes(session.getState().status);
    // Late extension announcements must never relabel the actual active provider.
    if (active && priorSelected) {
      next = [priorSelected, ...next.filter(wallet =>
        wallet.provider !== priorSelected.provider && wallet.id !== priorSelected.id)];
    }
    wallets = next;
    $('wallet-select').replaceChildren();
    if (!next.length) {
      const option = document.createElement('option');
      option.value = ''; option.textContent = 'No browser wallet detected';
      $('wallet-select').append(option);
      $('wallet-select').value = '';
    } else {
      for (const wallet of next) {
        const option = document.createElement('option');
        option.value = wallet.id; option.textContent = wallet.name;
        $('wallet-select').append(option);
      }
      $('wallet-select').value = next.some(w => w.id === selected) ? selected : next[0].id;
    }
    $('wallet-availability').textContent = next.length
      ? 'Choose your wallet, then approve account access in its own prompt. Wallet names are self-reported by the extension.'
      : 'No compatible browser wallet detected. Open this URL in a browser with an EIP-1193 wallet such as the MetaMask extension, then select Detect wallets. QR/mobile WalletConnect is not included.';
    render(session.getState());
  });
  const bindings = [
    ['wallet-connect', () => {
      const selected = wallets.find(w => w.id === $('wallet-select').value);
      void session.connect(selected?.provider, selected?.name);
    }],
    ['wallet-discover', () => discovery.request()],
    ['wallet-refresh', () => { void session.refresh(); }],
    ['wallet-switch', () => { void session.switchToMonad(); }],
    ['wallet-disconnect', () => session.disconnect()],
  ];
  for (const [id, callback] of bindings) $(id).addEventListener('click', callback);
  render(session.getState());
  return Object.freeze({ destroy() {
    discovery.dispose();
    session.disconnect('');
    for (const [id, callback] of bindings) $(id).removeEventListener('click', callback);
  } });
}
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  let ui = mountWalletUI({ document, host: window });
  window.addEventListener('pagehide', () => { ui?.destroy(); ui = null; });
  window.addEventListener('pageshow', () => {
    if (!ui) ui = mountWalletUI({ document, host: window });
  });
}
