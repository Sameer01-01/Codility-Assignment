import React, { useEffect, useState } from 'react';
import { useAuth } from '../store/index.js';
import { apiClient } from '../api/client.js';
import { connectSocket } from '../api/socket.js';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Server,
  Layers,
  Zap,
  Clock,
  RefreshCw,
  Send,
  Cpu,
  Play,
  RotateCcw,
  Flag,
  Info
} from 'lucide-react';

interface RecentEvent {
  id: string;
  jobId: string;
  jobType: string;
  status: string;
  timestamp: string;
}

export const Dashboard: React.FC = () => {
  const { activeProject } = useAuth();
  const [totalJobs, setTotalJobs] = useState(0);
  const [completedJobs, setCompletedJobs] = useState(0);
  const [failedJobs, setFailedJobs] = useState(0);
  const [workerCount, setWorkerCount] = useState(0);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (activeProject) {
      fetchOverview();

      const socket = connectSocket();
      socket.emit('join:project', activeProject.id);

      socket.on('job:status_changed', (payload: any) => {
        setRecentEvents((prev) => [
          {
            id: Math.random().toString(36),
            jobId: payload.jobId?.substring(0, 8) || '???',
            jobType: payload.type || 'job',
            status: payload.status,
            timestamp: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 9),
        ]);

        // Update counters live
        if (payload.status === 'COMPLETED') {
          setCompletedJobs((c) => c + 1);
          setTotalJobs((t) => t + 1);
        } else if (payload.status === 'FAILED' || payload.status === 'DEAD_LETTER') {
          setFailedJobs((f) => f + 1);
        }
      });

      return () => {
        socket.emit('leave:project', activeProject.id);
        socket.off('job:status_changed');
      };
    }
  }, [activeProject]);

  const fetchOverview = async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      // Fetch queues and aggregate stats
      const queuesRes = await apiClient.get(`/queues?projectId=${activeProject.id}`);
      const queues = queuesRes.data;

      let total = 0, completed = 0, failed = 0;
      for (const q of queues) {
        try {
          const statsRes = await apiClient.get(`/queues/${q.id}/stats`);
          const counts = statsRes.data.counts || {};
          for (const val of Object.values(counts)) {
            total += val as number;
          }
          completed += counts.COMPLETED || 0;
          failed += (counts.FAILED || 0) + (counts.DEAD_LETTER || 0);
        } catch { /* skip */ }
      }
      setTotalJobs(total);
      setCompletedJobs(completed);
      setFailedJobs(failed);

      // Fetch workers
      try {
        const workersRes = await apiClient.get('/workers');
        setWorkerCount(workersRes.data.filter((w: any) => w.status === 'ONLINE').length);
      } catch { /* skip */ }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'FAILED': return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
      case 'RUNNING': return <Play className="w-3.5 h-3.5 text-blue-400" />;
      case 'QUEUED': return <Clock className="w-3.5 h-3.5 text-gray-400" />;
      case 'SCHEDULED': return <Clock className="w-3.5 h-3.5 text-purple-400" />;
      case 'DEAD_LETTER': return <XCircle className="w-3.5 h-3.5 text-amber-400" />;
      default: return <Activity className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-emerald-400';
      case 'FAILED': return 'text-rose-400';
      case 'RUNNING': return 'text-blue-400';
      case 'DEAD_LETTER': return 'text-amber-400';
      default: return 'text-gray-400';
    }
  };

  const pipelineSteps = [
    {
      icon: <Send className="w-5 h-5" />,
      title: 'Submit Job',
      desc: 'Jobs are submitted via the REST API with a type, payload, and target queue.',
      color: 'from-indigo-500 to-indigo-600',
    },
    {
      icon: <Layers className="w-5 h-5" />,
      title: 'Queue',
      desc: 'Jobs enter a queue sorted by priority. Each queue has its own concurrency limit.',
      color: 'from-purple-500 to-purple-600',
    },
    {
      icon: <Cpu className="w-5 h-5" />,
      title: 'Worker Claims',
      desc: 'Workers atomically lock jobs using SQL transactions to prevent duplicates.',
      color: 'from-blue-500 to-blue-600',
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: 'Execute',
      desc: 'The worker runs the task handler (email, image processing, report, etc.).',
      color: 'from-cyan-500 to-cyan-600',
    },
    {
      icon: <RotateCcw className="w-5 h-5" />,
      title: 'Complete / Retry',
      desc: 'On success, the job is marked done. On failure, it retries or goes to the Dead Letter Queue.',
      color: 'from-emerald-500 to-emerald-600',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero Welcome Section */}
      <div className="glass p-8 rounded-2xl border border-gray-800 bg-gradient-to-br from-[#0d1321] to-[#0a0f1d]">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-white font-montserrat tracking-tight">
              Control Center
            </h1>
            <p className="text-gray-400 mt-2 max-w-2xl leading-relaxed">
              Your distributed job scheduling platform — submit, monitor, and retry background tasks in real time.
              Jobs are submitted via the API, queued by priority, picked up by distributed workers, and executed
              with automatic retry policies.
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-2 bg-emerald-950/30 border border-emerald-500/20 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            <span className="text-emerald-400 text-xs font-semibold">System Online</span>
          </div>
        </div>
      </div>

      {/* Live Stat Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin text-brandPrimary mr-3" />
          <span>Loading system stats...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="glass p-5 rounded-2xl border border-gray-800 group hover:border-indigo-500/30 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 uppercase font-semibold">Total Jobs</span>
              <div className="p-2 bg-indigo-950/30 rounded-lg border border-indigo-500/10">
                <Layers className="w-4 h-4 text-indigo-400" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white font-montserrat">{totalJobs}</div>
            <p className="text-xs text-gray-500 mt-1">All job instances across queues</p>
          </div>

          <div className="glass p-5 rounded-2xl border border-gray-800 group hover:border-emerald-500/30 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 uppercase font-semibold">Completed</span>
              <div className="p-2 bg-emerald-950/30 rounded-lg border border-emerald-500/10">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-emerald-400 font-montserrat">{completedJobs}</div>
            <p className="text-xs text-gray-500 mt-1">Successfully executed jobs</p>
          </div>

          <div className="glass p-5 rounded-2xl border border-gray-800 group hover:border-rose-500/30 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 uppercase font-semibold">Failed</span>
              <div className="p-2 bg-rose-950/30 rounded-lg border border-rose-500/10">
                <XCircle className="w-4 h-4 text-rose-400" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-rose-400 font-montserrat">{failedJobs}</div>
            <p className="text-xs text-gray-500 mt-1">Jobs that exhausted all retries</p>
          </div>

          <div className="glass p-5 rounded-2xl border border-gray-800 group hover:border-blue-500/30 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 uppercase font-semibold">Active Workers</span>
              <div className="p-2 bg-blue-950/30 rounded-lg border border-blue-500/10">
                <Server className="w-4 h-4 text-blue-400" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-blue-400 font-montserrat">{workerCount}</div>
            <p className="text-xs text-gray-500 mt-1">Online background processors</p>
          </div>
        </div>
      )}

      {/* How It Works — Pipeline Diagram */}
      <div className="glass p-6 rounded-2xl border border-gray-800">
        <div className="flex items-center gap-2 mb-6">
          <Info className="w-4 h-4 text-brandPrimary" />
          <h2 className="text-lg font-bold text-white font-montserrat">How It Works — Job Lifecycle Pipeline</h2>
        </div>

        <div className="flex flex-col lg:flex-row items-stretch gap-3">
          {pipelineSteps.map((step, idx) => (
            <React.Fragment key={idx}>
              <div className="flex-1 bg-[#0a0f1d] border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors group">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${step.color} flex items-center justify-center text-white mb-3 shadow-lg group-hover:scale-105 transition-transform`}>
                  {step.icon}
                </div>
                <h3 className="text-sm font-bold text-white mb-1">{step.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
              </div>
              {idx < pipelineSteps.length - 1 && (
                <div className="hidden lg:flex items-center justify-center text-gray-600 shrink-0">
                  <ArrowRight className="w-5 h-5" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Bottom Row: Quick Actions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Navigation */}
        <div className="glass p-6 rounded-2xl border border-gray-800">
          <h2 className="text-lg font-bold text-white font-montserrat mb-4">Quick Navigation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { to: '/jobs', label: 'Job Explorer', desc: 'Browse, filter, and inspect all jobs', icon: <Activity className="w-4.5 h-4.5" /> },
              { to: '/workers', label: 'Active Workers', desc: 'Monitor worker health and load', icon: <Server className="w-4.5 h-4.5" /> },
              { to: '/queues', label: 'Queue Config', desc: 'Manage queues and concurrency', icon: <Layers className="w-4.5 h-4.5" /> },
              { to: '/metrics', label: 'Metrics', desc: 'Throughput charts and latency', icon: <Flag className="w-4.5 h-4.5" /> },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 p-3.5 bg-[#0a0f1d] border border-gray-800 rounded-xl hover:border-brandPrimary/30 hover:bg-brandPrimary/5 transition-all group"
              >
                <div className="p-2 bg-gray-800/80 rounded-lg text-brandPrimary group-hover:bg-brandPrimary/20 transition-colors">
                  {item.icon}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white group-hover:text-brandPrimary transition-colors">{item.label}</div>
                  <div className="text-xs text-gray-500">{item.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="glass p-6 rounded-2xl border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white font-montserrat">Live Activity Feed</h2>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
              Real-time via WebSocket
            </span>
          </div>

          {recentEvents.length === 0 ? (
            <div className="text-center py-10 text-gray-600">
              <Activity className="w-10 h-10 mx-auto mb-3 stroke-[1.5] opacity-50" />
              <p className="text-sm">Waiting for job events...</p>
              <p className="text-xs text-gray-700 mt-1">Events appear here in real-time as workers process jobs.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 p-2.5 bg-[#0a0f1d] border border-gray-800/60 rounded-lg text-xs animate-fade-in"
                >
                  {getStatusIcon(event.status)}
                  <div className="flex-1 min-w-0">
                    <span className="text-white font-semibold">{event.jobType}</span>
                    <span className="text-gray-600 mx-1.5">→</span>
                    <span className={`font-semibold ${getStatusColor(event.status)}`}>{event.status}</span>
                  </div>
                  <span className="text-gray-600 shrink-0">{event.timestamp}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
