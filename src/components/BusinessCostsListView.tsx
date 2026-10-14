import BusinessCostsPage from './BusinessCostsPage'
import SectionTabs from './SectionTabs'

export default function BusinessCostsListView() {
  return (
    <div className="gutter--left gutter--right" style={{ maxWidth: 1440 }}>
      <SectionTabs />
      <BusinessCostsPage />
    </div>
  )
}
