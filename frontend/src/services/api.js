import axios from 'axios';

const AUTH_BASE = '/auth';
const MSG_BASE = '/api';

const authApi = axios.create({ baseURL: AUTH_BASE });
const msgApi = axios.create({ baseURL: MSG_BASE });

function getToken() {
  return localStorage.getItem('accessToken');
}

// Attach token to message service requests
msgApi.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

authApi.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auth endpoints
export const authService = {
  register: (data) => authApi.post('/register', data),
  login: (data) => authApi.post('/login', data),
  logout: (data) => authApi.post('/logout', data),
  refresh: (refreshToken) => authApi.post('/refresh', { refreshToken }),
  getUsers: () => authApi.get('/users'),
};

// Message endpoints
export const messageService = {
  getRooms: () => msgApi.get('/rooms'),
  getOrCreateDirect: (targetUserId, targetUsername) =>
    msgApi.post('/rooms/direct', { targetUserId, targetUsername }),
  createGroup: (name, memberIds) =>
    msgApi.post('/rooms/group', { name, memberIds }),
  getMessages: (roomId, params = {}) =>
    msgApi.get(`/rooms/${roomId}/messages`, { params }),
  sendMessage: (roomId, content) =>
    msgApi.post(`/rooms/${roomId}/messages`, { content }),
};
