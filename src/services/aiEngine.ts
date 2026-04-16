// src/services/aiEngine.ts
// AgroFlow+ AI Engine
// Layer 1 → Rule-based deterministic logic
// Layer 2 → Gemini API called with controlled prompt

import { GoogleGenerativeAI } from "@google/generative-ai";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CropType = "Maize" | "Cassava" | "Tomato" | "Pepper";
export type SoilType = "loamy" | "sandy" | "clay" | "silty" | "unknown";
export type Intent =
  | "harvest_prediction"
  | "soil_check"
  | "crop_guidance"
  | "irrigation_advice"
  | "pest_alert"
  | "general";

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
  intent: Intent;
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
  source: "gemini" | "fallback";
}

// ── Crop Knowledge Base ───────────────────────────────────────────────────────

const CROP_DATA: Record<
  CropType,
  {
    growthDays: number;
    bestSoils: SoilType[];
    waterInterval: number;
    stages: { name: string; startPct: number }[];
    pests: string[];
  }
> = {
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
  Maize: {
    loamy: "Excellent",
    silty: "Good",
    sandy: "Fair",
    clay: "Poor",
    unknown: "Unknown",
  },
  Cassava: {
    loamy: "Excellent",
    sandy: "Good",
    silty: "Fair",
    clay: "Poor",
    unknown: "Unknown",
  },
  Tomato: {
    loamy: "Excellent",
    sandy: "Good",
    silty: "Good",
    clay: "Fair",
    unknown: "Unknown",
  },
  Pepper: {
    loamy: "Excellent",
    silty: "Good",
    sandy: "Fair",
    clay: "Poor",
    unknown: "Unknown",
  },
};

export const ALLOWED_CROPS: CropType[] = ["Maize", "Cassava", "Tomato", "Pepper"];

const AGRI_KEYWORDS = [
  "crop", "farm", "soil", "harvest", "plant", "grow", "water", "irrigat",
  "fertiliz", "pest", "disease", "yield", "field", "seed", "rain", "weather",
  "maize", "corn", "cassava", "tomato", "pepper", "ndvi", "moisture", "spray",
  "weed", "compost", "nitrogen", "potassium", "phosphorus", "deliver", "sell", "buy",
];

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/harvest|when.*(ready|pick)|days? (left|remain)|maturity/.test(m))
    return "harvest_prediction";
  if (/soil|loam|clay|sand|silt|nitrogen|nutrient|ph/.test(m))
    return "soil_check";
  if (/water|irrigat|moisture|dry|drip/.test(m)) 
    return "irrigation_advice";
  if (/pest|disease|insect|worm|blight|mosaic|mite|weevil|fungus/.test(m))
    return "pest_alert";
  if (/guid|advice|tip|how|what|best|recommend|plan|stage/.test(m))
    return "crop_guidance";
  return "general";
}

function detectCropFromMessage(message: string): CropType | null {
  const m = message.toLowerCase();
  if (m.includes("maize") || m.includes("corn")) return "Maize";
  if (m.includes("cassava")) return "Cassava";
  if (m.includes("tomato")) return "Tomato";
  if (m.includes("pepper")) return "Pepper";
  return null;
}

export function isAgricultureRelated(message: string): boolean {
  const m = message.toLowerCase();
  return AGRI_KEYWORDS.some((kw) => m.includes(kw));
}

export function isAllowedCrop(crop: string): crop is CropType {
  return ALLOWED_CROPS.includes(crop as CropType);
}

export function runRuleEngine(input: AIInput): RuleResult {
  const intent = detectIntent(input.message);
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

    if (input.plantingDate) {
      const planted = new Date(input.plantingDate);
      const harvest = new Date(planted);
      harvest.setDate(harvest.getDate() + data.growthDays);
      harvestDate = harvest.toISOString().split("T")[0];
      const today = new Date();
      daysToHarvest = Math.ceil(
        (harvest.getTime() - today.getTime()) / 86_400_000,
      );

      const elapsedDays = Math.ceil(
        (today.getTime() - planted.getTime()) / 86_400_000,
      );
      const growthPct = Math.min(
        100,
        Math.round((elapsedDays / data.growthDays) * 100),
      );
      const stage = [...data.stages]
        .reverse()
        .find((s) => growthPct >= s.startPct);
      growthStage = stage
        ? `${stage.name} (${growthPct}% complete)`
        : "Germination";
    }

    if (input.soilType && input.soilType !== "unknown") {
      soilSuitability = SOIL_RATINGS[crop][input.soilType] ?? "Unknown";
      if (soilSuitability === "Poor") {
        riskFlags.push(
          `${input.soilType} soil is not ideal for ${crop} — consider soil amendment`,
        );
      }
    }

    if (input.lastIrrigation) {
      const lastWatered = new Date(input.lastIrrigation);
      const daysSince = Math.ceil(
        (Date.now() - lastWatered.getTime()) / 86_400_000,
      );
      if (daysSince >= data.waterInterval) {
        irrigationDue = true;
        riskFlags.push(
          `Irrigation overdue — last watered ${daysSince} days ago (recommended every ${data.waterInterval} days)`,
        );
      }
    }

    if (input.ndvi !== undefined) {
      if (input.ndvi < 0.3) {
        riskFlags.push(
          `Low NDVI (${input.ndvi.toFixed(2)}) — crop may be stressed or unhealthy`,
        );
      }
    }

    if (input.soilMoisture !== undefined) {
      if (input.soilMoisture < 20) {
        riskFlags.push(
          `Very low soil moisture (${input.soilMoisture}%) — urgent irrigation needed`,
        );
        irrigationDue = true;
      } else if (input.soilMoisture > 80) {
        riskFlags.push(
          `High soil moisture (${input.soilMoisture}%) — risk of waterlogging`,
        );
      }
    }

    if (intent === "pest_alert") {
      riskFlags.push(`Common pests for ${crop}: ${data.pests.join(", ")}`);
    }

    summary = `Crop: ${crop}`;
    if (growthStage) summary += ` | Stage: ${growthStage}`;
    if (harvestDate) summary += ` | Est. Harvest: ${harvestDate}`;
    if (daysToHarvest !== null) {
      summary +=
        daysToHarvest > 0
          ? ` (${daysToHarvest} days away)`
          : ` (ready to harvest!)`;
    }
    if (soilSuitability) summary += ` | Soil: ${soilSuitability}`;
    if (irrigationDue) summary += ` | ⚠ Irrigation due`;
  } else {
    summary = "General agricultural query";
  }

  return {
    intent,
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

function buildPrompt(input: AIInput, rule: RuleResult): string {
  const riskSection =
    rule.riskFlags.length > 0
      ? `Risk Flags Detected:\n${rule.riskFlags.map((r) => `- ${r}`).join("\n")}`
      : "No major risks detected.";

  return `You are AgroFlow AI, an expert agricultural assistant for Nigerian farmers.
You ONLY answer questions about farming, crops, soil, irrigation, pests, and harvesting.
If the question is not agriculture-related, respond: "I can only assist with agricultural topics."

Farmer: ${input.farmerName ?? "Farmer"}
Location: ${input.location ?? "Nigeria"}
Crop: ${rule.crop ?? "Not specified"}
User Question: "${input.message}"

--- System Analysis (use this to guide your response) ---
Intent Detected: ${rule.intent}
Growth Stage: ${rule.growthStage ?? "Unknown"}
Estimated Harvest Date: ${rule.harvestDate ?? "Not calculated"}
Days to Harvest: ${rule.daysToHarvest !== null ? rule.daysToHarvest + " days" : "N/A"}
Soil Suitability: ${rule.soilSuitability ?? "Not assessed"}
Irrigation Due: ${rule.irrigationDue ? "YES — action needed" : "No"}
${riskSection}
---

Instructions:
- Use the system analysis above as the basis of your answer
- Give practical, specific advice relevant to Nigerian farming conditions
- Use simple, clear language the farmer can act on immediately
- Structure your response with line breaks for readability
- Keep response focused and under 200 words
- Do NOT contradict the system analysis data above
- Do NOT discuss topics outside agriculture`;
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in environment");

  console.log("🔵 Initializing Gemini with model: gemini-2.5-flash");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  console.log("🟡 Sending request to Gemini...");
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  
  console.log("📝 Raw Gemini response length:", text.length);
  console.log("📝 Response preview:", text.substring(0, 150) + "...");
  
  const blockedPatterns = [
    /ignore (previous|above|system)/i,
    /you are now/i,
    /act as/i,
    /jailbreak/i,
  ];
  if (blockedPatterns.some((p) => p.test(text))) {
    console.log("⚠️ Response blocked by safety filter");
    return "I can only assist with agricultural topics related to your crops and farm.";
  }

  return text.trim();
}

export async function processAIRequest(input: AIInput): Promise<AIResponse> {
  console.log("\n🟣 PROCESSING AI REQUEST");
  console.log("User message:", input.message);
  
  const ruleResult = runRuleEngine(input);
  const prompt = buildPrompt(input, ruleResult);

  let aiText: string;
  let source: "gemini" | "fallback";

  try {
    aiText = await callGemini(prompt);
    source = "gemini";
    console.log("✅ Gemini SUCCESS! Returning AI response of length:", aiText.length);
  } catch (err: any) {
    console.error("🔴 Gemini API error:", err?.message);
    aiText = `Based on my analysis:\n\n${ruleResult.summary}`;
    if (ruleResult.riskFlags.length > 0) {
      aiText += "\n\n⚠️ Alerts:\n" + ruleResult.riskFlags.map(r => `• ${r}`).join("\n");
    }
    source = "fallback";
    console.log("⚠️ Using FALLBACK response");
  }

  console.log("📤 Returning response. Source:", source);
  console.log("📤 Response preview:", aiText.substring(0, 150) + "...\n");
  
  return { ruleResult, aiText, source };
}