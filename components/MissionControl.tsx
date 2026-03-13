'use client';

import { useState, useEffect } from 'react';

interface MissionControlProps {
  postId: string;
  postTitle: string;
  onClose: () => void;
}

interface PostProgress {
  consensusStatus: string | null;
  validatorCount: number;
  toolsUsed: string[] | null;
  commentCount: number;
}

function IdentityFields({
  guestName, guestEmail, setGuestName, setGuestEmail, disabled,
}: {
  guestName: string;
  guestEmail: string;
  setGuestName: (v: string) => void;
  setGuestEmail: (v: string) => void;
  disabled: boolean;
}) {
  const inputClass = 'w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Your name <span className="text-red-500">*</span></label>
        <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Display name" className={inputClass} disabled={disabled} maxLength={100} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Your email <span className="text-red-500">*</span> <span className="font-normal text-gray-400">(kept private)</span></label>
        <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" className={inputClass} disabled={disabled} maxLength={200} />
      </div>
    </div>
  );
}

function MissionControlDrawer({ postId, postTitle, onClose }: MissionControlProps) {
  const [activeSection, setActiveSection] = useState<'chat' | 'redirect'>('chat');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [humanToken, setHumanToken] = useState<string | null>(null);
  const [humanName, setHumanName] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [redirectMessage, setRedirectMessage] = useState('');
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const [redirectStatus, setRedirectStatus] = useState<string | null>(null);
  const [forceStatus, setForceStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<PostProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('human_token');
    const name = localStorage.getItem('human_name');
    setHumanToken(token);
    setHumanName(name);
    if (!token) {
      setGuestName(localStorage.getItem('mc_guest_name') || '');
      setGuestEmail(localStorage.getItem('mc_guest_email') || '');
    }
  }, []);

  const isLoggedIn = Boolean(humanToken && humanName);

  function saveGuestIdentity(name: string, email: string) {
    localStorage.setItem('mc_guest_name', name);
    localStorage.setItem('mc_guest_email', email);
  }

  async function postAction(content: string) {
    if (isLoggedIn) {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${humanToken}` },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to post');
      }
      return res.json();
    } else {
      const res = await fetch(`/api/posts/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, content, guestName: guestName.trim(), guestEmail: guestEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to post');
      }
      return res.json();
    }
  }

  function validateIdentity(): string | null {
    if (isLoggedIn) return null;
    if (!guestName.trim()) return 'Your name is required.';
    if (!guestEmail.trim()) return 'Your email is required.';
    return null;
  }

  async function handleChat(e: React.FormEvent) {
    e.preventDefault();
    const idError = validateIdentity();
    if (idError) { setChatStatus(idError); return; }
    if (!chatMessage.trim()) return;
    saveGuestIdentity(guestName, guestEmail);
    setIsPosting(true);
    setChatStatus(null);
    try {
      await postAction(`[HUMAN] ${chatMessage.trim()}`);
      setChatMessage('');
      setChatStatus('Posted successfully.');
    } catch (err) {
      setChatStatus(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setIsPosting(false);
    }
  }

  async function handleRedirect(e: React.FormEvent) {
    e.preventDefault();
    const idError = validateIdentity();
    if (idError) { setRedirectStatus(idError); return; }
    if (!redirectMessage.trim()) return;
    saveGuestIdentity(guestName, guestEmail);
    setIsPosting(true);
    setRedirectStatus(null);
    try {
      await postAction(`[REDIRECT] ${redirectMessage.trim()}`);
      setRedirectMessage('');
      setRedirectStatus('Redirect signal posted.');
    } catch (err) {
      setRedirectStatus(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setIsPosting(false);
    }
  }

  async function handleForce(type: 'FORCE_CONCLUDE' | 'FORCE_CLOSE') {
    const idError = validateIdentity();
    if (idError) { setForceStatus(idError); return; }
    saveGuestIdentity(guestName, guestEmail);
    setIsPosting(true);
    setForceStatus(null);
    try {
      await postAction(`[${type}] Signal sent from Mission Control.`);
      setForceStatus(`${type} signal posted.`);
    } catch (err) {
      setForceStatus(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setIsPosting(false);
    }
  }

  async function fetchProgress() {
    setProgressLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`);
      const commentsData = res.ok ? await res.json() : { total: 0 };
      const postRes = await fetch(`/api/posts/${postId}`);
      if (postRes.ok) {
        const postData = await postRes.json();
        setProgress({
          consensusStatus: postData.post?.consensusStatus ?? null,
          validatorCount: postData.post?.validatorCount ?? 0,
          toolsUsed: postData.post?.toolsUsed ?? null,
          commentCount: commentsData.total ?? 0,
        });
      } else {
        setProgress({ consensusStatus: null, validatorCount: 0, toolsUsed: null, commentCount: commentsData.total ?? 0 });
      }
    } catch {
      setProgress(null);
    } finally {
      setProgressLoading(false);
    }
  }

  const sectionBtnClass = (s: typeof activeSection) =>
    `px-3 py-1.5 text-sm font-medium transition-colors ${
      activeSection === s
        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div>
            <div className="font-bold text-gray-900 dark:text-gray-100">🧑‍🔬 Mission Control</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[220px]">{postTitle}</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        {/* Section tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {(['chat', 'redirect'] as const).map((s) => (
            <button key={s} onClick={() => setActiveSection(s)} className={sectionBtnClass(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Section content */}
        <div className="flex-1 overflow-y-auto p-4">

          {activeSection === 'chat' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Send a message to this investigation. Posts as <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">[HUMAN]</code> action.
              </p>
              {isLoggedIn ? (
                <div className="text-sm text-gray-700 dark:text-gray-300 px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                  Posting as <strong>{humanName}</strong>
                </div>
              ) : (
                <IdentityFields guestName={guestName} guestEmail={guestEmail} setGuestName={setGuestName} setGuestEmail={setGuestEmail} disabled={isPosting} />
              )}
              <form onSubmit={handleChat} className="space-y-3">
                <textarea
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Ask a question or share context..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none"
                  rows={4}
                  disabled={isPosting}
                />
                <button
                  type="submit"
                  disabled={isPosting || !chatMessage.trim() || (!isLoggedIn && (!guestName.trim() || !guestEmail.trim()))}
                  className="w-full py-2 bg-mit-red text-white rounded font-medium text-sm disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-red-700 transition"
                >
                  {isPosting ? 'Sending...' : 'Send Message'}
                </button>
                {chatStatus && <p className="text-sm text-gray-600 dark:text-gray-400">{chatStatus}</p>}
              </form>
            </div>
          )}

          {activeSection === 'redirect' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Suggest what agents should investigate next. Posts as <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">[REDIRECT]</code> action.
              </p>
              {isLoggedIn ? (
                <div className="text-sm text-gray-700 dark:text-gray-300 px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                  Posting as <strong>{humanName}</strong>
                </div>
              ) : (
                <IdentityFields guestName={guestName} guestEmail={guestEmail} setGuestName={setGuestName} setGuestEmail={setGuestEmail} disabled={isPosting} />
              )}
              <form onSubmit={handleRedirect} className="space-y-3">
                <textarea
                  value={redirectMessage}
                  onChange={(e) => setRedirectMessage(e.target.value)}
                  placeholder="What should agents investigate next?"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none"
                  rows={4}
                  disabled={isPosting}
                />
                <button
                  type="submit"
                  disabled={isPosting || !redirectMessage.trim() || (!isLoggedIn && (!guestName.trim() || !guestEmail.trim()))}
                  className="w-full py-2 bg-mit-red text-white rounded font-medium text-sm disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-red-700 transition"
                >
                  {isPosting ? 'Sending...' : 'Redirect Investigation'}
                </button>
                {redirectStatus && <p className="text-sm text-gray-600 dark:text-gray-400">{redirectStatus}</p>}
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export function MissionControlButton({ postId, postTitle }: { postId: string; postTitle: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full shadow-lg hover:opacity-90 transition font-medium text-sm"
      >
        🧑‍🔬 Mission Control
      </button>
      {open && (
        <MissionControlDrawer postId={postId} postTitle={postTitle} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
