# 🚀 Inceptra AI Backend Server

A high-performance backend powering the **Inceptra AI** platform, built with **Node.js**, **Express**, **TypeScript**, and **Prisma**. It supports intelligent content and image generation, background removal, resume analysis, secure authentication, usage tracking, and subscription management.

---

## ✨ Core Features

- **Modular REST API** – Organized routes for all AI-powered tools
- **Authentication** – Secure access using Clerk JWT middleware
- **Subscription Management** – Stripe integration for premium features
- **Rate Limiting** – Daily request limits for free users
- **Database Layer** – Prisma ORM with PostgreSQL
- **File Upload Support** – Multer-powered handling of images and PDFs
- **Usage History** – Persistent generation logs per user
- **Full Type Safety** – Written entirely in TypeScript

---

## 🧰 Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Authentication**: Clerk
- **Payments**: Stripe
- **AI Services**: Hugging Face, OpenAI
- **File Handling**: Multer
- **Environment Config**: dotenv

---

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL instance
- Clerk & Stripe accounts with active API keys

---

## 🛠️ Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

Copy and edit environment variables:

```bash
cp .env.example .env
```

Required keys:

```env
DATABASE_URL=postgresql://...
CLERK_SECRET_KEY=...
STRIPE_SECRET_KEY=...
HF_TOKEN=...
OPENAI_API_KEY=...
CLIENT_URL=http://localhost:5173
```

### 3. Run Migrations

```bash
pnpm prisma migrate deploy
```

### 4. Start Development Server

```bash
pnpm dev
```

App will run on `http://localhost:5000`

---

## 📦 Scripts

- `pnpm dev` – Development mode with Nodemon
- `pnpm build` – Compile TypeScript into `/dist`
- `pnpm start` – Launch server from compiled output

---

## 🧱 Project Structure

```text
src/
├── routes/        # API endpoints (article, image, bgRemove, resume, history, stripe)
├── middleware/    # Auth guards and rate limiters
├── utils/         # DB helpers, PDF parsing, etc.
├── types/         # Global and request-specific types

prisma/
├── schema.prisma  # Database schema definition
├── migrations/    # Schema migration history
```

---

## 🔐 Access & Limits

- Protected routes use `Authorization: Bearer <JWT>`
- Free-tier users have daily limits on API usage
- Stripe-powered premium access removes limits

---

## 📡 API Overview

All endpoints are prefixed with `/api`.

### POST `/api/article`

```json
{
  "title": "Your article topic",
  "length": "short | medium | long"
}
```

### POST `/api/image`

```json
{
  "prompt": "Description",
  "style": "realistic",
  "size": "1024x1024"
}
```

### POST `/api/bg-remove`

- Accepts image file via `multipart/form-data`  
- PNG/JPG, max size 10MB

### POST `/api/resume`

- Accepts PDF file via `multipart/form-data`  
- Max size 5MB

### GET `/api/history?limit=50`

- Retrieves latest generations for authenticated user

### POST `/api/stripe/webhook`

- Stripe event listener for subscription management

---

## 🌱 Environment Reference

See `.env.example` for all required config keys. Do not commit `.env` to version control.

---

## 📄 License

Licensed under the [MIT License](LICENSE).

---

## 🤝 Contributing

1. Fork the repository  
2. Create a branch: `git checkout -b feature/my-feature`  
3. Commit your changes  
4. Push: `git push origin feature/my-feature`  
5. Submit a pull request

---

## 📬 Support

Open an issue in this repository or contact:  
**📧** abdullah.bajwa.co@gmail.com
