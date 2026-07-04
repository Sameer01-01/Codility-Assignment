import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client.js';
import { connectSocket } from '../api/socket.js';
import { Cpu, Server, HardDrive, RefreshCw, Loader2, HelpCircle } from 'lucide-react';

interface Heartbeat {
  id: string;
  timestamp: string;
  currentLoad: number;
}

interface Worker {
  id: string;
  hostname: string;
  pid: number;
  status: 'ONLINE' | 'OFFLINE' | 'DRAINING';
  lastHeartbeatAt: string;
  startedAt: string;
  heartbeats?: Heartbeat[];
}

export const Workers: React.FC = () => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchWorkers();

    // Connect Socket.IO for worker events
    const socket = connectSocket();
    
    socket.on('worker:heartbeat', (payload: any) => {
      setWorkers((prevWorkers) => {
        const index = prevWorkers.findIndex((w) => w.id === payload.workerId);
        
        if (index > -1) {
          // Update existing worker
          return prevWorkers.map((w) =>
            w.id === payload.workerId
              ? {
                  ...w,
                  status: payload.status,
                  currentLoad: payload.currentLoad,
                  lastHeartbeatAt: payload.timestamp,
                  heartbeats: [
                    { id: Math.random().toString(), timestamp: payload.timestamp, currentLoad: payload.currentLoad },
                    ...(w.heartbeats || []).slice(0, 9),
                  ],
                }
              : w
          );
        } else {
          // Insert new worker on the fly
          return [
            {
              id: payload.workerId,
              hostname: payload.hostname,
              pid: payload.pid,
              status: payload.status,
              lastHeartbeatAt: payload.timestamp,
              startedAt: payload.timestamp,
              heartbeats: [{ id: Math.random().toString(), timestamp: payload.timestamp, currentLoad: payload.currentLoad }],
            },
            ...prevWorkers,
          ];
        }
      });
    });

    return () => {
      socket.off('worker:heartbeat');
    };
  }, []);

  const fetchWorkers = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get('/workers');
      setWorkers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ONLINE':
        return 'bg-emerald-500 text-emerald-400 border-emerald-500/20';
      case 'DRAINING':
        return 'bg-amber-500 text-amber-400 border-amber-500/20';
      case 'OFFLINE':
        return 'bg-rose-500 text-rose-400 border-rose-500/20';
      default:
        return 'bg-gray-500 text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white font-montserrat tracking-tight">Active Workers</h1>
          <p className="text-gray-400 mt-1">Real-time status monitoring, PID allocation, and thread-load indices</p>
        </div>
        <button
          onClick={fetchWorkers}
          className="p-2.5 bg-[#0a0f1d] border border-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-4.5 h-4.5" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-10 h-10 animate-spin text-brandPrimary mb-2" />
          <p>Loading worker clusters...</p>
        </div>
      ) : workers.length === 0 ? (
        <div className="glass p-16 rounded-2xl text-center text-gray-400 border border-gray-800">
          <Server className="w-16 h-16 mx-auto mb-4 text-gray-600 stroke-[1.5]" />
          <h3 className="text-xl font-bold text-white mb-2">No workers registered</h3>
          <p>Launch worker processes from the CLI / Docker Compose to scale processing nodes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {workers.map((worker) => {
            const isOffline = worker.status === 'OFFLINE';
            const loadPercent = Math.min(100, Math.round(((worker.heartbeats?.[0]?.currentLoad || 0) / 10) * 100)); // assumes max 10 jobs load
            
            return (
              <div
                key={worker.id}
                className="glass p-6 rounded-2xl border border-gray-800 hover:border-gray-700 transition-colors flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-gray-850 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-gray-805/85 rounded-xl text-brandPrimary">
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white font-montserrat tracking-tight">{worker.hostname}</h3>
                        <p className="text-xs text-gray-500 font-mono">PID: {worker.pid} | ID: {worker.id.substring(0, 16)}...</p>
                      </div>
                    </div>
                    
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border flex items-center gap-1.5 ${
                        worker.status === 'ONLINE'
                          ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20'
                          : worker.status === 'DRAINING'
                          ? 'bg-amber-950/20 text-amber-400 border-amber-500/20 animate-pulse'
                          : 'bg-rose-950/20 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${worker.status === 'ONLINE' ? 'bg-emerald-400' : worker.status === 'DRAINING' ? 'bg-amber-400' : 'bg-rose-400'}`}></span>
                      {worker.status}
                    </span>
                  </div>

                  {/* Core Metrics */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="block text-xs text-gray-500 uppercase font-semibold">Active Threads</span>
                      <span className="text-white font-medium flex items-center gap-1.5 mt-1">
                        <Cpu className="w-4 h-4 text-gray-400" />
                        {worker.heartbeats?.[0]?.currentLoad || 0} tasks
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 uppercase font-semibold">Last Contact</span>
                      <span className="text-white font-medium flex items-center gap-1.5 mt-1">
                        <HardDrive className="w-4 h-4 text-gray-400" />
                        {isOffline ? 'Never' : new Date(worker.lastHeartbeatAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  {/* Load Progress bar */}
                  {!isOffline && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>Current Load Capacity</span>
                        <span>{loadPercent}%</span>
                      </div>
                      <div className="w-full bg-gray-900 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-brandPrimary to-brandSecondary h-2 rounded-full transition-all duration-500"
                          style={{ width: `${loadPercent}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-gray-850 text-xs text-gray-500 flex justify-between">
                  <span>Started: {new Date(worker.startedAt).toLocaleString()}</span>
                  <span>Node.js Cluster</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default Workers;
