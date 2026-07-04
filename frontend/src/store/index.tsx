import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
}

interface Org {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
}

interface AuthContextType {
  user: User | null;
  activeOrg: Org | null;
  activeProject: Project | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userData: any) => void;
  logout: () => void;
  setActiveOrg: (org: Org) => void;
  setActiveProject: (project: Project | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeOrg, setActiveOrgState] = useState<Org | null>(null);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load stored details
    const storedUser = localStorage.getItem('user');
    const storedOrg = localStorage.getItem('activeOrg');
    const storedProject = localStorage.getItem('activeProject');
    const token = localStorage.getItem('accessToken');

    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
      if (storedOrg) setActiveOrgState(JSON.parse(storedOrg));
      if (storedProject) setActiveProjectState(JSON.parse(storedProject));
    }
    
    setIsLoading(false);
  }, []);

  const login = (userData: any) => {
    localStorage.setItem('accessToken', userData.accessToken);
    localStorage.setItem('refreshToken', userData.refreshToken);
    localStorage.setItem('user', JSON.stringify(userData.user));
    
    setUser(userData.user);

    if (userData.organization) {
      localStorage.setItem('activeOrg', JSON.stringify(userData.organization));
      setActiveOrgState(userData.organization);
    }
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('activeOrg');
    localStorage.removeItem('activeProject');
    
    setUser(null);
    setActiveOrgState(null);
    setActiveProjectState(null);
  };

  const setActiveOrg = (org: Org) => {
    localStorage.setItem('activeOrg', JSON.stringify(org));
    setActiveOrgState(org);
    // Reset active project when org changes
    setActiveProjectState(null);
    localStorage.removeItem('activeProject');
  };

  const setActiveProject = (project: Project | null) => {
    if (project) {
      localStorage.setItem('activeProject', JSON.stringify(project));
      setActiveProjectState(project);
    } else {
      localStorage.removeItem('activeProject');
      setActiveProjectState(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeOrg,
        activeProject,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        setActiveOrg,
        setActiveProject,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
