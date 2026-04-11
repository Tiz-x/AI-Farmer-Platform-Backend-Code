import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt, { SignOptions } from 'jsonwebtoken'
import prisma from '../db/index'

const router = Router()

function generateToken(payload: { id: string; email: string; role: string }) {
  const secret  = process.env.JWT_SECRET as string
  const options: SignOptions = {
    expiresIn: '7d'
  }
  return jwt.sign(payload, secret, options)
}

// ── REGISTER ─────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password, role, location } = req.body

    if (!name || !email || !password || !role) {
      res.status(400).json({ error: 'Name, email, password and role are required' })
      return
    }

    const validRoles = ['farmer', 'buyer', 'seller']
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'Role must be farmer, buyer or seller' })
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
        phone:    phone    || null,
        location: location || null,
        password: hashedPassword,
        role,
      },
    })

    if (role === 'farmer') {
      await prisma.farmer.create({
        data: {
          userId:   user.id,
          location: location || '',
        },
      })
    } else if (role === 'buyer') {
      await prisma.buyer.create({ data: { userId: user.id } })
    } else if (role === 'seller') {
      await prisma.seller.create({ data: { userId: user.id } })
    }

    const token = generateToken({
      id:    user.id,
      email: user.email,
      role:  user.role,
    })

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id:       user.id,
        name:     user.name,
        email:    user.email,
        role:     user.role,
        location: user.location,
      },
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ error: 'Something went wrong during registration' })
  }
})

// ── LOGIN ─────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' })
      return
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    if (user.status === 'suspended') {
      res.status(403).json({ error: 'Your account has been suspended. Contact support.' })
      return
    }

    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const token = generateToken({
      id:    user.id,
      email: user.email,
      role:  user.role,
    })

    res.json({
      message: 'Login successful',
      token,
      user: {
        id:       user.id,
        name:     user.name,
        email:    user.email,
        role:     user.role,
        location: user.location,
        phone:    user.phone,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Something went wrong during login' })
  }
})

// ── GET CURRENT USER ──────────────────────────────
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Not authorized' })
      return
    }

    const token   = authHeader.split(' ')[1]
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as { id: string }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id:        true,
        name:      true,
        email:     true,
        role:      true,
        status:    true,
        location:  true,
        phone:     true,
        avatarUrl: true,
        createdAt: true,
      },
    })

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json({ user })
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

// ── CREATE FIRST ADMIN ────────────────────────────
router.post('/create-admin', async (req: Request, res: Response) => {
  console.log('🔥 create-admin route hit')
  console.log('Body received:', req.body)
  try {
    const { name, email, password, secretKey } = req.body

    if (secretKey !== process.env.ADMIN_SECRET_KEY) {
      res.status(403).json({ error: 'Invalid secret key' })
      return
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      res.status(400).json({ error: 'Email already registered' })
      return
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const admin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role:     'admin',
        status:   'active',
      },
    })

    res.status(201).json({
      message: 'Admin account created',
      user: {
        id:    admin.id,
        name:  admin.name,
        email: admin.email,
        role:  admin.role,
      },
    })
  } catch (error) {
    console.error('Create admin error FULL:', JSON.stringify(error, null, 2))
    console.error('Create admin error MESSAGE:', error)
    res.status(500).json({
      error: 'Something went wrong',
      detail: error instanceof Error ? error.message : String(error)
    })
  }
})

export default router