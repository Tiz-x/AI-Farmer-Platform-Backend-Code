import { Router, Response } from 'express'
import prisma from '../db/index'
import { protect, AuthRequest } from '../middleware/auth'
import { adminOnly } from '../middleware/adminOnly'

const router = Router()

router.get('/', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const farmers = await prisma.farmer.findMany({
      include: {
        user: {
          select: {
            id:        true,
            name:      true,
            email:     true,
            phone:     true,
            status:    true,
            avatarUrl: true,
            createdAt: true,
          },
        },
        fields: true,
      },
    })

    const formatted = farmers.map((f: {
      id:       string
      userId:   string
      location: string
      user: {
        name:      string
        email:     string
        phone:     string | null
        status:    string
        avatarUrl: string | null
        createdAt: Date
      }
      fields: {
        area: number
        ndvi: number
      }[]
    }) => ({
      id:        f.id,
      userId:    f.userId,
      name:      f.user.name,
      email:     f.user.email,
      phone:     f.user.phone,
      location:  f.location,
      status:    f.user.status,
      fields:    f.fields.length,
      area:      f.fields.reduce((sum: number, field: { area: number }) => sum + field.area, 0),
      ndvi:      f.fields.length > 0
        ? f.fields.reduce((sum: number, field: { ndvi: number }) => sum + field.ndvi, 0) / f.fields.length
        : 0,
      createdAt: f.user.createdAt,
    }))

    res.json({ farmers: formatted, total: formatted.length })
  } catch (error) {
    console.error('Get farmers error:', error)
    res.status(500).json({ error: 'Failed to fetch farmers' })
  }
})

router.get('/:id', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const farmer = await prisma.farmer.findUnique({
      where: { id: String(req.params.id) },
      include: {
        user: {
          select: {
            id:        true,
            name:      true,
            email:     true,
            phone:     true,
            status:    true,
            location:  true,
            avatarUrl: true,
            createdAt: true,
          },
        },
        fields: {
          include: { alerts: true },
        },
      },
    })

    if (!farmer) {
      res.status(404).json({ error: 'Farmer not found' })
      return
    }

    res.json({ farmer })
  } catch (error) {
    console.error('Get farmer error:', error)
    res.status(500).json({ error: 'Failed to fetch farmer' })
  }
})

router.get('/me/profile', protect, async (req: AuthRequest, res: Response) => {
  try {
    const farmer = await prisma.farmer.findUnique({
      where: { userId: req.user!.id },
      include: {
        user: {
          select: {
            id:        true,
            name:      true,
            email:     true,
            phone:     true,
            location:  true,
            avatarUrl: true,
          },
        },
        fields: {
          include: { alerts: true },
        },
      },
    })

    if (!farmer) {
      res.status(404).json({ error: 'Farmer profile not found' })
      return
    }

    res.json({ farmer })
  } catch (error) {
    console.error('Get my profile error:', error)
    res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

router.patch('/:id/status', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body

    if (!['active', 'suspended'].includes(status)) {
      res.status(400).json({ error: 'Status must be active or suspended' })
      return
    }

    const farmer = await prisma.farmer.findUnique({
      where: { id: String(req.params.id) },
    })

    if (!farmer) {
      res.status(404).json({ error: 'Farmer not found' })
      return
    }

    await prisma.user.update({
      where: { id: farmer.userId },
      data:  { status },
    })

    res.json({ message: `Farmer ${status} successfully` })
  } catch (error) {
    console.error('Update farmer status error:', error)
    res.status(500).json({ error: 'Failed to update farmer status' })
  }
})

export default router