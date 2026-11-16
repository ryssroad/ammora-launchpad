import assert from "node:assert/strict";
import test from "node:test";
import { glyphImage, safeGlyphImage } from "../lib/glyph";
import { buildMetadataUri, readMetadata, MAX_METADATA_BYTES } from "../lib/metadata";
import { formatRaw } from "../lib/format";
import { parseAmount } from "../lib/ammora/trade";

test("glyphs survive metadata storage without an image host, including maximum Unicode inputs", () => {
  for (const seed of [0, 1, 32767, 0xffffffff, 21973]) {
    const image = glyphImage(seed);
    const name = "月".repeat(32);
    const description = "月".repeat(140);
    const uri = buildMetadataUri({ name, symbol: "ABCDEFGHIJ", description, image });
    assert.ok(new TextEncoder().encode(uri).length <= MAX_METADATA_BYTES);
    assert.deepEqual(readMetadata(uri), { name, symbol: "ABCDEFGHIJ", description, image });
  }
});

test("untrusted SVG and other active image schemes are rejected", () => {
  for (const svg of ['<svg onload="alert(1)"/>', '<svg><image href="https://example.org/track"/></svg>']) {
    const image = `data:image/svg+xml;base64,${btoa(svg)}`;
    assert.equal(safeGlyphImage(image), null);
    assert.equal(readMetadata(buildMetadataUri({ name: "X", symbol: "X", image }))?.image, undefined);
  }
  assert.equal(readMetadata(buildMetadataUri({ name: "X", symbol: "X", image: "javascript:alert(1)" }))?.image, undefined);
  assert.equal(readMetadata("data:application/json,null"), null);
  assert.equal(readMetadata("data:application/json,%XX"), null);
});

test("existing HTTPS images remain readable and oversize metadata is rejected", () => {
  assert.equal(readMetadata(buildMetadataUri({ name: "Old", symbol: "OLD", image: "https://example.org/art.png" }))?.image, "https://example.org/art.png");
  assert.throws(() => buildMetadataUri({ name: "X", symbol: "X", description: "x".repeat(2048) }), /too long/);
});

test("tiny balances and graduation targets never display as zero", () => {
  assert.equal(formatRaw(1000000000000n, 18, 4), "0.000001");
  assert.equal(formatRaw(1n, 18, 4), "0.000000000000000001");
  assert.equal(formatRaw(0n, 18, 4), "0");
  assert.equal(formatRaw(1234567890n, 3, 2), "1,234,567.89");
});

test("amounts reject negatives, zero and precision loss", () => {
  for (const amount of ["0", "-1", "1e3", "0.0000000001", "NaN"]) assert.throws(() => parseAmount(amount, 9));
  assert.equal(parseAmount("0.000000001", 9), 1n);
});
