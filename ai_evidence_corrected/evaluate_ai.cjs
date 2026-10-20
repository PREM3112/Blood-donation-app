'use strict';
// Standalone evaluator; does not import or overwrite the app service.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const csv = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fields = ['bloodGroup','quantity','urgency'];
function valid(x) {
  return x && typeof x === 'object' &&
    ['A+','A-','B+','B-','AB+','AB-','O+','O-','All',null].includes(x.bloodGroup) &&
    (x.quantity === null || (Number.isInteger(x.quantity) && x.quantity >= 0)) &&
    ['LOW','MEDIUM','HIGH'].includes(x.urgency) && typeof x.replyMessage === 'string';
}
function score(expected, actual) {
  return Object.fromEntries(fields.map(k => [k, expected[k] === actual[k]]));
}
async function main() {
  const datasetBytes = fs.readFileSync(path.join(__dirname,'dataset.json'));
  const dataset = JSON.parse(datasetBytes);
  const prompt = fs.readFileSync(path.join(__dirname,'prompt.txt'),'utf8');
  if (dataset.length !== 50 || new Set(dataset.map(x=>x.id)).size !== 50)
    throw new Error('Dataset must contain 50 unique queries.');
  if (!process.argv.includes('--run')) {
    console.log('Dataset: 50 queries. No API calls made.');
    console.log('Run/resume: node evaluate_ai.cjs --run');
    console.log('Review LABEL_REVIEW.md before claiming publication accuracy.');
    return;
  }
  require('dotenv').config({quiet:true});
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();
  if (!key) throw new Error('Set GEMINI_API_KEY or EXPO_PUBLIC_GEMINI_API_KEY in .env.');
  if (typeof fetch !== 'function') throw new Error('Use Node.js 20 or later.');
  const protocol = {
    model:'gemini-2.5-flash', generationConfig:{response_mime_type:'application/json',temperature:0.1},
    prompt, datasetSHA256:sha(datasetBytes), scriptSHA256:sha(fs.readFileSync(__filename)),
    scoring:'Exact equality of bloodGroup, quantity and urgency; original supplied labels remain provisional.',
    intervalMs:15000, timeoutMs:60000,
    latencyDefinition:'Immediately before fetch until response body is read, parsed and validated; excludes pacing/backoff and app UI.',
    retryPolicy:'No automatic immediate retries. Stop on HTTP/network errors; rerun resumes unresolved queries. Returned model responses, including wrong or invalid outputs, are terminal.'
  };
  const fingerprint = sha(JSON.stringify(protocol));
  const folder = path.join(__dirname,'ai_evidence_output');
  fs.mkdirSync(folder,{recursive:true});
  const file = path.join(folder,'evidence.json');
  const lock = path.join(folder,'running.lock');
  const lockFd = fs.openSync(lock,'wx');
  const redact = v => String(v).split(key).join('[REDACTED]');
  let report;
  function save() {
    const finished = report.queries.filter(q=>q.completed);
    const schemaValid = finished.filter(q=>q.outcome === 'MATCH' || q.outcome === 'MISMATCH');
    const matches = finished.filter(q=>q.outcome === 'MATCH').length;
    report.summary = {
      labelsStatus:'PROVISIONAL: see LABEL_REVIEW.md', plannedQueries:dataset.length,
      completedModelResponses:finished.length, validResponses:schemaValid.length,
      exactMatches:matches, mismatches:finished.filter(q=>q.outcome==='MISMATCH').length,
      invalidResponses:finished.filter(q=>q.outcome==='INVALID_RESPONSE').length,
      unresolvedQueries:dataset.length-finished.length,
      apiFailureAttempts:report.queries.flatMap(q=>q.attempts).filter(a=>['HTTP_ERROR','NETWORK_ERROR'].includes(a.status)).length,
      exactMatchPercentAmongCompleted:finished.length ? 100*matches/finished.length : null,
      complete:finished.length===dataset.length
    };
    report.updatedAt = new Date().toISOString();
    fs.writeFileSync(file+'.tmp',JSON.stringify(report,null,2));
    fs.renameSync(file+'.tmp',file);
    const header=['Query ID','Input','Expected JSON','Actual JSON','Outcome','Attempts','Retries','Last API elapsed ms'];
    const rows=report.queries.map(q=>{
      const last=q.attempts.at(-1);
      return [q.id,q.input,JSON.stringify(q.expected),q.actual?JSON.stringify(q.actual):'',
        q.outcome||'PENDING',q.attempts.length,Math.max(0,q.attempts.length-1),last?.apiElapsedMs??''];
    });
    fs.writeFileSync(path.join(folder,'results.csv'),[header,...rows].map(r=>r.map(csv).join(',')).join('\n'));
  }
  try {
    report = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {
      createdAt:new Date().toISOString(),fingerprint,protocol,sessions:[],
      queries:dataset.map(q=>({...q,completed:false,attempts:[]}))
    };
    if (report.fingerprint!==fingerprint)
      throw new Error('Protocol/dataset/script changed. Archive ai_evidence_output before starting a separate experiment.');
    if (report.notBefore && Date.now()<Date.parse(report.notBefore))
      throw new Error('Saved cooldown: resume after '+report.notBefore);
    const session={id:crypto.randomUUID(),startedAt:new Date().toISOString(),
      nodeVersion:process.version,platform:os.platform(),architecture:os.arch(),
      deviceDescription:process.env.EVIDENCE_DEVICE || 'Not supplied',
      networkDescription:process.env.EVIDENCE_NETWORK || 'Not supplied'};
    report.sessions.push(session);
    for (const q of report.queries) for (const a of q.attempts)
      if(a.status==='IN_FLIGHT') a.status='INTERRUPTED_OUTCOME_UNKNOWN';
    save();
    for (const q of report.queries) {
      if(q.completed) continue;
      const wait = Math.max(0,15000-(Date.now()-(report.lastRequestAt || 0)));
      if(wait) await sleep(wait);
      const attempt={sessionId:session.id,attempt:q.attempts.length+1,
        startedAt:new Date().toISOString(),status:'IN_FLIGHT'};
      q.attempts.push(attempt);
      report.lastRequestAt=Date.now(); save();
      const start=performance.now();
      let response, text, data;
      try {
        response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+protocol.model+':generateContent',{
          method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
          signal:AbortSignal.timeout(60000),
          body:JSON.stringify({
            contents:[{role:'user',parts:[{text:prompt+'\n\nUser request: "'+q.input+'"'}]}],
            generationConfig:protocol.generationConfig
          })
        });
        text=await response.text();
        attempt.httpStatus=response.status;
        attempt.rawResponseBody=redact(text);
        try { data=JSON.parse(text); } catch { data=null; }
      } catch(error) {
        attempt.status='NETWORK_ERROR';
        attempt.error=redact(error.message);
        attempt.apiElapsedMs=performance.now()-start;
        q.outcome='API_ERROR'; session.stopReason='Network error'; save(); break;
      }
      if(!response.ok) {
        attempt.status='HTTP_ERROR';
        attempt.apiElapsedMs=performance.now()-start;
        attempt.error=redact(data?.error?.message || 'HTTP '+response.status);
        q.outcome='API_ERROR';
        // Honor structured retry information; daily waits are persisted, never slept through.
        const detail=data?.error?.details?.find(d=>typeof d.retryDelay==='string');
        const delayMatch=detail?.retryDelay?.match(/^(\d+(?:\.\d+)?)s$/);
        const retryHeader=response.headers.get('retry-after');
        const headerMs=retryHeader ? (Number.isFinite(Number(retryHeader)) ?
          Number(retryHeader)*1000 : Math.max(0,Date.parse(retryHeader)-Date.now())) : 0;
        if(response.status===429 || response.status>=500)
          report.notBefore=new Date(Date.now()+Math.max(60000,delayMatch?Number(delayMatch[1])*1000:0,headerMs||0)).toISOString();
        session.stopReason='HTTP '+response.status;
        save();
        console.log('Stopped on HTTP '+response.status+'. Progress saved. Check quota before resuming.');
        console.log(attempt.error); break;
      }
      const candidate=data?.candidates?.[0];
      const rawText=candidate?.content?.parts?.filter(p=>!p.thought && typeof p.text==='string').map(p=>p.text).join('') || '';
      attempt.rawModelText=redact(rawText);
      attempt.modelVersion=data?.modelVersion || null;
      attempt.usageMetadata=data?.usageMetadata || null;
      attempt.finishReason=candidate?.finishReason || null;
      try {
        const actual=JSON.parse(rawText); // Strict JSON: no silent markdown cleanup.
        if(!valid(actual)) throw new Error('Invalid output schema.');
        q.actual=actual; q.fieldMatches=score(q.expected,actual);
        q.outcome=Object.values(q.fieldMatches).every(Boolean)?'MATCH':'MISMATCH';
      } catch(error) {
        q.outcome='INVALID_RESPONSE'; attempt.validationError=redact(error.message);
      }
      q.completed=true; attempt.status='MODEL_RESPONSE';
      attempt.apiElapsedMs=performance.now()-start;
      attempt.finishedAt=new Date().toISOString();
      save(); console.log('Query '+q.id+': '+q.outcome);
    }
    session.finishedAt=new Date().toISOString(); save();
    console.log('Saved '+file);
    console.log('Completed model responses: '+report.summary.completedModelResponses+'/50');
  } finally {
    fs.closeSync(lockFd); fs.unlinkSync(lock);
  }
}
if(require.main===module) main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={valid,score};
