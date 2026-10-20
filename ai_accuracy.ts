import * as fs from 'fs';
import { parseQueryWithGemini } from './app/geminiService'; // Adjust path as needed

const dataset = [
  { id: 1, input: "Mass casualty incident. Need 5 units O- immediately.", expected: { bloodGroup: "O-", quantity: 5, urgency: "HIGH" } },
  { id: 2, input: "Weekly update: A+ levels are stable, no immediate need.", expected: { bloodGroup: "A+", quantity: null, urgency: "LOW" } },
  { id: 3, input: "Running low on B+. Send 2 units when possible.", expected: { bloodGroup: "B+", quantity: 2, urgency: "MEDIUM" } },
  { id: 4, input: "General restock, all groups needed for the weekend.", expected: { bloodGroup: "All", quantity: null, urgency: "MEDIUM" } },
  // ... Add your remaining 46 queries here
];

async function runEvaluations() {
  const results = ["Query ID,Input,Expected JSON,Actual JSON,Pass/Fail,Retries,Error"];
  console.log(`Starting evaluation on gemini-2.5-flash for ${dataset.length} queries...`);

  for (const item of dataset) {
    let retries = 0;
    let actualRes = { bloodGroup: "ERROR", quantity: null, urgency: "ERROR" };
    let errorMsg = "None";
    let passed = "Fail";

    while (retries < 3) {
      try {
        const response = await parseQueryWithGemini(item.input);
        actualRes = { 
          bloodGroup: response.bloodGroup, 
          quantity: response.quantity, 
          urgency: response.urgency 
        };
        
        const isMatch = 
          actualRes.bloodGroup === item.expected.bloodGroup &&
          actualRes.quantity === item.expected.quantity &&
          actualRes.urgency === item.expected.urgency;
          
        passed = isMatch ? "Pass" : "Fail";
        break; 
      } catch (err: any) {
        errorMsg = err.message.replace(/,/g, ''); // Strip commas for CSV
        retries++;
      }
    }
    
    const expectedStr = JSON.stringify(item.expected).replace(/"/g, '""');
    const actualStr = JSON.stringify(actualRes).replace(/"/g, '""');
    results.push(`"${item.id}","${item.input}","${expectedStr}","${actualStr}","${passed}","${retries}","${errorMsg}"`);
  }

  fs.writeFileSync('research_evidence/ai_accuracy/ai_accuracy_logs.csv', results.join('\n'));
  console.log("Evaluation complete. Saved to ai_accuracy_logs.csv");
}

runEvaluations();