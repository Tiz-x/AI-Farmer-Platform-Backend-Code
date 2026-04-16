// src/services/aiEngine.ts
// STRATEGY: Rule Engine = REAL Intelligence | Groq = ONLY Explanation

import Groq from 'groq-sdk';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CropType = "Maize" | "Cassava" | "Tomato" | "Pepper";
export type SoilType = "loamy" | "sandy" | "clay" | "silty" | "unknown";

export interface AIInput {
  message: string;
  crop?: CropType;
  soilType?: SoilType;
  plantingDate?: string;
  location?: string;
  soilMoisture?: number;
  ndvi?: number;
  lastIrrigation?: string | null;
  farmerName?: string;
}

export interface RuleResult {
  crop: CropType | null;
  harvestDate: string | null;
  daysToHarvest: number | null;
  soilSuitability: string | null;
  irrigationDue: boolean;
  growthStage: string | null;
  riskFlags: string[];
  summary: string;
}

export interface AIResponse {
  ruleResult: RuleResult;
  aiText: string;
  source: "groq" | "fallback";
}

// ── CROP KNOWLEDGE BASE (YOUR REAL INTELLIGENCE) ─────────────────────────────

const CROP_DATA: Record<CropType, {
  growthDays: number;
  bestSoils: SoilType[];
  waterInterval: number;
  stages: { name: string; startPct: number }[];
  pests: string[];
}> = {
  Maize: {
    growthDays: 90,
    bestSoils: ["loamy", "silty"],
    waterInterval: 7,
    stages: [
      { name: "Germination", startPct: 0 },
      { name: "Vegetative", startPct: 15 },
      { name: "Tasseling", startPct: 50 },
      { name: "Grain Filling", startPct: 70 },
      { name: "Maturity", startPct: 90 },
    ],
    pests: ["Fall Armyworm", "Maize Weevil", "Aphids"],
  },
  Cassava: {
    growthDays: 540,
    bestSoils: ["loamy", "sandy"],
    waterInterval: 14,
    stages: [
      { name: "Establishment", startPct: 0 },
      { name: "Canopy Growth", startPct: 10 },
      { name: "Root Bulking", startPct: 40 },
      { name: "Maturation", startPct: 80 },
    ],
    pests: ["Cassava Mosaic Disease", "Mealybug", "Green Spider Mite"],
  },
  Tomato: {
    growthDays: 75,
    bestSoils: ["loamy", "sandy"],
    waterInterval: 3,
    stages: [
      { name: "Seedling", startPct: 0 },
      { name: "Vegetative", startPct: 20 },
      { name: "Flowering", startPct: 45 },
      { name: "Fruiting", startPct: 65 },
      { name: "Ripening", startPct: 85 },
    ],
    pests: ["Tomato Borer", "Whitefly", "Early Blight"],
  },
  Pepper: {
    growthDays: 90,
    bestSoils: ["loamy", "silty"],
    waterInterval: 5,
    stages: [
      { name: "Seedling", startPct: 0 },
      { name: "Vegetative", startPct: 20 },
      { name: "Flowering", startPct: 50 },
      { name: "Fruiting", startPct: 70 },
      { name: "Harvest", startPct: 90 },
    ],
    pests: ["Pepper Weevil", "Thrips", "Anthracnose"],
  },
};

const SOIL_RATINGS: Record<CropType, Record<SoilType, string>> = {
  Maize: { loamy: "Excellent", silty: "Good", sandy: "Fair", clay: "Poor", unknown: "Unknown" },
  Cassava: { loamy: "Excellent", sandy: "Good", silty: "Fair", clay: "Poor", unknown: "Unknown" },
  Tomato: { loamy: "Excellent", sandy: "Good", silty: "Good", clay: "Fair", unknown: "Unknown" },
  Pepper: { loamy: "Excellent", silty: "Good", sandy: "Fair", clay: "Poor", unknown: "Unknown" },
};

// ── Helper Functions ─────────────────────────────────────────────────────────

function detectCropFromMessage(message: string): CropType | null {
  const m = message.toLowerCase();
  if (m.includes("maize") || m.includes("corn")) return "Maize";
  if (m.includes("cassava")) return "Cassava";
  if (m.includes("tomato")) return "Tomato";
  if (m.includes("pepper")) return "Pepper";
  return null;
}

export function isGreeting(message: string): boolean {
  const m = message.toLowerCase().trim();
  const greetings = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening", "howdy"];
  return greetings.includes(m) || greetings.some(g => m.startsWith(g));
}

// ── RULE ENGINE (YOUR REAL INTELLIGENCE - DOES ALL THE CALCULATIONS) ─────────

export function runRuleEngine(input: AIInput): RuleResult {
  const crop = input.crop ?? detectCropFromMessage(input.message);
  const riskFlags: string[] = [];

  let harvestDate: string | null = null;
  let daysToHarvest: number | null = null;
  let soilSuitability: string | null = null;
  let growthStage: string | null = null;
  let irrigationDue = false;
  let summary = "";

  if (crop && CROP_DATA[crop]) {
    const data = CROP_DATA[crop];

    // 1. Calculate harvest date and growth stage
    if (input.plantingDate) {
      const planted = new Date(input.plantingDate);
      const harvest = new Date(planted);
      harvest.setDate(harvest.getDate() + data.growthDays);
      harvestDate = harvest.toISOString().split("T")[0];
      const today = new Date();
      daysToHarvest = Math.ceil((harvest.getTime() - today.getTime()) / 86_400_000);

      const elapsedDays = Math.ceil((today.getTime() - planted.getTime()) / 86_400_000);
      const growthPct = Math.min(100, Math.round((elapsedDays / data.growthDays) * 100));
      const stage = [...data.stages].reverse().find((s) => growthPct >= s.startPct);
      growthStage = stage ? `${stage.name} (${growthPct}% complete)` : "Germination";
    }

    // 2. Check soil suitability
    if (input.soilType && input.soilType !== "unknown") {
      soilSuitability = SOIL_RATINGS[crop][input.soilType] ?? "Unknown";
      if (soilSuitability === "Poor") {
        riskFlags.push(`${input.soilType} soil is not ideal for ${crop}`);
      }
    }

    // 3. Check irrigation needs
    if (input.lastIrrigation) {
      const lastWatered = new Date(input.lastIrrigation);
      const daysSince = Math.ceil((Date.now() - lastWatered.getTime()) / 86_400_000);
      if (daysSince >= data.waterInterval) {
        irrigationDue = true;
        riskFlags.push(`Irrigation needed - ${daysSince} days since last watering`);
      }
    }

    // 4. Check soil moisture
    if (input.soilMoisture !== undefined && input.soilMoisture < 20) {
      riskFlags.push(`Very low soil moisture (${input.soilMoisture}%) - water immediately`);
      irrigationDue = true;
    }

    // 5. Check NDVI (crop health)
    if (input.ndvi !== undefined && input.ndvi < 0.3) {
      riskFlags.push(`Crop health is low (NDVI: ${input.ndvi}) - check for pests/disease`);
    }

    // Build summary
    summary = `Crop: ${crop}`;
    if (growthStage) summary += ` | Stage: ${growthStage}`;
    if (daysToHarvest !== null && daysToHarvest > 0) summary += ` | ${daysToHarvest} days to harvest`;
    if (daysToHarvest !== null && daysToHarvest <= 0) summary += ` | READY TO HARVEST!`;
    if (soilSuitability) summary += ` | Soil: ${soilSuitability}`;
    if (irrigationDue) summary += ` | ⚠ Needs water`;
    
  } else if (crop) {
    summary = `Crop: ${crop}`;
  } else {
    summary = "General farming question";
  }

  return {
    crop,
    harvestDate,
    daysToHarvest,
    soilSuitability,
    irrigationDue,
    growthStage,
    riskFlags,
    summary,
  };
}

// ── BUILD PROMPT FOR GROQ (AI ONLY EXPLAINS, DOESN'T DECIDE) ─────────────────

function buildExplanationPrompt(input: AIInput, rule: RuleResult): string {
  return `You are AgroFlow AI - a friendly farming assistant for Nigerian farmers.

IMPORTANT: The calculations below are ACCURATE and MUST be used as facts. Do not change them.

SYSTEM CALCULATIONS (These are the FACTS):

${rule.summary}

${rule.riskFlags.length > 0 ? `⚠️ RISKS DETECTED:\n${rule.riskFlags.map(f => `- ${f}`).join('\n')}\n` : ''}

Farmer asked: "${input.message}"

YOUR JOB:
Explain these calculations in simple, helpful language. Give practical advice a farmer can use immediately.

Keep response under 150 words. Be encouraging and specific to Nigerian farming conditions.`;
}

// ── GROQ CLIENT (ONLY FOR EXPLANATION) ──────────────────────────────────────

let groq: any = null;

function getGroqClient() {
  if (!groq && process.env.GROQ_API_KEY) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
}

async function callGroq(prompt: string): Promise<string> {
  const client = getGroqClient();
  if (!client) {
    throw new Error("GROQ_API_KEY not set");
  }

  const completion = await client.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama-3.3-70b-versatile",
    temperature: 0.7,
    max_tokens: 500,
  });

  return completion.choices[0]?.message?.content || "";
}

// ── FALLBACK (WHEN GROQ FAILS - STILL USES RULE RESULTS) ─────────────────────

function getFallbackResponse(rule: RuleResult): string {
  const crop = rule.crop || "your crop";
  
  let response = `🌱 **${crop} Status Report**\n\n`;
  
  if (rule.daysToHarvest !== null) {
    if (rule.daysToHarvest > 0) {
      response += `📅 **Harvest:** ${rule.daysToHarvest} days remaining\n\n`;
    } else {
      response += `🎉 **Harvest:** Ready to harvest NOW!\n\n`;
    }
  }
  
  if (rule.growthStage) {
    response += `🌿 **Growth Stage:** ${rule.growthStage}\n\n`;
  }
  
  if (rule.soilSuitability) {
    response += `🌍 **Soil:** ${rule.soilSuitability}`;
    if (rule.soilSuitability === "Poor") {
      response += ` - Add compost and fertilizer to improve`;
    }
    response += `\n\n`;
  }
  
  if (rule.irrigationDue) {
    response += `💧 **Watering Needed:** Your crop needs irrigation now!\n\n`;
  }
  
  if (rule.riskFlags.length > 0) {
    response += `⚠️ **Alerts:**\n`;
    rule.riskFlags.forEach(flag => {
      response += `• ${flag}\n`;
    });
    response += `\n`;
  }
  
  response += `💡 **Tip:** Monitor your ${crop} regularly for best results.`;
  
  return response;
}

// ── MAIN EXPORT (RULE ENGINE + OPTIONAL AI EXPLANATION) ──────────────────────

export async function processAIRequest(input: AIInput): Promise<AIResponse> {
  console.log("\n🔍 STEP 1: Running Rule Engine...");
  console.log(`   Message: "${input.message.substring(0, 50)}"`);
  
  // REMOVE or COMMENT OUT any greeting/thank you handling here
  // Let the controller handle all greetings and thank yous
  
  // STEP 1: Run Rule Engine (YOUR REAL INTELLIGENCE)
  const ruleResult = runRuleEngine(input);
  console.log(`   ✅ Rule Result: ${ruleResult.summary}`);
  
  // STEP 2: Try AI for explanation only (if available)
  let aiText: string;
  let source: "groq" | "fallback";
  
  try {
    console.log("🤖 STEP 2: Getting AI explanation from Groq...");
    const prompt = buildExplanationPrompt(input, ruleResult);
    aiText = await callGroq(prompt);
    source = "groq";
    console.log(`   ✅ AI explanation generated`);
  } catch (err: any) {
    console.log(`   ⚠️ AI unavailable, using fallback`);
    aiText = getFallbackResponse(ruleResult);
    source = "fallback";
  }
  
  return { ruleResult, aiText, source };
}

