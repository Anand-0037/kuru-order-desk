export const NOW = 1790928000000;
export const OWNER = '0x1111111111111111111111111111111111111111';
export const HASH = `0x${'a'.repeat(64)}`;
export const BLOCK_HASH = `0x${'b'.repeat(64)}`;
export function input(change: Record<string, unknown> = {}) {
  return {owner:OWNER,side:'buy',price:'0.025',quantity:'1000',...change};
}
export function snapshot(change: Record<string, unknown> = {}) {
  return { chainId:10143, market:'0x26cd68436b6a4aeb3ec52abc20a4d121f8b4bac9', accountCore:'0xdbaade7b42c95399bb1e9614d51b5b9e2cf78038',
    baseToken:'0x0000000000000000000000000000000000000000',quoteToken:'0xa402b424f392eaa05dbc8779e4502a1f6a96fef1',
    owner:OWNER, accountId:'7', blockNumber:'100',blockHash:BLOCK_HASH,blockTimestampMs:NOW,observedAtMs:NOW,
    priceScale:'1000000',sizeScale:'1000000',baseMultiplier:'1000000000000',quoteDecimals:6,tick:'1',
    minQuoteAtoms:'10000000',maxQuoteAtoms:'5000000000000',makerFeePps:'4000',
    baseFreeAtoms:'10000000000000000000000',quoteFreeAtoms:'1000000000',baseReservedAtoms:'0',quoteReservedAtoms:'0',walletMonAtoms:'1000000000000000000',
    slots:Array(62).fill('0'), postFillHook:'0x0000000000000000000000000000000000000000',paused:false,marketState:0,
    marketImplementation:'0xa4171e141a3cf7801d7f06c126284ac0a509e6a9',accountImplementation:'0x980719bfce5bf47fbe6951676086bde2fd8452b1',
    ...change };
}
export const CANCEL_HASH = `0x${'c'.repeat(64)}`;
export function book(change: Record<string, unknown> = {}) {
 return {kind:'book',chainId:10143,market:'0x26cd68436b6a4aeb3ec52abc20a4d121f8b4bac9',blockNumber:'101',blockHash:BLOCK_HASH,transactionHash:HASH,transactionIndex:0,logIndex:0,recordIndex:0,
  actionAccountId:'7',clientOrderId:'',operationIndex:0,makerId:'7',orderId:'88',slot:3,side:'buy',price:'25000',size:'1000000000',live:true,sentinel:false,outcome:2,makerFeePps:'4000',...change};
}
export function trade(change: Record<string, unknown> = {}) {
 return {kind:'trade',chainId:10143,market:'0x26cd68436b6a4aeb3ec52abc20a4d121f8b4bac9',blockNumber:'102',blockHash:BLOCK_HASH,transactionHash:`0x${'d'.repeat(64)}`,transactionIndex:0,logIndex:0,recordIndex:0,
  actionAccountId:'19',clientOrderId:`0x${'e'.repeat(64)}`,makerId:'7',orderId:'88',slot:3,side:'buy',price:'25000',fillSize:'400000000',updatedSize:'600000000',tradeId:'123',passive:false,makerFeePps:'4000',...change};
}
export function evidence(clientOrderId: string, change: Record<string, unknown> = {}) {
 return {chainId:10143,market:'0x26cd68436b6a4aeb3ec52abc20a4d121f8b4bac9',submissionHash:HASH,receiptStatus:'success',receiptBlock:'101',requestMatches:true,
  finalized:true,complete:true,canonical:true,fromBlock:'101',toBlock:'105',headHash:BLOCK_HASH,observedAtMs:NOW,
  events:[book({clientOrderId})], slots:Array.from({length:62},(_,i)=>i===3?'88':'0'),...change};
}
