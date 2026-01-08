"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit, Check, X } from "lucide-react";

export default function AddWebsitePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [websites, setWebsites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState(null);

  // Form state
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [websiteName, setWebsiteName] = useState("");
  const [description, setDescription] = useState("");
  const [niche, setNiche] = useState("");
  const [sitemap, setSitemap] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");

  // Edit form state
  const [editForm, setEditForm] = useState({
    website_url: "",
    api_key: "",
    website_name: "",
    description: "",
    niche: "",
    sitemap: "",
    prompt_template: "",
    is_active: true,
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    } else if (status === "authenticated") {
      fetchWebsites();
    }
  }, [status, router]);

  // Handle edit parameter from URL
  useEffect(() => {
    if (websites.length > 0) {
      const urlParams = new URLSearchParams(window.location.search);
      const editId = urlParams.get('edit');
      if (editId && !editingId) {
        const websiteToEdit = websites.find(w => w.id === parseInt(editId));
        if (websiteToEdit) {
          handleEdit(websiteToEdit);
        }
      }
    }
  }, [websites]);

  const fetchWebsites = async () => {
    try {
      setFetching(true);
      const response = await fetch("/api/websites");
      if (!response.ok) {
        throw new Error("Failed to fetch websites");
      }
      const data = await response.json();
      setWebsites(data.websites || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/websites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          website_url: websiteUrl,
          api_key: apiKey,
          website_name: websiteName,
          description: description,
          niche: niche,
          sitemap: sitemap,
          prompt_template: promptTemplate,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add website");
      }

      setSuccess("Website added successfully!");
      resetForm();
      fetchWebsites();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this website?")) {
      return;
    }

    try {
      const response = await fetch(`/api/websites/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete website");
      }

      setSuccess("Website deleted successfully!");
      fetchWebsites();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (website) => {
    setEditingId(website.id);
    setEditForm({
      website_url: website.website_url,
      api_key: website.api_key || "",
      website_name: website.website_name || "",
      description: website.description || "",
      niche: website.niche || "",
      sitemap: website.sitemap || "",
      prompt_template: website.prompt_template || "",
      is_active: website.is_active,
    });
  };

  const handleUpdate = async (id) => {
    try {
      const response = await fetch(`/api/websites/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editForm),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update website");
      }

      setSuccess("Website updated successfully!");
      setEditingId(null);
      fetchWebsites();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setWebsiteUrl("");
    setApiKey("");
    setWebsiteName("");
    setDescription("");
    setNiche("");
    setSitemap("");
    setPromptTemplate("");
  };

  if (status === "loading" || fetching) {
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

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Manage Websites</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Add and manage your website connections with API keys.
        </p>

        {/* Add Website Form */}
        {!editingId && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add New Website
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="website_url">Website URL *</Label>
                <Input
                  id="website_url"
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website_name">Website Name</Label>
                <Input
                  id="website_name"
                  type="text"
                  value={websiteName}
                  onChange={(e) => setWebsiteName(e.target.value)}
                  placeholder="My Website"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_key">API Key</Label>
              <Input
                id="api_key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter API key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="niche">Niche</Label>
              <Input
                id="niche"
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g., Religion, Technology, Health"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt_template">LLM Prompt Template</Label>
              <textarea
                id="prompt_template"
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                placeholder="Enter custom prompt template for blog writing. Use ${celebrityName} and ${blogText} as placeholders."
                rows={10}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Leave empty to use default template. Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">${`{celebrityName}`}</code> and <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">${`{blogText}`}</code> as placeholders.
              </p>
            </div>
            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-700 text-green-700 dark:text-green-400 rounded-lg text-sm">
                {success}
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full md:w-auto">
              {loading ? "Adding..." : "Add Website"}
            </Button>
          </form>
          </div>
        )}

        {/* Websites List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Your Websites</h2>
          {websites.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400 text-center py-8">
              No websites added yet. Add your first website above.
            </p>
          ) : (
            <div className="space-y-4">
              {websites.map((website) => (
                <div
                  key={website.id}
                  className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  {editingId === website.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label>Website URL</Label>
                          <Input
                            value={editForm.website_url}
                            onChange={(e) =>
                              setEditForm({ ...editForm, website_url: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label>Website Name</Label>
                          <Input
                            value={editForm.website_name}
                            onChange={(e) =>
                              setEditForm({ ...editForm, website_name: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <Label>API Key</Label>
                        <Input
                          type="password"
                          value={editForm.api_key}
                          onChange={(e) =>
                            setEditForm({ ...editForm, api_key: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input
                          value={editForm.description}
                          onChange={(e) =>
                            setEditForm({ ...editForm, description: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>Niche</Label>
                        <Input
                          value={editForm.niche}
                          onChange={(e) =>
                            setEditForm({ ...editForm, niche: e.target.value })
                          }
                          placeholder="e.g., Religion, Technology, Health"
                        />
                      </div>
                      <div>
                        <Label>Sitemap URL</Label>
                        <Input
                          type="url"
                          value={editForm.sitemap}
                          onChange={(e) =>
                            setEditForm({ ...editForm, sitemap: e.target.value })
                          }
                          placeholder="https://example.com/sitemap.xml"
                        />
                      </div>
                      <div>
                        <Label>LLM Prompt Template</Label>
                        <textarea
                          value={editForm.prompt_template}
                          onChange={(e) =>
                            setEditForm({ ...editForm, prompt_template: e.target.value })
                          }
                          placeholder="Enter custom prompt template for blog writing. Use ${celebrityName} and ${blogText} as placeholders."
                          rows={10}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Leave empty to use default template. Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">${`{celebrityName}`}</code> and <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">${`{blogText}`}</code> as placeholders.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`active-${website.id}`}
                          checked={editForm.is_active}
                          onChange={(e) =>
                            setEditForm({ ...editForm, is_active: e.target.checked })
                          }
                          className="w-4 h-4"
                        />
                        <Label htmlFor={`active-${website.id}`}>Active</Label>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleUpdate(website.id)}
                          size="sm"
                          className="flex items-center gap-2"
                        >
                          <Check className="h-4 w-4" />
                          Save
                        </Button>
                        <Button
                          onClick={() => setEditingId(null)}
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2"
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                          {website.website_name || website.website_url}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {website.website_url}
                        </p>
                        {website.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                            {website.description}
                          </p>
                        )}
                        {website.niche && (
                          <div className="mt-2">
                            <span className="px-2 py-1 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded">
                              {website.niche}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            API Key: {website.api_key ? "••••••••" : "Not set"}
                          </span>
                          <span
                            className={`${
                              website.is_active
                                ? "text-green-600 dark:text-green-400"
                                : "text-gray-400"
                            }`}
                          >
                            {website.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleEdit(website)}
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2"
                        >
                          <Edit className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          onClick={() => handleDelete(website.id)}
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2 text-red-600 dark:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

