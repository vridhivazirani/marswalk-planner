import React from 'react'
import {
  DEFAULT_REGION_ID,
  EXPERIENCE_ROUTES,
  NAV_SECTION_ORDER,
  getRegionBadgeLabel,
} from '../../navigation/routes.ts'
import type { PageId } from '../../types/mission.ts'

export type { PageId }

interface NavigationSidebarProps {
  activePage: PageId
  onSelectPage: (page: PageId) => void
  hasActiveRoute: boolean
  hasEmergencyPlan: boolean
  activeRegionId?: string
  activeRegionName?: string | null
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
  activeRegionId = DEFAULT_REGION_ID,
  activeRegionName,
}) => {
  const sections: NavSection[] = NAV_SECTION_ORDER.map((sectionTitle) => ({
    title: sectionTitle,
    items: EXPERIENCE_ROUTES.filter(
      (route) => route.section === sectionTitle,
    ).map((route) => {
      let badge = route.staticBadge
      if (route.id === 'route-planner') {
        badge = hasActiveRoute ? 'Active' : (route.staticBadge ?? '03')
      } else if (route.id === 'emergency') {
        badge = hasEmergencyPlan ? 'Alert' : undefined
      }
      return {
        id: route.id,
        label: route.navLabel,
        icon: route.icon,
        badge,
      }
    }),
  }))

  const regionBadgeText = getRegionBadgeLabel(activeRegionId, activeRegionName)

  return (
    <aside className="mission-sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-logo-row">
          <span className="brand-icon">◈</span>
          <span className="brand-name">MARSWALK</span>
        </div>
        <div className="brand-tagline">PLANETARY DECISION SUPPORT</div>
        <div className="brand-region-badge">{regionBadgeText}</div>
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
                          className={`nav-item-badge ${item.badge === 'Alert' ? 'alert' : item.badge === 'Active' ? 'active' : ''
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


