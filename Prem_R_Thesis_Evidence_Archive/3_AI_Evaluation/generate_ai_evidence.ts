import * as fs from 'fs';
import 'dotenv/config'; 

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("CRITICAL ERROR: EXPO_PUBLIC_GEMINI_API_KEY is not set in your .env file.");
  process.exit(1);
}

const SYSTEM_INSTRUCTION = `
  You are an emergency medical dispatcher assisting a decentralized blood donation network.
  Extract the requested blood type (one of: 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', or 'All'), the number of units requested, and the urgency level ('LOW', 'MEDIUM', 'HIGH').
  Return ONLY a raw JSON object with exactly these keys: "bloodGroup" (string), "quantity" (number), "urgency" (string), "replyMessage" (string).
  Do NOT wrap the output in markdown code blocks. Do NOT use backticks. Return raw JSON text only.
`;

async function parseQueryWithGemini(userPrompt: string) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nUser request: "${userPrompt}"` }] }],
      generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}: ${data.error?.message ?? "Request failed"}`);
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("No text returned from Gemini");

  const cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleanText);
}

const dataset = [
  // Standard & High Urgency
  { id: 1, input: "Mass casualty incident. Need 10 units O- immediately.", expected: { bloodGroup: "O-", quantity: 10, urgency: "HIGH" } },
  { id: 2, input: "Critical shortage of AB+ in trauma ward. Send 4 units ASAP.", expected: { bloodGroup: "AB+", quantity: 4, urgency: "HIGH" } },
  { id: 3, input: "Emergency surgery prep. Require 2 units of B-.", expected: { bloodGroup: "B-", quantity: 2, urgency: "HIGH" } },
  { id: 4, input: "Patient bleeding heavily, O positive required, 5 bags.", expected: { bloodGroup: "O+", quantity: 5, urgency: "HIGH" } },
  { id: 5, input: "Code red, need A- blood right now. 3 units.", expected: { bloodGroup: "A-", quantity: 3, urgency: "HIGH" } },
  
  // Medium Urgency & Restocks
  { id: 6, input: "Running low on B+. Send 2 units when possible.", expected: { bloodGroup: "B+", quantity: 2, urgency: "MEDIUM" } },
  { id: 7, input: "Restocking our A+ supply, looking for 15 units by tonight.", expected: { bloodGroup: "A+", quantity: 15, urgency: "MEDIUM" } },
  { id: 8, input: "O positive levels dipping below baseline. Need 8 units.", expected: { bloodGroup: "O+", quantity: 8, urgency: "MEDIUM" } },
  { id: 9, input: "Transfer 6 units of AB negative to central clinic today.", expected: { bloodGroup: "AB-", quantity: 6, urgency: "MEDIUM" } },
  { id: 10, input: "General restock, all groups needed for the weekend.", expected: { bloodGroup: "All", quantity: null, urgency: "MEDIUM" } },
  
  // Low Urgency & Status Updates
  { id: 11, input: "Weekly update: A+ levels are stable, no immediate need.", expected: { bloodGroup: "A+", quantity: null, urgency: "LOW" } },
  { id: 12, input: "Inventory check: O- at 12 units. Good for now.", expected: { bloodGroup: "O-", quantity: null, urgency: "LOW" } },
  { id: 13, input: "B negative stocks are full.", expected: { bloodGroup: "B-", quantity: null, urgency: "LOW" } },
  { id: 14, input: "Routine supply run, bring 1 unit of AB+ if available.", expected: { bloodGroup: "AB+", quantity: 1, urgency: "LOW" } },
  { id: 15, input: "No emergencies today. A- stock is adequate.", expected: { bloodGroup: "A-", quantity: null, urgency: "LOW" } },
  
  // Ambiguous & Edge Cases
  { id: 16, input: "Need some blood for surgery tomorrow.", expected: { bloodGroup: "All", quantity: null, urgency: "MEDIUM" } },
  { id: 17, input: "Send whatever O types you have urgently.", expected: { bloodGroup: "O+", quantity: null, urgency: "HIGH" } }, 
  { id: 18, input: "We need a dozen bags of A pos.", expected: { bloodGroup: "A+", quantity: 12, urgency: "MEDIUM" } },
  { id: 19, input: "Just had a crash victim come in. A negative. Lots of blood needed.", expected: { bloodGroup: "A-", quantity: null, urgency: "HIGH" } },
  { id: 20, input: "Zero units of B- left.", expected: { bloodGroup: "B-", quantity: 0, urgency: "HIGH" } },
  { id: 21, input: "Need half a dozen AB- for NICU.", expected: { bloodGroup: "AB-", quantity: 6, urgency: "HIGH" } },
  { id: 22, input: "Send 5 units.", expected: { bloodGroup: "All", quantity: 5, urgency: "MEDIUM" } },
  { id: 23, input: "Looking for rare blood types, AB- and B-.", expected: { bloodGroup: "AB-", quantity: null, urgency: "MEDIUM" } }, 
  { id: 24, input: "Is anyone awake? Need 2 units O+.", expected: { bloodGroup: "O+", quantity: 2, urgency: "HIGH" } },
  { id: 25, input: "O negative, 1 unit. Non-urgent.", expected: { bloodGroup: "O-", quantity: 1, urgency: "LOW" } },

  // Expanded Validation Dataset (26-50)
  { id: 26, input: "Accident on highway 4. Need 8 units B+ stat.", expected: { bloodGroup: "B+", quantity: 8, urgency: "HIGH" } },
  { id: 27, input: "Checking if nearby hospitals have A+.", expected: { bloodGroup: "A+", quantity: null, urgency: "LOW" } },
  { id: 28, input: "Prepare 3 units of AB pos for scheduled transplant.", expected: { bloodGroup: "AB+", quantity: 3, urgency: "MEDIUM" } },
  { id: 29, input: "We are out of O-. Any available?", expected: { bloodGroup: "O-", quantity: null, urgency: "HIGH" } },
  { id: 30, input: "A- supply is getting critical, down to 1 unit.", expected: { bloodGroup: "A-", quantity: null, urgency: "HIGH" } },
  { id: 31, input: "Can you spare two bags of O pos?", expected: { bloodGroup: "O+", quantity: 2, urgency: "MEDIUM" } },
  { id: 32, input: "B- restock required before weekend.", expected: { bloodGroup: "B-", quantity: null, urgency: "MEDIUM" } },
  { id: 33, input: "Need 4 O- and 2 A+.", expected: { bloodGroup: "O-", quantity: 4, urgency: "MEDIUM" } }, 
  { id: 34, input: "Send blood for a dog.", expected: { bloodGroup: "All", quantity: null, urgency: "LOW" } }, 
  { id: 35, input: "AB negative 5 bags immediately.", expected: { bloodGroup: "AB-", quantity: 5, urgency: "HIGH" } },
  { id: 36, input: "We have surplus A+, willing to share 10 units.", expected: { bloodGroup: "A+", quantity: 10, urgency: "LOW" } },
  { id: 37, input: "Need O pos.", expected: { bloodGroup: "O+", quantity: null, urgency: "MEDIUM" } },
  { id: 38, input: "Urgently require 7 units of B positive blood.", expected: { bloodGroup: "B+", quantity: 7, urgency: "HIGH" } },
  { id: 39, input: "A negative levels dropping.", expected: { bloodGroup: "A-", quantity: null, urgency: "MEDIUM" } },
  { id: 40, input: "Require 1 bag O-.", expected: { bloodGroup: "O-", quantity: 1, urgency: "MEDIUM" } },
  { id: 41, input: "Massive hemorrhage, need 15 bags AB+.", expected: { bloodGroup: "AB+", quantity: 15, urgency: "HIGH" } },
  { id: 42, input: "General query: who has B-?", expected: { bloodGroup: "B-", quantity: null, urgency: "LOW" } },
  { id: 43, input: "Stocktake: A+ (20), B+ (15).", expected: { bloodGroup: "A+", quantity: null, urgency: "LOW" } },
  { id: 44, input: "Need twenty units of O negative.", expected: { bloodGroup: "O-", quantity: 20, urgency: "HIGH" } },
  { id: 45, input: "Send 3 units A pos to ER.", expected: { bloodGroup: "A+", quantity: 3, urgency: "HIGH" } },
  { id: 46, input: "Low on all negative blood types.", expected: { bloodGroup: "All", quantity: null, urgency: "MEDIUM" } },
  { id: 47, input: "We are returning 2 units of B+.", expected: { bloodGroup: "B+", quantity: 2, urgency: "LOW" } },
  { id: 48, input: "Need AB- stat. 1 unit.", expected: { bloodGroup: "AB-", quantity: 1, urgency: "HIGH" } },
  { id: 49, input: "Can someone send O+?", expected: { bloodGroup: "O+", quantity: null, urgency: "MEDIUM" } },
  { id: 50, input: "Final restock for the month, need 50 units A-.", expected: { bloodGroup: "A-", quantity: 50, urgency: "MEDIUM" } }
];

async function runEvaluations() {
  const results = ["Query ID,Input,Expected JSON,Actual JSON,Pass/Fail,Retries,Error"];
  console.log(`Executing 50-query evaluation on gemini-2.5-flash...`);

  for (const item of dataset) {
    let retries = 0;
    let actualRes: { bloodGroup: string | null, quantity: number | null, urgency: string } = { 
      bloodGroup: "ERROR", 
      quantity: null, 
      urgency: "ERROR" 
    };
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
        errorMsg = err.message.replace(/,/g, ''); 
        retries++;
      }
    }
    
    const expectedStr = JSON.stringify(item.expected).replace(/"/g, '""');
    const actualStr = JSON.stringify(actualRes).replace(/"/g, '""');
    results.push(`"${item.id}","${item.input}","${expectedStr}","${actualStr}","${passed}","${retries}","${errorMsg}"`);
  }

  fs.writeFileSync('ai_accuracy_logs.csv', results.join('\n'));
  console.log("\nEvaluation complete. Data saved to ai_accuracy_logs.csv.");
}

runEvaluations();