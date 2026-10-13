# Browser wallet integration

## Supported surface

User-initiated EIP-1193 browser-provider connection, EIP-6963 multi-wallet discovery, and a legacy injected-provider fallback. MetaMask's installed browser extension exposes this standard. Other standards-compliant injected wallets may work; they have not been certified here. No WalletConnect QR service, deep linking, remote-wallet SDK, credentials or API project key is required or included.

This is a real provider integration, not a fake connected state. With no compatible provider, Connect is disabled and the page explains how to open it in an appropriate browser. The user operates any wallet prompt themselves.

## Allowed requests

- `eth_requestAccounts`: only after Connect is clicked
- `eth_accounts` and `eth_chainId`: after an explicit connection, refresh or provider state change
- `eth_getBalance`: native balance only, and only after chain 10143 (`0x279f`) is verified
- `wallet_switchEthereumChain`: only after the explicit Monad testnet switch button is clicked, using the fixed chain ID

There are no signing, transaction, contract-call, funding, token-approval, wallet-creation, network-add or delegated-permission operations. Submit and Cancel controls stay disabled in every wallet state. The browser provider is not MetaMask Agent Wallet's CLI host and does not install or connect the CLI plugin.

## State and data handling

The controller invalidates prior balances on account/chain changes, disconnect, and refresh. Epoch checks discard late asynchronous reads. A separate connection-generation guard prevents an old network-switch result from affecting a reconnected session. Balance reads are followed by account/chain checks. Unsupported networks never display a native balance as MON. Failed balance reads remain unavailable, never fall back to zero or fixture values.

Account and balance live only in page memory. No app-owned backend, localStorage or sessionStorage receives them. The wallet may use its configured RPC service. The Disconnect-this-page control clears local state and listeners only; it does not revoke permissions stored by the extension. Reload starts disconnected, without automatic account restoration or an account-permission request.

Wallet names and provider identity metadata are self-reported. The UI renders names as text, ignores icons/URLs, and refuses duplicate provider UUID replacement. EIP-6963 is discovery, not authentication of a wallet vendor.

## Offline separation

The existing order review and lifecycle examples remain synthetic, with their own prominent OFFLINE FIXTURE label. Connecting a wallet does not replace any fixture balance, order, fill, cancellation or quote. Real custody/market/order integration is not implemented by this panel.

## Verification

Automated tests exercise controller behavior using a realistic EIP-1193 EventEmitter provider and the real controller code. DOM-stub tests exercise the actual UI bindings and visible text updates. These are not an installed-wallet or rendered-browser end-to-end test. Actual extension approval, mobile rendering and screenshots remain unverified because the supported cloud preview route is unavailable in this environment.

## Official references checked 2026-10-02

- EIP-1193 provider API: https://eips.ethereum.org/EIPS/eip-1193
- EIP-6963 discovery: https://eips.ethereum.org/EIPS/eip-6963
- EIP-3326 explicit network switch: https://eips.ethereum.org/EIPS/eip-3326
- MetaMask provider documentation: https://docs.metamask.io/metamask-connect/evm/reference/provider-api/
- Monad testnet details: https://docs.monad.xyz/developer-essentials/testnet
- viem public-client/transport distinction, consulted before selecting dependency-free direct provider calls: https://viem.sh/docs/clients/intro
