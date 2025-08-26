# SegWit P2WSH Data Storage MVP

A web application for storing and retrieving arbitrary data on the Bitcoin testnet using SegWit P2WSH (Pay-to-Witness-Script-Hash) transactions.

## Features

- **Store Data**: Embed up to 10KB of data in Bitcoin transactions using P2WSH witness scripts
- **Decode Transactions**: Extract and view data from existing P2WSH transactions
- **UniSat Wallet Integration**: Fund and broadcast transactions using UniSat browser extension
- **Testnet Support**: Safe testing on Bitcoin testnet

## How It Works

1. **Data Encoding**: Your data is wrapped in an envelope script pattern: `OP_FALSE OP_IF <data> OP_ENDIF OP_TRUE`
2. **P2WSH Address**: A witness script hash address is generated from your data
3. **Funding**: Send testnet BTC to the P2WSH address
4. **Spending**: Reveal the data by spending the UTXO (no signature required)

## Technical Details

- **Standard Relay**: Scripts up to 3,600 bytes are relayed by most nodes
- **Consensus Limit**: Scripts up to 10,000 bytes are valid by consensus rules (may require direct pool submission)
- **No Signatures**: The envelope pattern allows spending without signatures

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

### Storing Data
1. Enter your text or hex data (up to 10KB)
2. Connect UniSat wallet
3. Fund the generated P2WSH address
4. Spend the UTXO to reveal the data on-chain

### Decoding Data
1. Switch to "Decode Transaction" tab
2. Enter a transaction ID
3. View extracted data from P2WSH inputs

## Limitations

- Scripts over 3,600 bytes may not relay through standard nodes
- Maximum script size is 10,000 bytes (Bitcoin consensus rule)
- Larger scripts may require direct submission to mining pools

## Technologies

- React + TypeScript
- Vite
- bitcoinjs-lib
- Tailwind CSS
- UniSat Wallet API