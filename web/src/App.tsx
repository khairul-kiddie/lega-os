import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RoofMap from './pages/RoofMap'
import Portfolio from './pages/Portfolio'
import Leasing from './pages/Leasing'
import Insights from './pages/Insights'
import Firming from './pages/Firming'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/map" replace />} />
        <Route path="/map" element={<RoofMap />} />
        <Route path="/portfolio/*" element={<Portfolio />} />
        <Route path="/leasing" element={<Leasing />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/firming" element={<Firming />} />
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Route>
    </Routes>
  )
}
