import assert from "node:assert/strict";
import test from "node:test";
import { RpcRequestError } from "viem";
import { giwaChain, giwaRpcTransport } from "../lib/ammora/rpc";

test("GIWA transport retries throttled reads once after a pause, and never retries a send", async (t) => {
  const calls = new Map<string, number[]>();
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { id: number; method: string }[];
    return Response.json(body.map(({ id, method }) => {
      const times = calls.get(method) ?? [];
      times.push(performance.now());
      calls.set(method, times);
      if (method === "eth_chainId" && times.length === 2) {
        return { jsonrpc: "2.0", id, result: "0x164ce" };
      }
      const error = method === "eth_estimateGas"
        ? { code: -32602, message: "invalid params" }
        : { code: -32016, message: "over rate limit" };
      return { jsonrpc: "2.0", id, error };
    }));
  });

  const { request } = giwaRpcTransport({ chain: giwaChain });
  const [chain, blocked, sent, invalid] = await Promise.allSettled([
    request({ method: "eth_chainId" }),
    request({ method: "eth_blockNumber" }),
    request({ method: "eth_sendRawTransaction", params: ["0x"] }),
    request({ method: "eth_estimateGas", params: [{}] }),
  ]);

  assert.deepEqual(chain, { status: "fulfilled", value: "0x164ce" });
  assert.equal(blocked.status, "rejected");
  assert.ok(blocked.reason instanceof RpcRequestError);
  const chainIdCalls = calls.get("eth_chainId") ?? [];
  assert.equal(chainIdCalls.length, 2);
  assert.ok(chainIdCalls[1] - chainIdCalls[0] >= 950);
  assert.equal(calls.get("eth_blockNumber")?.length, 2);
  assert.equal(sent.status, "rejected");
  assert.equal(calls.get("eth_sendRawTransaction")?.length, 1);
  assert.equal(invalid.status, "rejected");
  assert.equal(calls.get("eth_estimateGas")?.length, 1);
});
