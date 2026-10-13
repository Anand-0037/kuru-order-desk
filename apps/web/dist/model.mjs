import { parseExact, formatExact, ceilDiv } from './amounts.mjs';
// Browser-only numerical projection of src/planner.ts, checked against the original planner.
// Deliberately not an intent: no digest, freshness proof, wallet identity, transaction or signing path.
export function reviewEstimate({side,price,quantity}, snapshot) {
 if(side!=='buy'&&side!=='sell') throw Error('Choose buy or sell');
 const p=parseExact(price,BigInt(snapshot.priceScale));
 const q=parseExact(quantity,BigInt(snapshot.sizeScale));
 if(p<=0n||p>=1n<<32n||q<=0n||q>=1n<<96n||p%BigInt(snapshot.tick)) throw Error('Price or quantity violates the fixture tick or integer bounds');
 const quoteScale=10n**BigInt(snapshot.quoteDecimals);
 const notional=(((p*q)/BigInt(snapshot.sizeScale))*quoteScale)/BigInt(snapshot.priceScale);
 if(notional<BigInt(snapshot.minQuoteAtoms)||notional>BigInt(snapshot.maxQuoteAtoms)) throw Error('Outside the fixture notional range (10–5,000,000 USDC)');
 const estimate=ceilDiv(p*q*quoteScale,BigInt(snapshot.priceScale)*BigInt(snapshot.sizeScale));
 const fee=ceilDiv(estimate*BigInt(snapshot.makerFeePps),10000000n);
 const required=side==='buy'?estimate+fee:q*BigInt(snapshot.baseMultiplier);
 const free=BigInt(side==='buy'?snapshot.quoteFreeAtoms:snapshot.baseFreeAtoms);
 if(required>free) throw Error('Insufficient prefunded balance in the synthetic fixture account');
 return {side,price:formatExact(p,BigInt(snapshot.priceScale)),quantity:formatExact(q,BigInt(snapshot.sizeScale)),priceUnits:p.toString(),quantityUnits:q.toString(),notional:formatExact(notional,quoteScale),fee:formatExact(fee,quoteScale),required:formatExact(required,side==='buy'?quoteScale:10n**18n),token:side==='buy'?'USDC':'MON'};
}
export function selectScenario(fixture,key){
 const scenario={open:fixture.open,partial:fixture.demo.partial,cancelled:fixture.demo.final,unknown:fixture.unknown}[key];
 if(!scenario) throw Error('Unknown fixture scenario');
 return scenario;
}
