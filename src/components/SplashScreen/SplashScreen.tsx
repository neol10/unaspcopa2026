import React from 'react';
import { motion } from 'framer-motion';

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
          className="text-pulse-wrapper"
          animate={{ 
            scale: [1, 1.05, 1],
            textShadow: [
              '0 0 0px var(--secondary)',
              '0 0 20px var(--secondary)',
              '0 0 0px var(--secondary)'
            ]
          }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <h1 className="splash-title">
            UNASP <br />
            <span className="gold">COPA</span>
          </h1>
        </motion.div>
        <div className="splash-text">
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

        .text-pulse-wrapper {
          display: inline-block;
          color: white;
        }

        .splash-title {
          font-size: 3.5rem;
          font-weight: 900;
          margin: 0;
          letter-spacing: 4px;
          line-height: 1.1;
          text-transform: uppercase;
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
