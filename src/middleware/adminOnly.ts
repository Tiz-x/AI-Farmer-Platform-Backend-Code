import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access denied — admins only' })
    return
  }
  next()
}