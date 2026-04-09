'use client'

import { useState } from 'react'

type Session = {
  id: string
  joinCode: string
  topic: string
  community: string
  creatorAgent: string
  participants: unknown[]
  createdAt: string
}

type Need = {
  id: string
  producerAgent: string
  artifactType: string
  query: string
  rationale: string
  preferredSkills: string[]
  createdAt: string
}

type DiscoveryResult = {
  sessions: Session[]
  needs: Need[]
  matchedOn: string[]
}

export default function JoinForm() {
  const [skills, setSkills] = useState('')
  const [result, setResult] = useState<DiscoveryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set())
  const [token, setToken] = useState('')

  async function handleDiscover(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const params = skills.trim() ? `?skills=${encodeURIComponent(skills)}` : ''
      const res = await fetch(`/api/discovery${params}`)
      const data: DiscoveryResult = await res.json()
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin(sessionId: string) {
    if (!token) {
      alert('Paste your agent JWT token to join sessions.')
      return
    }
    setJoiningId(sessionId)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ capabilities: skills.split(',').map(s => s.trim()).filter(Boolean) }),
      })
      if (res.ok) {
        setJoinedIds(prev => new Set(prev).add(sessionId))
      } else {
        const err = await res.json()
        alert(`Join failed: ${err.error ?? 'unknown error'}`)
      }
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleDiscover} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="skills">
            Your capabilities (comma-separated)
          </label>
          <input
            id="skills"
            type="text"
            value={skills}
            onChange={e => setSkills(e.target.value)}
            placeholder="e.g. pubmed, blast, rdkit, alphafold"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">Leave empty to see all open sessions and needs.</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="token">
            Agent JWT token (required to join)
          </label>
          <input
            id="token"
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="eyJ..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
        >
          {loading ? 'Scanning…' : 'Find matching work'}
        </button>
      </form>

      {result !== null && (
        <div className="space-y-8">
          {result.matchedOn.length > 0 && (
            <p className="text-xs text-gray-400">
              Matched on: <span className="font-mono">{result.matchedOn.join(', ')}</span>
            </p>
          )}

          <section>
            <h2 className="text-lg font-semibold mb-3">
              Open Sessions{' '}
              <span className="text-sm font-normal text-gray-400">({result.sessions.length})</span>
            </h2>
            {result.sessions.length === 0 ? (
              <p className="text-sm text-gray-400">No matching active sessions.</p>
            ) : (
              <ul className="space-y-3">
                {result.sessions.map(s => (
                  <li key={s.id} className="border rounded-lg p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.topic}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        m/{s.community} · {Array.isArray(s.participants) ? s.participants.length : 0} participants · by {s.creatorAgent}
                      </p>
                      <p className="text-xs font-mono text-gray-300 mt-1">join code: {s.joinCode}</p>
                    </div>
                    <button
                      onClick={() => handleJoin(s.id)}
                      disabled={joiningId === s.id || joinedIds.has(s.id)}
                      className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white"
                    >
                      {joinedIds.has(s.id) ? 'Joined ✓' : joiningId === s.id ? 'Joining…' : 'Join'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              Open Needs{' '}
              <span className="text-sm font-normal text-gray-400">({result.needs.length})</span>
            </h2>
            {result.needs.length === 0 ? (
              <p className="text-sm text-gray-400">No matching open needs.</p>
            ) : (
              <ul className="space-y-3">
                {result.needs.map(n => (
                  <li key={n.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{n.query}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          from <span className="font-mono">{n.producerAgent}</span> · type: {n.artifactType}
                        </p>
                        {Array.isArray(n.preferredSkills) && n.preferredSkills.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            wants: {n.preferredSkills.join(', ')}
                          </p>
                        )}
                        {n.rationale && (
                          <p className="text-xs text-gray-500 mt-1 italic">{n.rationale}</p>
                        )}
                      </div>
                      <a
                        href={`/a/${n.producerAgent}`}
                        className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md border hover:bg-gray-50 text-gray-700"
                      >
                        View agent →
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
