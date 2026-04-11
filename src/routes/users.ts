import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../db/index'
import { protect } from '../middleware/auth'
import { adminOnly } from '../middleware/adminOnly'
import { AuthRequest } from '../middleware/auth'

const router = Router()

// ── GET ALL USERS (admin only) ────────────────────
router.get('/', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id:        true,
        name:      true,
        email:     true,
        phone:     true,
        role:      true,
        status:    true,
        location:  true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ users, total: users.length })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// ── GET ONE USER (admin only) ─────────────────────
router.get('/:id', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: String(req.params.id) },
      select: {
        id:        true,
        name:      true,
        email:     true,
        phone:     true,
        role:      true,
        status:    true,
        location:  true,
        avatarUrl: true,
        createdAt: true,
      },
    })

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json({ user })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

// ── ADD USER (admin only) ─────────────────────────
router.post('/', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, role, phone, location } = req.body

    if (!name || !email || !password || !role) {
      res.status(400).json({ error: 'Name, email, password and role are required' })
      return
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      res.status(400).json({ error: 'Email already registered' })
      return
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        phone:    phone    || null,
        location: location || null,
      },
    })

    // Create role profile
    if (role === 'farmer') {
      await prisma.farmer.create({
        data: { userId: user.id, location: location || '' },
      })
    } else if (role === 'buyer') {
      await prisma.buyer.create({ data: { userId: user.id } })
    } else if (role === 'seller') {
      await prisma.seller.create({ data: { userId: user.id } })
    }

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      },
    })
  } catch (error) {
    console.error('Add user error:', error)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// ── SUSPEND / REINSTATE USER (admin only) ─────────
router.patch('/:id/status', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body

    if (!['active', 'suspended'].includes(status)) {
      res.status(400).json({ error: 'Status must be active or suspended' })
      return
    }

    const user = await prisma.user.update({
      where: { id: String(req.params.id) },
      data:  { status },
    })

    res.json({ message: `User ${status} successfully`, user })
  } catch (error) {
    console.error('Update user status error:', error)
    res.status(500).json({ error: 'Failed to update user status' })
  }
})

// ── UPDATE MY PROFILE ─────────────────────────────
router.patch('/me/update', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, location } = req.body

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data:  {
        ...(name     && { name     }),
        ...(phone    && { phone    }),
        ...(location && { location }),
      },
      select: {
        id:       true,
        name:     true,
        email:    true,
        phone:    true,
        location: true,
        role:     true,
      },
    })

    res.json({ message: 'Profile updated', user })
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

export default router