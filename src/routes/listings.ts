import { Router, Response } from 'express'
import prisma from '../db/index'
import { protect, AuthRequest } from '../middleware/auth'
import {
  sendMatchEmailToBuyer,
  sendMatchEmailToSeller,
  sendWaitlistEmail,
  sendRequestEmailToSeller,
} from '../services/emailService'

const router = Router()

const AKURE_COORDS: Record<string, { lat: number; lng: number }> = {
  'Oba-Ile':      { lat: 7.2986, lng: 5.1413 },
  'Ijapo Estate': { lat: 7.2558, lng: 5.1947 },
  'Oke-Aro':      { lat: 7.2621, lng: 5.1823 },
  'Arakale':      { lat: 7.2533, lng: 5.1942 },
  'Isolo':        { lat: 7.2467, lng: 5.2011 },
  'Oda':          { lat: 7.2389, lng: 5.2134 },
  'Oke-Ogba':     { lat: 7.2701, lng: 5.1756 },
  'Ijomu':        { lat: 7.2612, lng: 5.1889 },
  'Ayedun':       { lat: 7.2445, lng: 5.2089 },
  'Alagbaka':     { lat: 7.2578, lng: 5.1934 },
}

function haversineDistance(loc1: string, loc2: string): number {
  const c1 = AKURE_COORDS[loc1]
  const c2 = AKURE_COORDS[loc2]
  if (!c1 || !c2) return 10

  const R = 6371
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180
  const dLng = ((c2.lng - c1.lng) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1.lat * Math.PI) / 180) *
      Math.cos((c2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}

// Helper to safely get param as string
const getParam = (param: string | string[] | undefined): string => {
  return Array.isArray(param) ? param[0] : param || ''
}

// ── GET ALL LISTINGS ──────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { crop, location } = req.query

    const listings = await prisma.listing.findMany({
      where: {
        status: { not: 'sold' },
        ...(crop && typeof crop === 'string' && { cropType: crop as any }),
        ...(location && typeof location === 'string' && { location }),
      },
      include: {
        seller: { include: { user: { select: { name: true, email: true, phone: true } } } },
        _count: { select: { requests: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const userLocation = (req.query.userLocation as string) || 'Ijapo Estate'

    const result = listings.map((l: any) => ({
      id:           l.id,
      sellerId:     l.sellerId,
      sellerName:   l.seller.user.name,
      sellerEmail:  l.seller.user.email,
      sellerPhone:  l.seller.user.phone,
      cropType:     l.cropType,
      quantity:     l.quantity,
      remainingQty: l.remainingQty,
      location:     l.location,
      description:  l.description,
      photoUrl:     l.photoUrl,
      status:       l.status,
      createdAt:    l.createdAt,
      distance:     haversineDistance(l.location, userLocation),
      requestCount: l._count.requests,
      coordinates:  AKURE_COORDS[l.location] || null,
    }))

    res.json({ listings: result, total: result.length })
  } catch (error) {
    console.error('Get listings error:', error)
    res.status(500).json({ error: 'Failed to fetch listings' })
  }
})

// ── POST A LISTING (seller) ──────────────────────────────────
router.post('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { cropType, quantity, location, description, photoUrl } = req.body

    if (!cropType || !quantity || !location || !description) {
      res.status(400).json({ error: 'cropType, quantity, location and description are required' })
      return
    }

    const seller = await prisma.seller.findUnique({
      where:   { userId: req.user!.id },
      include: { user: true },
    })

    if (!seller) {
      res.status(403).json({ error: 'Only sellers can post listings' })
      return
    }

    const listing = await prisma.listing.create({
      data: {
        sellerId:     seller.id,
        cropType:     cropType as any,
        quantity:     Number(quantity),
        remainingQty: Number(quantity),
        location,
        description,
        photoUrl:     photoUrl || null,
        status:       'available',
      },
    })

    // ── AUTO-MATCH: check waitlist for matching demands ──
    const matchingDemands = await prisma.demand.findMany({
      where: {
        cropType: cropType as any,
        status:   'pending',
        quantity: { lte: Number(quantity) },
      },
      include: {
        buyer: { include: { user: true } },
      },
    })

    for (const demand of matchingDemands) {
      const distance = haversineDistance(demand.location, location)
      if (distance > 15) continue

      const match = await prisma.match.create({
        data: {
          listingId:      listing.id,
          demandId:       demand.id,
          cropType:       cropType as any,
          buyerId:        demand.buyerId,
          sellerId:       seller.id,
          quantity:       demand.quantity,
          buyerLocation:  demand.location,
          sellerLocation: location,
          distance,
          status:         'pending',
        },
      })

      await prisma.demand.update({
        where: { id: demand.id },
        data:  { status: 'matched' },
      })

      await prisma.listing.update({
        where: { id: listing.id },
        data: {
          remainingQty: { decrement: demand.quantity },
          status: Number(quantity) - demand.quantity === 0 ? 'sold' : 'partial',
        },
      })

      await sendMatchEmailToBuyer({
        buyerName:      demand.buyer.user.name,
        buyerEmail:     demand.buyer.user.email,
        sellerName:     seller.user.name,
        sellerEmail:    seller.user.email,
        sellerPhone:    seller.user.phone || undefined,
        cropType,
        quantity:       demand.quantity,
        sellerLocation: location,
        buyerLocation:  demand.location,
        distance,
        matchId:        match.id,
      })

      await sendMatchEmailToSeller({
        sellerName:     seller.user.name,
        sellerEmail:    seller.user.email,
        buyerName:      demand.buyer.user.name,
        buyerEmail:     demand.buyer.user.email,
        cropType,
        quantity:       demand.quantity,
        buyerLocation:  demand.location,
        sellerLocation: location,
        distance,
        matchId:        match.id,
      })

      break
    }

    res.status(201).json({
      message: 'Listing posted successfully',
      listing: {
        id:          listing.id,
        cropType:    listing.cropType,
        quantity:    listing.quantity,
        location:    listing.location,
        coordinates: AKURE_COORDS[location] || null,
      },
    })
  } catch (error) {
    console.error('Post listing error:', error)
    res.status(500).json({ error: 'Failed to post listing' })
  }
})

// ── POST A DEMAND (buyer) ──────────────────────────────────
router.post('/demand', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { cropType, quantity, location } = req.body

    if (!cropType || !quantity || !location) {
      res.status(400).json({ error: 'cropType, quantity and location are required' })
      return
    }

    const buyer = await prisma.buyer.findUnique({
      where:   { userId: req.user!.id },
      include: { user: true },
    })

    if (!buyer) {
      res.status(403).json({ error: 'Only buyers can post demands' })
      return
    }

    const availableListings = await prisma.listing.findMany({
      where: {
        cropType:     cropType as any,
        status:       { not: 'sold' },
        remainingQty: { gte: Number(quantity) },
      },
      include: {
        seller: { include: { user: true } },
      },
    })

    const nearbyListings = availableListings
      .map((l: any) => ({ ...l, distance: haversineDistance(l.location, location) }))
      .filter((l: any) => l.distance <= 15)
      .sort((a: any, b: any) => a.distance - b.distance)

    if (nearbyListings.length > 0) {
      const bestListing = nearbyListings[0]

      const match = await prisma.match.create({
        data: {
          listingId:      bestListing.id,
          cropType:       cropType as any,
          buyerId:        buyer.id,
          sellerId:       bestListing.sellerId,
          quantity:       Number(quantity),
          buyerLocation:  location,
          sellerLocation: bestListing.location,
          distance:       bestListing.distance,
          status:         'pending',
        },
      })

      const newQty = bestListing.remainingQty - Number(quantity)
      await prisma.listing.update({
        where: { id: bestListing.id },
        data: {
          remainingQty: newQty,
          status:       newQty === 0 ? 'sold' : 'partial',
        },
      })

      await sendMatchEmailToBuyer({
        buyerName:      buyer.user.name,
        buyerEmail:     buyer.user.email,
        sellerName:     bestListing.seller.user.name,
        sellerEmail:    bestListing.seller.user.email,
        sellerPhone:    bestListing.seller.user.phone || undefined,
        cropType,
        quantity:       Number(quantity),
        sellerLocation: bestListing.location,
        buyerLocation:  location,
        distance:       bestListing.distance,
        matchId:        match.id,
      })

      await sendMatchEmailToSeller({
        sellerName:     bestListing.seller.user.name,
        sellerEmail:    bestListing.seller.user.email,
        buyerName:      buyer.user.name,
        buyerEmail:     buyer.user.email,
        cropType,
        quantity:       Number(quantity),
        buyerLocation:  location,
        sellerLocation: bestListing.location,
        distance:       bestListing.distance,
        matchId:        match.id,
      })

      res.json({
        matched: true,
        match: {
          id:             match.id,
          cropType,
          quantity:       Number(quantity),
          sellerName:     bestListing.seller.user.name,
          sellerLocation: bestListing.location,
          buyerLocation:  location,
          distance:       bestListing.distance,
          status:         match.status,
        },
      })
    } else {
      const demand = await prisma.demand.create({
        data: {
          buyerId:  buyer.id,
          cropType: cropType as any,
          quantity: Number(quantity),
          location,
          status:   'pending',
        },
      })

      await sendWaitlistEmail({
        buyerName:  buyer.user.name,
        buyerEmail: buyer.user.email,
        cropType,
        quantity:   Number(quantity),
        location,
      })

      res.json({
        matched: false,
        demand: {
          id:       demand.id,
          cropType,
          quantity: Number(quantity),
          location,
          status:   'pending',
        },
      })
    }
  } catch (error) {
    console.error('Post demand error:', error)
    res.status(500).json({ error: 'Failed to post demand' })
  }
})

// ── REQUEST TO BUY (manual, buyer clicks on a listing) ───────
router.post('/:listingId/request', protect, async (req: AuthRequest, res: Response) => {
  try {
    const listingId = getParam(req.params.listingId)
    const { quantity, message, buyerLocation } = req.body

    const buyer = await prisma.buyer.findUnique({
      where:   { userId: req.user!.id },
      include: { user: true },
    })

    if (!buyer) {
      res.status(403).json({ error: 'Only buyers can send requests' })
      return
    }

    const listing = await prisma.listing.findUnique({
      where:   { id: listingId },
      include: { seller: { include: { user: true } } },
    })

    if (!listing) {
      res.status(404).json({ error: 'Listing not found' })
      return
    }

    if (Number(quantity) > listing.remainingQty) {
      res.status(400).json({ error: `Only ${listing.remainingQty}kg available` })
      return
    }

    const request = await prisma.listingRequest.create({
      data: {
        listingId:      listingId,
        buyerId:        buyer.id,
        requestedQty:   Number(quantity),
        message:        message || '',
        buyerLocation:  buyerLocation || '',
        status:         'pending',
      },
    })

    await sendRequestEmailToSeller({
      sellerName:  listing.seller.user.name,
      sellerEmail: listing.seller.user.email,
      buyerName:   buyer.user.name,
      buyerEmail:  buyer.user.email,
      cropType:    listing.cropType,
      quantity:    Number(quantity),
      message:     message || undefined,
    })

    res.status(201).json({
      message: 'Request sent successfully',
      request: {
        id:           request.id,
        listingId,
        requestedQty: Number(quantity),
        status:       'pending',
      },
    })
  } catch (error) {
    console.error('Request to buy error:', error)
    res.status(500).json({ error: 'Failed to send request' })
  }
})

// ── ACCEPT A REQUEST (seller) ────────────────────────────────
router.patch('/requests/:requestId/accept', protect, async (req: AuthRequest, res: Response) => {
  try {
    const requestId = getParam(req.params.requestId)
    const { buyerLocation } = req.body

    const request = await prisma.listingRequest.findUnique({
      where:   { id: requestId },
      include: {
        listing: { include: { seller: { include: { user: true } } } },
        buyer:   { include: { user: true } },
      },
    })

    if (!request) {
      res.status(404).json({ error: 'Request not found' })
      return
    }

    await prisma.listingRequest.update({
      where: { id: requestId },
      data:  { status: 'accepted' },
    })

    const newQty = request.listing.remainingQty - request.requestedQty
    await prisma.listing.update({
      where: { id: request.listingId },
      data: {
        remainingQty: newQty,
        status:       newQty === 0 ? 'sold' : 'partial',
      },
    })

    const distance = haversineDistance(
      buyerLocation || request.buyerLocation || 'Ijapo Estate',
      request.listing.location
    )

    const match = await prisma.match.create({
      data: {
        listingId:      request.listingId,
        requestId:      request.id,
        cropType:       request.listing.cropType,
        buyerId:        request.buyerId,
        sellerId:       request.listing.sellerId,
        quantity:       request.requestedQty,
        buyerLocation:  buyerLocation || request.buyerLocation || 'Ijapo Estate',
        sellerLocation: request.listing.location,
        distance,
        status:         'confirmed',
      },
    })

    await sendMatchEmailToBuyer({
      buyerName:      request.buyer.user.name,
      buyerEmail:     request.buyer.user.email,
      sellerName:     request.listing.seller.user.name,
      sellerEmail:    request.listing.seller.user.email,
      sellerPhone:    request.listing.seller.user.phone || undefined,
      cropType:       request.listing.cropType,
      quantity:       request.requestedQty,
      sellerLocation: request.listing.location,
      buyerLocation:  buyerLocation || request.buyerLocation || 'Ijapo Estate',
      distance,
      matchId:        match.id,
    })

    await sendMatchEmailToSeller({
      sellerName:     request.listing.seller.user.name,
      sellerEmail:    request.listing.seller.user.email,
      buyerName:      request.buyer.user.name,
      buyerEmail:     request.buyer.user.email,
      cropType:       request.listing.cropType,
      quantity:       request.requestedQty,
      buyerLocation:  buyerLocation || request.buyerLocation || 'Ijapo Estate',
      sellerLocation: request.listing.location,
      distance,
      matchId:        match.id,
    })

    res.json({
      message: 'Request accepted. Match confirmed! Emails sent to both parties.',
      match: {
        id:       match.id,
        cropType: match.cropType,
        quantity: match.quantity,
        distance: match.distance,
        status:   match.status,
      },
    })
  } catch (error) {
    console.error('Accept request error:', error)
    res.status(500).json({ error: 'Failed to accept request' })
  }
})

// ── DECLINE A REQUEST (seller) ───────────────────────────────
router.patch('/requests/:requestId/decline', protect, async (req: AuthRequest, res: Response) => {
  try {
    const requestId = getParam(req.params.requestId)

    await prisma.listingRequest.update({
      where: { id: requestId },
      data:  { status: 'rejected' },
    })

    res.json({ message: 'Request declined' })
  } catch (error) {
    console.error('Decline request error:', error)
    res.status(500).json({ error: 'Failed to decline request' })
  }
})

// ── GET MY LISTINGS (seller) ─────────────────────────────────
router.get('/my/listings', protect, async (req: AuthRequest, res: Response) => {
  try {
    const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } })
    if (!seller) {
      res.json({ listings: [] })
      return
    }

    const listings = await prisma.listing.findMany({
      where:   { sellerId: seller.id },
      include: {
        requests: {
          include: { buyer: { include: { user: { select: { name: true, email: true, phone: true } } } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ listings })
  } catch (error) {
    console.error('Get my listings error:', error)
    res.status(500).json({ error: 'Failed to fetch listings' })
  }
})

// ── GET MY MATCHES ───────────────────────────────────────────
router.get('/my/matches', protect, async (req: AuthRequest, res: Response) => {
  try {
    const buyer  = await prisma.buyer.findUnique({ where: { userId: req.user!.id } })
    const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } })

    const matches = await prisma.match.findMany({
      where: {
        OR: [
          ...(buyer  ? [{ buyerId:  buyer.id  }] : []),
          ...(seller ? [{ sellerId: seller.id }] : []),
        ],
      },
      include: {
        buyer:  { include: { user: { select: { name: true, email: true, phone: true } } } },
        seller: { include: { user: { select: { name: true, email: true, phone: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ matches })
  } catch (error) {
    console.error('Get matches error:', error)
    res.status(500).json({ error: 'Failed to fetch matches' })
  }
})

// ── GET MY WAITLIST ──────────────────────────────────────────
router.get('/my/waitlist', protect, async (req: AuthRequest, res: Response) => {
  try {
    const buyer = await prisma.buyer.findUnique({ where: { userId: req.user!.id } })
    if (!buyer) {
      res.json({ demands: [] })
      return
    }

    const demands = await prisma.demand.findMany({
      where:   { buyerId: buyer.id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ demands })
  } catch (error) {
    console.error('Get waitlist error:', error)
    res.status(500).json({ error: 'Failed to fetch waitlist' })
  }
})

export { haversineDistance, AKURE_COORDS }
export default router