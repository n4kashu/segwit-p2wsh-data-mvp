# SegWit P2WSH Data Storage MVP

A web application for storing and retrieving arbitrary data on the Bitcoin testnet using SegWit P2WSH (Pay-to-Witness-Script-Hash) transactions.

## Features

- **SegWit P2WSH**: Embed up to 3.5KB of data in Bitcoin transactions using P2WSH witness scripts
- **Taproot Inscriptions**: Create Ordinals-style inscriptions with proper MIME types (up to ~390KB)
- **Decode Transactions**: Extract and view data from existing P2WSH transactions
- **UniSat Wallet Integration**: Fund and broadcast transactions using UniSat browser extension
- **Testnet Support**: Safe testing on Bitcoin testnet
- **Dual Methods**: Choose between SegWit (smaller, fully compliant) or Taproot (larger capacity)

## How It Works

### SegWit P2WSH Method
1. **Data Encoding**: Your data is wrapped in an envelope script pattern: `OP_FALSE OP_IF <data> OP_ENDIF OP_TRUE`
2. **P2WSH Address**: A witness script hash address is generated from your data
3. **Funding**: Send testnet BTC to the P2WSH address
4. **Spending**: Reveal the data by spending the UTXO (no signature required)

### Taproot Inscription Method
1. **Inscription Format**: Uses Ordinals protocol with `OP_FALSE OP_IF "ord" <version> <content-type> <data> OP_ENDIF`
2. **Script Tree**: Data is embedded in Taproot script tree (script-path spending)
3. **Two-Phase Process**: Commit transaction creates the output, reveal transaction spends it
4. **MIME Types**: Supports various content types (text, images, etc.)

## Technical Details

- **Relay Policy Limit**: Scripts limited to 3,500 bytes for reliable network relay
- **No Signatures**: The envelope pattern allows spending without signatures
- **Standard Compliance**: All transactions follow standard relay policies for broad network acceptance

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run development server:
```bash
npm run dev
```

3. Install [UniSat Wallet](https://unisat.io/) browser extension
4. Switch UniSat to Bitcoin Testnet
5. Get testnet BTC from a faucet

## Usage

### SegWit P2WSH Storage
1. Select "SegWit P2WSH" subtab
2. Enter your text or hex data (up to 3.5KB)
3. Connect UniSat wallet and fund the P2WSH address
4. Spend the UTXO to reveal the data on-chain

### Taproot Inscriptions
1. Select "Taproot Inscription" subtab
2. Set content type (MIME) and enter data (up to ~390KB)
3. View the generated Ordinals-style inscription script
4. Note: Full Taproot implementation requires additional tooling

### Decoding Data
1. Switch to "Decode Transaction" tab
2. Enter a transaction ID
3. View extracted data from P2WSH inputs or Taproot scripts

## Limitations

- **SegWit**: Maximum 3,500 bytes to ensure reliable network relay
- **Taproot**: Theoretical ~390KB limit, but requires proper commit/reveal workflow
- **Production Use**: Taproot inscriptions need proper key management and tooling

## Technologies

- React + TypeScript
- Vite
- bitcoinjs-lib
- Tailwind CSS
- UniSat Wallet API