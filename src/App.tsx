import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as bitcoin from "bitcoinjs-lib";

const TESTNET = bitcoin.networks.testnet;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/, "");
  if (clean.length % 2 !== 0) throw new Error("Hex length must be even");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function utf8ToBytes(txt: string): Uint8Array {
  return new TextEncoder().encode(txt);
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function encodeCompactSize(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) {
    const b = Buffer.alloc(3);
    b[0] = 0xfd;
    b.writeUInt16LE(n, 1);
    return b;
  }
  if (n <= 0xffffffff) {
    const b = Buffer.alloc(5);
    b[0] = 0xfe;
    b.writeUInt32LE(n, 1);
    return b;
  }
  throw new Error("compactSize too large");
}

function witnessStackToScriptWitness(stack: Buffer[]): Buffer {
  const parts: Buffer[] = [encodeCompactSize(stack.length)];
  for (const item of stack) {
    parts.push(encodeCompactSize(item.length));
    parts.push(item);
  }
  return Buffer.concat(parts);
}

function buildEnvelopeScript(dataBytes: Uint8Array): Buffer {
  return bitcoin.script.compile([
    bitcoin.opcodes.OP_FALSE,
    bitcoin.opcodes.OP_IF,
    Buffer.from(dataBytes),
    bitcoin.opcodes.OP_ENDIF,
    bitcoin.opcodes.OP_TRUE,
  ]);
}

function buildInscriptionScript(dataBytes: Uint8Array, contentType: string = "text/plain;charset=utf-8"): Buffer {
  // Build Ordinals-style inscription envelope
  // OP_FALSE OP_IF OP_PUSH "ord" OP_PUSH 1 OP_PUSH contentType OP_PUSH 0 OP_PUSH data OP_ENDIF
  const parts: Array<number | Buffer> = [
    bitcoin.opcodes.OP_FALSE,
    bitcoin.opcodes.OP_IF,
    Buffer.from("ord"),
    Buffer.from([1]), // Protocol version
    Buffer.from(contentType),
    Buffer.from([0]), // Data push delimiter
  ];

  // Split data into chunks if needed (520 byte limit per push)
  const MAX_CHUNK_SIZE = 520;
  for (let i = 0; i < dataBytes.length; i += MAX_CHUNK_SIZE) {
    parts.push(Buffer.from(dataBytes.slice(i, i + MAX_CHUNK_SIZE)));
  }
  
  parts.push(bitcoin.opcodes.OP_ENDIF);
  
  return bitcoin.script.compile(parts);
}


function bytesToHex(u8: Uint8Array): string {
  return Array.from(u8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseEnvelopeScript(scriptHex: string): { data: Uint8Array; isEnvelope: boolean } | null {
  try {
    const script = Buffer.from(scriptHex, 'hex');
    const decompiled = bitcoin.script.decompile(script);
    
    if (!decompiled || decompiled.length < 5) return null;
    
    // Check for envelope pattern: OP_FALSE OP_IF <data> OP_ENDIF OP_TRUE
    if (
      decompiled[0] === bitcoin.opcodes.OP_FALSE &&
      decompiled[1] === bitcoin.opcodes.OP_IF &&
      decompiled[decompiled.length - 2] === bitcoin.opcodes.OP_ENDIF &&
      decompiled[decompiled.length - 1] === bitcoin.opcodes.OP_TRUE
    ) {
      // Extract data from between OP_IF and OP_ENDIF
      const data = decompiled[2];
      if (Buffer.isBuffer(data)) {
        return { data: new Uint8Array(data), isEnvelope: true };
      }
    }
    
    return null;
  } catch (e) {
    console.error("Error parsing script:", e);
    return null;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"create" | "decode">("create");
  const [createSubTab, setCreateSubTab] = useState<"segwit" | "taproot">("segwit");
  
  // Create tab states
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string>("");
  const [networkName, setNetworkName] = useState<string>("");
  const [mode, setMode] = useState<"utf8" | "hex">("utf8");
  const [dataInput, setDataInput] = useState<string>("Hello from P2WSH!");
  const [wscriptHex, setWscriptHex] = useState<string>("");
  const [p2wshAddress, setP2wshAddress] = useState<string>("");
  const [p2wshScriptPubKeyHex, setP2wshScriptPubKeyHex] = useState<string>("");
  const [wscriptLen, setWscriptLen] = useState<number>(0);
  const [fundAmount, setFundAmount] = useState<number>(1500);
  const [feeRateFund, setFeeRateFund] = useState<number>(2);
  const [fundingTxid, setFundingTxid] = useState<string>("");
  const [fundingVout, setFundingVout] = useState<number | "">("");
  const [fundingValue, setFundingValue] = useState<number | "">("");
  const [recipient, setRecipient] = useState<string>("");
  const [sendFee, setSendFee] = useState<number>(900);
  const [spendTxid, setSpendTxid] = useState<string>("");
  const [building, setBuilding] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [expandedHex, setExpandedHex] = useState<boolean>(false);
  
  // Taproot states
  const [taprootAddress, setTaprootAddress] = useState<string>("");
  const [taprootScriptHex, setTaprootScriptHex] = useState<string>("");
  const [taprootScriptLen, setTaprootScriptLen] = useState<number>(0);
  const [taprootDataInput, setTaprootDataInput] = useState<string>("Hello from Taproot!");
  const [taprootMode, setTaprootMode] = useState<"utf8" | "hex">("utf8");
  const [contentType, setContentType] = useState<string>("text/plain;charset=utf-8");
  const [taprootExpandedHex, setTaprootExpandedHex] = useState<boolean>(false);
  
  // Decode tab states
  const [decodeTxid, setDecodeTxid] = useState<string>("");
  const [decodeLoading, setDecodeLoading] = useState(false);
  const [decodedData, setDecodedData] = useState<{
    txid: string;
    inputs: Array<{
      index: number;
      witness: string[];
      hasData: boolean;
      extractedData?: string;
      dataHex?: string;
      dataUtf8?: string;
    }>;
    outputs: Array<{
      index: number;
      value: number;
      address: string;
    }>;
  } | null>(null);
  const [decodeError, setDecodeError] = useState<string>("");

  useEffect(() => {
    try {
      const bytes = mode === "utf8" ? utf8ToBytes(dataInput) : hexToBytes(dataInput);
      const wscript = buildEnvelopeScript(bytes);
      setWscriptHex(wscript.toString("hex"));
      setWscriptLen(wscript.length);
      
      // Only generate address if within 3500 byte limit
      if (wscript.length <= 3500) {
        const p2wsh = bitcoin.payments.p2wsh({ redeem: { output: wscript }, network: TESTNET });
        setP2wshAddress(p2wsh.address || "");
        setP2wshScriptPubKeyHex((p2wsh.output || Buffer.alloc(0)).toString("hex"));
      } else {
        // Clear address for oversized scripts
        setP2wshAddress("");
        setP2wshScriptPubKeyHex("");
      }
    } catch (e: any) {
      console.error("Error building witness script:", e);
      // Only clear values if there's an actual parsing error (like invalid hex)
      if (e?.message?.includes("Hex length") || e?.message?.includes("even")) {
        setWscriptHex("");
        setP2wshAddress("");
        setP2wshScriptPubKeyHex("");
        setWscriptLen(0);
      }
    }
  }, [mode, dataInput]);

  // Taproot inscription effect
  useEffect(() => {
    try {
      const bytes = taprootMode === "utf8" ? utf8ToBytes(taprootDataInput) : hexToBytes(taprootDataInput);
      const inscriptionScript = buildInscriptionScript(bytes, contentType);
      setTaprootScriptHex(inscriptionScript.toString("hex"));
      setTaprootScriptLen(inscriptionScript.length);
      
      // For demo purposes, we'll show the inscription script details
      // In production, you'd need proper Taproot address generation with key pairs
      // This requires additional libraries for EC operations
      setTaprootAddress("[Taproot address generation requires EC library]");
      
    } catch (e: any) {
      console.error("Error building taproot inscription:", e);
      setTaprootScriptHex("");
      setTaprootAddress("");
      setTaprootScriptLen(0);
    }
  }, [taprootMode, taprootDataInput, contentType]);

  const connect = useCallback(async () => {
    try {
      // @ts-ignore
      const unisat = (window as any).unisat;
      if (!unisat) throw new Error("UniSat extension not found");
      await unisat.requestAccounts();
      await unisat.switchChain("BITCOIN_TESTNET");
      const net = await unisat.getNetwork();
      setNetworkName(net);
      const accounts: string[] = await unisat.getAccounts();
      setAddress(accounts[0]);
      setConnected(true);
      setMessage("Connected to UniSat on testnet.");
    } catch (e: any) {
      console.error("Connection error:", e);
      const errorMsg = e?.message || e?.error || JSON.stringify(e) || String(e);
      setMessage(errorMsg);
    }
  }, []);

  const fundP2WSH = useCallback(async () => {
    try {
      setMessage("");
      if (!p2wshAddress) throw new Error("P2WSH address not ready");
      if (wscriptLen === 0) throw new Error("Witness script empty");
      if (wscriptLen > 3500) throw new Error("Script > 3500 bytes — exceeds relay policy limit. Please reduce your data.");
      if ((fundAmount || 0) < 400) throw new Error("Fund amount too low; use at least ~400 sats for P2WSH");
      // @ts-ignore
      const unisat = (window as any).unisat;
      const txid = await unisat.sendBitcoin(p2wshAddress, Number(fundAmount), { feeRate: Number(feeRateFund) });
      setFundingTxid(txid);
      setMessage("Funding sent. Paste vout or use auto-detect.");
    } catch (e: any) {
      console.error("Funding error:", e);
      const errorMsg = e?.message || e?.error || JSON.stringify(e) || String(e);
      setMessage(errorMsg);
    }
  }, [p2wshAddress, wscriptLen, fundAmount, feeRateFund]);

  const autodetectVout = useCallback(async () => {
    try {
      if (!fundingTxid || !p2wshAddress) throw new Error("Need funding txid and P2WSH address");
      const res = await fetch(`https://mempool.space/testnet/api/tx/${fundingTxid}`);
      if (!res.ok) throw new Error("Failed to fetch tx from mempool.space");
      const tx = await res.json();
      const idx = tx.vout.findIndex((o: any) => o.scriptpubkey_address === p2wshAddress);
      if (idx < 0) throw new Error("Could not find P2WSH output in that tx");
      setFundingVout(idx);
      setFundingValue(tx.vout[idx].value);
      setMessage(`Detected vout=${idx}, value=${tx.vout[idx].value} sats`);
    } catch (e: any) {
      console.error("Auto-detect error:", e);
      const errorMsg = e?.message || e?.error || JSON.stringify(e) || String(e);
      setMessage(errorMsg);
    }
  }, [fundingTxid, p2wshAddress]);

  const buildAndBroadcastSpend = useCallback(async () => {
    try {
      setBuilding(true);
      setBroadcasting(false);
      setMessage("");
      if (wscriptLen === 0 || !wscriptHex) throw new Error("witnessScript missing");
      if (!fundingTxid || fundingVout === "" || fundingValue === "") throw new Error("Missing funding outpoint or value");
      if (!recipient) throw new Error("Recipient address required");
      const value = Number(fundingValue);
      const fee = Number(sendFee);
      if (fee <= 0 || fee >= value) throw new Error("Fee must be >0 and < input value");

      console.log("Building spend transaction:", {
        fundingTxid,
        fundingVout,
        value,
        recipient,
        fee,
        wscriptHex
      });

      const wscript = Buffer.from(wscriptHex, "hex");
      const p2wsh = bitcoin.payments.p2wsh({ redeem: { output: wscript }, network: TESTNET });
      const lockingScript = p2wsh.output!;

      console.log("P2WSH details:", {
        scriptPubKey: lockingScript.toString("hex"),
        scriptSize: wscript.length
      });

      const psbt = new bitcoin.Psbt({ network: TESTNET });
      
      // Add witnessScript to the input
      psbt.addInput({
        hash: fundingTxid,
        index: Number(fundingVout),
        witnessUtxo: {
          script: lockingScript,
          value: value,
        },
        witnessScript: wscript, // Add this for proper P2WSH spending
      });
      
      psbt.addOutput({ address: recipient, value: value - fee });

      // For P2WSH with no signatures needed, we manually finalize
      const finalWitness = witnessStackToScriptWitness([wscript]);
      psbt.finalizeInput(0, () => ({ finalScriptWitness: finalWitness }));

      const tx = psbt.extractTransaction();
      const rawtx = tx.toHex();
      
      console.log("Transaction built:", {
        txid: tx.getId(),
        size: rawtx.length / 2,
        hex: rawtx
      });

      setBuilding(false);
      setBroadcasting(true);
      
      // Try UniSat first
      try {
        // @ts-ignore
        const unisat = (window as any).unisat;
        const txid = await unisat.pushTx({ rawtx });
        setSpendTxid(txid);
        setBroadcasting(false);
        setMessage("Spend broadcasted via UniSat.");
      } catch (unisatError: any) {
        console.error("UniSat broadcast failed, trying mempool.space:", unisatError);
        
        // Fallback to mempool.space API
        try {
          const res = await fetch("https://mempool.space/testnet/api/tx", {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: rawtx
          });
          
          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Mempool API error: ${errorText}`);
          }
          
          const txid = await res.text();
          setSpendTxid(txid);
          setBroadcasting(false);
          setMessage("Spend broadcasted via mempool.space.");
        } catch (mempoolError: any) {
          throw new Error(`Both broadcast methods failed. UniSat: ${unisatError?.message || unisatError}, Mempool: ${mempoolError?.message || mempoolError}`);
        }
      }
    } catch (e: any) {
      setBuilding(false);
      setBroadcasting(false);
      console.error("Build/broadcast error:", e);
      const errorMsg = e?.message || e?.error || JSON.stringify(e) || String(e);
      setMessage(`Error: ${errorMsg}`);
    }
  }, [wscriptHex, wscriptLen, fundingTxid, fundingVout, fundingValue, recipient, sendFee]);

  const fetchAndDecodeTransaction = useCallback(async () => {
    try {
      setDecodeLoading(true);
      setDecodeError("");
      setDecodedData(null);
      
      if (!decodeTxid) throw new Error("Please enter a transaction ID");
      
      // Fetch transaction data
      const res = await fetch(`https://mempool.space/testnet/api/tx/${decodeTxid}`);
      if (!res.ok) throw new Error("Failed to fetch transaction from mempool.space");
      
      const txData = await res.json();
      console.log("Fetched transaction:", txData);
      
      // Process inputs to find witness data
      const processedInputs = txData.vin.map((input: any, index: number) => {
        const result: any = {
          index,
          witness: input.witness || [],
          hasData: false,
        };
        
        // Check if this is a P2WSH input with witness data
        if (input.witness && input.witness.length > 0) {
          // The last item in witness stack is usually the witnessScript for P2WSH
          const lastWitness = input.witness[input.witness.length - 1];
          
          if (lastWitness) {
            // Try to parse as envelope script
            const parsed = parseEnvelopeScript(lastWitness);
            
            if (parsed && parsed.isEnvelope) {
              result.hasData = true;
              result.extractedData = "Envelope pattern detected";
              result.dataHex = bytesToHex(parsed.data);
              
              // Try to decode as UTF-8
              try {
                result.dataUtf8 = bytesToUtf8(parsed.data);
              } catch {
                result.dataUtf8 = "[Binary data - not valid UTF-8]";
              }
            }
          }
        }
        
        return result;
      });
      
      // Process outputs
      const processedOutputs = txData.vout.map((output: any, index: number) => ({
        index,
        value: output.value,
        address: output.scriptpubkey_address || "Unknown",
      }));
      
      setDecodedData({
        txid: decodeTxid,
        inputs: processedInputs,
        outputs: processedOutputs,
      });
      
    } catch (e: any) {
      console.error("Decode error:", e);
      setDecodeError(e?.message || String(e));
    } finally {
      setDecodeLoading(false);
    }
  }, [decodeTxid]);

  const canFund = connected && !!p2wshAddress && wscriptLen > 0;
  const canSpend = !!fundingTxid && fundingVout !== "" && fundingValue !== "" && !!recipient;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">SegWit P2WSH Data MVP (Testnet)</h1>
          <button
            onClick={connect}
            className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
          >
            {connected ? `Connected: ${address.slice(0, 6)}…${address.slice(-6)}` : "Connect UniSat (testnet)"}
          </button>
        </header>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab("create")}
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === "create" 
                ? "border-indigo-500 text-indigo-400" 
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Create & Store Data
          </button>
          <button
            onClick={() => setActiveTab("decode")}
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === "decode" 
                ? "border-indigo-500 text-indigo-400" 
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Decode Transaction
          </button>
        </div>

        {/* Create Tab Content */}
        {activeTab === "create" && (
          <>
            {/* Subtabs for SegWit vs Taproot */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setCreateSubTab("segwit")}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  createSubTab === "segwit" 
                    ? "bg-indigo-600 text-white" 
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                SegWit P2WSH
              </button>
              <button
                onClick={() => setCreateSubTab("taproot")}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  createSubTab === "taproot" 
                    ? "bg-indigo-600 text-white" 
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                Taproot Inscription
              </button>
            </div>

            {/* SegWit Content */}
            {createSubTab === "segwit" && (
              <>
            <section className="bg-slate-900/60 p-4 rounded-2xl shadow">
              <h2 className="font-semibold mb-3">1) Enter data → build P2WSH witnessScript</h2>
              <div className="flex gap-3 mb-3">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={mode === "utf8"} onChange={() => setMode("utf8")} />
                  <span>UTF‑8</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={mode === "hex"} onChange={() => setMode("hex")} />
                  <span>Hex</span>
                </label>
              </div>
              <textarea
                className="w-full min-h-[100px] rounded-xl p-3 text-slate-900"
                value={dataInput}
                onChange={(e) => setDataInput(e.target.value)}
                placeholder={mode === "utf8" ? "Type some text…" : "deadbeef…"}
              />
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="space-y-2">
                  <div className="bg-slate-800/70 rounded-xl p-3">
                    <div className="opacity-70">Witness script size</div>
                    <div className={`${wscriptLen > 3500 ? "text-red-400" : ""}`}>{wscriptLen} bytes {wscriptLen > 3500 && "(exceeds limit)"}</div>
                  </div>
                  <div className="bg-slate-800/70 rounded-xl p-3 break-all">
                    <div className="opacity-70">P2WSH address (testnet)</div>
                    <div>{p2wshAddress || "—"}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="bg-slate-800/70 rounded-xl p-3 break-all">
                    <div className="flex justify-between items-center mb-1">
                      <div className="opacity-70">witnessScript (hex)</div>
                      {wscriptHex && wscriptHex.length > 100 && (
                        <button 
                          onClick={() => setExpandedHex(!expandedHex)}
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          {expandedHex ? "Collapse" : "Expand"}
                        </button>
                      )}
                    </div>
                    <div className="text-xs font-mono">
                      {wscriptHex ? (
                        expandedHex || wscriptHex.length <= 100 ? wscriptHex : `${wscriptHex.slice(0, 100)}...`
                      ) : "—"}
                    </div>
                  </div>
                  <div className="bg-slate-800/70 rounded-xl p-3 break-all">
                    <div className="opacity-70">scriptPubKey for UTXO (hex)</div>
                    <div className="text-xs">{p2wshScriptPubKeyHex || "—"}</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-slate-900/60 p-4 rounded-2xl shadow">
              <h2 className="font-semibold mb-3">2) Fund the P2WSH output (testnet)</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <label className="block">
                  <div className="text-sm opacity-80 mb-1">Amount (sats)</div>
                  <input
                    type="number"
                    className="w-full rounded-xl p-2 text-slate-900"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(Number(e.target.value))}
                    min={400}
                  />
                </label>
                <label className="block">
                  <div className="text-sm opacity-80 mb-1">Fee rate (sats/vB)</div>
                  <input
                    type="number"
                    className="w-full rounded-xl p-2 text-slate-900"
                    value={feeRateFund}
                    onChange={(e) => setFeeRateFund(Number(e.target.value))}
                    min={1}
                  />
                </label>
                <button
                  onClick={fundP2WSH}
                  disabled={!canFund}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                >
                  Fund to P2WSH
                </button>
              </div>
              <div className="mt-3 text-sm">
                {fundingTxid ? (
                  <div>
                    Funding txid: <a className="text-indigo-400 underline" target="_blank" rel="noreferrer" href={`https://mempool.space/testnet/tx/${fundingTxid}`}>{fundingTxid}</a>
                  </div>
                ) : (
                  <div className="opacity-70">This uses UniSat.sendBitcoin() from your wallet to the P2WSH address.</div>
                )}
              </div>
            </section>

            <section className="bg-slate-900/60 p-4 rounded-2xl shadow">
              <h2 className="font-semibold mb-3">3) Spend the P2WSH UTXO → reveal data (no sig needed)</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <label className="block">
                  <div className="text-sm opacity-80 mb-1">Funding txid</div>
                  <input
                    className="w-full rounded-xl p-2 text-slate-900"
                    value={fundingTxid}
                    onChange={(e) => setFundingTxid(e.target.value.trim())}
                    placeholder="txid from step 2"
                  />
                </label>
                <label className="block">
                  <div className="text-sm opacity-80 mb-1">vout</div>
                  <input
                    type="number"
                    className="w-full rounded-xl p-2 text-slate-900"
                    value={fundingVout as any}
                    onChange={(e) => setFundingVout(Number(e.target.value))}
                    placeholder="index"
                  />
                </label>
                <button onClick={autodetectVout} className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500">Auto‑detect vout</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end mt-3">
                <label className="block">
                  <div className="text-sm opacity-80 mb-1">UTXO value (sats)</div>
                  <input
                    type="number"
                    className="w-full rounded-xl p-2 text-slate-900"
                    value={fundingValue as any}
                    onChange={(e) => setFundingValue(Number(e.target.value))}
                    placeholder="amount sent"
                  />
                </label>
                <label className="block">
                  <div className="text-sm opacity-80 mb-1">Recipient address</div>
                  <input
                    className="w-full rounded-xl p-2 text-slate-900"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value.trim())}
                    placeholder="tb1... (testnet)"
                  />
                </label>
                <label className="block">
                  <div className="text-sm opacity-80 mb-1">Fee (sats, flat)</div>
                  <input
                    type="number"
                    className="w-full rounded-xl p-2 text-slate-900"
                    value={sendFee}
                    onChange={(e) => setSendFee(Number(e.target.value))}
                    min={200}
                  />
                </label>
              </div>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={buildAndBroadcastSpend}
                  disabled={!canSpend || building || broadcasting}
                  className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50"
                >
                  Build + Broadcast spend
                </button>
                {spendTxid && (
                  <a className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700" target="_blank" rel="noreferrer" href={`https://mempool.space/testnet/tx/${spendTxid}`}>View spend → {spendTxid.slice(0,10)}…</a>
                )}
              </div>
            </section>

            <section className="bg-slate-900/60 p-4 rounded-2xl shadow text-sm space-y-2">
              <h3 className="font-semibold">Notes</h3>
              <ul className="list-disc ml-5 space-y-1">
                <li>Policy: witnessScript limited to 3,500 bytes for reliable network relay and full compliance.</li>
                <li>Your data lives in the <em>witnessScript</em> under an unexecuted branch. Spending reveals it; no signatures needed for that input.</li>
                <li>Funding uses <code>unisat.sendBitcoin()</code>. Spending broadcasts with <code>unisat.pushTx()</code>.</li>
                <li>Everything here runs on <strong>testnet</strong>. Use small amounts (≥~400 sats to avoid dust).</li>
              </ul>
              <div className="opacity-70">
                Tip: To chunk bigger payloads, create multiple P2WSH outputs (repeat Step 2) and add each as an input in one spend.
              </div>
            </section>

            {message && (
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-sm">{message}</div>
            )}
              </>
            )}

            {/* Taproot Content */}
            {createSubTab === "taproot" && (
              <>
                <section className="bg-slate-900/60 p-4 rounded-2xl shadow">
                  <h2 className="font-semibold mb-3">1) Enter inscription data → build Taproot script</h2>
                  <div className="flex gap-3 mb-3">
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={taprootMode === "utf8"} onChange={() => setTaprootMode("utf8")} />
                      <span>UTF‑8</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={taprootMode === "hex"} onChange={() => setTaprootMode("hex")} />
                      <span>Hex</span>
                    </label>
                  </div>
                  <div className="mb-3">
                    <label className="block text-sm opacity-80 mb-1">Content Type (MIME)</label>
                    <input
                      className="w-full rounded-xl p-2 text-slate-900"
                      value={contentType}
                      onChange={(e) => setContentType(e.target.value)}
                      placeholder="text/plain;charset=utf-8"
                    />
                  </div>
                  <textarea
                    className="w-full min-h-[100px] rounded-xl p-3 text-slate-900"
                    value={taprootDataInput}
                    onChange={(e) => setTaprootDataInput(e.target.value)}
                    placeholder={taprootMode === "utf8" ? "Type some text…" : "deadbeef…"}
                  />
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="space-y-2">
                      <div className="bg-slate-800/70 rounded-xl p-3">
                        <div className="opacity-70">Inscription size</div>
                        <div>{taprootScriptLen} bytes</div>
                      </div>
                      <div className="bg-slate-800/70 rounded-xl p-3 break-all">
                        <div className="opacity-70">Taproot address (testnet)</div>
                        <div>{taprootAddress || "—"}</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="bg-slate-800/70 rounded-xl p-3 break-all">
                        <div className="flex justify-between items-center mb-1">
                          <div className="opacity-70">Inscription script (hex)</div>
                          {taprootScriptHex && taprootScriptHex.length > 100 && (
                            <button 
                              onClick={() => setTaprootExpandedHex(!taprootExpandedHex)}
                              className="text-xs text-indigo-400 hover:text-indigo-300"
                            >
                              {taprootExpandedHex ? "Collapse" : "Expand"}
                            </button>
                          )}
                        </div>
                        <div className="text-xs font-mono">
                          {taprootScriptHex ? (
                            taprootExpandedHex || taprootScriptHex.length <= 100 
                              ? taprootScriptHex 
                              : `${taprootScriptHex.slice(0, 100)}...`
                          ) : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-slate-900/60 p-4 rounded-2xl shadow text-sm space-y-2">
                  <h3 className="font-semibold">Taproot Inscription Notes</h3>
                  <ul className="list-disc ml-5 space-y-1">
                    <li>Uses Ordinals-style inscription format with envelope: <code>OP_FALSE OP_IF "ord" ...</code></li>
                    <li>Data is revealed when spending via script-path (not key-path)</li>
                    <li>Supports up to ~390KB per inscription (within 400KB standard tx limit)</li>
                    <li>Content type (MIME) allows various data formats</li>
                    <li>Inscription requires two transactions: commit (create output) and reveal (spend output)</li>
                  </ul>
                  <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded-xl">
                    <strong>⚠️ Note:</strong> This is a simplified implementation. Production inscriptions need proper key management and commit/reveal workflow.
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {/* Decode Tab Content */}
        {activeTab === "decode" && (
          <>
            <section className="bg-slate-900/60 p-4 rounded-2xl shadow">
              <h2 className="font-semibold mb-3">Decode P2WSH Transaction Data</h2>
              <div className="flex gap-3">
                <input
                  className="flex-1 rounded-xl p-3 text-slate-900"
                  value={decodeTxid}
                  onChange={(e) => setDecodeTxid(e.target.value.trim())}
                  placeholder="Enter transaction ID (TXID) to decode..."
                />
                <button
                  onClick={fetchAndDecodeTransaction}
                  disabled={decodeLoading || !decodeTxid}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
                >
                  {decodeLoading ? "Loading..." : "Decode"}
                </button>
              </div>
              {decodeError && (
                <div className="mt-3 p-3 rounded-xl bg-red-900/30 border border-red-700 text-sm">
                  {decodeError}
                </div>
              )}
            </section>

            {decodedData && (
              <>
                <section className="bg-slate-900/60 p-4 rounded-2xl shadow">
                  <h3 className="font-semibold mb-3">Transaction Details</h3>
                  <div className="space-y-2 text-sm">
                    <div className="bg-slate-800/70 rounded-xl p-3">
                      <div className="opacity-70">Transaction ID</div>
                      <div className="font-mono break-all">
                        <a 
                          href={`https://mempool.space/testnet/tx/${decodedData.txid}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-indigo-400 hover:underline"
                        >
                          {decodedData.txid}
                        </a>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-slate-900/60 p-4 rounded-2xl shadow">
                  <h3 className="font-semibold mb-3">Witness Data in Inputs</h3>
                  <div className="space-y-3">
                    {decodedData.inputs.filter(input => input.hasData).length === 0 ? (
                      <div className="text-sm opacity-70 p-3 bg-slate-800/50 rounded-xl">
                        No P2WSH envelope data found in this transaction's inputs.
                      </div>
                    ) : (
                      decodedData.inputs.filter(input => input.hasData).map(input => (
                        <div key={input.index} className="bg-slate-800/70 rounded-xl p-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <div className="font-semibold text-sm">Input #{input.index}</div>
                            <div className="text-xs px-2 py-1 bg-emerald-600/20 text-emerald-400 rounded">
                              Data Found
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="bg-slate-900/50 rounded-lg p-2">
                              <div className="text-xs opacity-70 mb-1">UTF-8 Data:</div>
                              <div className="text-sm font-mono break-all text-indigo-300">
                                {input.dataUtf8}
                              </div>
                            </div>
                            
                            <div className="bg-slate-900/50 rounded-lg p-2">
                              <div className="text-xs opacity-70 mb-1">Hex Data:</div>
                              <div className="text-xs font-mono break-all opacity-80">
                                {input.dataHex}
                              </div>
                            </div>
                            
                            <div className="bg-slate-900/50 rounded-lg p-2">
                              <div className="text-xs opacity-70 mb-1">Witness Stack ({input.witness.length} items):</div>
                              <div className="text-xs space-y-1">
                                {input.witness.map((wit: string, idx: number) => (
                                  <div key={idx} className="font-mono opacity-60">
                                    [{idx}]: {wit.length > 100 ? `${wit.slice(0, 50)}...${wit.slice(-50)}` : wit}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="bg-slate-900/60 p-4 rounded-2xl shadow">
                  <h3 className="font-semibold mb-3">Outputs</h3>
                  <div className="space-y-2">
                    {decodedData.outputs.map(output => (
                      <div key={output.index} className="bg-slate-800/70 rounded-xl p-3 flex justify-between items-center">
                        <div className="text-sm">
                          <span className="opacity-70">Output #{output.index}:</span> {output.address}
                        </div>
                        <div className="text-sm font-semibold">
                          {output.value.toLocaleString()} sats
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}