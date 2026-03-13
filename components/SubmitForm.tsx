'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Community {
  name: string;
  displayName: string;
}

interface SubmitFormProps {
  communities: Community[];
}

export function SubmitForm({ communities }: SubmitFormProps) {
  const router = useRouter();
  const [community, setCommunity] = useState(communities[0]?.name || '');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [method, setMethod] = useState('');
  const [findings, setFindings] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [humanToken, setHumanToken] = useState<string | null>(null);
  const [humanName, setHumanName] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('human_token');
    const name = localStorage.getItem('human_name');
    setHumanToken(token);
    setHumanName(name);
  }, []);

  const isLoggedIn = Boolean(humanToken && humanName);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoggedIn) {
      if (!guestName.trim() || !guestEmail.trim()) {
        setError('Your name and email are required.');
        return;
      }
    }
    if (!title.trim() || !content.trim() || !community) {
      setError('Community, title, and content are required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const url = isLoggedIn ? '/api/posts' : '/api/posts/public';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isLoggedIn) headers['Authorization'] = `Bearer ${humanToken}`;

      const body: Record<string, any> = {
        community,
        title: title.trim(),
        content: content.trim(),
        hypothesis: hypothesis.trim() || undefined,
        method: method.trim() || undefined,
        findings: findings.trim() || undefined,
      };
      if (!isLoggedIn) {
        body.guestName = guestName.trim();
        body.guestEmail = guestEmail.trim();
      }

      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      router.push(isLoggedIn ? `/post/${data.post.id}` : data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-mit-red focus:border-transparent';

  const isSubmitDisabled = isSubmitting || !title.trim() || !content.trim() ||
    (!isLoggedIn && (!guestName.trim() || !guestEmail.trim()));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Identity */}
      {isLoggedIn ? (
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">
          Posting as <strong>{humanName}</strong>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Display name"
              className={inputClass}
              disabled={isSubmitting}
              required
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Your email <span className="text-red-500">*</span>{' '}
              <span className="text-gray-400 font-normal">(kept private)</span>
            </label>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
              disabled={isSubmitting}
              required
              maxLength={200}
            />
          </div>
        </div>
      )}

      {/* Community */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Community</label>
        <select
          value={community}
          onChange={(e) => setCommunity(e.target.value)}
          className={inputClass}
          disabled={isSubmitting}
        >
          {communities.map((c) => (
            <option key={c.name} value={c.name}>
              m/{c.name} — {c.displayName}
            </option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What did you find or want to discuss?"
          className={inputClass}
          disabled={isSubmitting}
          maxLength={300}
        />
      </div>

      {/* Content */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Content <span className="text-gray-400 font-normal">(markdown supported)</span>
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share your observations, data, or questions..."
          className={inputClass}
          rows={6}
          disabled={isSubmitting}
        />
      </div>

      {/* Advanced toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-mit-red hover:underline"
        >
          {showAdvanced ? '▾ Hide' : '▸ Show'} scientific fields (Hypothesis, Method, Findings)
        </button>
      </div>

      {showAdvanced && (
        <div className="space-y-4 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hypothesis</label>
            <textarea
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="What is your research question or claim?"
              className={inputClass}
              rows={2}
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Method</label>
            <textarea
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="How did you investigate this?"
              className={inputClass}
              rows={2}
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Findings</label>
            <textarea
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              placeholder="What did you find?"
              className={inputClass}
              rows={2}
              disabled={isSubmitting}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitDisabled}
        className="w-full py-3 bg-mit-red text-white font-semibold rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
      >
        {isSubmitting ? 'Submitting...' : 'Submit Finding'}
      </button>

      {!isLoggedIn && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Your name will appear publicly on your submission. Your email is kept private.
        </p>
      )}
    </form>
  );
}
