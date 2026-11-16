export type TxJson = {
  to: string;
  data: string;
  value: string;
};

export type ChainInfo = {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeSymbol: string;
};

export type ConfigSource = "env" | "local" | "template";

export type ConfigInfo = {
  configId: string;
  configHash: string;
  enabled: boolean;
  usingPublicTemplate: boolean;
  source: ConfigSource;
  tokenDecimals: number;
  quoteToken: string;
  quoteSymbol: string;
  quoteDecimals: number;
  poolCreationFeeWei: string;
  partnerRecipient: string;
  owner: string;
  migrationQuoteThreshold: string;
  chain: ChainInfo;
  deploymentSlot: string;
};

export type LaunchCard = {
  token: string;
  curve: string;
  creator: string;
  name: string;
  symbol: string;
  decimals: number;
  metadataUri: string;
  image: string | null;
  status: number;
  statusLabel: string;
  progressBps: number;
  quoteReserve: string;
  quoteThreshold: string;
  quoteToken: string;
  quoteSymbol: string;
  quoteDecimals: number;
  canonicalPool: string | null;
  configId: string;
};

export type FeedResponse = {
  source: "data-api" | "factory-logs";
  warning: string | null;
  launches: LaunchCard[];
};

export type FillKind = "full" | "graduation-boundary" | "terminal-dust" | "partial";

export type QuoteView = {
  side: "buy" | "sell";
  amountInRaw: string;
  amountOutRaw: string;
  amountLeftRaw: string;
  feeRaw: string;
  minimumAmountOutRaw: string;
  amountIn: string;
  amountOut: string;
  amountLeft: string;
  fee: string;
  minimumAmountOut: string;
  fillKind: FillKind;
  allowPartialFill: boolean;
  executable: boolean;
  message: string;
  tokenDecimals: number;
  quoteDecimals: number;
  quoteSymbol: string;
  symbol: string;
  asOfBlock: string;
};

export type PlanView = {
  status: "READY" | "APPROVAL_REQUIRED";
  action: "launch" | "trade" | "migrate";
  summary: string[];
  transaction: TxJson;
  approvalTransactions: TxJson[];
  replanAfterApproval: boolean;
  quote: QuoteView | null;
  predictedToken: string | null;
  predictedCurve: string | null;
};

export type ConfigPlan = {
  chainId: number;
  registry: string;
  templateId: string;
  templateHash: string;
  owner: string;
  recipients: {
    configOwner: string;
    partnerRecipient: string;
    liquidityPartner: string;
    leftoverReceiver: string;
  };
  saleSupplyRaw: string;
  saleSupply: string;
  quoteThresholdRaw: string;
  quoteThreshold: string;
  totalSupplyRaw: string;
  simulatedConfigId: string;
  simulatedConfigHash: string;
  reviewHash: string;
  transaction: TxJson;
  simulation: { ok: boolean; message: string };
  note: string;
};

export type CreatedConfig = {
  hash: string;
  configId: string;
  configHash: string;
  owner: string;
};

export type ReceiptView = {
  hash: string;
  token: string | null;
  curve: string | null;
  configId: string | null;
  canonicalPool: string | null;
  amountOut: string | null;
};
