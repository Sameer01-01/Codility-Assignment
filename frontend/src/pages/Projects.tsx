import React, { useEffect, useState } from 'react';
import { useAuth } from '../store/index.js';
import { apiClient } from '../api/client.js';
import { Plus, Folder, LayoutGrid, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export const Projects: React.FC = () => {
  const { activeOrg, activeProject, setActiveProject } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (activeOrg) {
      fetchProjects();
    }
  }, [activeOrg]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get(`/projects?orgId=${activeOrg?.id}`);
      setProjects(res.data);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch projects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg) return;
    setError(null);

    try {
      const res = await apiClient.post('/projects', {
        orgId: activeOrg.id,
        name: newProjName,
        description: newProjDesc,
      });

      setProjects((prev) => [res.data, ...prev]);
      setActiveProject(res.data);
      setNewProjName('');
      setNewProjDesc('');
      setIsCreating(false);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create project');
    }
  };

  const selectProject = (project: Project) => {
    setActiveProject(project);
    navigate(`/queues`);
  };

  if (!activeOrg) {
    return (
      <div className="p-8 text-center text-gray-400">
        Please create or log into an organization to continue.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white font-montserrat tracking-tight">Projects</h1>
          <p className="text-gray-400 mt-1">Projects group your queues, jobs, and workers into isolated workspaces</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="bg-gradient-to-r from-brandPrimary to-brandSecondary hover:opacity-90 text-white font-semibold py-2.5 px-4 rounded-lg flex items-center gap-2 shadow-lg shadow-brandPrimary/10 transition-all transform hover:scale-[1.01]"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 text-red-200 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* Creation Modal/Form */}
      {isCreating && (
        <div className="glass p-6 rounded-2xl border border-gray-800 space-y-4">
          <h3 className="text-lg font-bold text-white">Create New Project</h3>
          <form onSubmit={handleCreateProject} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Project Name
              </label>
              <input
                type="text"
                required
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                placeholder="e.g. Production Jobs"
                className="w-full bg-[#0a0f1d] border border-gray-800 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-brandPrimary transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Description (Optional)
              </label>
              <textarea
                value={newProjDesc}
                onChange={(e) => setNewProjDesc(e.target.value)}
                placeholder="Describe what kind of jobs run here..."
                rows={3}
                className="w-full bg-[#0a0f1d] border border-gray-800 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-brandPrimary transition-colors resize-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-gradient-to-r from-brandPrimary to-brandSecondary text-white font-semibold py-2 px-4 rounded-lg transition-opacity hover:opacity-90"
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
          <p>Fetching projects list...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="glass p-16 rounded-2xl text-center text-gray-400 border border-gray-800">
          <Folder className="w-16 h-16 mx-auto mb-4 text-gray-600 stroke-[1.5]" />
          <h3 className="text-xl font-bold text-white mb-2">No projects yet</h3>
          <p className="mb-2 max-w-md mx-auto">A project is a workspace that groups your queues and jobs together. Create one to get started.</p>
          <p className="text-xs text-gray-500 mb-6">Once created, you can set up queues inside it and start submitting jobs.</p>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-gray-800 hover:bg-gray-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors border border-gray-700"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const isActive = activeProject?.id === project.id;
            return (
              <div
                key={project.id}
                onClick={() => selectProject(project)}
                className={`glass p-6 rounded-2xl cursor-pointer transition-all duration-300 transform hover:scale-[1.02] border hover:border-brandPrimary/30 flex flex-col justify-between ${
                  isActive ? 'border-brandPrimary bg-brandPrimary/5 shadow-brandPrimary/10 shadow-lg' : 'border-gray-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2.5 bg-gray-800/80 rounded-xl">
                      <LayoutGrid className="w-5 h-5 text-brandPrimary" />
                    </div>
                    {isActive && (
                      <span className="text-xs bg-brandPrimary/20 text-brandPrimary px-2.5 py-0.5 rounded-full font-semibold border border-brandPrimary/30">
                        Active
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-white font-montserrat truncate mb-2">
                    {project.name}
                  </h3>
                  <p className="text-gray-400 text-sm line-clamp-2 min-h-[40px]">
                    {project.description || 'No description provided.'}
                  </p>
                </div>
                
                <div className="mt-6 pt-4 border-t border-gray-800/50 flex justify-between items-center text-xs text-gray-500">
                  <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
                  <span className="text-brandPrimary group-hover:underline font-semibold flex items-center gap-1">
                    Configure →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default Projects;
