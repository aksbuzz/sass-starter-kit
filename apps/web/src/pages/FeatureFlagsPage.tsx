import { Header } from '@/components/layout/Header'
import { FeatureFlagList } from '@/components/feature-flags/FeatureFlagList'

export function FeatureFlagsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Feature Flags" />
      <div className="flex-1 p-6">
        <FeatureFlagList />
      </div>
    </div>
  )
}
