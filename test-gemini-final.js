const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function testGemini() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // Use a model from your available list
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  
  try {
    console.log("Testing with model: gemini-2.5-flash");
    const result = await model.generateContent("What is the best time to plant maize in Nigeria? Give a short answer.");
    const response = await result.response;
    console.log("✅ Gemini is WORKING!");
    console.log("\nResponse:", response.text());
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testGemini();