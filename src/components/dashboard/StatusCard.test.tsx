import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusCard } from './StatusCard'

describe('StatusCard', () => {
  it('renders with title', () => {
    render(<StatusCard title="Test Service" status="ok" />)
    expect(screen.getByText('Test Service')).toBeInTheDocument()
  })

  it('displays healthy badge for ok status', () => {
    render(<StatusCard title="Service" status="ok" />)
    expect(screen.getByText('Healthy')).toBeInTheDocument()
  })

  it('displays error badge for error status', () => {
    render(<StatusCard title="Service" status="error" />)
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('displays warning badge for warning status', () => {
    render(<StatusCard title="Service" status="warning" />)
    expect(screen.getByText('Warning')).toBeInTheDocument()
  })

  it('displays loading badge for loading status', () => {
    render(<StatusCard title="Service" status="loading" />)
    expect(screen.getByText('Loading')).toBeInTheDocument()
  })

  it('renders message when provided', () => {
    render(<StatusCard title="Service" status="ok" message="All systems operational" />)
    expect(screen.getByText('All systems operational')).toBeInTheDocument()
  })

  it('renders stats when provided', () => {
    render(
      <StatusCard
        title="Service"
        status="ok"
        stats={[
          { label: 'Uptime', value: '99.9%' },
          { label: 'Requests', value: 1234 },
        ]}
      />
    )
    expect(screen.getByText('Uptime:')).toBeInTheDocument()
    expect(screen.getByText('99.9%')).toBeInTheDocument()
    expect(screen.getByText('Requests:')).toBeInTheDocument()
    expect(screen.getByText('1234')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <StatusCard title="Service" status="ok" className="custom-class" />
    )
    expect(container.querySelector('.custom-class')).toBeInTheDocument()
  })
})
