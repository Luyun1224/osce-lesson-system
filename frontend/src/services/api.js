import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/v1';

// 創建 axios 實例
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 請求攔截器 - 添加認證 token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 響應攔截器 - 處理錯誤和 token 過期
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token 過期或無效，清除本地存儲並重定向到登入頁面
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 認證相關 API
export const authAPI = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  logout: async () => {
    const response = await api.post('/auth/logout');
    return response.data;
  },

  refreshToken: async () => {
    const response = await api.post('/auth/refresh');
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

// 教案相關 API
export const lessonAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/lessons', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/lessons/${id}`);
    return response.data;
  },

  create: async (lessonData) => {
    const response = await api.post('/lessons', lessonData);
    return response.data;
  },

  update: async (id, lessonData) => {
    const response = await api.put(`/lessons/${id}`, lessonData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/lessons/${id}`);
    return response.data;
  },

  generateWithAI: async (prompt) => {
    const response = await api.post('/lessons/generate', { prompt });
    return response.data;
  },

  submitForReview: async (id) => {
    const response = await api.post(`/lessons/${id}/review`);
    return response.data;
  },

  approve: async (id, feedback) => {
    const response = await api.post(`/lessons/${id}/approve`, { feedback });
    return response.data;
  },

  reject: async (id, feedback) => {
    const response = await api.post(`/lessons/${id}/reject`, { feedback });
    return response.data;
  },
};

// 知識庫相關 API
export const knowledgeAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/knowledge', { params });
    return response.data;
  },

  create: async (knowledgeData) => {
    const response = await api.post('/knowledge', knowledgeData);
    return response.data;
  },

  update: async (id, knowledgeData) => {
    const response = await api.put(`/knowledge/${id}`, knowledgeData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/knowledge/${id}`);
    return response.data;
  },
};

// 用戶相關 API
export const userAPI = {
  getProfile: async () => {
    const response = await api.get('/users/profile');
    return response.data;
  },

  updateProfile: async (userData) => {
    const response = await api.put('/users/profile', userData);
    return response.data;
  },

  changePassword: async (passwordData) => {
    const response = await api.put('/users/password', passwordData);
    return response.data;
  },

  getAll: async (params = {}) => {
    const response = await api.get('/users', { params });
    return response.data;
  },
};

// AI 相關 API
export const aiAPI = {
  generateLesson: async (prompt, options = {}) => {
    const response = await api.post('/ai/generate-lesson', { prompt, ...options });
    return response.data;
  },

  reviewLesson: async (lessonId, content) => {
    const response = await api.post('/ai/review-lesson', { lessonId, content });
    return response.data;
  },

  suggestImprovements: async (lessonId) => {
    const response = await api.post('/ai/suggest-improvements', { lessonId });
    return response.data;
  },
};

// 管理員相關 API
export const adminAPI = {
  getStats: async () => {
    const response = await api.get('/admin/stats');
    return response.data;
  },

  getSystemHealth: async () => {
    const response = await api.get('/admin/health');
    return response.data;
  },

  getLogs: async (params = {}) => {
    const response = await api.get('/admin/logs', { params });
    return response.data;
  },
};

export default api;