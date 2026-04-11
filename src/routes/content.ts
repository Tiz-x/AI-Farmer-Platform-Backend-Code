import { Router, Response } from 'express'
import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import { protect, AuthRequest } from '../middleware/auth'
import { adminOnly } from '../middleware/adminOnly'
import prisma from '../db/index'

const router = Router()

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Use memory storage — we upload buffer directly to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'))
    }
  },
})

// ── GET ALL CONTENT IMAGES ────────────────────────
router.get('/', async (_req, res: Response) => {
  try {
    const images = await prisma.contentImage.findMany({
      orderBy: { page: 'asc' },
    })
    res.json({ images })
  } catch (error) {
    console.error('Get content error:', error)
    res.status(500).json({ error: 'Failed to fetch content images' })
  }
})

// ── UPLOAD / REPLACE IMAGE (admin only) ──────────
router.post(
  '/upload',
  protect,
  adminOnly,
  upload.single('image'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { key, label, description, page } = req.body

      if (!req.file) {
        res.status(400).json({ error: 'No image file provided' })
        return
      }

      if (!key || !label || !page) {
        res.status(400).json({ error: 'key, label and page are required' })
        return
      }

      // Upload to Cloudinary
      const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder:         'agroflow',
            public_id:      `content_${key}`,
            overwrite:      true,
            transformation: [{ quality: 'auto', fetch_format: 'auto' }],
          },
          (error, result) => {
            if (error) reject(error)
            else resolve(result as { secure_url: string })
          }
        )
        uploadStream.end(req.file!.buffer)
      })

      // Save or update in database
      const image = await prisma.contentImage.upsert({
        where:  { key },
        update: { imageUrl: uploadResult.secure_url, label, description: description || '', page },
        create: { key, label, description: description || '', page, imageUrl: uploadResult.secure_url },
      })

      res.json({
        message: 'Image uploaded successfully',
        image,
      })
    } catch (error) {
      console.error('Upload content error:', error)
      res.status(500).json({ error: 'Failed to upload image' })
    }
  }
)

// ── SEED DEFAULT IMAGES (run once) ───────────────
router.post('/seed', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const defaultImages = [
      {
        key:         'hero_bg',
        label:       'Hero Background',
        description: 'Main banner image on the landing page',
        page:        'Landing Page',
        imageUrl:    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200',
      },
      {
        key:         'how_we_work_1',
        label:       'How We Work — Image 1',
        description: 'Top-left image in the How We Work grid',
        page:        'Landing Page',
        imageUrl:    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600',
      },
      {
        key:         'how_we_work_2',
        label:       'How We Work — Image 2',
        description: 'Top-right image in the How We Work grid',
        page:        'Landing Page',
        imageUrl:    'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=600',
      },
      {
        key:         'how_we_work_3',
        label:       'How We Work — Image 3',
        description: 'Bottom image in the How We Work grid',
        page:        'Landing Page',
        imageUrl:    'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600',
      },
      {
        key:         'role_farmer',
        label:       'Farmers Role Card',
        description: 'Image on the Farmers role card',
        page:        'Landing Page',
        imageUrl:    'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=600',
      },
      {
        key:         'role_buyer',
        label:       'Buyers Role Card',
        description: 'Image on the Buyers role card',
        page:        'Landing Page',
        imageUrl:    'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=600',
      },
      {
        key:         'role_seller',
        label:       'Sellers Role Card',
        description: 'Image on the Sellers role card',
        page:        'Landing Page',
        imageUrl:    'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=600',
      },
      {
        key:         'signin_side',
        label:       'Sign In Side Image',
        description: 'Left panel image on the Sign In page',
        page:        'Sign In Page',
        imageUrl:    'https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800',
      },
      {
        key:         'register_side',
        label:       'Register Side Image',
        description: 'Left panel image on the Register page',
        page:        'Register Page',
        imageUrl:    'https://images.unsplash.com/photo-1592838064575-70ed626d3a0e?w=800',
      },
    ]

    for (const img of defaultImages) {
      await prisma.contentImage.upsert({
        where:  { key: img.key },
        update: { imageUrl: img.imageUrl },
        create: img,
      })
    }

    res.json({ message: 'Default images seeded successfully' })
  } catch (error) {
    console.error('Seed content error:', error)
    res.status(500).json({ error: 'Failed to seed content images' })
  }
})

export default router