// Offline replay of public match history only; never reads credentials.
import fs from 'node:fs';
import {buildIndex,bestPlays} from '../src/dictionary.js';
const rows=(t:string)=>JSON.parse(fs.readFileSync(new URL(`./evidence-${t}.json`,import.meta.url),'utf8'))[0].rows;
const index=buildIndex(fs.readFileSync('spacetimedb/wordlist.txt','utf8').trim().toUpperCase().split('\n'));
const initial=JSON.parse(fs.readFileSync(new URL('./evidence-replay.json',import.meta.url),'utf8')).map(({id,initial,unknown}:any)=>({id,initial,unknown}));
let out:any[]=[];
for(const m of initial){
 const rack=new Uint8Array(26); for(const [c,n] of Object.entries(m.initial))rack[c.charCodeAt(0)-65]=n as number;
 const events:any[]=[];
 for(const a of rows('auction_result'))if(a[1]===m.id&&a[3][0]===0&&a[3][1]===203)events.push({t:a[5][0],kind:'win',letter:a[2],paid:a[4],auction:a[0]});
 for(const w of rows('word_play'))if(w[1]===m.id&&w[2]===203)events.push({t:w[7][0],kind:'word',word:w[3],reward:w[6]});
 events.sort((a,b)=>a.t-b.t);
 let bal=100;
 const text=()=>Array.from(rack).map((n,i)=>String.fromCharCode(65+i).repeat(n)).join('')+(m.unknown?'?'.repeat(m.unknown):'');
 const best=()=>bestPlays(index,rack).sort((a,b)=>a.word.localeCompare(b.word))[0];
 for(const e of events){
  e.rackBefore=text();e.balanceBefore=bal;
  if(e.kind==='win'){rack[e.letter.charCodeAt(0)-65]++;bal-=e.paid;}
  const p=best();e.best=p?{word:p.word,reward:p.reward}:null;
  const hooks:any[]=[];
  for(let i=0;i<26;i++){rack[i]++;const q=best();rack[i]--;if(q&&q.length>=6&&q.reward>(p?.reward??0))hooks.push({letter:String.fromCharCode(65+i),word:q.word,reward:q.reward});}
  e.longHooks=hooks.sort((a,b)=>b.reward-a.reward).slice(0,8);
  if(e.kind==='word'){for(const c of e.word)rack[c.charCodeAt(0)-65]--;bal+=e.reward;}
  e.rackAfter=text();e.balanceAfter=bal;
 }
 out.push({...m,events});
}
fs.writeFileSync('/tmp/ct-replay.json',JSON.stringify(out,null,2));
for(const m of out){console.log('\nMATCH',m.id,'unknown',m.unknown);for(const e of m.events)console.log(JSON.stringify(e));}
