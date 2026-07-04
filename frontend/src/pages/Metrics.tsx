import React, { useEffect, useState } from 'react';
import { useAuth } from '../store/index.js';
import { apiClient } from '../api/client.js';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { Loader2, RefreshCw, Activity, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface QueueStats {
  queueName: string;
  counts: Record<string, number>;
  avgDurationMs: number;
  throughputHour: number;
  failureRate24h: number;
}

export const Metrics: React.FC = () => {
  const { activeProject } = useAuth();
  const [statsList, setStatsList] = useState<QueueStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeProject) {
      fetchMetrics();
    }
  }, [activeProject]);

  const fetchMetrics = async () => {
    if (!activeProject) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch all queues
      const queuesRes = await apiClient.get(`/queues?projectId=${activeProject.id}`);
      const queues = queuesRes.data;

      // 2. Fetch stats for each queue concurrently
      const statsPromises = queues.map(async (q: any) => {
        try {
          const statsRes = await apiClient.get(`/queues/${q.id}/stats`);
          return {
            queueName: q.name,
            ...statsRes.data,
          } as QueueStats;
        } catch (err) {
          console.error(`Failed to fetch stats for queue ${q.name}`, err);
          return null;
        }
      });

      const results = await Promise.all(statsPromises);
      setStatsList(results.filter((r) => r !== null) as QueueStats[]);
    } catch (err) {
      console.error(err);
      setError('Failed to aggregate project metrics');
    } finally {
      setIsLoading(false);
    }
  };

  // Compute aggregations
  const aggregateCounts = () => {
    const total = {
      QUEUED: 0,
      SCHEDULED: 0,
      CLAIMED: 0,
      RUNNING: 0,
      COMPLETED: 0,
      FAILED: 0,
      DEAD_LETTER: 0,
    };

    for (const stats of statsList) {
      for (const key of Object.keys(total)) {
        total[key as keyof typeof total] += stats.counts[key] || 0;
      }
    }
    return total;
  };

  const counts = aggregateCounts();
  const totalJobs = Object.values(counts).reduce((a, b) => a + b, 0);
  const completedJobs = counts.COMPLETED;
  const failedJobs = counts.FAILED + counts.DEAD_LETTER;

  const successRate = completedJobs + failedJobs > 0
    ? Math.round((completedJobs / (completedJobs + failedJobs)) * 100)
    : 100;

  // Chart Data preparation
  const throughputData = statsList.map((stats) => ({
    name: stats.queueName,
    Throughput: stats.throughputHour,
  }));

  const latencyData = statsList.map((stats) => ({
    name: stats.queueName,
    Latency: stats.avgDurationMs,
  }));

  const statusPieData = [
    { name: 'Completed', value: counts.COMPLETED, color: '#10b981' },
    { name: 'Failed', value: counts.FAILED, color: '#ef4444' },
    { name: 'Dead Letter', value: counts.DEAD_LETTER, color: '#f59e0b' },
    { name: 'Active/Pending', value: counts.QUEUED + counts.SCHEDULED + counts.CLAIMED + counts.RUNNING, color: '#6366f1' },
  ].filter((d) => d.value > 0);

  if (!activeProject) {
    return (
      <div className="p-8 text-center text-gray-400">
        Please select a project to view metrics.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white font-montserrat tracking-tight">Performance Analytics</h1>
          <p className="text-gray-400 mt-1">
            Aggregate workload charts, queue latency factors, and execution stats
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          className="p-2.5 bg-[#0a0f1d] border border-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 text-red-200 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-10 h-10 animate-spin text-brandPrimary mb-2" />
          <p>Compiling database aggregates...</p>
        </div>
      ) : statsList.length === 0 ? (
        <div className="glass p-16 rounded-2xl text-center text-gray-400 border border-gray-800">
          <Activity className="w-16 h-16 mx-auto mb-4 text-gray-600 stroke-[1.5]" />
          <h3 className="text-xl font-bold text-white mb-2">No metric details available</h3>
          <p>Setup queues and run sample jobs to aggregate performance metrics.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Key Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="glass p-6 rounded-2xl border border-gray-800 space-y-2">
              <span className="text-xs text-gray-500 uppercase font-semibold">Total Job Instances</span>
              <div className="text-3xl font-extrabold text-white font-montserrat">{totalJobs}</div>
            </div>

            <div className="glass p-6 rounded-2xl border border-gray-800 space-y-2">
              <span className="text-xs text-gray-500 uppercase font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Successful Executes
              </span>
              <div className="text-3xl font-extrabold text-emerald-400 font-montserrat">{counts.COMPLETED}</div>
            </div>

            <div className="glass p-6 rounded-2xl border border-gray-800 space-y-2">
              <span className="text-xs text-gray-500 uppercase font-semibold flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                Failed Runs (Exhausted)
              </span>
              <div className="text-3xl font-extrabold text-rose-400 font-montserrat">
                {counts.FAILED + counts.DEAD_LETTER}
              </div>
            </div>

            <div className="glass p-6 rounded-2xl border border-gray-800 space-y-2">
              <span className="text-xs text-gray-500 uppercase font-semibold">Execution Accuracy Rate</span>
              <div className="text-3xl font-extrabold text-brandPrimary font-montserrat">{successRate}%</div>
            </div>
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Status Breakdown (Pie Chart) */}
            <div className="glass p-6 rounded-2xl border border-gray-800 flex flex-col justify-between min-h-[350px]">
              <h3 className="text-lg font-bold text-white font-montserrat mb-4">Job Distribution</h3>
              <div className="h-56 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {statusPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-4 text-xs">
                {statusPieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }}></span>
                    <span className="text-gray-400">{d.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Throughput (Bar Chart) */}
            <div className="glass p-6 rounded-2xl border border-gray-800 lg:col-span-2 min-h-[350px]">
              <h3 className="text-lg font-bold text-white font-montserrat mb-4 flex justify-between">
                <span>Hourly Throughput</span>
                <span className="text-xs text-brandSecondary uppercase self-center bg-brandSecondary/10 px-2.5 py-0.5 rounded border border-brandSecondary/20 font-semibold">
                  Jobs / Hour
                </span>
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={throughputData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.4} />
                    <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} />
                    <YAxis stroke="#6b7280" fontSize={12} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }} />
                    <Bar dataKey="Throughput" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Latency Plot */}
          <div className="glass p-6 rounded-2xl border border-gray-800">
            <h3 className="text-lg font-bold text-white font-montserrat mb-4 flex justify-between">
              <span>Avg Queue Latency</span>
              <span className="text-xs text-brandPrimary uppercase self-center bg-brandPrimary/10 px-2.5 py-0.5 rounded border border-brandPrimary/20 font-semibold">
                milliseconds
              </span>
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={latencyData}>
                  <defs>
                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.4} />
                  <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} />
                  <YAxis stroke="#6b7280" fontSize={12} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }} />
                  <Area type="monotone" dataKey="Latency" stroke="#a855f7" fillOpacity={1} fill="url(#colorLatency)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Metrics;
