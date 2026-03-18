import React from 'react';
import { motion } from 'framer-motion';
import logo from '../../assets/unasp_logo.png';

const SplashScreen: React.FC = () => {
  return (
    <div className="splash-screen">
      <motion.div 
        className="splash-content"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <motion.div 
          className="logo-wrapper"
          animate={{ 
            y: [0, -10, 0],
            scale: [1, 1.05, 1],
            filter: [
              'drop-shadow(0 0 0px var(--secondary))',
              'drop-shadow(0 0 20px var(--secondary))',
              'drop-shadow(0 0 0px var(--secondary))'
            ]
          }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <img src={logo} alt="Copa UNASP 2026" className="splash-logo" />
        </motion.div>
        <div className="splash-text">
          <h1 className="text-gradient">COPA <span className="gold">2026</span></h1>
          <div className="loading-bar-container">
            <motion.div 
              className="loading-bar"
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 2, ease: "easeInOut" }}
            />
          </div>
          <p>Preparando a Arena...</p>
        </div>
      </motion.div>

      <style>{`
        .splash-screen {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: #010204;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          overflow: hidden;
        }

        .splash-content {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
        }

        .splash-logo {
          width: 100px;
          height: 100px;
          object-fit: contain;
        }

        .splash-text h1 {
          font-size: 2.5rem;
          font-weight: 900;
          margin: 0;
          letter-spacing: 4px;
        }

        .gold {
          color: var(--secondary);
          -webkit-text-fill-color: var(--secondary);
        }

        .loading-bar-container {
          width: 200px;
          height: 4px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 2px;
          margin: 1.5rem auto 1rem;
          overflow: hidden;
        }

        .loading-bar {
          height: 100%;
          background: linear-gradient(90deg, var(--vibrant-green), var(--secondary), var(--vibrant-red));
          box-shadow: 0 0 10px var(--secondary);
        }

        .splash-text p {
          color: var(--text-dim);
          font-size: 0.9rem;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin: 0;
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;
