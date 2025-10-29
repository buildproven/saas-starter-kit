'use client'

import { useAuth } from '@/lib/hooks/useAuth'
import { useCurrentOrganization, useUI } from '@/lib/hooks/useStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart3,
  Users,
  TrendingUp,
  DollarSign,
  Activity,
  Calendar,
  Settings,
  Plus,
} from 'lucide-react'

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth()
  const { organization, hasActiveSubscription, isTrialing } = useCurrentOrganization()
  const { isLoading } = useUI()

  if (authLoading || isLoading) {
    return <DashboardSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You must be logged in to view the dashboard.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user.name || user.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={hasActiveSubscription ? 'default' : isTrialing ? 'secondary' : 'destructive'}>
            {hasActiveSubscription ? 'Active' : isTrialing ? 'Trial' : 'Inactive'}
          </Badge>
          <Button size="sm" variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Organization Info */}
      {organization && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {organization.name}
            </CardTitle>
            <CardDescription>
              Organization ID: {organization.id} • Role: {organization.role}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Users"
          value="2,350"
          change="+20.1%"
          icon={Users}
          trend="up"
        />
        <StatsCard
          title="Revenue"
          value="$45,231.89"
          change="+201"
          icon={DollarSign}
          trend="up"
        />
        <StatsCard
          title="Active Sessions"
          value="12,234"
          change="+19%"
          icon={Activity}
          trend="up"
        />
        <StatsCard
          title="Conversion Rate"
          value="3.24%"
          change="+5.1%"
          icon={TrendingUp}
          trend="up"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Recent Activity */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Your recent actions and updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ActivityItem
              action="Updated profile information"
              time="2 minutes ago"
              type="profile"
            />
            <ActivityItem
              action="Created new API key"
              time="1 hour ago"
              type="api"
            />
            <ActivityItem
              action="Invited team member"
              time="3 hours ago"
              type="team"
            />
            <ActivityItem
              action="Upgraded subscription plan"
              time="1 day ago"
              type="billing"
            />
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start">
              <Plus className="h-4 w-4 mr-2" />
              Create New Project
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <Users className="h-4 w-4 mr-2" />
              Invite Team Member
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <Settings className="h-4 w-4 mr-2" />
              Manage Settings
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <Calendar className="h-4 w-4 mr-2" />
              Schedule Meeting
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Usage Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Overview</CardTitle>
          <CardDescription>Monitor your plan usage and limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <UsageMetric
              label="API Calls"
              current={8420}
              limit={10000}
              unit="calls"
            />
            <UsageMetric
              label="Storage"
              current={2.4}
              limit={10}
              unit="GB"
            />
            <UsageMetric
              label="Team Members"
              current={5}
              limit={25}
              unit="members"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatsCard({
  title,
  value,
  change,
  icon: Icon,
  trend,
}: {
  title: string
  value: string
  change: string
  icon: React.ComponentType<{ className?: string }>
  trend: 'up' | 'down'
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className={`text-xs ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
          {change} from last month
        </p>
      </CardContent>
    </Card>
  )
}

function ActivityItem({
  action,
  time,
  type,
}: {
  action: string
  time: string
  type: 'profile' | 'api' | 'team' | 'billing'
}) {
  const getIcon = () => {
    switch (type) {
      case 'profile':
        return <Users className="h-4 w-4" />
      case 'api':
        return <Settings className="h-4 w-4" />
      case 'team':
        return <Users className="h-4 w-4" />
      case 'billing':
        return <DollarSign className="h-4 w-4" />
    }
  }

  return (
    <div className="flex items-center space-x-3">
      <div className="flex-shrink-0">
        <div className="flex items-center justify-center w-8 h-8 bg-muted rounded-full">
          {getIcon()}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{action}</p>
        <p className="text-xs text-muted-foreground">{time}</p>
      </div>
    </div>
  )
}

function UsageMetric({
  label,
  current,
  limit,
  unit,
}: {
  label: string
  current: number
  limit: number
  unit: string
}) {
  const percentage = (current / limit) * 100

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">
          {current.toLocaleString()} / {limit.toLocaleString()} {unit}
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className={`h-2 rounded-full ${
            percentage > 80
              ? 'bg-red-500'
              : percentage > 60
              ? 'bg-yellow-500'
              : 'bg-green-500'
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{percentage.toFixed(1)}% used</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      <Skeleton className="h-24 w-full" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-64 md:col-span-2" />
        <Skeleton className="h-64" />
      </div>

      <Skeleton className="h-40 w-full" />
    </div>
  )
}