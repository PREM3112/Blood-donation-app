// app/geminiService.ts
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

export interface ParsedBloodQuery {
  bloodGroup: string | null;
  quantity: number | null;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  replyMessage: string;
}

const SYSTEM_INSTRUCTION = `
  You are an emergency medical dispatcher assisting a decentralized blood donation network.
  Extract the requested blood type (one of: 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', or 'All'), the number of units requested, and the urgency level.
  Return ONLY a raw JSON object with exactly these keys: "bloodGroup" (string), "quantity" (number), "urgency" (string), "replyMessage" (string).
  Do NOT wrap the output in markdown code blocks. Do NOT use backticks. Return raw JSON text only.

  Example output:
  {
    "bloodGroup": "O-",
    "quantity": 2,
    "urgency": "HIGH",
    "replyMessage": "Found verified blood banks stocking 2 units of O- nearby."
  }
`;

// Text-Based Search
export async function parseQueryWithGemini(userPrompt: string): Promise<ParsedBloodQuery> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nUser request: "${userPrompt}"` }]
          }
        ],
        generationConfig: { 
          response_mime_type: "application/json",
          temperature: 0.1 // Ensures strict, deterministic JSON formatting
        }
      })
    });

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawText) throw new Error("No response from Gemini");
    
    // CRITICAL FIX: Sanitize the output to remove any accidental markdown backticks
    const cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanText) as ParsedBloodQuery;
  } catch (err: any) {
    console.error("Gemini Text Parse Error:", err);
    return {
      bloodGroup: "All",
      quantity: null,
      urgency: "MEDIUM",
      replyMessage: "Could not process request. Please select filter manually."
    };
  }
}

// Direct Voice/Audio Multimodal Search
export async function parseAudioWithGemini(base64Audio: string): Promise<ParsedBloodQuery> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: SYSTEM_INSTRUCTION },
              {
                inline_data: {
                  mime_type: "audio/m4a",
                  data: base64Audio
                }
              }
            ]
          }
        ],
        generationConfig: { 
          response_mime_type: "application/json",
          temperature: 0.1 
        }
      })
    });

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawText) throw new Error("No audio response from Gemini");
    
    // CRITICAL FIX: Sanitize the output to remove any accidental markdown backticks
    const cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanText) as ParsedBloodQuery;
  } catch (err: any) {
    console.error("Gemini Audio Parse Error:", err);
    return {
      bloodGroup: "All",
      quantity: null,
      urgency: "MEDIUM",
      replyMessage: "Voice request unclear. Please try again or type."
    };
  }
}