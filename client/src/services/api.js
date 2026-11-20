const API_BASE = '/api';

const getHeaders = (isMultipart = false) => {
  const token = localStorage.getItem('docu_token');
  const headers = {};
  if (!isMultipart) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const api = {
  // Auth
  async signup(email, password) {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to sign up');
    return data;
  },

  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to log in');
    return data;
  },

  async getMe() {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch current user');
    return data;
  },

  // Documents
  async uploadDocument(file, title, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);

    const token = localStorage.getItem('docu_token');
    const xhr = new XMLHttpRequest();

    return new Promise((resolve, reject) => {
      xhr.open('POST', `${API_BASE}/documents`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data.error || 'Upload failed'));
          }
        } catch (err) {
          reject(new Error('Invalid response from server'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });
  },

  async getDocuments() {
    const res = await fetch(`${API_BASE}/documents`, {
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch documents');
    return data;
  },

  async getDocument(id) {
    const res = await fetch(`${API_BASE}/documents/${id}`, {
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch document');
    return data;
  },

  async getDocumentPages(id) {
    const res = await fetch(`${API_BASE}/documents/${id}/pages`, {
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch document pages');
    return data;
  },

  async deleteDocument(id) {
    const res = await fetch(`${API_BASE}/documents/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete document');
    return data;
  },
};
