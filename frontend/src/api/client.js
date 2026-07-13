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

export const listGroups = (classroomId) => request("/api/groups", { classroomId });

export const createGroup = (classroomId, name) =>
  request("/api/groups", { method: "POST", body: { name }, classroomId });

export const renameGroup = (classroomId, groupId, name) =>
  request(`/api/groups/${groupId}`, { method: "PATCH", body: { name }, classroomId });

export const deleteGroup = (classroomId, groupId) =>
  request(`/api/groups/${groupId}`, { method: "DELETE", classroomId });

export const getWorkspace = (classroomId, groupId) =>
  request(`/api/groups/${groupId}/project`, { classroomId });

export const saveProject = (classroomId, groupId, code, { keepalive = false } = {}) =>
  request(`/api/groups/${groupId}/project`, {
    method: "PUT",
    body: { code },
    classroomId,
    keepalive,
  });
