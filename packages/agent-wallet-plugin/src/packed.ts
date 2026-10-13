/**
 * Independently authored from Kuru's published 39/64-byte record specification.
 * This decodes record bodies only, not the incompletely documented event envelope.
 * See docs/INDEPENDENT-ADAPTER.md for sources, limitations and missing interfaces.
 */
interface PackedIdentity {
  makerId: bigint;
  slotIdx: number;
  makerIsBuy: boolean;
  price: bigint;
  orderId: bigint;
  makerFeePps: bigint;
  outcome: number;
  operationIndex?: number;
}
export interface PackedBook extends PackedIdentity {
  size: bigint;
  minSizeAfterBlock: bigint;
  isLive: boolean;
  isSentinel: boolean;
}
export interface PackedTrade extends PackedIdentity {
  fillSize: bigint;
  updatedSize: bigint;
  tradeId: bigint;
  makerIsPassive: boolean;
  matchEnd: boolean;
  replacementSlot?: number;
}

function records(value: unknown, bytes: number): string[] {
  if (typeof value !== "string" || !/^0x(?:[a-fA-F0-9]{2})*$/.test(value))
    throw new Error("Packed payload must be even-length hexadecimal");
  const body = value.slice(2);
  if (body.length % (bytes * 2) !== 0)
    throw new Error(
      `Packed record length must be a multiple of ${bytes} bytes`,
    );
  const result: string[] = [];
  for (let start = 0; start < body.length; start += bytes * 2)
    result.push(body.slice(start, start + bytes * 2));
  return result;
}
function field(body: string, from: number, to: number): bigint {
  return BigInt(`0x${body.slice(from * 2, to * 2)}`);
}
function identity(body: string, outcome: number) {
  return {
    makerId: field(body, 0, 5),
    slotIdx: Number(field(body, 5, 6)),
    makerIsBuy: (Number(field(body, 6, 7)) & 1) !== 0,
    price: field(body, 7, 11),
    orderId: field(body, 23, 31),
    outcome,
    ...(outcome !== 0 ? { operationIndex: Number(field(body, 31, 32)) } : {}),
  };
}
/** An empty body decodes to no records and cannot establish an order outcome. */
export function decodeBookPayload(value: unknown): PackedBook[] {
  return records(value, 39).map((body) => {
    const flags = Number(field(body, 6, 7)),
      outcome = (flags >> 1) & 31;
    const shared = identity(body, outcome),
      isLive = (flags & 128) !== 0;
    const decoded: PackedBook = {
      ...shared,
      makerFeePps: field(body, 36, 39),
      size: field(body, 11, 23),
      minSizeAfterBlock: field(body, 32, 36),
      isLive,
      isSentinel: !isLive && shared.makerId === 0n,
    };
    if ((flags & 64) !== 0 || outcome > 10)
      throw new Error("Unknown packed book flags or outcome");
    if (decoded.isSentinel) {
      if (
        decoded.makerIsBuy ||
        decoded.price !== 0n ||
        decoded.size !== 0n ||
        decoded.orderId !== 0n ||
        decoded.minSizeAfterBlock !== 0n ||
        decoded.makerFeePps !== 0n ||
        ![3, 5, 6, 9].includes(outcome) ||
        (decoded.slotIdx > 61 && decoded.slotIdx !== 255) ||
        (outcome === 9 && decoded.slotIdx === 255) ||
        (outcome === 5 && decoded.slotIdx !== 255)
      )
        throw new Error("Invalid packed book sentinel");
    } else {
      if (decoded.makerId === 0n || decoded.slotIdx > 61)
        throw new Error("Invalid packed book maker identity");
      if (
        isLive ? ![0, 2].includes(outcome) : ![0, 3, 6, 7, 8].includes(outcome)
      )
        throw new Error("Invalid packed book outcome context");
      if (
        !isLive &&
        (decoded.minSizeAfterBlock !== 0n || decoded.makerFeePps !== 0n)
      )
        throw new Error("Packed book deletion must have zero trailers");
    }
    return decoded;
  });
}
/** Operation metadata is absent for outcome NONE, even when raw metadata is nonzero. */
export function decodeTradePayload(value: unknown): PackedTrade[] {
  return records(value, 64).map((body) => {
    const flags = Number(field(body, 6, 7)),
      outcome = flags >> 3;
    const decoded: PackedTrade = {
      ...identity(body, outcome),
      makerFeePps: field(body, 44, 47),
      fillSize: field(body, 11, 23),
      updatedSize: field(body, 32, 44),
      tradeId: field(body, 56, 64),
      makerIsPassive: (flags & 2) !== 0,
      matchEnd: (flags & 4) !== 0,
      ...(outcome !== 0
        ? { replacementSlot: Number(field(body, 47, 48)) }
        : {}),
    };
    if (field(body, 48, 56) !== 0n || ![0, 1, 2, 3, 4, 10].includes(outcome))
      throw new Error("Unknown packed trade reserved bits or outcome");
    if (
      outcome !== 0 &&
      (!decoded.matchEnd ||
        (decoded.replacementSlot! > 61 && decoded.replacementSlot !== 255) ||
        (outcome === 4 && decoded.replacementSlot !== 255))
    )
      throw new Error("Invalid packed trade outcome context");
    if (decoded.makerIsPassive) {
      if (
        decoded.makerId !== 0n ||
        decoded.makerFeePps !== 0n ||
        decoded.slotIdx !== (decoded.makerIsBuy ? 0 : 1)
      )
        throw new Error("Invalid packed passive trade identity");
    } else if (decoded.makerId === 0n || decoded.slotIdx > 61) {
      throw new Error("Invalid packed active trade identity");
    }
    return decoded;
  });
}
