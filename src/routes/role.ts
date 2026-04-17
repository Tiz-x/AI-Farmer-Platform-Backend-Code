import { Router, Response } from 'express'
import { AuthRequest, protect } from '../middleware/auth'
import prisma from '../db/index'

const router = Router()

// Switch to Farmer role
router.post('/switch-to-farmer', protect, async (req: AuthRequest, res: Response) => {
  try {
    // Update user role to farmer
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { role: 'farmer' }
    })
    
    // Ensure farmer profile exists
    let farmer = await prisma.farmer.findUnique({
      where: { userId: user.id }
    })
    
    if (!farmer) {
      farmer = await prisma.farmer.create({
        data: {
          userId: user.id,
          location: user.location || 'Akure'
        }
      })
    }
    
    res.json({ 
      success: true, 
      role: 'farmer',
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    })
  } catch (error) {
    console.error('Switch to farmer error:', error)
    res.status(500).json({ error: 'Failed to switch role' })
  }
})

// Switch to Seller role
router.post('/switch-to-seller', protect, async (req: AuthRequest, res: Response) => {
  try {
    // Update user role to seller
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { role: 'seller' }
    })
    
    // Ensure seller profile exists
    let seller = await prisma.seller.findUnique({
      where: { userId: user.id }
    })
    
    if (!seller) {
      seller = await prisma.seller.create({
        data: { userId: user.id }
      })
    }
    
    res.json({ 
      success: true, 
      role: 'seller',
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    })
  } catch (error) {
    console.error('Switch to seller error:', error)
    res.status(500).json({ error: 'Failed to switch role' })
  }
})

// Switch to Buyer role
router.post('/switch-to-buyer', protect, async (req: AuthRequest, res: Response) => {
  try {
    // Update user role to buyer
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { role: 'buyer' }
    })
    
    // Ensure buyer profile exists
    let buyer = await prisma.buyer.findUnique({
      where: { userId: user.id }
    })
    
    if (!buyer) {
      buyer = await prisma.buyer.create({
        data: { userId: user.id }
      })
    }
    
    res.json({ 
      success: true, 
      role: 'buyer',
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    })
  } catch (error) {
    console.error('Switch to buyer error:', error)
    res.status(500).json({ error: 'Failed to switch role' })
  }
})

// Get current role and ensure profiles exist
router.get('/current-role', protect, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        farmer: true,
        seller: true,
        buyer: true
      }
    })
    
    // Auto-create missing profiles based on role
    if (user?.role === 'farmer' && !user.farmer) {
      await prisma.farmer.create({
        data: { userId: user.id, location: user.location || 'Akure' }
      })
    }
    if (user?.role === 'seller' && !user.seller) {
      await prisma.seller.create({
        data: { userId: user.id }
      })
    }
    if (user?.role === 'buyer' && !user.buyer) {
      await prisma.buyer.create({
        data: { userId: user.id }
      })
    }
    
    res.json({ 
      role: user?.role || 'farmer',
      hasFarmer: !!user?.farmer,
      hasSeller: !!user?.seller,
      hasBuyer: !!user?.buyer
    })
  } catch (error) {
    console.error('Get current role error:', error)
    res.status(500).json({ error: 'Failed to get current role' })
  }
})

export default router