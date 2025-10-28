// Common types used across the application

export interface User {
  id: string
  email: string
  name?: string
  createdAt: Date
  updatedAt: Date
}

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  message?: string
}

export type ApiError = {
  message: string
  code?: string
  status?: number
}