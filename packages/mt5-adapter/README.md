# @ezyview/mt5-adapter

MetaTrader 5 adapter for EzyView, providing quotes, historical candles, account information, and order execution via the MT5 bridge or native MT5 MCP server.

## Security & Encryption at Rest

- **Credentials Storage:** Broker account passwords and MCP API keys are stored in the host OS keyring using the Rust `keyring` crate with native hardware-backed or encrypted credential stores:
  - **Linux:** Secret Service API (GNOME Keyring, KWallet, KeePassXC)
  - **macOS:** Apple Keychain
  - **Windows:** Windows Credential Manager
- **Zero Plaintext Credentials:** Passwords and keys are never persisted to disk in SQLite, localStorage, or application log files.
- **In-Memory Session Lifecycle:** When connecting to MT5, a bridge-minted session token is held in-memory for the duration of the session and cleared upon disconnect.
- **Safety Rails:** Order execution is gated by max volume limits, single-use confirmation tokens, and risk modals when switching to live real-money trading accounts.
