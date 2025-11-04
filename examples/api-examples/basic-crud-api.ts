/**
 * Example: Basic CRUD API Route
 *
 * This example shows how to create a complete CRUD API endpoint
 * following the template's patterns for validation, error handling,
 * authorization, and database operations.
 *
 * Copy this file to src/app/api/[your-resource]/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/auth/api-protection'
import { logError } from '@/lib/error-logging'

// Input validation schemas
const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  dueDate: z.string().datetime().optional(),
  organizationId: z.string().min(1, 'Organization ID is required'),
})

const UpdateTaskSchema = CreateTaskSchema.partial().omit({ organizationId: true })

const QuerySchema = z.object({
  page: z.string().default('1').transform(Number).pipe(z.number().min(1)),
  limit: z.string().default('10').transform(Number).pipe(z.number().min(1).max(100)),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  organizationId: z.string().optional(),
})

// GET /api/tasks - List tasks with filtering and pagination
export async function GET(request: NextRequest) {
  return withAuth(async (user) => {
    try {
      const url = new URL(request.url)
      const queryParams = Object.fromEntries(url.searchParams.entries())
      const query = QuerySchema.parse(queryParams)

      // Check organization access
      if (query.organizationId) {
        const member = await prisma.organizationMember.findFirst({
          where: {
            organizationId: query.organizationId,
            userId: user.id,
            status: 'ACTIVE',
          },
        })

        if (!member) {
          return NextResponse.json(
            { error: 'Access denied to organization' },
            { status: 403 }
          )
        }
      }

      // Build where clause
      const where: any = {}
      if (query.organizationId) where.organizationId = query.organizationId
      if (query.status) where.status = query.status
      if (query.priority) where.priority = query.priority

      // If no specific org, show user's accessible tasks
      if (!query.organizationId) {
        const userOrgs = await prisma.organizationMember.findMany({
          where: { userId: user.id, status: 'ACTIVE' },
          select: { organizationId: true },
        })
        where.organizationId = { in: userOrgs.map(org => org.organizationId) }
      }

      // Get paginated results
      const [tasks, total] = await Promise.all([
        prisma.task.findMany({
          where,
          include: {
            organization: { select: { id: true, name: true, slug: true } },
            assignee: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.task.count({ where }),
      ])

      const totalPages = Math.ceil(total / query.limit)

      return NextResponse.json({
        tasks,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages,
          hasNext: query.page < totalPages,
          hasPrevious: query.page > 1,
        },
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid query parameters', details: error.issues },
          { status: 400 }
        )
      }

      logError('tasks-list-error', error, { userId: user.id })
      return NextResponse.json(
        { error: 'Failed to fetch tasks' },
        { status: 500 }
      )
    }
  })(request)
}

// POST /api/tasks - Create new task
export async function POST(request: NextRequest) {
  return withAuth(async (user) => {
    try {
      const body = await request.json()
      const validatedData = CreateTaskSchema.parse(body)

      // Verify organization access
      const member = await prisma.organizationMember.findFirst({
        where: {
          organizationId: validatedData.organizationId,
          userId: user.id,
          status: 'ACTIVE',
          role: { in: ['OWNER', 'ADMIN', 'MEMBER'] }, // All active members can create tasks
        },
      })

      if (!member) {
        return NextResponse.json(
          { error: 'Access denied to organization' },
          { status: 403 }
        )
      }

      // Check subscription limits (example usage enforcement)
      const organization = await prisma.organization.findUnique({
        where: { id: validatedData.organizationId },
        include: { subscription: { include: { plan: true } } },
      })

      if (organization?.subscription?.plan) {
        const taskCount = await prisma.task.count({
          where: { organizationId: validatedData.organizationId },
        })

        const planFeatures = organization.subscription.plan.features as any
        if (planFeatures?.maxTasks && taskCount >= planFeatures.maxTasks) {
          return NextResponse.json(
            {
              error: 'Task limit reached',
              details: { limit: planFeatures.maxTasks, current: taskCount }
            },
            { status: 402 }
          )
        }
      }

      // Create task
      const task = await prisma.task.create({
        data: {
          ...validatedData,
          assigneeId: user.id, // Assign to creator by default
          status: 'PENDING',
        },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      })

      return NextResponse.json({ task }, { status: 201 })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid input', details: error.issues },
          { status: 400 }
        )
      }

      logError('task-creation-error', error, { userId: user.id })
      return NextResponse.json(
        { error: 'Failed to create task' },
        { status: 500 }
      )
    }
  })(request)
}

/**
 * Usage Examples:
 *
 * // GET with pagination and filtering
 * fetch('/api/tasks?page=1&limit=20&status=PENDING&organizationId=org_123')
 *
 * // POST to create new task
 * fetch('/api/tasks', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     title: 'Complete API documentation',
 *     description: 'Add examples and edge cases',
 *     priority: 'HIGH',
 *     organizationId: 'org_123',
 *     dueDate: '2024-12-01T10:00:00Z'
 *   })
 * })
 *
 * // Add to your Prisma schema:
 * model Task {
 *   id             String    @id @default(cuid())
 *   title          String
 *   description    String?
 *   status         TaskStatus @default(PENDING)
 *   priority       TaskPriority @default(MEDIUM)
 *   dueDate        DateTime?
 *   organizationId String
 *   assigneeId     String?
 *   createdAt      DateTime  @default(now())
 *   updatedAt      DateTime  @updatedAt
 *
 *   organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
 *   assignee       User?        @relation(fields: [assigneeId], references: [id])
 *
 *   @@map("tasks")
 * }
 *
 * enum TaskStatus {
 *   PENDING
 *   IN_PROGRESS
 *   COMPLETED
 * }
 *
 * enum TaskPriority {
 *   LOW
 *   MEDIUM
 *   HIGH
 * }
 */