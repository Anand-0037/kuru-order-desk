import { isProvider } from './wallet.mjs';

/** Discovery metadata is self-reported, not proof of a wallet's identity. */
export function discoverWallets(host, onChange = () => {}) {
  const providers = new Map();
  let disposed = false;
  function getProviders() {
    if (providers.size) return [...providers.values()];
    return isProvider(host.ethereum)
      ? [{ id: 'legacy-injected', name: 'Injected browser wallet (legacy)', provider: host.ethereum }]
      : [];
  }
  function announce(event) {
    const detail = event?.detail, info = detail?.info;
    if (!isProvider(detail?.provider) || !info || typeof info.uuid !== 'string' ||
        !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(info.uuid) ||
        typeof info.name !== 'string' || !info.name.trim()) return;
    if (providers.has(info.uuid) || [...providers.values()].some(p => p.provider === detail.provider)) return;
    // Deliberately do not render provider-supplied icons, markup, or URLs.
    providers.set(info.uuid, Object.freeze({ id: info.uuid, name: info.name.trim().slice(0,80), provider: detail.provider }));
    onChange(getProviders());
  }
  function request() {
    if (disposed) return;
    host.dispatchEvent(new host.Event('eip6963:requestProvider'));
    onChange(getProviders());
  }
  host.addEventListener('eip6963:announceProvider', announce);
  request();
  return Object.freeze({ getProviders, request, dispose() {
    disposed = true;
    host.removeEventListener('eip6963:announceProvider', announce);
  } });
}
