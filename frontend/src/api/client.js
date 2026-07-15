export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const tokenKey = (classroomId) => `codelab.token.${classroomId}`;

export const getToken = (classroomId) => localStorage.getItem(tokenKey(classroomId));
export const setToken = (classroomId, token) => localStorage.setItem(tokenKey(classroomId), token);
export const clearToken = (classroomId) => localStorage.removeItem(tokenKey(classroomId));

async function request(path, { method = "GET", body, classroomId, keepalive = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (classroomId != null) {
    const token = getToken(classroomId);
    if (token) headers["X-Classroom-Token"] = token;
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive,
    });
  } catch {
    throw new ApiError("Can't reach the server.", 0);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const listClassrooms = () => request("/api/classrooms");

export const verifyPin = (classroomId, pin) =>
  request(`/api/classrooms/${classroomId}/verify-pin`, { method: "POST", body: { pin } });

export const listGroups = (classroomId, kind = "capstone") =>
  request(`/api/groups?kind=${kind}`, { classroomId });

export const createGroup = (classroomId, name, kind = "capstone") =>
  request("/api/groups", { method: "POST", body: { name, kind }, classroomId });

export const renameGroup = (classroomId, groupId, name) =>
  request(`/api/groups/${groupId}`, { method: "PATCH", body: { name }, classroomId });

export const deleteGroup = (classroomId, groupId) =>
  request(`/api/groups/${groupId}`, { method: "DELETE", classroomId });

export const listFiles = (classroomId, groupId) =>
  request(`/api/groups/${groupId}/files`, { classroomId });

export const getFileContent = (classroomId, groupId, fileId) =>
  request(`/api/groups/${groupId}/files/${fileId}`, { classroomId });

export const saveFileContent = (classroomId, groupId, fileId, content, { keepalive = false } = {}) =>
  request(`/api/groups/${groupId}/files/${fileId}`, {
    method: "PUT",
    body: { content },
    classroomId,
    keepalive,
  });

export const createFile = (classroomId, groupId, { name, isDirectory = false, parentId = null }) =>
  request(`/api/groups/${groupId}/files`, {
    method: "POST",
    body: { name, is_directory: isDirectory, parent_id: parentId },
    classroomId,
  });

export const renameFile = (classroomId, groupId, fileId, name) =>
  request(`/api/groups/${groupId}/files/${fileId}`, {
    method: "PATCH",
    body: { name },
    classroomId,
  });

export const deleteFile = (classroomId, groupId, fileId) =>
  request(`/api/groups/${groupId}/files/${fileId}`, { method: "DELETE", classroomId });

export const moveFile = (classroomId, groupId, fileId, parentId) =>
  request(`/api/groups/${groupId}/files/${fileId}/move`, {
    method: "PATCH",
    body: { parent_id: parentId },
    classroomId,
  });

export async function uploadAsset(classroomId, groupId, parentId, file) {
  const form = new FormData();
  if (parentId != null) form.append("parent_id", String(parentId));
  form.append("file", file);
  const headers = {};
  const token = getToken(classroomId);
  if (token) headers["X-Classroom-Token"] = token;

  let response;
  try {
    response = await fetch(`/api/groups/${groupId}/files/upload`, {
      method: "POST",
      headers,
      body: form,
    });
  } catch {
    throw new ApiError("Can't reach the server.", 0);
  }
  if (!response.ok) {
    let message = `Upload failed (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new ApiError(message, response.status);
  }
  return response.json();
}

export async function getAssetBytes(classroomId, groupId, fileId) {
  const headers = {};
  const token = getToken(classroomId);
  if (token) headers["X-Classroom-Token"] = token;
  const response = await fetch(`/api/groups/${groupId}/files/${fileId}/raw`, { headers });
  if (!response.ok) throw new ApiError(`Couldn't load asset (${response.status}).`, response.status);
  return response.arrayBuffer();
}
