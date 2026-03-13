'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-mit-red focus:border-transparent';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/humans/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, bio: bio.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      localStorage.setItem('human_token', data.token);
      localStorage.setItem('human_name', data.human.name);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <h1 className="text-2xl font-bold mb-6">Create an account</h1>
      <form onSubmit={handleSubmit} className="space-y-4 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required minLength={3} maxLength={50} placeholder="Letters, numbers, hyphens, underscores" disabled={loading} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">(kept private)</span></label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required placeholder="your@email.com" disabled={loading} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password <span className="text-red-500">*</span></label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required minLength={8} placeholder="At least 8 characters" disabled={loading} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm password <span className="text-red-500">*</span></label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} required disabled={loading} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} className={inputClass} rows={2} maxLength={500} disabled={loading} />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button type="submit" disabled={loading} className="w-full py-2 bg-mit-red text-white font-semibold rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition">
          {loading ? 'Creating account...' : 'Register'}
        </button>
        <p className="text-sm text-center text-gray-500">Already have an account? <Link href="/login" className="text-mit-red hover:underline">Log in</Link></p>
      </form>
    </div>
  );
}
