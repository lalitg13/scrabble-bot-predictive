import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setActivePolicy,prepareDictionary,decideBid,chooseWord,bestPlayable,shouldPlay,rackAfterWord} from './strategy.js';
import {tournamentRefusal} from './casual.js';
const words=fs.readFileSync(new URL('../spacetimedb/wordlist.txt',import.meta.url),'utf8').trim().toUpperCase().split('\n');
prepareDictionary(words);setActivePolicy(null); // these tests pin the heuristic rails
const rack=(s:string)=>{const m=new Map<string,number>();for(const c of s)m.set(c,(m.get(c)??0)+1);return m;};
const bid=(r:string,l:string,b=100,bag=68)=>decideBid({myRack:rack(r),letter:l,myBalance:b,bagRemaining:bag,auctionType:'Vickrey'});
test('unhooked power tiles remain skipped',()=>{for(const c of 'QZX')assert.equal(bid('',c),0);});
test('vowel saturation and duplicates are discounted',()=>{assert.ok(bid('IIO','E',25)<bid('IIO','T',25));assert.ok(bid('IO','I',38)<bid('IO','N',38));});
test('do not spend last coins on an early singleton',()=>{assert.ok(bid('','E',14,42)<=3);assert.equal(bid('','N',80,6),0);});
test('late cashable completion can use all remaining funds',()=>assert.equal(bid('HAT','E',20,1),20));
test('hold cheap five for funded real six-letter hooks',()=>assert.equal(chooseWord({myRack:rack('EILNO'),dictionary:words,bagRemaining:33,myBalance:19}),null));
test('bounded holding releases in late game or when unfunded',()=>{for(const [bag,balance] of [[18,19],[33,4]])assert.ok(chooseWord({myRack:rack('EILNO'),dictionary:words,bagRemaining:bag,myBalance:balance}));});
test('early low four held; late four liquidated',()=>{const p=bestPlayable(words,rack('AUTO'))!;assert.equal(shouldPlay(p,6,46),false);assert.equal(shouldPlay(p,6,8),true);});
test('great six is banked',()=>assert.equal(chooseWord({myRack:rack('TOGGED'),dictionary:words,bagRemaining:53,myBalance:54}),'TOGGED'));
test('tournament environment always refused, including empty',()=>{assert.ok(tournamentRefusal({TOURNAMENT_ID:''}));assert.ok(tournamentRefusal({TOURNAMENT_ID:'1'}));assert.equal(tournamentRefusal({}),null);});
console.log('sanity bids',Object.fromEntries(['E','A','S','R','Q','Z','X'].map(c=>[c,bid('',c)])), 'HAT+E',bid('HAT','E'),'late empty N',bid('','N',80,6));

test('early four-letter completion does not drain follow-up coins',()=>assert.ok(bid('AIT','R',22,30)<=8));
test('auction sees the leave of a cashing word, not an obsolete completion',()=>{assert.deepEqual(rackAfterWord(rack('ARGENT'),'ARGENT'),rack(''));assert.deepEqual(rackAfterWord(rack('AVOIDL'),'AVOID'),rack('L'));assert.ok(decideBid({myRack:rackAfterWord(rack('ARGENT'),'ARGENT'),letter:'I',myBalance:38,bagRemaining:42})<=7);});
