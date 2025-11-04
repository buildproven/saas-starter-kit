import { useAppStore } from './store'

describe('Notification Auto-dismiss', () => {
  beforeEach(() => {
    // Reset store state
    useAppStore.setState({
      notifications: [],
    })
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should auto-dismiss non-error notifications after 5 seconds', () => {
    const { addNotification } = useAppStore.getState()

    // Add a success notification
    addNotification({
      type: 'success',
      title: 'Test Success',
      message: 'This should auto-dismiss',
    })

    // Verify notification was added
    expect(useAppStore.getState().notifications).toHaveLength(1)
    const successNotification = useAppStore.getState().notifications[0]
    expect(successNotification).toBeDefined()
    expect(successNotification?.title).toBe('Test Success')

    // Fast-forward time by 5 seconds
    jest.advanceTimersByTime(5000)

    // Verify notification was removed
    expect(useAppStore.getState().notifications).toHaveLength(0)
  })

  it('should NOT auto-dismiss error notifications', () => {
    const { addNotification } = useAppStore.getState()

    // Add an error notification
    addNotification({
      type: 'error',
      title: 'Test Error',
      message: 'This should NOT auto-dismiss',
    })

    // Verify notification was added
    expect(useAppStore.getState().notifications).toHaveLength(1)

    // Fast-forward time by 5 seconds
    jest.advanceTimersByTime(5000)

    // Verify error notification is still there
    expect(useAppStore.getState().notifications).toHaveLength(1)
    const errorNotification = useAppStore.getState().notifications[0]
    expect(errorNotification).toBeDefined()
    expect(errorNotification?.title).toBe('Test Error')
  })

  it('should handle multiple notifications with different auto-dismiss behaviors', () => {
    const { addNotification } = useAppStore.getState()

    // Add multiple notifications
    addNotification({
      type: 'success',
      title: 'Success 1',
    })

    addNotification({
      type: 'error',
      title: 'Error 1',
    })

    addNotification({
      type: 'info',
      title: 'Info 1',
    })

    // Verify all notifications were added
    expect(useAppStore.getState().notifications).toHaveLength(3)

    // Fast-forward time by 5 seconds
    jest.advanceTimersByTime(5000)

    // Verify only error notification remains
    const remainingNotifications = useAppStore.getState().notifications
    expect(remainingNotifications).toHaveLength(1)
    const [remainingNotification] = remainingNotifications
    expect(remainingNotification).toBeDefined()
    expect(remainingNotification?.title).toBe('Error 1')
    expect(remainingNotification?.type).toBe('error')
  })

  it('should not remove notification if manually removed before timeout', () => {
    const { addNotification, removeNotification } = useAppStore.getState()

    // Add a notification
    addNotification({
      type: 'success',
      title: 'Manual Remove Test',
    })

    const notificationId = useAppStore.getState().notifications[0]?.id
    expect(notificationId).toBeDefined()

    // Manually remove the notification
    removeNotification(notificationId as string)

    // Verify notification was removed
    expect(useAppStore.getState().notifications).toHaveLength(0)

    // Fast-forward time - should not cause any errors
    jest.advanceTimersByTime(5000)

    // Should still be empty
    expect(useAppStore.getState().notifications).toHaveLength(0)
  })
})
