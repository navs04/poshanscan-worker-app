import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import Toast from './components/Toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SyncProvider } from './context/SyncContext'
import Capture from './pages/Capture'
import ChildSearch from './pages/ChildSearch'
import Login from './pages/Login'
import Queue from './pages/Queue'
import RegisterChild from './pages/RegisterChild'
import Result from './pages/Result'

function RequireAuth() {
  const { session } = useAuth()
  const location = useLocation()
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SyncProvider>
          <Toast />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              {/* full-screen camera, no app header */}
              <Route path="/capture/:childId" element={<Capture />} />
              <Route element={<Layout />}>
                <Route index element={<ChildSearch />} />
                <Route path="children/new" element={<RegisterChild />} />
                <Route path="result" element={<Result />} />
                <Route path="queue" element={<Queue />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SyncProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
