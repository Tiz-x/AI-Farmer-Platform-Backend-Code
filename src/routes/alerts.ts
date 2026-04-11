import { Router, Response } from 'express'
import prisma from '../db/index'
import { protect, AuthRequest } from '../middleware/auth'
import { adminOnly } from '../middleware/adminOnly'

const router = Router()

router.get('/', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const alerts = await prisma.alert.findMany({
      include: {
        field: {
          include: {
            farmer: {
              include: {
                user: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const formatted = alerts.map((a: {
      id:         string
      fieldId:    string
      type:       string
      severity:   string
      resolved:   boolean
      resolvedAt: Date | null
      createdAt:  Date
      field: {
        farmerId: string
        location: string
        crop:     string
        farmer: {
          user: { name: string }
        }
      }
    }) => ({
      id:         a.id,
      fieldId:    a.fieldId,
      farmerName: a.field.farmer.user.name,
      farmerId:   a.field.farmerId,
      location:   a.field.location,
      crop:       a.field.crop,
      type:       a.type,
      severity:   a.severity,
      resolved:   a.resolved,
      resolvedAt: a.resolvedAt,
      time:       a.createdAt,
    }))

    res.json({ alerts: formatted, total: formatted.length })
  } catch (error) {
    console.error('Get alerts error:', error)
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

router.get('/mine', protect, async (req: AuthRequest, res: Response) => {
  try {
    const farmer = await prisma.farmer.findUnique({
      where: { userId: req.user!.id },
    })

    if (!farmer) {
      res.status(404).json({ error: 'Farmer not found' })
      return
    }

    const alerts = await prisma.alert.findMany({
      where: {
        field: { farmerId: farmer.id },
      },
      include: {
        field: {
          select: {
            location: true,
            crop:     true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ alerts, total: alerts.length })
  } catch (error) {
    console.error('Get my alerts error:', error)
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

router.post('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { fieldId, type, severity } = req.body

    if (!fieldId || !type || !severity) {
      res.status(400).json({ error: 'fieldId, type and severity are required' })
      return
    }

    const validSeverities = ['info', 'warning', 'critical']
    if (!validSeverities.includes(severity)) {
      res.status(400).json({ error: 'Severity must be info, warning or critical' })
      return
    }

    const alert = await prisma.alert.create({
      data: { fieldId, type, severity },
    })

    res.status(201).json({ message: 'Alert created', alert })
  } catch (error) {
    console.error('Create alert error:', error)
    res.status(500).json({ error: 'Failed to create alert' })
  }
})

router.patch('/:id/resolve', protect, async (req: AuthRequest, res: Response) => {
  try {
    const alert = await prisma.alert.update({
      where: { id: String(req.params.id) },
      data: {
        resolved:   true,
        resolvedAt: new Date(),
      },
    })

    res.json({ message: 'Alert resolved', alert })
  } catch (error) {
    console.error('Resolve alert error:', error)
    res.status(500).json({ error: 'Failed to resolve alert' })
  }
})

router.patch('/:id/unresolve', protect, async (req: AuthRequest, res: Response) => {
  try {
    const alert = await prisma.alert.update({
      where: { id: String(req.params.id) },
      data: {
        resolved:   false,
        resolvedAt: null,
      },
    })

    res.json({ message: 'Alert unresolved', alert })
  } catch (error) {
    console.error('Unresolve alert error:', error)
    res.status(500).json({ error: 'Failed to unresolve alert' })
  }
})

export default router