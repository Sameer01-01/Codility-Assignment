import React, { useEffect, useState } from 'react';
import { useAuth } from '../store/index.js';
import { apiClient } from '../api/client.js';
import { connectSocket, disconnectSocket } from '../api/socket.js';
import { Play, XCircle, Search, RefreshCw, Layers, Calendar, Clock, Terminal, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface Job {
  id: string;
  queueId: string;
  type: string;
  payload: any;
  status: string;
  priority: number;
  runAt: string;
  attempts: number;
  maxAttempts: number;
  claimedByWorkerId?: string | null;
  claimedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  queue?: {
    name: string;
  };
}

interface Execution {
  id: string;
  workerId: string;
  startedAt: string;
  finishedAt?: string | null;
  status: string;
  errorMessage?: string | null;
  durationMs?: number | null;
}

interface JobLog {
  id: string;
  level: string;
  message: string;
  createdAt: string;
}

export const JobExplorer: React.FC = () => {
  const { activeProject } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [queues, setQueues] = useState<any[]>([]);
  const [selectedQueue, setSelectedQueue] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Detail Modal State
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobExecutions, setJobExecutions] = useState<Execution[]>([]);
  const [jobLogs, setJobLogs] = useState<JobLog[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    if (activeProject) {
      fetchQueues();
      fetchJobs();

      // Connect Socket.IO
      const socket = connectSocket();
      socket.emit('join:project', activeProject.id);

      // Realtime listener
      socket.on('job:status_changed', (payload: any) => {
        // Update job list state
        setJobs((prevJobs) =>
          prevJobs.map((job) =>
            job.id === payload.jobId
              ? { ...job, status: payload.status, attempts: payload.attempts, runAt: payload.runAt }
              : job
          )
        );

        // If the updated job is currently opened in details modal, refresh its details
        setSelectedJob((curr) => {
          if (curr && curr.id === payload.jobId) {
            fetchJobDetails(curr.id);
            return { ...curr, status: payload.status, attempts: payload.attempts, runAt: payload.runAt };
          }
          return curr;
        });
      });

      return () => {
        socket.emit('leave:project', activeProject.id);
        socket.off('job:status_changed');
      };
    }
  }, [activeProject, selectedQueue, selectedStatus, page]);

  const fetchQueues = async () => {
    try {
      const res = await apiClient.get(`/queues?projectId=${activeProject?.id}`);
      setQueues(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchJobs = async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      let url = `/jobs?projectId=${activeProject.id}&page=${page}&limit=10`;
      if (selectedQueue) {
        url += `&queueId=${selectedQueue}`;
      }
      if (selectedStatus) {
        url += `&status=${selectedStatus}`;
      }

      const res = await apiClient.get(url);
      setJobs(res.data.jobs);
      setTotalPages(res.data.pagination.pages);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchJobDetails = async (jobId: string) => {
    setIsLoadingDetails(true);
    try {
      const res = await apiClient.get(`/jobs/${jobId}`);
      setJobExecutions(res.data.executions || []);
      setJobLogs(res.data.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleOpenDetails = (job: Job) => {
    setSelectedJob(job);
    fetchJobDetails(job.id);
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      const res = await apiClient.post(`/jobs/${jobId}/retry`);
      // Update job state in list
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: 'QUEUED', attempts: 0 } : j))
      );
      if (selectedJob && selectedJob.id === jobId) {
        setSelectedJob({ ...selectedJob, status: 'QUEUED', attempts: 0 });
        fetchJobDetails(jobId);
      }
    } catch (err) {
      console.error('Failed to retry job', err);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await apiClient.post(`/jobs/${jobId}/cancel`);
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: 'FAILED' } : j))
      );
      if (selectedJob && selectedJob.id === jobId) {
        setSelectedJob({ ...selectedJob, status: 'FAILED' });
        fetchJobDetails(jobId);
      }
    } catch (err) {
      console.error('Failed to cancel job', err);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-900/20 text-emerald-400 border-emerald-500/20';
      case 'RUNNING':
        return 'bg-blue-900/20 text-blue-400 border-blue-500/20 animate-pulse';
      case 'CLAIMED':
        return 'bg-indigo-900/20 text-indigo-400 border-indigo-500/20';
      case 'QUEUED':
        return 'bg-gray-800/80 text-gray-300 border-gray-700/50';
      case 'SCHEDULED':
        return 'bg-purple-900/20 text-purple-400 border-purple-500/20';
      case 'FAILED':
        return 'bg-rose-900/20 text-rose-400 border-rose-500/20';
      case 'DEAD_LETTER':
        return 'bg-amber-900/20 text-amber-400 border-amber-500/20';
      default:
        return 'bg-gray-800 text-gray-300';
    }
  };

  if (!activeProject) {
    return (
      <div className="p-8 text-center text-gray-400">
        Please select a project from the projects list to view job execution history.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-white font-montserrat tracking-tight">Job Explorer</h1>
        <p className="text-gray-400 mt-1">Realtime pipeline execution, scheduling, logs, and failure triage</p>
      </div>

      {/* Filter Toolbar */}
      <div className="glass p-4 rounded-2xl border border-gray-800 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2 bg-[#0a0f1d] px-3 py-2 border border-gray-800 rounded-lg">
            <Layers className="w-4 h-4 text-gray-500" />
            <select
              value={selectedQueue}
              onChange={(e) => {
                setSelectedQueue(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-white focus:outline-none text-sm cursor-pointer"
            >
              <option value="">All Queues</option>
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-[#0a0f1d] px-3 py-2 border border-gray-800 rounded-lg">
            <Search className="w-4 h-4 text-gray-500" />
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-white focus:outline-none text-sm cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="QUEUED">QUEUED</option>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="CLAIMED">CLAIMED</option>
              <option value="RUNNING">RUNNING</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="FAILED">FAILED</option>
              <option value="DEAD_LETTER">DEAD_LETTER</option>
            </select>
          </div>
        </div>

        <button
          onClick={fetchJobs}
          className="p-2.5 bg-[#0a0f1d] border border-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Table */}
      {isLoading ? (
        <div className="glass p-20 rounded-2xl text-center text-gray-400 border border-gray-800 flex flex-col items-center justify-center">
          <RefreshCw className="w-10 h-10 animate-spin text-brandPrimary mb-2" />
          <p>Loading jobs list...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="glass p-16 rounded-2xl text-center text-gray-400 border border-gray-800">
          <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-600 stroke-[1.5]" />
          <h3 className="text-xl font-bold text-white mb-2">No jobs matched</h3>
          <p>Submit jobs from the API to monitor them in the live console.</p>
        </div>
      ) : (
        <div className="glass rounded-2xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-850 bg-gray-900/30 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Job ID / Type</th>
                  <th className="py-4 px-6">Queue</th>
                  <th className="py-4 px-6">Priority</th>
                  <th className="py-4 px-6">Attempts</th>
                  <th className="py-4 px-6">Run At</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-850 text-sm text-gray-300">
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => handleOpenDetails(job)}
                    className="hover:bg-gray-800/30 cursor-pointer transition-colors group"
                  >
                    <td className="py-4 px-6">
                      <div className="font-bold text-white group-hover:text-brandPrimary transition-colors truncate max-w-[180px]">
                        {job.type}
                      </div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5">{job.id.substring(0, 8)}...</div>
                    </td>
                    <td className="py-4 px-6 text-gray-400">{job.queue?.name || 'Unknown'}</td>
                    <td className="py-4 px-6">{job.priority}</td>
                    <td className="py-4 px-6">
                      {job.attempts} / {job.maxAttempts}
                    </td>
                    <td className="py-4 px-6 text-gray-400">
                      {new Date(job.runAt).toLocaleString()}
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${getStatusStyle(
                          job.status
                        )}`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        {(job.status === 'FAILED' || job.status === 'DEAD_LETTER') && (
                          <button
                            onClick={() => handleRetryJob(job.id)}
                            className="p-1.5 bg-brandPrimary/20 text-brandPrimary border border-brandPrimary/30 rounded-lg hover:bg-brandPrimary/30 transition-colors"
                            title="Retry Job"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(job.status === 'QUEUED' || job.status === 'SCHEDULED') && (
                          <button
                            onClick={() => handleCancelJob(job.id)}
                            className="p-1.5 bg-red-900/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-950/40 transition-colors"
                            title="Cancel Job"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
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

      {/* Details Side-Drawer / Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-2xl bg-darkCard border-l border-gray-800 h-full p-6 overflow-y-auto space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-gray-850 pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-white font-montserrat">{selectedJob.type}</h2>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${getStatusStyle(
                        selectedJob.status
                      )}`}
                    >
                      {selectedJob.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">UUID: {selectedJob.id}</p>
                </div>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-gray-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Quick Details Grid */}
              <div className="grid grid-cols-2 gap-4 bg-[#0a0f1d] p-4 rounded-xl border border-gray-800/80 text-sm">
                <div>
                  <span className="block text-xs text-gray-500 uppercase font-semibold">Priority</span>
                  <span className="text-white font-medium">{selectedJob.priority}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-500 uppercase font-semibold">Attempts</span>
                  <span className="text-white font-medium">
                    {selectedJob.attempts} / {selectedJob.maxAttempts}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-gray-500 uppercase font-semibold">Scheduled Run</span>
                  <span className="text-white font-medium">
                    {new Date(selectedJob.runAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-gray-500 uppercase font-semibold">Queue ID</span>
                  <span className="text-white font-medium truncate block">{selectedJob.queueId}</span>
                </div>
              </div>

              {/* Payload Viewer */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Payload Payload</span>
                <pre className="bg-[#050811] border border-gray-850 p-4 rounded-xl text-xs text-brandSecondary overflow-x-auto font-mono">
                  {JSON.stringify(selectedJob.payload, null, 2)}
                </pre>
              </div>

              {/* Executions Logs & Attempts history */}
              <div className="space-y-4">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                  Execution Attempts History
                </span>
                
                {isLoadingDetails ? (
                  <div className="text-center py-6 text-gray-500 text-sm">
                    <RefreshCw className="w-6 h-6 animate-spin text-brandPrimary mx-auto mb-2" />
                    Fetching executions details...
                  </div>
                ) : jobExecutions.length === 0 ? (
                  <div className="text-center py-6 text-gray-600 text-sm border border-dashed border-gray-800 rounded-xl">
                    No execution history. Job is currently queued/scheduled.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {jobExecutions.map((exec, idx) => (
                      <div
                        key={exec.id}
                        className="p-4 bg-gray-900/30 border border-gray-800 rounded-xl text-xs space-y-2"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-white">
                            Attempt #{jobExecutions.length - idx}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-semibold border ${
                              exec.status === 'SUCCESS'
                                ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20'
                                : 'bg-red-950/20 text-red-400 border-red-500/20'
                            }`}
                          >
                            {exec.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-gray-400">
                          <div>
                            Worker: <span className="text-white font-mono">{exec.workerId.substring(0, 16)}...</span>
                          </div>
                          <div>
                            Duration:{' '}
                            <span className="text-white">
                              {exec.durationMs !== null ? `${exec.durationMs}ms` : 'In progress...'}
                            </span>
                          </div>
                          <div className="col-span-2">
                            Started: {new Date(exec.startedAt).toLocaleString()}
                          </div>
                          {exec.errorMessage && (
                            <div className="col-span-2 text-red-400 bg-red-950/20 p-2 rounded border border-red-550/10 mt-1">
                              Error: {exec.errorMessage}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Console Logs */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-brandPrimary" />
                  Execution Logs
                </span>
                
                {isLoadingDetails ? (
                  <div className="text-center py-6 text-gray-500 text-sm">
                    Fetching log console...
                  </div>
                ) : jobLogs.length === 0 ? (
                  <div className="text-center py-6 text-gray-600 text-sm border border-dashed border-gray-800 rounded-xl">
                    Console empty.
                  </div>
                ) : (
                  <div className="bg-[#050811] border border-gray-850 p-4 rounded-xl font-mono text-xs text-emerald-400 space-y-1.5 max-h-[220px] overflow-y-auto">
                    {jobLogs.map((log) => (
                      <div key={log.id} className="flex gap-2">
                        <span className="text-gray-500">[{new Date(log.createdAt).toLocaleTimeString()}]</span>
                        <span className={log.level === 'ERROR' ? 'text-rose-400' : log.level === 'WARN' ? 'text-amber-400' : 'text-emerald-400'}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions Footer */}
            <div className="border-t border-gray-850 pt-4 mt-6 flex justify-end gap-3">
              {(selectedJob.status === 'QUEUED' || selectedJob.status === 'SCHEDULED') && (
                <button
                  onClick={() => handleCancelJob(selectedJob.id)}
                  className="bg-red-900/20 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 hover:bg-red-950/40 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Cancel Job Execution
                </button>
              )}
              {(selectedJob.status === 'FAILED' || selectedJob.status === 'DEAD_LETTER') && (
                <button
                  onClick={() => handleRetryJob(selectedJob.id)}
                  className="bg-brandPrimary hover:bg-brandPrimary/90 text-white px-5 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-brandPrimary/25"
                >
                  <Play className="w-4 h-4" />
                  Retry Job Now
                </button>
              )}
              <button
                onClick={() => setSelectedJob(null)}
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
export default JobExplorer;
