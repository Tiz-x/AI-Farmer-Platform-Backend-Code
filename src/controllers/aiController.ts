import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import prisma from '../db/index'
import { processAIRequest, AIInput, CropType } from '../services/aiEngine'

export async function chat(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { message, fieldId } = req.body;
    
    console.log("=========================================");
    console.log("CHAT FUNCTION CALLED");
    console.log("Message:", message);
    console.log("=========================================");
    
    if (!message || message.trim().length === 0) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    
    const cleanMessage = message.trim();
    const lowerMessage = cleanMessage.toLowerCase();
    
    // Greetings
    const greetings = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"];
    if (greetings.some(g => lowerMessage === g || lowerMessage.startsWith(g + " "))) {
      res.status(200).json({
        aiText: `👋 Hello! Welcome to AgroFlow+.\n\nI'm your farming assistant. I can help you with:\n• Crop health and harvest timing\n• Soil conditions and irrigation\n• Pest management\n\nWhat crop would you like to discuss? (Maize, Cassava, Tomato, or Pepper)`,
        ruleResult: null,
        source: 'greeting',
      });
      return;
    }
    
    // Thank you messages
    if (lowerMessage.includes("thank")) {
      res.status(200).json({
        aiText: `🌱 You're very welcome! I'm happy to help with your farming needs.\n\nFeel free to ask me anytime about your crops, harvest timing, or any agricultural questions. Have a great day on the farm! 🚜`,
        ruleResult: null,
        source: 'greeting',
      });
      return;
    }
    
    // Goodbye messages
    if (lowerMessage.includes("bye") || lowerMessage.includes("goodbye")) {
      res.status(200).json({
        aiText: `👋 Goodbye! It was a pleasure helping you.\n\nCome back anytime you need farming advice. Wishing you a bountiful harvest! 🌾`,
        ruleResult: null,
        source: 'greeting',
      });
      return;
    }
    
    console.log("🌾 Processing farming question...");
    
    // Build input for rule engine
    const aiInput: AIInput = {
      message: cleanMessage,
      farmerName: 'Farmer',
      location: 'Nigeria',
    };
    
    // Get farmer's field data if available
    if (req.user?.id) {
      const farmer = await prisma.farmer.findUnique({
        where: { userId: req.user.id },
        include: { fields: true, user: true },
      });
      
      if (farmer) {
        aiInput.farmerName = farmer.user.name;
        aiInput.location = farmer.location;
        
        // Detect crop from message
        const crops: CropType[] = ['Maize', 'Cassava', 'Tomato', 'Pepper'];
        const messageLower = cleanMessage.toLowerCase();
        const matchedCrop = crops.find(c => 
          messageLower.includes(c.toLowerCase()) || 
          (c === 'Maize' && messageLower.includes('corn'))
        );
        
        if (matchedCrop) {
          const matchedField = farmer.fields.find(f => f.crop === matchedCrop);
          if (matchedField) {
            aiInput.crop = matchedField.crop as CropType;
            aiInput.soilMoisture = matchedField.soilMoisture;
            aiInput.ndvi = matchedField.ndvi;
            aiInput.lastIrrigation = matchedField.lastIrrigation?.toISOString() ?? null;
            aiInput.plantingDate = matchedField.createdAt.toISOString();
            aiInput.location = matchedField.location;
          }
        }
      }
    }
    
    // Process through rule engine + optional AI explanation
    const result = await processAIRequest(aiInput);
    
    res.status(200).json({
      aiText: result.aiText,
      ruleResult: result.ruleResult,
      source: result.source,
    });
    return;
    
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ 
      aiText: "I'm having trouble right now. Please try again.",
      ruleResult: null,
      source: 'error'
    });
    return;
  }
}

export async function cropCheck(req: AuthRequest, res: Response): Promise<void> {
  res.json({ valid: true, message: "Crop check endpoint" });
}