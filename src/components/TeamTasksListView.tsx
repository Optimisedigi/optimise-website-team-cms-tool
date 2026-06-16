import TeamTasksSpreadsheet from './TeamTasksSpreadsheet'

export default function TeamTasksListView() {
  return (
    <div className="gutter--left gutter--right" style={{ maxWidth: 1600 }}>
      <TeamTasksSpreadsheet />
    </div>
  )
}
