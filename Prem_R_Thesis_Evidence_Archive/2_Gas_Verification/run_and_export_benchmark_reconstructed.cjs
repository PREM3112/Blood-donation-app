/*
 * Reconstructed reproduction script, NOT the authenticated original execution
 * script for the historical report. Every execution creates NEW evidence.
 * Requires Node.js 20+, ethers 6, axios and dotenv.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fields = ['name', 'licenseId', 'inventoryLevels', 'timestamp'];
const stringify = x => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
const digest = x => crypto.createHash('sha256').update(x).digest('hex');
function stats(values) {
  const n = values.length;
  if (!n) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const mean = values.reduce((a,b) => a+b,0)/n;
  return {count:n, meanGas:mean, medianGas:(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2,
    populationStandardDeviation:Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/n),
    totalGas:values.reduce((a,b)=>a+b,0), minimumGas:sorted[0], maximumGas:sorted[n-1]};
}
async function main() {
  if (!process.argv.includes('--execute')) {
    console.log('Optional NEW Sepolia experiment: node run_and_export_benchmark_reconstructed.cjs --execute');
    console.log('Uses input_dataset.json; spends testnet gas and pins data. Existing evidence is not overwritten.');
    return;
  }
  require('dotenv').config({quiet:true});
  const {ethers} = require('ethers');
  const axios = require('axios');
  for (const key of ['SEPOLIA_RPC_URL','PRIVATE_KEY','PINATA_JWT'])
    if (!process.env[key]?.trim()) throw new Error('Missing environment variable: '+key);
  const datasetBytes = fs.readFileSync(path.join(__dirname,'input_dataset.json'));
  const dataset = JSON.parse(datasetBytes);
  if (!Array.isArray(dataset) || dataset.length !== 10 ||
      dataset.some((p,i)=>p.iteration!==i+1 || fields.some(k=>typeof p[k]!=='string')))
    throw new Error('Expected ten ordered input records with all four string fields.');
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL.trim());
  if ((await provider.getNetwork()).chainId !== 11155111n) throw new Error('Expected Sepolia chain 11155111.');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY.trim(),provider);
  const baseAddress = ethers.getAddress((process.env.BASELINE_CONTRACT_ADDRESS ||
    '0x5a9D64b0158fa3c4df12f9f1730dB326CA624BAf').toLowerCase());
  const hybridAddress = ethers.getAddress((process.env.HYBRID_CONTRACT_ADDRESS ||
    '0x8E14797A22A6B6fC611374eeA029747fD509fcB6').toLowerCase());
  const baseABI = ['function updateInventoryOnChain(string,string,string,string)'];
  const hybridABI = ['function updateInventory(string)','function bloodBanks(address) view returns (string,string,string,bool,bool)'];
  const baseline = new ethers.Contract(baseAddress,baseABI,wallet);
  const hybrid = new ethers.Contract(hybridAddress,hybridABI,wallet);
  for (const a of [baseAddress,hybridAddress])
    if (await provider.getCode(a)==='0x') throw new Error('No deployed code at '+a);
  const bank = await hybrid.bloodBanks(wallet.address);
  if (!bank[3]) throw new Error('Sender must already be registered and verified in the hybrid contract.');
  const output = fs.mkdtempSync(path.join(__dirname,'new_benchmark_'));
  const report = {
    exportTimestamp:new Date().toISOString(), provenance:'New execution using reconstructed script; not historical execution provenance.',
    chainId:11155111, sender:wallet.address, baselineAddress:baseAddress, hybridAddress,
    scriptSHA256:digest(fs.readFileSync(__filename)), datasetSHA256:digest(datasetBytes),
    ethersVersion:ethers.version, nodeVersion:process.version,
    initialBlockNumber:await provider.getBlockNumber(),
    runtimeCodeSHA256:{
      baseline:digest(await provider.getCode(baseAddress)),
      hybrid:digest(await provider.getCode(hybridAddress))
    },
    inputDataset:dataset, linkedRows:[], executionStatus:'in_progress'
  };
  function save() {
    const verified=report.linkedRows.filter(r=>r.verified===true);
    const b=stats(verified.map(r=>Number(r.baseline.gasUsed)));
    const h=stats(verified.map(r=>Number(r.hybrid.gasUsed)));
    report.analysisSummary={expectedPairs:10,verifiedPairs:verified.length,
      complete:verified.length===10, baseline:b,hybrid:h,
      gasSavedPerUpdate:b ? b.meanGas-h.meanGas : null,
      percentageReduction:b ? 100*(b.totalGas-h.totalGas)/b.totalGas : null,
      scope:'Verified pairs only. Fixed input timestamps; existing contract state is not reset. Transaction gas excludes IPFS/API charges and latency. Different authorization/event logic prevents isolating storage as the sole cause.'};
    report.lastUpdatedAt=new Date().toISOString();
    fs.writeFileSync(path.join(output,'report.tmp'),stringify(report));
    fs.renameSync(path.join(output,'report.tmp'),path.join(output,'experiment_evidence_report.json'));
  }
  async function capture(tx, target, iface, method, entry) {
    entry.txHash=tx.hash; save();
    const receipt=await tx.wait();
    entry.rawReceipt=receipt.toJSON(); save();
    const fetched=await provider.getTransaction(tx.hash);
    if (!fetched) throw new Error('Transaction unavailable from RPC.');
    entry.rawTransaction=fetched.toJSON();
    entry.destinationAddress=fetched.to;
    entry.status=receipt.status===1 ? 'Success':'Failed';
    entry.gasUsed=receipt.gasUsed.toString();
    entry.blockNumber=receipt.blockNumber;
    if (receipt.status!==1 || fetched.to?.toLowerCase()!==target.toLowerCase() ||
        fetched.from.toLowerCase()!==wallet.address.toLowerCase())
      throw new Error('Receipt or transaction identity mismatch.');
    return iface.decodeFunctionData(method,fetched.data);
  }
  save();
  try {
    for (const item of dataset) {
      const payload=Object.fromEntries(fields.map(k=>[k,item[k]]));
      const row={iteration:item.iteration,expectedPayload:payload,baseline:{},hybrid:{},verified:false};
      report.linkedRows.push(row); save();
      // Pin/retrieve before sending transactions; never automatically retry a transaction.
      const pin=await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS',
        {pinataContent:payload,pinataOptions:{cidVersion:0}},
        {timeout:60000,headers:{Authorization:'Bearer '+process.env.PINATA_JWT.trim()}});
      const cid=pin.data.IpfsHash;
      if (typeof cid!=='string' || !/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid))
        throw new Error('Expected a 46-character CIDv0.');
      row.hybrid.pinnedCID=cid; save();
      const gateway='https://gateway.pinata.cloud/ipfs/'+encodeURIComponent(cid);
      const retrieved=(await axios.get(gateway,{timeout:60000})).data;
      row.hybrid.retrievalURL=gateway;
      row.hybrid.retrievedAt=new Date().toISOString();
      row.hybrid.retrievedIpfsJson=retrieved;
      if (fields.some(k=>retrieved?.[k]!==payload[k])) throw new Error('Gateway payload mismatch.');
      save();
      const baseDecoded=await capture(
        await baseline.updateInventoryOnChain(...fields.map(k=>payload[k])),
        baseAddress,baseline.interface,'updateInventoryOnChain',row.baseline);
      row.baseline.decodedInputs=Object.fromEntries(fields.map((k,i)=>[k,baseDecoded[i]])); save();
      const hybridDecoded=await capture(await hybrid.updateInventory(cid),
        hybridAddress,hybrid.interface,'updateInventory',row.hybrid);
      row.hybrid.decodedCID=hybridDecoded[0];
      row.fieldMatches=Object.fromEntries(fields.map(k=>[k,
        row.baseline.decodedInputs[k]===payload[k] && retrieved[k]===payload[k]]));
      row.verified=Object.values(row.fieldMatches).every(Boolean) && hybridDecoded[0]===cid;
      if (!row.verified) throw new Error('Decoded transaction / payload mismatch.');
      save();
      console.log('Run '+item.iteration+': baseline '+row.baseline.gasUsed+'; hybrid '+row.hybrid.gasUsed+'; fields match.');
    }
    report.executionStatus='complete'; save();
    console.log('New evidence saved: '+path.join(output,'experiment_evidence_report.json'));
  } catch (error) {
    // Do not export axios request configuration, headers, credentials or RPC URLs.
    report.executionStatus='incomplete';
    report.failure={code:String(error.code || 'ERROR'),note:'Stopped; inspect partial records before any rerun.'};
    save();
    console.error('Execution stopped. Partial evidence: '+output);
    process.exitCode=1;
  }
}
main().catch(error=>{
  console.error('Setup failed:',error.code || 'ERROR',
    'Check environment, dataset, network, contract addresses and sender verification.');
  process.exitCode=1;
});
