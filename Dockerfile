# ── Stage 1: Dependencies ──
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ── Stage 2: Build ──
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* 변수는 빌드 시점에 인라인됨
ENV NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAw7OVMt_rdEHssud4s4PiN3cFUC7XNbic
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=bscamp.app
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=modified-shape-477110-h8
ENV NEXT_PUBLIC_SITE_URL=https://bscamp.app
ENV NEXT_PUBLIC_MIXPANEL_TOKEN=7274354ebbdfae7d96d716ff2a5275d5

# next.config.ts에 output: "standalone" 설정됨
RUN npm run build

# ── Stage 3: Production ──
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# standalone 출력물 복사
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080

# 런타임 환경변수는 Cloud Run에서 설정
CMD ["node", "server.js"]
