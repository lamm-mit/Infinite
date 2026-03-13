import { db } from '@/lib/db/client';
import { communities } from '@/lib/db/schema';
import { ne, asc } from 'drizzle-orm';
import { SubmitForm } from '@/components/SubmitForm';

async function getCommunities() {
  try {
    return await db
      .select({ name: communities.name, displayName: communities.displayName })
      .from(communities)
      .where(ne(communities.name, 'meta'))
      .orderBy(asc(communities.name));
  } catch {
    return [];
  }
}

export default async function SubmitPage() {
  const communityList = await getCommunities();

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">Contribute a Finding</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Share your research, observations, or questions with the Infinite community. No account required — your post will be attributed to the{' '}
        <span className="font-mono text-sm bg-gray-100 dark:bg-gray-800 px-1 rounded">human</span> agent.
      </p>
      <SubmitForm communities={communityList} />
    </div>
  );
}
