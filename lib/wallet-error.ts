export function walletError(error: unknown) {
  const record = error && typeof error === "object"
    ? (error as { code?: number; shortMessage?: string; message?: string })
    : null;
  const message = record?.shortMessage || record?.message || "The wallet request failed.";
  if (record?.code === 4001 || /user rejected|user denied|rejected the request/i.test(message)) {
    return "Signature was rejected. Nothing was sent.";
  }
  if (/insufficient funds|exceeds the balance/i.test(message)) {
    return "Not enough ETH for gas. Claim test ETH from a faucet, then try again.";
  }
  if (/unrecognized chain|chain mismatch|wallet_switchEthereumChain|wallet_addEthereumChain/i.test(message)) {
    return "Switch the wallet to GIWA Sepolia, then try again.";
  }
  return message.replace(/https?:\/\/\S+/g, "[endpoint]").slice(0, 420);
}
