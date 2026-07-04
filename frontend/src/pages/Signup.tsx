import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../store/index.js';
import { apiClient } from '../api/client.js';
import { Activity, Lock, Mail, User, ArrowRight } from 'lucide-react';

export const Signup: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await apiClient.post('/auth/register', { name, email, password });
      login(response.data);
      navigate('/');
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message || 'Registration failed. Try a different email.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute w-[400px] h-[400px] bg-brandPrimary/10 rounded-full blur-[100px] top-[-50px] left-[-50px]"></div>
      <div className="absolute w-[400px] h-[400px] bg-brandSecondary/10 rounded-full blur-[100px] bottom-[-50px] right-[-50px]"></div>

      <div className="w-full max-w-md glass rounded-2xl p-8 shadow-2xl relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-tr from-brandPrimary to-brandSecondary rounded-xl flex items-center justify-center shadow-lg shadow-brandPrimary/20 mb-3 animate-pulse">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-3xl font-extrabold text-white font-montserrat">Create Account</h2>
          <p className="text-gray-400 mt-2 text-sm">Join to scale your asynchronous pipelines</p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 text-red-200 rounded-lg p-3 text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full bg-[#0a0f1d] border border-gray-800 rounded-lg py-3 pl-11 pr-4 text-white focus:outline-none focus:border-brandPrimary transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#0a0f1d] border border-gray-800 rounded-lg py-3 pl-11 pr-4 text-white focus:outline-none focus:border-brandPrimary transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full bg-[#0a0f1d] border border-gray-800 rounded-lg py-3 pl-11 pr-4 text-white focus:outline-none focus:border-brandPrimary transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-brandPrimary to-brandSecondary hover:from-brandPrimary/90 hover:to-brandSecondary/90 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-brandPrimary/20 transition-all transform hover:scale-[1.01]"
          >
            {isSubmitting ? 'Registering...' : 'Get Started'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brandPrimary hover:underline font-semibold">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};
export default Signup;
