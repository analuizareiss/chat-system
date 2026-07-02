import axios from 'axios';

const AUTH_BASE = '/auth';
const MSG_BASE = '/api';

const authApi = axios.create({ baseURL: AUTH_BASE });
const msgApi = axios.create({ baseURL: MSG_BASE });

function getToken() {
  return localStorage.getItem('accessToken');
}

function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

function setTokens({ accessToken, refreshToken }) {
  localStorage.setItem('accessToken', accessToken);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
}

function clearSessionAndRedirect() {
  localStorage.clear();
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
}

function attachToken(config) {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}

authApi.interceptors.request.use(attachToken);
msgApi.interceptors.request.use(attachToken);

let isRefreshing = false;
let refreshQueue = [];

function onRefreshed(newAccessToken) {
  refreshQueue.forEach((cb) => cb(newAccessToken));
  refreshQueue = [];
}

async function performRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token available');


  const { data } = await axios.post(`${AUTH_BASE}/refresh`, { refreshToken });
  setTokens(data);
  return data.accessToken;
}


export async function refreshAccessToken() {
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      refreshQueue.push((newAccessToken) => {
        if (!newAccessToken) reject(new Error('Refresh failed'));
        else resolve(newAccessToken);
      });
    });
  }

  isRefreshing = true;
  try {
    const newAccessToken = await performRefresh();
    isRefreshing = false;
    onRefreshed(newAccessToken);
    return newAccessToken;
  } catch (err) {
    isRefreshing = false;
    onRefreshed(null);
    clearSessionAndRedirect();
    throw err;
  }
}

function createAuthRefreshInterceptor(apiInstance) {
  apiInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const { config, response } = error;

      const isAuthError = response?.status === 401;
      const isRefreshCall = config?.url?.includes('/refresh');
      const alreadyRetried = config?._retry;

      if (!isAuthError || isRefreshCall || alreadyRetried) {
        return Promise.reject(error);
      }

      config._retry = true;

      try {
        const newAccessToken = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiInstance(config);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }
  );
}

createAuthRefreshInterceptor(authApi);
createAuthRefreshInterceptor(msgApi);

export const authService = {
  register: (data) => authApi.post('/register', data),
  login: (data) => authApi.post('/login', data),
  logout: (data) => authApi.post('/logout', data),
  refresh: (refreshToken) => authApi.post('/refresh', { refreshToken }),
  getUsers: () => authApi.get('/users'),
};

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