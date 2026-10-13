import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeBookPayload, decodeTradePayload } from "../src/packed.ts";

// Independent oracle: public indexing/order-book.md at contract revision
// cdac5ae1, sections Packed Trade Records, Packed Active Book Updates and
// Outcomes on {TradesPacked,BookUpdatesPacked}. No SDK ABI, codec, or production
// packing helper is used to construct these byte strings or expected values.
// Visual byte groups are the documented field boundaries, in network order.
const BOOK =
  "0x" +
  "0102030405" + "3d" + "85" + "11223344" +
  "0102030405060708090a0b0c" + "1122334455667788" + "2a" +
  "10203040" + "123456";
const TRADE =
  "0x" +
  "0102030405" + "3d" + "15" + "11223344" +
  "0102030405060708090a0b0c" + "1122334455667788" + "2a" +
  "0c0b0a090807060504030201" + "123456" + "ff" +
  "0000000000000000" + "8899aabbccddeeff";
const SENTINEL =
  "0x" +
  "0000000000" + "ff" + "0c" + "00000000" +
  "000000000000000000000000" + "0000000000000000" + "00" +
  "00000000" + "000000";

function byte(payload: string, offset: number, value: string): string {
  assert.match(value, /^[0-9a-f]{2}$/i);
  const start = 2 + offset * 2;
  return payload.slice(0, start) + value + payload.slice(start + 2);
}
function join(a: string, b: string): string {
  return a + b.slice(2);
}

test("independent adapter review: 39-byte literal preserves each book boundary", () => {
  const records = decodeBookPayload(BOOK);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    makerId: 0x0102030405n,
    slotIdx: 61,
    makerIsBuy: true,
    price: 0x11223344n,
    size: 0x0102030405060708090a0b0cn,
    orderId: 0x1122334455667788n,
    operationIndex: 42,
    minSizeAfterBlock: 0x10203040n,
    makerFeePps: 0x123456n,
    outcome: 2,
    isLive: true,
    isSentinel: false,
  });
});

test("independent adapter review: 64-byte literal preserves both trade words", () => {
  const records = decodeTradePayload(TRADE);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    makerId: 0x0102030405n,
    slotIdx: 61,
    makerIsBuy: true,
    price: 0x11223344n,
    fillSize: 0x0102030405060708090a0b0cn,
    orderId: 0x1122334455667788n,
    operationIndex: 42,
    updatedSize: 0x0c0b0a090807060504030201n,
    makerFeePps: 0x123456n,
    replacementSlot: 255,
    tradeId: 0x8899aabbccddeeffn,
    outcome: 2,
    makerIsPassive: false,
    matchEnd: true,
  });
});

test("independent adapter review: maximum unsigned widths never cross field boundaries", () => {
  // Codec-width vectors, not claims that these economic values can be placed.
  const book = "0x" + "ffffffffff" + "3d" + "84" + "ffffffff" +
    "ffffffffffffffffffffffff" + "ffffffffffffffff" + "ff" + "ffffffff" + "ffffff";
  const trade = "0x" + "ffffffffff" + "3d" + "14" + "ffffffff" +
    "ffffffffffffffffffffffff" + "ffffffffffffffff" + "ff" +
    "ffffffffffffffffffffffff" + "ffffff" + "3d" +
    "0000000000000000" + "ffffffffffffffff";
  const [b] = decodeBookPayload(book), [t] = decodeTradePayload(trade);
  assert.equal(b?.makerId, 0xffffffffffn);
  assert.equal(b?.price, 0xffffffffn);
  assert.equal(b?.size, 0xffffffffffffffffffffffffn);
  assert.equal(b?.orderId, 0xffffffffffffffffn);
  assert.equal(b?.minSizeAfterBlock, 0xffffffffn);
  assert.equal(b?.makerFeePps, 0xffffffn);
  assert.equal(b?.operationIndex, 255);
  assert.equal(t?.makerId, 0xffffffffffn);
  assert.equal(t?.price, 0xffffffffn);
  assert.equal(t?.fillSize, 0xffffffffffffffffffffffffn);
  assert.equal(t?.updatedSize, 0xffffffffffffffffffffffffn);
  assert.equal(t?.orderId, 0xffffffffffffffffn);
  assert.equal(t?.tradeId, 0xffffffffffffffffn);
  assert.equal(t?.makerFeePps, 0xffffffn);
  assert.equal(t?.operationIndex, 255);
  assert.equal(t?.replacementSlot, 61);
});

test("independent adapter review: sentinel operation index zero is meaningful", () => {
  const [s] = decodeBookPayload(SENTINEL);
  assert.equal(s?.isSentinel, true);
  assert.equal(s?.isLive, false);
  assert.equal(s?.makerIsBuy, false);
  assert.equal(s?.makerId, 0n);
  assert.equal(s?.slotIdx, 255);
  assert.equal(s?.outcome, 6);
  assert.equal(s?.operationIndex, 0);
  const [cancelNoop] = decodeBookPayload(byte(byte(SENTINEL, 5, "3d"), 6, "12"));
  assert.equal(cancelNoop?.isSentinel, true);
  assert.equal(cancelNoop?.outcome, 9);
  assert.equal(cancelNoop?.slotIdx, 61);
});

test("independent adapter review: outcome NONE ignores the reserved operation metadata", () => {
  const [b] = decodeBookPayload(byte(BOOK, 6, "81"));
  const [t] = decodeTradePayload(byte(TRADE, 6, "05"));
  assert.equal(b?.outcome, 0);
  assert.equal(b?.operationIndex, undefined);
  assert.equal(t?.outcome, 0);
  assert.equal(t?.operationIndex, undefined);
  assert.equal(t?.replacementSlot, undefined);
  assert.equal(t?.matchEnd, true);
  // A packed event may end before its enclosing match does. A pure payload
  // decoder must not demand MATCH_END on the last record of every event.
  const [continued] = decodeTradePayload(byte(TRADE, 6, "01"));
  assert.equal(continued?.matchEnd, false);
  assert.equal(continued?.outcome, 0);
  assert.equal(continued?.operationIndex, undefined);
});

test("independent adapter review: passive bid and ask use zero maker and side-bound slots", () => {
  const bid = "0x" + "0000000000" + "00" + "0f" + "000061a8" +
    "000000000000000017d78400" + "0000000000005dc0" + "00" +
    "000000000000000023c34600" + "000000" + "ff" +
    "0000000000000000" + "0000000000000001";
  const ask = byte(byte(bid, 5, "01"), 6, "0e");
  const [b, a] = decodeTradePayload(join(bid, ask));
  assert.equal(b?.makerIsPassive, true);
  assert.equal(b?.makerIsBuy, true);
  assert.equal(b?.makerId, 0n);
  assert.equal(b?.slotIdx, 0);
  assert.equal(b?.orderId, 24_000n);
  assert.equal(b?.price, 25_000n);
  assert.equal(b?.fillSize, 400_000_000n);
  assert.equal(b?.updatedSize, 600_000_000n);
  assert.equal(b?.makerFeePps, 0n);
  assert.equal(b?.outcome, 1);
  assert.equal(b?.operationIndex, 0);
  assert.equal(a?.makerIsBuy, false);
  assert.equal(a?.slotIdx, 1);
  assert.throws(() => decodeTradePayload(byte(bid, 5, "01")));
  assert.throws(() => decodeTradePayload(byte(ask, 5, "00")));
  assert.throws(() => decodeTradePayload(byte(bid, 4, "01")));
  assert.throws(() => decodeTradePayload(byte(bid, 46, "01")));
});

test("independent adapter review: concatenation preserves record order and ignores no suffix", () => {
  const books = decodeBookPayload(join(BOOK, SENTINEL));
  const trades = decodeTradePayload(join(TRADE, byte(TRADE, 63, "01")));
  assert.equal(books.length, 2);
  assert.equal(books[0]?.orderId, 0x1122334455667788n);
  assert.equal(books[1]?.isSentinel, true);
  assert.equal(trades.length, 2);
  assert.equal(trades[0]?.tradeId, 0x8899aabbccddeeffn);
  assert.equal(trades[1]?.tradeId, 0x8899aabbccddee01n);
  assert.throws(() => decodeBookPayload(BOOK + "00"));
  assert.throws(() => decodeTradePayload(TRADE + "00"));
  assert.deepEqual(decodeBookPayload("0x"), []);
  assert.deepEqual(decodeTradePayload("0x"), []);
});

test("independent adapter review: malformed lexical input and truncated records fail closed", () => {
  for (const value of [null, undefined, 0, 1n, {}, [], new Uint8Array(), "", "00", "0x0", "0xz0", " 0x", "0x\n"]) {
    assert.throws(() => decodeBookPayload(value), `book ${String(value)}`);
    assert.throws(() => decodeTradePayload(value), `trade ${String(value)}`);
  }
  for (const length of [1, 32, 38, 40, 77, 79])
    assert.throws(() => decodeBookPayload("0x" + "00".repeat(length)), `book ${length} bytes`);
  for (const length of [1, 32, 63, 65, 127, 129])
    assert.throws(() => decodeTradePayload("0x" + "00".repeat(length)), `trade ${length} bytes`);
  assert.throws(() => decodeBookPayload(join(BOOK, byte(SENTINEL, 6, "3e"))));
  assert.throws(() => decodeTradePayload(join(TRADE, byte(TRADE, 6, "fc"))));
});

test("independent adapter review: unknown flags and reserved bits fail closed", () => {
  assert.throws(() => decodeBookPayload(byte(BOOK, 6, "c5")), "reserved book bit 6");
  assert.throws(() => decodeBookPayload(byte(BOOK, 6, "97")), "unknown book outcome 11");
  assert.throws(() => decodeTradePayload(byte(TRADE, 6, "5d")), "unknown trade outcome 11");
  for (const offset of [48, 55])
    assert.throws(() => decodeTradePayload(byte(TRADE, offset, "01")), `reserved trade byte ${offset}`);
});

test("independent adapter review: impossible documented outcome contexts fail closed", () => {
  // Live cannot be CANCELLED; book cannot carry FILLED, IOC_PARTIAL or dust.
  for (const flags of ["8f", "83", "89", "95"])
    assert.throws(() => decodeBookPayload(byte(BOOK, 6, flags)));
  // Nonzero trade outcome requires MATCH_END. Book-only outcomes never trade.
  for (const flags of ["11", "2d", "35", "3d", "45", "4d"])
    assert.throws(() => decodeTradePayload(byte(TRADE, 6, flags)));
  const nativePartial = byte(TRADE, 6, "25");
  assert.equal(decodeTradePayload(nativePartial)[0]?.outcome, 4);
  assert.throws(() => decodeTradePayload(byte(nativePartial, 47, "03")));
  for (const flags of ["0d", "15", "1d", "25", "55"])
    assert.equal(decodeTradePayload(byte(TRADE, 6, flags)).length, 1);
  for (let outcome = 11; outcome < 32; outcome++) {
    assert.throws(() => decodeBookPayload(byte(BOOK, 6, (0x81 | (outcome << 1)).toString(16))));
    assert.throws(() => decodeTradePayload(byte(TRADE, 6, (5 | (outcome << 3)).toString(16))));
  }
});

test("independent adapter review: nonzero sentinel fields cannot erase a real delta", () => {
  for (const offset of [7, 11, 23, 32, 36])
    assert.throws(() => decodeBookPayload(byte(SENTINEL, offset, "01")), `sentinel byte ${offset}`);
  assert.throws(() => decodeBookPayload(byte(SENTINEL, 6, "0d")), "sentinel buy flag");
  assert.throws(() => decodeBookPayload(byte(SENTINEL, 6, "8c")), "zero-account live record");
  assert.throws(() => decodeBookPayload(byte(SENTINEL, 6, "00")), "sentinel lacks an outcome");
  assert.throws(() => decodeBookPayload(byte(SENTINEL, 6, "0e")), "CANCELLED needs a real maker");
  assert.throws(() => decodeBookPayload(byte(SENTINEL, 5, "3e")), "physical slot 62 is reserved");
  assert.throws(() => decodeBookPayload(byte(SENTINEL, 6, "12")), "CANCEL_NOOP requires packed target slot");
  assert.throws(() => decodeBookPayload(byte(byte(SENTINEL, 6, "0a"), 5, "00")), "IOC_UNFILLED requires native slot 255");
  assert.throws(() => decodeBookPayload(byte(BOOK, 5, "ff")), "live physical slot 255 is invalid");
  assert.throws(() => decodeTradePayload(byte(TRADE, 5, "ff")), "active physical slot 255 is invalid");
});

test("independent adapter review: real deletion keeps removed size and has zero trailers", () => {
  let deleted = byte(BOOK, 6, "0f");
  for (let offset = 32; offset < 39; offset++) deleted = byte(deleted, offset, "00");
  const [r] = decodeBookPayload(deleted);
  assert.equal(r?.isLive, false);
  assert.equal(r?.isSentinel, false);
  assert.equal(r?.outcome, 7);
  assert.equal(r?.size, 0x0102030405060708090a0b0cn);
  assert.equal(r?.orderId, 0x1122334455667788n);
  assert.equal(r?.minSizeAfterBlock, 0n);
  assert.equal(r?.makerFeePps, 0n);
  assert.throws(() => decodeBookPayload(byte(deleted, 35, "01")));
  assert.throws(() => decodeBookPayload(byte(deleted, 38, "01")));
  for (const flags of ["01", "07", "0d", "0f", "11"])
    assert.equal(decodeBookPayload(byte(deleted, 6, flags)).length, 1);
});
