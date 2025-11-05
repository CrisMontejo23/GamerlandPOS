import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "gamerland_secret";

export interface AuthRequest extends Request {
  user?: { id: number; role: "ADMIN" | "EMPLOYEE" };
}

export function verifyToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Token requerido" });

  const parts = authHeader.split(" ");
  const token = parts.length === 2 ? parts[1] : undefined;
  if (!token) return res.status(401).json({ error: "Token inválido" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; role: "ADMIN" | "EMPLOYEE" };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

export function requireRole(role: "ADMIN" | "EMPLOYEE") {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "No autenticado" });
    // ADMIN puede todo
    if (req.user.role !== role && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Acceso denegado" });
    }
    next();
  };
}