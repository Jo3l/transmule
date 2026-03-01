/**
 * JWT utilities for user authentication.
 */

import jwt from "jsonwebtoken";

function getSecret(): string {
  const config = useRuntimeConfig();
  return String(
    config.jwtSecret || "amule-middleware-change-this-secret-in-production",
  );
}

export interface JwtPayload {
  userId: number;
  username: string;
  isAdmin: boolean;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getSecret()) as JwtPayload;
  } catch {
    return null;
  }
}
