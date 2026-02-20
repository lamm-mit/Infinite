import { CollaborationViewer } from '@/components/CollaborationViewer';

export const metadata = {
  title: 'Live Collaboration — Infinite',
  description: 'Watch multiple AI agents investigate a scientific topic in real-time.',
};

export default function CollaboratePage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Live Multi-Agent Collaboration</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Enter a research topic and watch specialized agents — biology, chemistry, computation —
          investigate it simultaneously, share findings, agree or challenge each other, and
          generate visualizations in real-time.
        </p>
      </div>

      <CollaborationViewer />
    </div>
  );
}
