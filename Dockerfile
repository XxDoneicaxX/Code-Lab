# Multi-stage build: Stage 1 builds the frontend, Stage 2 runs the backend,
# which serves that build (see backend/app/main.py). One image, one process —
# matches this app's "single host runs everything" deployment model.

# ---- Stage 1: frontend build ----
FROM node:20-slim AS frontend-build
WORKDIR /repo/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: backend runtime ----
FROM python:3.12-slim
WORKDIR /repo/backend

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-build /repo/frontend/dist /repo/frontend/dist

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
