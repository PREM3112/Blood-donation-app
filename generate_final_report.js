require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

// The 10 unique CIDs generated during your latest benchmark run
const CIDS = [
  "QmPoncY7fVR9jC3V1pWWwcAqUrbZaGd8YvYSye75Vvja6i",
  "QmYSLVjQDzEZpv4LMfnhJuiWaTnuDsiH9QyKojv4tHKQc5",
  "QmaoiSonjJ7M6xvveZVjKtkdX78a5Z1fe2f8w4yF16FUTz",
  "Qme8EeRx39gCYzu7Pa8nxsewDGVYV2CMvxXHsuiyd1NwCZ",
  "QmPtAqF6k8CJGuHtJoP1pH6xvGrNDhjDRcnPhwWNaXk3t9",
  "QmfCoqcyxQdMbu6bnw9XGJHYYy5VoCkksme4Lsf6vcN9DB",
  "QmfVF8thk11Z8gPhvXG2N6pjtFDh76NCz3EeLGeA3GDzCR",
  "QmUDR56esj4W5CZMxi7zGjaehipG7KDPzs3yQLwPgc4NGP",
  "Qmaajq9GQsJ7hHWeurzMzXejE6XgxTeYzsWhvhSoaCTpu3",
  "QmPktJKJG9YDACWdzqGVSZgEFcGPzE8SNk7XWriyLjL2fL"
];

// Baseline gas values: Run 1 = 61,678; Runs 2-10 = 51,678 each
const BASELINE_GAS_ARRAY = [61678, 51678, 51678, 51678, 51678, 51678, 51678, 51678, 51678, 51678];
const HYBRID_GAS_CONSTANT = 49010;

async function generateReport() {
  const report = {
    exportTimestamp: new Date().toISOString(),
    analysisSummary: {
      description: "Matched 10-run deterministic benchmark comparison",
      overallReductionPercent: "6.96%",
      steadyStateReductionPercent: "5.16%",
      note: "Run 1 consumed 61,678 gas; runs 2–10 consumed 51,678 gas each. The cause of this difference has not yet been verified."
    },
    inputDataset: Array.from({ length: 10 }, (_, i) => ({
      iteration: i + 1,
      name: "Rajiv Gandhi Government General Hospital (Node)",
      licenseId: "GOV-TN-101",
      inventoryLevels: `O+: ${15 + i}, O-: 2, A+: 8, B+: 11, AB+: 5`,
      timestamp: "2026-10-15T13:00:00.000Z"
    })),
    comparativeResults: []
  };

  console.log("Fetching actual JSON contents from IPFS gateway...");
  for (let i = 0; i < CIDS.length; i++) {
    const cid = CIDS[i];
    let retrievedPayload = null;
    try {
      const response = await axios.get(`${PINATA_GATEWAY}${cid}`, { timeout: 10000 });
      retrievedPayload = response.data;
      console.log(`Fetched IPFS JSON for Run ${i + 1} | CID: ${cid}`);
    } catch (e) {
      retrievedPayload = `IPFS Fetch Failed: ${e.message}`;
      console.error(`Failed to fetch CID ${cid}: ${e.message}`);
    }

    report.comparativeResults.push({
      iteration: i + 1,
      baselineGas: BASELINE_GAS_ARRAY[i],
      hybridGas: HYBRID_GAS_CONSTANT,
      ipfsCID: cid,
      retrievedIpfsJson: retrievedPayload
    });
  }

  fs.writeFileSync('experiment_evidence_report.json', JSON.stringify(report, null, 2));
  console.log("\nSuccess! Complete report saved to 'experiment_evidence_report.json'.");
}

generateReport();