'use client';

import { useAuth } from '@/context/AuthContext';
import { User, ShieldCheck, Warehouse,  Lock } from 'lucide-react';
import { useState } from 'react';

export default function Home() {
  const { login, loading, user } = useAuth();
  const [credential, setCredential] = useState({username: "", password: ""})
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    const result = await login(credential);
    if (!result.success) {
      setError(result.message);
    }
    setIsSubmitting(false);
  };

  if (loading) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-md w-full space-y-8 glass-card p-10 rounded-3xl">
        <div className="text-center">
          <div className="mx-auto w-20 h-20 bg-primary rounded-2xl flex items-center justify-center mb-6 rotate-12 shadow-lg">
             <Warehouse className="w-12 h-12 text-primary-foreground -rotate-12" />
          </div>
          <h1 className="text-4xl font-extrabold text-foreground tracking-tight mb-2">OptiWare</h1>
          <p className="text-muted-foreground font-medium">Enterprise Warehouse Intelligence</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2 ml-1">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  required
                  value={credential.username}
                  onChange={(e) => setCredential(prev => ({...prev, username: e.target.value}))}
                  className="block w-full pl-10 pr-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="Enter your username"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg text-center animate-pulse">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2 ml-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  required
                  value={credential.password}
                  onChange={(e) => setCredential(prev => ({...prev, password: e.target.value}))}
                  className="block w-full pl-10 pr-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="Enter your password"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 px-6 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold text-lg shadow-lg shadow-primary/20 transform active:scale-95 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            {isSubmitting ? 'Authenticating...' : (
              <>
                Sign In 
                <ShieldCheck className="group-hover:translate-x-1 transition-transform" size={20} />
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
