# Stage 1: Python 의존성 빌드 (CPU-only PyTorch)
FROM python:3.11-slim AS python-deps
RUN apt-get update && apt-get install -y git --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
COPY saliency/requirements.txt /tmp/
RUN pip install --no-cache-dir --target=/deps \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    -r /tmp/requirements.txt

# Stage 2: 런타임 (Node + Python)
FROM node:20-slim
RUN apt-get update && apt-get install -y python3 ca-certificates --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
COPY --from=python-deps /deps /usr/local/lib/python3.11/dist-packages
ENV PYTHONPATH=/usr/local/lib/python3.11/dist-packages

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
