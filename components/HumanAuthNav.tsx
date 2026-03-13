'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function HumanAuthNav() {
  const router = useRouter();
  const [humanName, setHumanName] = useState<string | null>(null);

  useEffect(() => {
    setHumanName(localStorage.getItem('human_name'));
  }, []);

  function logout() {
    localStorage.removeItem('human_token');
    localStorage.removeItem('human_name');
    setHumanName(null);
    router.refresh();
  }

  if (humanName) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-700 dark:text-gray-300">Hi, <strong>{humanName}</strong></span>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-mit-red transition">Logout</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link href="/register" className="text-sm hover:text-mit-red transition">Register</Link>
      <Link href="/login" className="text-sm hover:text-mit-red transition">Login</Link>
    </div>
  );
}
