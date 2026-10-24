import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''));
const directory='docs/xiabaiwang/original/terms-review/round-2';
const rows=read(directory+'/terms-review.json'),prior=read('docs/xiabaiwang/original/terms-review/terms-review.json');
assert.equal(rows.length,16);assert.equal(new Set(rows.map(r=>r.id)).size,16);assert.equal(new Set(rows.map(r=>r.question)).size,16);
for(const r of rows){assert.match(r.id,/^xb-r2-\d{3}$/);assert.match(r.question,/^[\p{Script=Han}]{4,12}$/u);assert.ok(!/[?？]|为什么|是什么|怎么|吗/.test(r.question));assert.ok(r.answer.length>=12);assert.ok([1,2,3].includes(r.difficulty));assert.equal(new URL(r.source).protocol,'https:');assert.ok(r.sourceNote.length>5);assert.ok(!prior.some(old=>old.question===r.question));}
const html=fs.readFileSync(path.join(root,directory,'index.html'),'utf8');
assert.deepEqual(JSON.parse(html.match(/<script id="bank-data" type="application\/json">([\s\S]*?)<\/script>/)[1]),rows);
assert.ok(html.includes('2026-10-24-round2'));assert.ok(!html.includes('2026-10-24-v2'));
const md=fs.readFileSync(path.join(root,directory,'XB_LONG_TERMS_REVIEW_2026-10-24.md'),'utf8');assert.equal((md.match(/^\| R2-\d{3} \|/gm)||[]).length,16);
const effective=read('docs/xiabaiwang/original/feedback-2026-10-24/effective-review.json');
assert.equal(effective.reviews.length,160);assert.equal(effective.reviews.filter(r=>r.decision==='keep').length,49);
for(const id of ['xb-review-061','xb-review-064','xb-review-065'])assert.equal(effective.reviews.find(r=>r.id===id).decision,'replace');
assert.equal(effective.reviews.find(r=>r.id==='xb-review-055').decision,'pending');
console.log(JSON.stringify({passed:true,newCandidates:16,priorKeepCount:49,lengthRange:[Math.min(...rows.map(r=>r.question.length)),Math.max(...rows.map(r=>r.question.length))],sources:16,overlap:0,exportVersion:'2026-10-24-round2',threeRemovalsApplied:true}));
