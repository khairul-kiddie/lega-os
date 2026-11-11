import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RoofMap from './pages/RoofMap'
import Portfolio from './pages/Portfolio'
import Leasing from './pages/Leasing'
import Insights from './pages/Insights'
import Firming from './pages/Firming'
import Planner from './pages/Planner'
import Kulai from './pages/Kulai'
import Resident from './pages/Resident'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/map" replace />} />
        <Route path="/map" element={<RoofMap />} />
        <Route path="/planner/*" element={<Planner />} />
        <Route path="/community" element={<Navigate to="/planner/map" replace />} />
        <Route path="/portfolio/*" element={<Portfolio />} />
        <Route path="/kulai" element={<Kulai />} />
        <Route path="/leasing" element={<Leasing />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/firming" element={<Firming />} />
        <Route path="/resident" element={<Resident />} />
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Route>
    </Routes>
  )
}
