import { Router, Response } from 'express'
import { AuthRequest, protect } from '../middleware/auth'
import prisma from '../db/index'

const router = Router()

// Helper to safely get param as string
const getParam = (param: string | string[] | undefined): string => {
  return Array.isArray(param) ? param[0] : param || ''
}

// Get all chat sessions for user
router.get('/sessions', protect, async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await prisma.chatSession.findMany({
      where: { userId: req.user!.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })
    
    res.json({ sessions })
  } catch (error) {
    console.error('Get sessions error:', error)
    res.status(500).json({ error: 'Failed to get sessions' })
  }
})

// Create new chat session
router.post('/sessions', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { title } = req.body
    
    const session = await prisma.chatSession.create({
      data: {
        userId: req.user!.id,
        title: title || 'New Chat'
      }
    })
    
    res.json({ session })
  } catch (error) {
    console.error('Create session error:', error)
    res.status(500).json({ error: 'Failed to create session' })
  }
})

// Save message to session
router.post('/sessions/:sessionId/messages', protect, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = getParam(req.params.sessionId)
    const { role, content } = req.body
    
    // Verify session belongs to user
    const session = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId: req.user!.id
      }
    })
    
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    
    const message = await prisma.chatMessage.create({
      data: {
        sessionId: sessionId,
        role,
        content
      }
    })
    
    // Update session's updatedAt
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    })
    
    res.json({ message })
  } catch (error) {
    console.error('Save message error:', error)
    res.status(500).json({ error: 'Failed to save message' })
  }
})

// Delete session
router.delete('/sessions/:sessionId', protect, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = getParam(req.params.sessionId)
    
    // First delete all messages in the session
    await prisma.chatMessage.deleteMany({
      where: { sessionId: sessionId }
    })
    
    // Then delete the session
    await prisma.chatSession.delete({
      where: { 
        id: sessionId,
        userId: req.user!.id
      }
    })
    
    res.json({ message: 'Session deleted' })
  } catch (error) {
    console.error('Delete session error:', error)
    res.status(500).json({ error: 'Failed to delete session' })
  }
})

export default router