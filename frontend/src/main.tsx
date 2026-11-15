import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { MissionProvider } from './context/MissionContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MissionProvider>
      <App />
    </MissionProvider>
  </StrictMode>,
)
