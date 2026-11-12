import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/fraunces/wght-italic.css'
import 'bootstrap/dist/css/bootstrap.min.css' // grid + .btn base still used by the Quiz page

import './styles/tokens.css'
import './styles/ui.css'
import './styles/layout.css'
import './styles/network.css'
import './styles/profile.css'
import './styles/coffee.css'
import './styles/target.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
