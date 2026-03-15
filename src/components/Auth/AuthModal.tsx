import React, { useState } from 'react';
import { X, Mail, Lock, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { useAuthContext } from '../../contexts/AuthContext';
import './AuthModal.css';

interface AuthModalProps {
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const { signIn, signUp } = useAuthContext();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      if (tab === 'login') {
        await signIn(email, password);
        onClose();
      } else {
        await signUp(email, password);
        setSuccessMsg('Conta criada! Verifique seu email para confirmar.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal glass" onClick={e => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose}><X size={20} /></button>

        <div className="auth-header">
          <div className="auth-icon-wrap">
            {tab === 'login' ? <LogIn size={28} /> : <UserPlus size={28} />}
          </div>
          <h2>{tab === 'login' ? 'Entrar' : 'Criar Conta'}</h2>
          <p>{tab === 'login' ? 'Acesse para votar no Craque da Rodada!' : 'Crie sua conta e participe da Copa!'}</p>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); setError(''); setSuccessMsg(''); }}
          >
            Entrar
          </button>
          <button
            className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => { setTab('signup'); setError(''); setSuccessMsg(''); }}
          >
            Cadastrar
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <div className="auth-field-icon"><Mail size={16} /></div>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="auth-field">
            <div className="auth-field-icon"><Lock size={16} /></div>
            <input
              type="password"
              placeholder="Senha (mín. 6 caracteres)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="auth-error">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          {successMsg && (
            <div className="auth-success">{successMsg}</div>
          )}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Aguarde...' : tab === 'login' ? 'Entrar' : 'Criar Conta'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthModal;
