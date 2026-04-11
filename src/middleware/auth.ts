import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  user?: {
    id:    string
    email: string
    role:  string
  }
}

export function protect(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Not authorized — no token provided' })
      return
    }

    const token   = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string; email: string; role: string
    }

    req.user = decoded
    next()
  } catch {
    res.status(401).json({ error: 'Not authorized — invalid token' })
  }
}