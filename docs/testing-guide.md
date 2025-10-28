# Testing Guide

This guide outlines the testing patterns and conventions used in this SaaS starter template.

## Test Structure

```
src/
├── components/
│   └── ui/
│       ├── Button.tsx
│       └── Button.test.tsx          # Component tests
├── app/
│   ├── page.tsx
│   ├── page.test.tsx               # Page tests
│   └── api/
│       └── hello/
│           ├── route.ts
│           └── route.test.ts       # API route tests
├── lib/
│   ├── store.ts
│   ├── store.test.ts              # Store/hook tests
│   └── test-utils.tsx             # Test utilities
└── __tests__/                     # Global tests (if needed)
```

## Testing Tools

- **Jest** - Test runner and assertion library
- **React Testing Library** - Component testing utilities
- **@testing-library/user-event** - User interaction simulation
- **@testing-library/jest-dom** - Additional Jest matchers

## Test Utilities

### Custom Render Function

Use the custom render function from `@/lib/test-utils` for consistent testing setup:

```tsx
import { render, screen, user } from '@/lib/test-utils'

test('component works', async () => {
  render(<MyComponent />)

  const button = screen.getByRole('button')
  await user.click(button)

  expect(button).toBeInTheDocument()
})
```

### Store Mocking

The test utilities automatically mock the Zustand store. Use `mockStore` to control state:

```tsx
import { render, mockStore, resetMocks } from '@/lib/test-utils'

beforeEach(() => {
  resetMocks()
  mockStore.user = { id: '1', email: 'test@example.com' }
})
```

### API Mocking

Use provided helpers for mocking fetch calls:

```tsx
import { mockFetch, mockFetchError } from '@/lib/test-utils'

test('handles API success', async () => {
  mockFetch({ data: 'success' }, 200)
  // Your test code
})

test('handles API error', async () => {
  mockFetchError('Network error')
  // Your test code
})
```

## Testing Patterns

### Component Testing

1. **Rendering Tests** - Verify component renders correctly
2. **Props Tests** - Test different prop combinations
3. **Interaction Tests** - Test user interactions
4. **State Tests** - Test state changes
5. **Accessibility Tests** - Verify ARIA attributes and keyboard navigation

```tsx
describe('MyComponent', () => {
  it('renders with default props', () => {
    render(<MyComponent />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('handles click events', async () => {
    const handleClick = jest.fn()
    render(<MyComponent onClick={handleClick} />)

    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
```

### API Route Testing

1. **Success Responses** - Test expected successful responses
2. **Error Handling** - Test error scenarios
3. **Input Validation** - Test invalid inputs
4. **HTTP Methods** - Test all supported methods

```tsx
describe('GET /api/endpoint', () => {
  it('returns success response', async () => {
    const response = await GET(mockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual(expectedData)
  })
})
```

### Store Testing

1. **Initial State** - Verify default state
2. **Actions** - Test all store actions
3. **State Updates** - Verify state changes correctly
4. **Persistence** - Test localStorage integration

```tsx
describe('useAppStore', () => {
  it('updates state correctly', () => {
    const { result } = renderHook(() => useAppStore())

    act(() => {
      result.current.setUser(testUser)
    })

    expect(result.current.user).toEqual(testUser)
  })
})
```

## Coverage Requirements

- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

Run coverage with:
```bash
npm run test:coverage
```

## Best Practices

### 1. Test Behavior, Not Implementation
```tsx
// ❌ Bad - testing implementation details
expect(component.state.count).toBe(1)

// ✅ Good - testing user-observable behavior
expect(screen.getByText('Count: 1')).toBeInTheDocument()
```

### 2. Use Accessible Queries
```tsx
// ✅ Preferred queries (accessibility-focused)
screen.getByRole('button', { name: /submit/i })
screen.getByLabelText(/email address/i)
screen.getByText(/welcome/i)

// ❌ Avoid when possible
screen.getByTestId('submit-button')
screen.getByClassName('btn-primary')
```

### 3. Test User Interactions Realistically
```tsx
// ✅ Good - simulates real user interaction
await user.type(screen.getByLabelText(/email/i), 'test@example.com')
await user.click(screen.getByRole('button', { name: /submit/i }))

// ❌ Avoid - not how users interact
fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
```

### 4. Use Descriptive Test Names
```tsx
// ✅ Good - describes what the test verifies
it('shows error message when email is invalid', () => {})
it('disables submit button while form is submitting', () => {})

// ❌ Bad - vague or implementation-focused
it('works correctly', () => {})
it('calls useState', () => {})
```

### 5. Arrange, Act, Assert (AAA)
```tsx
it('updates theme when toggle button is clicked', async () => {
  // Arrange
  render(<ThemeToggle />)

  // Act
  await user.click(screen.getByRole('button', { name: /toggle theme/i }))

  // Assert
  expect(mockStore.setTheme).toHaveBeenCalledWith('dark')
})
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test Button.test.tsx

# Run tests matching pattern
npm test -- --testNamePattern="renders"
```

## Debugging Tests

1. **Add Console Logs**
   ```tsx
   screen.debug() // Prints current DOM
   console.log(screen.getByRole('button')) // Inspect element
   ```

2. **Use VS Code Debugger**
   - Set breakpoints in test files
   - Run "Debug Jest Tests" configuration

3. **Test Individual Components**
   ```bash
   npm test -- --testPathPattern=Button.test.tsx --verbose
   ```

## Continuous Integration

Tests run automatically on:
- Every push to main/master branch
- Every pull request
- Before deployment

CI will fail if:
- Any test fails
- Coverage drops below 80%
- Tests take longer than 5 minutes