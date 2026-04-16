import { Response }    from 'express'
import { AuthRequest } from '../middleware/auth'
import prisma          from '../db/index'
import {
  processAIRequest,
  isAgricultureRelated,
  isAllowedCrop,
  AIInput,
  CropType,
} from '../services/aiEngine'

export async function chat(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { message, fieldId } = req.body as {
      message?: string
      fieldId?: string
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'Message is required' })
      return
    }

    const cleanMessage = message.trim()

    if (cleanMessage.length > 500) {
      res.status(400).json({ error: 'Message too long. Please keep it under 500 characters.' })
      return
    }

    if (!isAgricultureRelated(cleanMessage)) {
      res.status(200).json({
        aiText: 'I can only assist with agricultural topics such as crop guidance, soil health, harvest timing, irrigation, and pest control. Please ask a farming-related question.',
        ruleResult: null,
        source: 'validation',
      })
      return
    }

    const aiInput: AIInput = {
      message:    cleanMessage,
      farmerName: 'Farmer',
      location:   'Nigeria',
    }

    if (fieldId) {
      const field = await prisma.field.findUnique({
        where:   { id: fieldId },
        include: { farmer: { include: { user: true } } },
      })

      if (field && field.farmer.userId === req.user?.id) {
        aiInput.crop           = field.crop as CropType
        aiInput.soilMoisture   = field.soilMoisture
        aiInput.ndvi           = field.ndvi
        aiInput.lastIrrigation = field.lastIrrigation?.toISOString() ?? null
        aiInput.plantingDate   = field.createdAt.toISOString()
        aiInput.location       = field.location
        aiInput.farmerName     = field.farmer.user.name
      }
    } else {
      const farmer = await prisma.farmer.findUnique({
        where:   { userId: req.user!.id },
        include: { fields: true, user: true },
      })

      if (farmer) {
        aiInput.farmerName = farmer.user.name
        aiInput.location   = farmer.location

        const mentionedCrops: CropType[] = ['Maize', 'Cassava', 'Tomato', 'Pepper']
        const messageLower = cleanMessage.toLowerCase()

        const matchedCrop = mentionedCrops.find(c =>
          messageLower.includes(c.toLowerCase()) ||
          (c === 'Maize' && messageLower.includes('corn'))
        )

        if (matchedCrop) {
          const matchedField = farmer.fields.find(f => f.crop === matchedCrop)
          if (matchedField) {
            aiInput.crop           = matchedField.crop as CropType
            aiInput.soilMoisture   = matchedField.soilMoisture
            aiInput.ndvi           = matchedField.ndvi
            aiInput.lastIrrigation = matchedField.lastIrrigation?.toISOString() ?? null
            aiInput.plantingDate   = matchedField.createdAt.toISOString()
            aiInput.location       = matchedField.location
          }
        } else if (farmer.fields.length > 0) {
          const latest = farmer.fields.sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )[0]
          aiInput.crop           = latest.crop as CropType
          aiInput.soilMoisture   = latest.soilMoisture
          aiInput.ndvi           = latest.ndvi
          aiInput.lastIrrigation = latest.lastIrrigation?.toISOString() ?? null
          aiInput.plantingDate   = latest.createdAt.toISOString()
          aiInput.location       = latest.location
        }
      }
    }

    const result = await processAIRequest(aiInput)

    // DEBUG LOGGING
    console.log("\n=== BACKEND RESPONSE DEBUG ===");
    console.log("Source:", result.source);
    console.log("AI Text length:", result.aiText.length);
    console.log("AI Text preview (first 200 chars):", result.aiText.substring(0, 200));
    console.log("Rule Summary:", result.ruleResult.summary);
    console.log("===============================\n");

    res.status(200).json({
      aiText:     result.aiText,
      ruleResult: result.ruleResult,
      source:     result.source,
    })

  } catch (error) {
    console.error('AI chat error:', error)
    res.status(500).json({ error: 'AI service temporarily unavailable. Please try again.' })
  }
}

export async function cropCheck(req: AuthRequest, res: Response): Promise<void> {
  const { crop } = req.body as { crop?: string }

  if (!crop) {
    res.status(400).json({ error: 'Crop name is required' })
    return
  }

  const valid = isAllowedCrop(crop)
  res.status(200).json({
    valid,
    message: valid
      ? `${crop} is supported`
      : `Only Maize, Cassava, Tomato, and Pepper are currently supported`,
  })
}