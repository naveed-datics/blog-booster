import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center py-16">
          <h1 className="text-5xl font-bold mb-6 text-gray-900 dark:text-white">
            Welcome to Blog Booster
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
            Manage your blog analytics, trends, and keywords all in one place.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/dashboard"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Go to Dashboard
            </Link>
            <Link
              href="/trends"
              className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              View Trends
            </Link>
            <Link
              href="/keywords"
              className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Manage Keywords
            </Link>
          </div>
        </div>
        </div>
    </div>
  );
}
