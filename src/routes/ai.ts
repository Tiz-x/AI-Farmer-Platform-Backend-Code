

import { Router }                from 'express'
import { protect }               from '../middleware/auth'
import { chat, cropCheck }       from '../controllers/aiController'

const router = Router()

// POST /api/ai/chat       — main chat endpoint (farmer must be logged in)
router.post('/chat',       protect, chat)

// POST /api/ai/crop-check — validate crop name
router.post('/crop-check', protect, cropCheck)

export default router