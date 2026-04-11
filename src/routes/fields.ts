import { Router, Response } from 'express'
import prisma from '../db/index'
import { protect, AuthRequest } from '../middleware/auth'
import { adminOnly } from '../middleware/adminOnly'

const router = Router()

router.get('/', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const fields = await prisma.field.findMany({
      include: {
        farmer: {
          include: {
            user: {
              select: {
                name:  true,
                email: true,
              },
            },
          },
        },
        alerts: {
          where:   { resolved: false },
          orderBy: { createdAt: 'desc' },
          take:    1,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const formatted = fields.map((f: {
      id:             string
      farmerId:       string
      location:       string
      crop:           string
      area:           number
      ndvi:           number
      soilMoisture:   number
      lastIrrigation: Date | null
      status:         string
      createdAt:      Date
      alerts:         { id: string }[]
      farmer: {
        user: {
          name:  string
          email: string
        }
      }
    }) => ({
      id:             f.id,
      farmerId:       f.farmerId,
      farmerName:     f.farmer.user.name,
      location:       f.location,
      crop:           f.crop,
      area:           f.area,
      ndvi:           f.ndvi,
      soilMoisture:   f.soilMoisture,
      lastIrrigation: f.lastIrrigation,
      status:         f.status,
      activeAlerts:   f.alerts.length,
      createdAt:      f.createdAt,
    }))

    res.json({ fields: formatted, total: formatted.length })
  } catch (error) {
    console.error('Get fields error:', error)
    res.status(500).json({ error: 'Failed to fetch fields' })
  }
})

router.get('/mine', protect, async (req: AuthRequest, res: Response) => {
  try {
    const farmer = await prisma.farmer.findUnique({
      where: { userId: req.user!.id },
    })

    if (!farmer) {
      res.status(404).json({ error: 'Farmer profile not found' })
      return
    }

    const fields = await prisma.field.findMany({
      where:   { farmerId: farmer.id },
      include: { alerts: true },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ fields, total: fields.length })
  } catch (error) {
    console.error('Get my fields error:', error)
    res.status(500).json({ error: 'Failed to fetch fields' })
  }
})

router.get('/:id', protect, async (req: AuthRequest, res: Response) => {
  try {
    const field = await prisma.field.findUnique({
      where: { id: String(req.params.id) },
      include: {
        farmer: {
          include: {
            user: {
              select: {
                name:  true,
                email: true,
                phone: true,
              },
            },
          },
        },
        alerts: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!field) {
      res.status(404).json({ error: 'Field not found' })
      return
    }

    res.json({ field })
  } catch (error) {
    console.error('Get field error:', error)
    res.status(500).json({ error: 'Failed to fetch field' })
  }
})

router.post('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { location, crop, area } = req.body

    if (!location || !crop || !area) {
      res.status(400).json({ error: 'Location, crop and area are required' })
      return
    }

    const validCrops = ['Maize', 'Cassava', 'Tomato', 'Pepper']
    if (!validCrops.includes(crop)) {
      res.status(400).json({ error: 'Crop must be Maize, Cassava, Tomato or Pepper' })
      return
    }

    const farmer = await prisma.farmer.findUnique({
      where: { userId: req.user!.id },
    })

    if (!farmer) {
      res.status(404).json({ error: 'Farmer profile not found' })
      return
    }

    const field = await prisma.field.create({
      data: {
        farmerId:     farmer.id,
        location,
        crop,
        area:         parseFloat(area),
        ndvi:         0,
        soilMoisture: 0,
      },
    })

    res.status(201).json({ message: 'Field created successfully', field })
  } catch (error) {
    console.error('Create field error:', error)
    res.status(500).json({ error: 'Failed to create field' })
  }
})

router.patch('/:id', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { ndvi, soilMoisture, lastIrrigation, status } = req.body

    const field = await prisma.field.update({
      where: { id: String(req.params.id) },
      data: {
        ...(ndvi           !== undefined && { ndvi:           parseFloat(ndvi)         }),
        ...(soilMoisture   !== undefined && { soilMoisture:   parseFloat(soilMoisture) }),
        ...(lastIrrigation !== undefined && { lastIrrigation: new Date(lastIrrigation) }),
        ...(status         !== undefined && { status                                   }),
      },
    })

    res.json({ message: 'Field updated successfully', field })
  } catch (error) {
    console.error('Update field error:', error)
    res.status(500).json({ error: 'Failed to update field' })
  }
})

export default router