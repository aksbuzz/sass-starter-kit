import type { ElementType, ComponentType } from 'react'

export interface RouteConfig {
  path: string
  component: ComponentType
}

export interface NavItem {
  href:  string
  label: string
  icon:  ElementType
}

export interface WebModule {
  name:     string
  routes:   RouteConfig[]
  navItems: NavItem[]
}
