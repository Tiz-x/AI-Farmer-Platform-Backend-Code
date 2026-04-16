const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function testGeminiDirect() {
  console.log("Testing Gemini API directly...");
  
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // Try the working model from your list
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  
  try {
    const result = await model.generateContent("How do I start planting my tomato? Give practical advice.");
    const response = await result.response;
    console.log("✅ Gemini is WORKING!");
    console.log("\n=== GEMINI RESPONSE ===");
    console.log(response.text());
    console.log("========================");
  } catch (error) {
    console.error("❌ Gemini failed:", error.message);
  }
}

testGeminiDirect();