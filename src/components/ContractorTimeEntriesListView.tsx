import AdminStepNavSetter from './AdminStepNavSetter'
import ContractorTimeEntriesSpreadsheet from './ContractorTimeEntriesSpreadsheet'

export default function ContractorTimeEntriesListView() {
  return (
    <div className="od-contractor-time-entries-list">
      <AdminStepNavSetter items={[{ label: 'Time entries' }]} />
      <ContractorTimeEntriesSpreadsheet />
    </div>
  )
}
