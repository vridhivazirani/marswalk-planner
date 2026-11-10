import React from 'react'

export type PageId =
  | 'overview'
  | 'digital-twin'
  | 'data-hub'
  | 'terrain'
  | 'hazards'
  | 'science'
  | 'route-planner'
  | 'route-comparison'
  | 'simulation'
  | 'emergency'
  | 'reports'
  | 'settings'

interface NavigationSidebarProps {
  activePage: PageId
  onSelectPage: (page: PageId) => void
  hasActiveRoute: boolean
  hasEmergencyPlan: boolean
}

interface NavItem {
  id: PageId
  label: string
  icon: string
  badge?: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  activePage,
  onSelectPage,
  hasActiveRoute,
  hasEmergencyPlan,
}) => {
  const sections: NavSection[] = [
    {
      title: 'OPERATIONS CENTER',
      items: [
        { id: 'overview', label: 'Mission Overview', icon: '🌐' },
        { id: 'digital-twin', label: 'Mars Digital Twin', icon: '🪐' },
      ],
    },
    {
      title: 'DATA & INTELLIGENCE',
      items: [
        { id: 'data-hub', label: 'NASA Data Hub', icon: '🛰️', badge: '10' },
        { id: 'terrain', label: 'Terrain Intelligence', icon: '⛰️' },
        { id: 'hazards', label: 'Hazard Assessment', icon: '⚠️' },
        { id: 'science', label: 'Science Explorer', icon: '🔬', badge: '6' },
      ],
    },
    {
      title: 'TRAVERSAL PLANNING',
      items: [
        { id: 'route-planner', label: 'EVA Route Planner', icon: '🧭', badge: hasActiveRoute ? 'Active' : undefined },
        { id: 'route-comparison', label: 'Route Comparison', icon: '⚖️' },
      ],
    },
    {
      title: 'SIMULATION & CONTINGENCY',
      items: [
        { id: 'simulation', label: 'Mission Simulation', icon: '🧑‍🚀' },
        { id: 'emergency', label: 'Emergency Operations', icon: '🚨', badge: hasEmergencyPlan ? 'Alert' : undefined },
      ],
    },
    {
      title: 'ANALYSIS & SYSTEM',
      items: [
        { id: 'reports', label: 'Mission Reports', icon: '📋' },
        { id: 'settings', label: 'System Settings', icon: '⚙️' },
      ],
    },
  ]

  return (
    <aside className="mission-sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-logo-row">
          <span className="brand-icon">🔴</span>
          <span className="brand-name">MARSWALK</span>
        </div>
        <div className="brand-tagline">PLANETARY DECISION SUPPORT</div>
        <div className="brand-region-badge">JEZERO CRATER • MARS</div>
      </div>

      {/* Navigation Sections */}
      <nav className="sidebar-nav">
        {sections.map((section) => (
          <div key={section.title} className="nav-section">
            <div className="nav-section-title">{section.title}</div>
            <ul className="nav-list">
              {section.items.map((item) => {
                const isActive = activePage === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`nav-item-btn ${isActive ? 'active' : ''}`}
                      onClick={() => onSelectPage(item.id)}
                    >
                      <span className="nav-item-icon">{item.icon}</span>
                      <span className="nav-item-label">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`nav-item-badge ${
                            item.badge === 'Alert' ? 'alert' : item.badge === 'Active' ? 'active' : ''
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer Info */}
      <div className="sidebar-footer">
        <div className="geodetic-info">
          <div>CRS: IAU_2015:49900</div>
          <div>Datum: Mars Areoid</div>
        </div>
      </div>
    </aside>
  )
}

