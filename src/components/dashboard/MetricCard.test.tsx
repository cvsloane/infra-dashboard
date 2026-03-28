import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Activity } from 'lucide-react'
import { MetricCard } from './MetricCard'

describe('MetricCard', () => {
  it('renders the title and value', () => {
    render(<MetricCard title="Active Jobs" value={42} icon={Activity} />)

    expect(screen.getByText('Active Jobs')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('shows skeleton placeholders when loading', () => {
    const { container } = render(
      <MetricCard
        title="Active Jobs"
        value={42}
        loading
        subtitle="Jobs currently processing"
        trend="up"
        trendValue="+5%"
      />
    )

    expect(screen.getByText('Active Jobs')).toBeInTheDocument()
    expect(screen.queryByText('42')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(2)
  })
})
