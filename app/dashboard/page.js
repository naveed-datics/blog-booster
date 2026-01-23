'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Globe, Plus, ExternalLink, Key, Calendar, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [websites, setWebsites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated') {
      fetchWebsites();
    }
  }, [status, router]);

  const fetchWebsites = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/websites');
      if (!response.ok) {
        throw new Error('Failed to fetch websites');
      }
      const data = await response.json();
      setWebsites(data.websites || []);
    } catch (err) {
      console.error('Error fetching websites:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Welcome back, <span className="font-semibold">{session?.user?.name || session?.user?.email}</span>!
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div className="text-sm">
                <p className="font-semibold text-blue-900 dark:text-blue-100">{session?.user?.name || 'User'}</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">{session?.user?.email}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Websites Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Globe className="h-6 w-6" />
              Your Websites
            </h2>
            <Link href="/add-website">
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add New
              </Button>
            </Link>
          </div>

          {websites.length === 0 ? (
            <div className="text-center py-12">
              <Globe className="h-16 w-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No websites yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Get started by adding your first website connection.
              </p>
              <Link href="/add-website">
                <Button className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Your First Website
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {websites.map((website) => (
                <div
                  key={website.id}
                  className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg transition-shadow bg-gray-50 dark:bg-gray-900/50"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                        {website.website_name || 'Unnamed Website'}
                      </h3>
                      <a
                        href={website.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        {website.website_url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        website.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {website.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {website.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      {website.description}
                    </p>
                  )}

                  {website.niche && (
                    <div className="mb-3">
                      <span className="px-2 py-1 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded">
                        {website.niche}
                      </span>
                    </div>
                  )}

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <Key className="h-3 w-3" />
                      <span>API Key: {website.api_key ? '••••••••' : 'Not set'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <Calendar className="h-3 w-3" />
                      <span>Added: {formatDate(website.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link href={`/add-website?edit=${website.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full flex items-center justify-center gap-2">
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                    </Link>
                    <Link href={`/ai-dashboard/${website.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        AI Dashboard
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

