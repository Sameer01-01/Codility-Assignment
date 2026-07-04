import React, { useEffect, useState } from 'react';
import { useAuth } from '../store/index.js';
import { apiClient } from '../api/client.js';
import { Play, Pause, Trash2, Plus, Sliders, Loader2, Info } from 'lucide-react';

interface Queue {
  id: string;
  name: string;
  priority: number;
  concurrencyLimit: number;
  status: 'ACTIVE' | 'PAUSED';
  retryPolicyId?: string | null;
  retryPolicy?: {
    name: string;
    strategy: string;
    baseDelayMs: number;
    maxRetries: number;
  } | null;
  _count?: {
    jobs: number;
  };
}

const Tooltip: React.FC<{ text: string }> = ({ text }) => (
  <span className="relative group/tip inline-flex ml-1 cursor-help">
    <Info className="w-3.5 h-3.5 text-gray-600 hover:text-brandPrimary transition-colors" />
    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 border border-gray-700 text-xs text-gray-300 rounded-lg shadow-xl whitespace-normal w-56 text-center opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 pointer-events-none">
      {text}
    </span>
  </span>
);

export const QueueDetail: React.FC = () => {
  const { activeProject } = useAuth();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Creation States
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(0);
  const [concurrencyLimit, setConcurrencyLimit] = useState(5);
  const [retryPolicyId, setRetryPolicyId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeProject) {
      fetchQueues();
    }
  }, [activeProject]);

  const fetchQueues = async () => {
    setIsLoading(true);
    try {
      const queuesRes = await apiClient.get(`/queues?projectId=${activeProject?.id}`);
      setQueues(queuesRes.data);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch queues');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setError(null);

    try {
      const res = await apiClient.post('/queues', {
        projectId: activeProject.id,
        name,
        priority: Number(priority),
        concurrencyLimit: Number(concurrencyLimit),
        retryPolicyId: retryPolicyId === '' ? null : retryPolicyId,
      });

      setQueues((prev) => [...prev, res.data]);
      setName('');
      setPriority(0);
      setConcurrencyLimit(5);
      setRetryPolicyId('');
      setIsCreating(false);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create queue');
    }
  };

  const toggleQueueStatus = async (queue: Queue) => {
    const newStatus = queue.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      const res = await apiClient.put(`/queues/${queue.id}`, {
        status: newStatus,
      });
      setQueues((prev) =>
        prev.map((q) => (q.id === queue.id ? { ...q, status: res.data.status } : q))
      );
    } catch (err) {
      console.error('Failed to toggle status', err);
    }
  };

  const handleDeleteQueue = async (queueId: string) => {
    if (!confirm('Are you sure you want to delete this queue? This will delete all jobs in it.')) {
      return;
    }

    try {
      await apiClient.delete(`/queues/${queueId}`);
      setQueues((prev) => prev.filter((q) => q.id !== queueId));
    } catch (err) {
      console.error('Failed to delete queue', err);
    }
  };

  if (!activeProject) {
    return (
      <div className="glass p-12 rounded-2xl text-center border border-gray-800">
        <Sliders className="w-12 h-12 mx-auto mb-3 text-gray-600 stroke-[1.5]" />
        <h3 className="text-lg font-bold text-white mb-2">No Project Selected</h3>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          Queues belong to a project. Go to the <span className="text-brandPrimary font-semibold">Projects</span> page and select or create one first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white font-montserrat tracking-tight">Queues</h1>
          <p className="text-gray-400 mt-1">
            Active project: <span className="text-brandPrimary font-semibold">{activeProject.name}</span>
            <Tooltip text="A queue is a named processing channel. Jobs enter a queue and are picked up by workers in priority order. Each queue has its own concurrency limit." />
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="bg-gradient-to-r from-brandPrimary to-brandSecondary hover:opacity-90 text-white font-semibold py-2.5 px-4 rounded-lg flex items-center gap-2 shadow-lg shadow-brandPrimary/10 transition-all"
        >
          <Plus className="w-4 h-4" />
          Create Queue
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 text-red-200 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* Create Queue Form */}
      {isCreating && (
        <div className="glass p-6 rounded-2xl border border-gray-800 space-y-4">
          <h3 className="text-lg font-bold text-white">Create New Queue</h3>
          <form onSubmit={handleCreateQueue} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Queue Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. email-delivery-queue"
                className="w-full bg-[#0a0f1d] border border-gray-800 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-brandPrimary transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Priority
                <Tooltip text="Higher number = processed first. A job with priority 10 will be picked up before a job with priority 0." />
              </label>
              <input
                type="number"
                required
                min={0}
                max={100}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full bg-[#0a0f1d] border border-gray-800 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-brandPrimary transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Concurrency Limit
                <Tooltip text="Maximum number of jobs this queue can run simultaneously across all workers. Prevents overloading downstream services." />
              </label>
              <input
                type="number"
                required
                min={1}
                max={1000}
                value={concurrencyLimit}
                onChange={(e) => setConcurrencyLimit(Number(e.target.value))}
                className="w-full bg-[#0a0f1d] border border-gray-800 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-brandPrimary transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Retry Policy ID (Optional)
                <Tooltip text="Links this queue to a retry policy that defines what happens when a job fails — Fixed, Linear, or Exponential backoff delays." />
              </label>
              <input
                type="text"
                value={retryPolicyId}
                onChange={(e) => setRetryPolicyId(e.target.value)}
                placeholder="Leave blank for defaults"
                className="w-full bg-[#0a0f1d] border border-gray-800 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-brandPrimary transition-colors"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-gradient-to-r from-brandPrimary to-brandSecondary text-white font-semibold py-2 px-6 rounded-lg hover:opacity-90 transition-opacity"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-10 h-10 animate-spin text-brandPrimary mb-2" />
          <p>Loading queues...</p>
        </div>
      ) : queues.length === 0 ? (
        <div className="glass p-16 rounded-2xl text-center text-gray-400 border border-gray-800">
          <Sliders className="w-16 h-16 mx-auto mb-4 text-gray-600 stroke-[1.5]" />
          <h3 className="text-xl font-bold text-white mb-2">No queues yet</h3>
          <p className="mb-2 max-w-md mx-auto">
            Queues are processing lanes for your jobs. Each queue can have its own concurrency limit and retry policy.
          </p>
          <p className="text-xs text-gray-500 mb-6">Create a queue, then submit jobs to it via the <code className="text-brandPrimary">POST /jobs</code> API endpoint.</p>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-gray-800 hover:bg-gray-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors border border-gray-700"
          >
            Create Queue
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {queues.map((queue) => {
            const isPaused = queue.status === 'PAUSED';
            return (
              <div
                key={queue.id}
                className="glass p-6 rounded-2xl border border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-gray-700 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-white font-montserrat">{queue.name}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${
                        isPaused
                          ? 'bg-amber-900/20 text-amber-400 border-amber-500/30'
                          : 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {queue.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">ID: {queue.id}</p>
                  
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-400 pt-2">
                    <div>
                      Priority:{' '}
                      <span className="text-white font-semibold">{queue.priority}</span>
                      <Tooltip text="Higher priority queues are processed first when workers poll for available jobs." />
                    </div>
                    <div>
                      Concurrency Limit:{' '}
                      <span className="text-white font-semibold">{queue.concurrencyLimit}</span>
                      <Tooltip text="Max simultaneous jobs allowed across all workers for this queue." />
                    </div>
                    <div>
                      Retry Policy:{' '}
                      <span className="text-white font-semibold">
                        {queue.retryPolicy?.name || 'Default (Fixed / 3 Retries)'}
                      </span>
                      <Tooltip text="Defines how failed jobs are retried: Fixed delay, Linear increase, or Exponential backoff." />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleQueueStatus(queue)}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 text-sm font-semibold transition-all ${
                      isPaused
                        ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-950/40'
                        : 'bg-amber-900/20 text-amber-400 border-amber-500/30 hover:bg-amber-950/40'
                    }`}
                  >
                    {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    {isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    onClick={() => handleDeleteQueue(queue.id)}
                    className="p-2.5 rounded-xl bg-red-900/20 text-red-400 border border-red-500/30 hover:bg-red-950/40 transition-colors"
                    title="Delete Queue"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default QueueDetail;
