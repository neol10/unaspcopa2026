import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from './components/Layout/Layout';
import Home from './pages/Home/Home';
import Standings from './pages/Standings/Standings';
import Rankings from './pages/Rankings/Rankings';
import Teams from './pages/Teams/Teams';
import Players from './pages/Players/Players';
import MatchCenter from './pages/MatchCenter/MatchCenter';
import Brackets from './pages/Brackets/Brackets';
import Admin from './pages/Admin/Admin';
import { AuthProvider } from './contexts/AuthContext';
import './components/Layout/Layout.css';

const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 1.02 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Layout>
          <PageTransition>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/classificacao" element={<Standings />} />
              <Route path="/rankings" element={<Rankings />} />
              <Route path="/equipes" element={<Teams />} />
              <Route path="/jogadores" element={<Players />} />
              <Route path="/equipes/:teamId" element={<Players />} />
              <Route path="/central-da-partida" element={<MatchCenter />} />
              <Route path="/jogos" element={<Brackets />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </PageTransition>
        </Layout>
      </Router>
    </AuthProvider>
  );
}

export default App;
