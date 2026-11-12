import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Search from './pages/Search'
import AddProfile from './pages/AddProfile'
import Quiz from './pages/Quiz'

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/add" element={<AddProfile />} />
          <Route path="/quiz" element={<Quiz />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
