import React, { useEffect, useState } from 'react';
import { useAuth } from '../store/index.js';
import { apiClient } from '../api/client.js';
import { ShieldAlert, Play, RefreshCw, Terminal, ChevronRight, Eye, Loader2 } from 'lucide-react';

interface DeadLetter {
  id: string;
  jobId: string;
  reason: string;
  failedAt: string;
  originalPayload: any;
  job: {
    id: string;
    type: string;
    queue: {
      id: string;
      name: string;
    };
  };
}

export const DeadLetterQueue: React.FC = () => {
  const { activeProject } = useAuth();
  const [entries, setEntries] = useState<DeadLetter[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<DeadLetter | null>(null);

  useEffect(() => {
    if (activeProject) {
      fetchDLQ();
    }
  }, [activeProject, page]);

  const fetchDLQ = async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const res = await apiClient.get(`/jobs/dead-letter/list?projectId=${activeProject.id}&page=${page}&limit=10`);
      setEntries(res.data.entries);
      setTotalPages(res.data.pagination.pages);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      await apiClient.post(`/jobs/${jobId}/retry`);
      // Remove from list
      setEntries((prev) => prev.filter((entry) => entry.jobId !== jobId));
      if (selectedEntry && selectedEntry.jobId === jobId) {
        setSelectedEntry(null);
      }
    } catch (err) {
      console.error('Failed to retry job', err);
    }
  };

  if (!activeProject) {
    return (
      <div className="p-8 text-center text-gray-400">
        Please select a project to manage its Dead Letter Queue.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white font-montserrat tracking-tight">Dead Letter Queue</h1>
          <p className="text-gray-400 mt-1">Triaging exhausted job tasks and retrying transaction pipelines</p>
        </div>
        <button
          onClick={fetchDLQ}
          className="p-2.5 bg-[#0a0f1d] border border-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-10 h-10 animate-spin text-brandPrimary mb-2" />
          <p>Fetching dead letter items...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="glass p-16 rounded-2xl text-center text-gray-400 border border-gray-800">
          <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-emerald-500 stroke-[1.5]" />
          <h3 className="text-xl font-bold text-white mb-2">Dead Letter Queue is empty</h3>
          <p>Excellent! All scheduled and retried tasks are processing normally without exhaustion.</p>
        </div>
      ) : (
        <div className="glass rounded-2xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-850 bg-gray-900/30 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Job Type / ID</th>
                  <th className="py-4 px-6">Queue</th>
                  <th className="py-4 px-6">Failure Reason</th>
                  <th className="py-4 px-6">Failed At</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-850 text-sm text-gray-300">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="hover:bg-gray-800/30 cursor-pointer transition-colors group"
                  >
                    <td className="py-4 px-6">
                      <div className="font-bold text-white group-hover:text-brandPrimary transition-colors truncate max-w-[180px]">
                        {entry.job?.type || 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5">{entry.jobId.substring(0, 8)}...</div>
                    </td>
                    <td className="py-4 px-6 text-gray-400">{entry.job?.queue?.name || 'Unknown'}</td>
                    <td className="py-4 px-6 text-rose-400 font-medium max-w-xs truncate">
                      {entry.reason}
                    </td>
                    <td className="py-4 px-6 text-gray-400">
                      {new Date(entry.failedAt).toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleRetry(entry.jobId)}
                          className="p-1.5 bg-brandPrimary/20 text-brandPrimary border border-brandPrimary/30 rounded-lg hover:bg-brandPrimary/30 transition-colors flex items-center gap-1 text-xs font-semibold"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Retry
                        </button>
                        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors self-center ml-2" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-4 border-t border-gray-850 flex items-center justify-between text-xs text-gray-500">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 bg-gray-800 rounded-lg hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:hover:bg-gray-800 transition-colors"
              >
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 bg-gray-800 rounded-lg hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:hover:bg-gray-800 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail viewer */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-xl bg-darkCard border-l border-gray-800 h-full p-6 overflow-y-auto space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex justify-between items-start border-b border-gray-850 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-white font-montserrat flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-rose-500" />
                    Dead Letter Triage
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">Entry ID: {selectedEntry.id} | Job ID: {selectedEntry.jobId}</p>
                </div>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="text-gray-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                  Exhaustion Reason
                </span>
                <div className="bg-red-950/20 border border-red-500/20 p-4 rounded-xl text-xs text-red-200">
                  {selectedEntry.reason}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                  Original Payload
                </span>
                <pre className="bg-[#050811] border border-gray-850 p-4 rounded-xl text-xs text-brandSecondary overflow-x-auto font-mono">
                  {JSON.stringify(selectedEntry.originalPayload, null, 2)}
                </pre>
              </div>
            </div>

            <div className="border-t border-gray-850 pt-4 mt-6 flex justify-end gap-3">
              <button
                onClick={() => handleRetry(selectedEntry.jobId)}
                className="bg-brandPrimary hover:bg-brandPrimary/90 text-white px-5 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-brandPrimary/25"
              >
                <Play className="w-4 h-4" />
                Retry & Requeue Job
              </button>
              <button
                onClick={() => setSelectedEntry(null)}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default DeadLetterQueue;
