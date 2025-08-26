# SegWit P2WSH Data Storage MVP

A web application for storing and retrieving arbitrary data on the Bitcoin testnet using SegWit P2WSH (Pay-to-Witness-Script-Hash) transactions.

## Features

- **Store Data**: Embed up to 3.5KB of data in Bitcoin transactions using P2WSH witness scripts
- **Decode Transactions**: Extract and view data from existing P2WSH transactions
- **UniSat Wallet Integration**: Fund and broadcast transactions using UniSat browser extension
- **Testnet Support**: Safe testing on Bitcoin testnet
- **Full Compliance**: Stays within standard relay policy limits for reliable network propagation

## How It Works

1. **Data Encoding**: Your data is wrapped in an envelope script pattern: `OP_FALSE OP_IF <data> OP_ENDIF OP_TRUE`
2. **P2WSH Address**: A witness script hash address is generated from your data
3. **Funding**: Send testnet BTC to the P2WSH address
4. **Spending**: Reveal the data by spending the UTXO (no signature required)

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

### Storing Data
1. Enter your text or hex data (up to 3.5KB)
2. Connect UniSat wallet
3. Fund the generated P2WSH address
4. Spend the UTXO to reveal the data on-chain

### Decoding Data
1. Switch to "Decode Transaction" tab
2. Enter a transaction ID
3. View extracted data from P2WSH inputs

## Limitations

- Maximum script size is 3,500 bytes to ensure reliable network relay
- Larger payloads must be split into multiple transactions

## Technologies

- React + TypeScript
- Vite
- bitcoinjs-lib
- Tailwind CSS
- UniSat Wallet API