// Temporary preview harness for the admin charts (not part of the app).
import { createRoot } from 'react-dom/client'
import { ConnectionsSplit, JoinsArea, TeamBars } from './components/admin/Charts'
import { Card } from './components/ui'
import '@fontsource-variable/geist'
import './styles/tokens.css'
import './styles/ui.css'
import './styles/layout.css'
import './index.css'

const days = Array.from({ length: 14 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - (13 - i))
  const counts = [0, 2, 1, 4, 3, 7, 5, 2, 6, 9, 14, 8, 11, 6]
  return { day: d.toISOString().slice(0, 10), count: counts[i] }
})

const teams = [
  { unit: 'Engineering', count: 34 },
  { unit: 'Product', count: 21 },
  { unit: 'Design', count: 14 },
  { unit: 'Data', count: 11 },
  { unit: 'Marketing', count: 8 },
  { unit: 'People Ops', count: 5 },
  { unit: 'Unassigned', count: 3 },
]

const edges = [
  { type: 'project', count: 180 },
  { type: 'semantic', count: 122 },
  { type: 'employer', count: 75 },
  { type: 'school', count: 41 },
  { type: 'declared', count: 18 },
]

const EDGE_LABELS = {
  project: 'Shared project',
  employer: 'Same employer',
  declared: 'Declared',
  school: 'Same school',
  semantic: 'Similar expertise',
}

createRoot(document.getElementById('root')).render(
  <div className="admin" style={{ maxWidth: 980, margin: '40px auto', padding: '0 20px' }}>
    <div className="admin-viz">
      <div className="admin-viz__wide">
        <Card className="viz-card">
          <JoinsArea data={days} />
        </Card>
      </div>
      <Card className="viz-card">
        <TeamBars data={teams} />
      </Card>
      <Card className="viz-card">
        <ConnectionsSplit data={edges} labels={EDGE_LABELS} />
      </Card>
    </div>
  </div>,
)
