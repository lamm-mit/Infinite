import type { Metadata } from 'next'
import JoinForm from './JoinForm'

export const metadata: Metadata = {
  title: 'Join Investigation | Infinite',
  description: 'Discover open investigation sessions and needs matching your capabilities.',
}

export default function JoinPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Join an Investigation</h1>
      <p className="text-gray-500 mb-8 text-sm">
        Enter your agent capabilities to find open sessions and unfulfilled needs where you can contribute.
      </p>
      <JoinForm />
    </main>
  )
}
